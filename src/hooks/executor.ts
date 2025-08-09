import { Hook, HookResult, HookContext, HookConfig } from "./types.js";
import { BuiltinHooks } from "./builtins.js";
import { log } from "../util/logging.js";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

export class HookExecutor {
  constructor(private config: HookConfig) {}

  /**
   * Execute a hook with the given context
   */
  async execute(hook: Hook, context: HookContext, additionalContext?: any): Promise<HookResult> {
    const startTime = Date.now();
    
    try {
      let result: HookResult;
      
      switch (hook.handler.type) {
        case 'builtin':
          result = await this.executeBuiltin(hook, context, additionalContext);
          break;
        case 'javascript':
          result = await this.executeJavaScript(hook, context, additionalContext);
          break;
        case 'python':
          result = await this.executePython(hook, context, additionalContext);
          break;
        case 'shell':
          result = await this.executeShell(hook, context, additionalContext);
          break;
        default:
          throw new Error(`Unsupported handler type: ${hook.handler.type}`);
      }
      
      const executionTime = Date.now() - startTime;
      
      if (this.config.logging.enabled) {
        this.logExecution(hook, result, executionTime);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: HookResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
      
      if (this.config.logging.enabled) {
        this.logExecution(hook, errorResult, executionTime);
      }
      
      return errorResult;
    }
  }

  /**
   * Execute built-in hook
   */
  private async executeBuiltin(
    hook: Hook, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    if (!hook.handler.builtin) {
      throw new Error('Builtin hook type not specified');
    }
    
    return BuiltinHooks.execute(hook.handler.builtin, context, additionalContext);
  }

  /**
   * Execute JavaScript hook
   */
  private async executeJavaScript(
    hook: Hook, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const code = hook.handler.script || (hook.handler.file ? await this.loadFile(hook.handler.file) : '');
    
    if (!code) {
      throw new Error('No JavaScript code provided');
    }

    // Create isolated context for hook execution
    const hookContext = {
      context,
      additionalContext,
      console: {
        log: (...args: any[]) => log.debug(`[Hook ${hook.id}]`, ...args),
        warn: (...args: any[]) => log.warn(`[Hook ${hook.id}]`, ...args),
        error: (...args: any[]) => log.error(`[Hook ${hook.id}]`, ...args)
      },
      require: (moduleName: string) => {
        // Whitelist of allowed modules for security
        const allowedModules = ['path', 'fs', 'crypto', 'util', 'zod'];
        if (allowedModules.includes(moduleName)) {
          return require(moduleName);
        }
        throw new Error(`Module ${moduleName} not allowed in hooks`);
      }
    };

    // Execute with timeout
    const result = await this.executeWithTimeout(async () => {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const hookFunction = new AsyncFunction('hookContext', code);
      return await hookFunction(hookContext);
    }, hook.timeout);

    return this.normalizeResult(result);
  }

  /**
   * Execute Python hook
   */
  private async executePython(
    hook: Hook, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const script = hook.handler.script || hook.handler.file;
    if (!script) {
      throw new Error('No Python script provided');
    }

    // Prepare input data
    const inputData = {
      hook_id: hook.id,
      context,
      additional_context: additionalContext,
      tool_name: additionalContext?.toolName,
      tool_input: additionalContext?.toolInput
    };

    // Execute Python script
    const result = await this.executeProcess('python3', ['-c', `
import json
import sys

# Read input data
input_data = json.loads('${JSON.stringify(inputData)}')

# User hook code
${script}

# Default result if hook doesn't return anything
if 'result' not in locals():
    result = {"success": True}

# Output result
print(json.dumps(result))
`], JSON.stringify(inputData));

    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Invalid JSON result from Python hook: ${result.stdout}`);
    }
  }

  /**
   * Execute shell hook
   */
  private async executeShell(
    hook: Hook, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const script = hook.handler.script || (hook.handler.file ? await this.loadFile(hook.handler.file) : '');
    
    if (!script) {
      throw new Error('No shell script provided');
    }

    // Set environment variables for the hook
    const env = {
      ...process.env,
      HOOK_ID: hook.id,
      HOOK_CONTEXT: JSON.stringify(context),
      HOOK_ADDITIONAL_CONTEXT: JSON.stringify(additionalContext || {}),
      REPO_PATH: context.repoPath,
      PROVIDER: context.provider,
      MODEL: context.model
    };

    const result = await this.executeProcess('sh', ['-c', script], '', env);
    
    // Try to parse JSON result, fallback to simple success/error
    try {
      return JSON.parse(result.stdout);
    } catch {
      return {
        success: result.code === 0,
        data: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined
      };
    }
  }

  /**
   * Execute process with timeout
   */
  private async executeProcess(
    command: string, 
    args: string[], 
    stdin: string = '',
    env?: Record<string, string>
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env: env || process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Send stdin if provided
      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Hook execution timeout')), timeoutMs);
    });

    return Promise.race([fn(), timeoutPromise]);
  }

  /**
   * Load file content
   */
  private async loadFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to load hook file ${filePath}: ${error}`);
    }
  }

  /**
   * Normalize hook result to standard format
   */
  private normalizeResult(result: any): HookResult {
    if (typeof result === 'boolean') {
      return { success: result };
    }
    
    if (typeof result === 'string') {
      return { success: true, data: result };
    }
    
    if (result && typeof result === 'object') {
      return {
        success: result.success !== false,
        data: result.data,
        error: result.error,
        suggestions: result.suggestions,
        transformedInput: result.transformedInput,
        metadata: result.metadata
      };
    }
    
    return { success: true, data: result };
  }

  /**
   * Log hook execution
   */
  private logExecution(hook: Hook, result: HookResult, executionTime: number): void {
    const logLevel = this.config.logging.level;
    
    const logData = {
      hookId: hook.id,
      hookName: hook.name,
      success: result.success,
      executionTime,
      error: result.error,
      suggestions: result.suggestions?.length || 0,
      timestamp: new Date().toISOString()
    };

    if (result.success) {
      if (logLevel === 'debug' || logLevel === 'info') {
        log.debug(`Hook executed: ${hook.id} (${executionTime}ms)`, logData);
      }
    } else {
      log.warn(`Hook failed: ${hook.id}`, logData);
    }

    // Write to log file if configured
    if (this.config.logging.logFile) {
      this.writeToLogFile(logData);
    }
  }

  /**
   * Write execution log to file
   */
  private async writeToLogFile(logData: any): Promise<void> {
    try {
      const logEntry = JSON.stringify(logData) + '\n';
      await fs.appendFile(this.config.logging.logFile!, logEntry);
    } catch (error) {
      log.warn('Failed to write hook log to file:', error);
    }
  }
}