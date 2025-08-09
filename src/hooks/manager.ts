import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { 
  Hook, 
  HookType, 
  HookContext, 
  HookExecutionResult, 
  HookConfig, 
  HookConfigSchema, 
  ToolUseContext, 
  DiffContext, 
  CommitContext,
  HookResult 
} from "./types.js";
import { BuiltinHooks } from "./builtins.js";
import { HookExecutor } from "./executor.js";
import { HookValidator } from "./validator.js";

export class HookManager {
  private hooks: Map<HookType, Hook[]> = new Map();
  private config: HookConfig;
  private executor: HookExecutor;
  private validator: HookValidator;
  private configPath: string;
  private executionHistory: HookExecutionResult[] = [];
  
  constructor(configDir: string = path.join(process.env.HOME || "~", ".termcode")) {
    this.configPath = path.join(configDir, "hooks.json");
    this.config = this.getDefaultConfig();
    this.executor = new HookExecutor(this.config);
    this.validator = new HookValidator();
  }
  
  /**
   * Initialize hook manager and load configuration
   */
  async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      await this.validateConfiguration();
      await this.registerHooks();
      
      log.info(`Hook manager initialized with ${this.getTotalHookCount()} hooks`);
    } catch (error) {
      log.error("Failed to initialize hook manager:", error);
      throw error;
    }
  }
  
  /**
   * Execute hooks for a specific type and context
   */
  async executeHooks(
    type: HookType, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookExecutionResult[]> {
    if (!this.config.enabled) {
      return [];
    }
    
    const hooks = this.getApplicableHooks(type, context, additionalContext);
    if (hooks.length === 0) {
      return [];
    }
    
    const startTime = Date.now();
    log.debug(`Executing ${hooks.length} hooks for ${type}`);
    
    const results: HookExecutionResult[] = [];
    const concurrencyLimit = Math.min(this.config.maxConcurrency, hooks.length);
    
    // Execute hooks in priority order with concurrency control
    const sortedHooks = hooks.sort((a, b) => a.priority - b.priority);
    
    for (let i = 0; i < sortedHooks.length; i += concurrencyLimit) {
      const batch = sortedHooks.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(hook => this.executeHook(hook, context, additionalContext));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Check for critical failures that should stop execution
      const criticalFailure = batchResults.find(r => 
        !r.success && r.result.error?.includes('CRITICAL')
      );
      
      if (criticalFailure) {
        log.error(`Critical hook failure, stopping execution: ${criticalFailure.error}`);
        break;
      }
    }
    
    const executionTime = Date.now() - startTime;
    log.debug(`Hook execution completed in ${executionTime}ms`);
    
    // Store execution history for analysis
    this.executionHistory.push(...results);
    this.cleanupExecutionHistory();
    
    return results;
  }
  
  /**
   * Execute a single hook with retries and timeout
   */
  private async executeHook(
    hook: Hook, 
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= hook.retries; attempt++) {
      try {
        const result = await this.executor.execute(hook, context, additionalContext);
        const executionTime = Date.now() - startTime;
        
        return {
          hookId: hook.id,
          success: true,
          executionTime,
          result,
          warnings: result.suggestions
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < hook.retries) {
          const backoffTime = Math.min(
            1000 * Math.pow(this.config.retryPolicy.backoffMultiplier, attempt),
            this.config.retryPolicy.maxBackoffTime
          );
          
          log.warn(`Hook ${hook.id} failed (attempt ${attempt + 1}), retrying in ${backoffTime}ms`);
          await this.sleep(backoffTime);
        }
      }
    }
    
    const executionTime = Date.now() - startTime;
    return {
      hookId: hook.id,
      success: false,
      executionTime,
      result: { success: false, error: lastError?.message || "Hook execution failed" },
      error: lastError
    };
  }
  
  /**
   * Get hooks applicable to the current context
   */
  private getApplicableHooks(
    type: HookType, 
    context: HookContext, 
    additionalContext?: any
  ): Hook[] {
    const typeHooks = this.hooks.get(type) || [];
    
    return typeHooks.filter(hook => {
      if (!hook.enabled) return false;
      
      // Check conditions
      if (hook.conditions && !this.checkConditions(hook.conditions, context)) {
        return false;
      }
      
      // Check matcher
      return this.matchesContext(hook, context, additionalContext);
    });
  }
  
  /**
   * Check if hook matches the current context
   */
  private matchesContext(hook: Hook, context: HookContext, additionalContext?: any): boolean {
    const { matcher } = hook;
    
    // Tool name matching
    if (matcher.toolNames && additionalContext?.toolName) {
      if (!matcher.toolNames.includes(additionalContext.toolName)) {
        return false;
      }
    }
    
    // Provider matching
    if (matcher.providers && !matcher.providers.includes(context.provider)) {
      return false;
    }
    
    // Model matching
    if (matcher.models && !matcher.models.includes(context.model)) {
      return false;
    }
    
    // Pattern matching
    if (matcher.patterns) {
      const textToMatch = JSON.stringify(additionalContext || context);
      const hasMatch = matcher.patterns.some(pattern => pattern.test(textToMatch));
      if (!hasMatch) return false;
    }
    
    // File type matching
    if (matcher.fileTypes && additionalContext?.filePaths) {
      const hasMatchingFile = additionalContext.filePaths.some((filePath: string) => {
        const ext = path.extname(filePath).slice(1);
        return matcher.fileTypes!.includes(ext);
      });
      if (!hasMatchingFile) return false;
    }
    
    // Condition matching
    if (matcher.conditions) {
      return matcher.conditions.every(condition => 
        this.evaluateCondition(condition, context, additionalContext)
      );
    }
    
    return true;
  }
  
  /**
   * Evaluate a matcher condition
   */
  private evaluateCondition(
    condition: { path: string; operator: string; value: any }, 
    context: HookContext, 
    additionalContext?: any
  ): boolean {
    const data = { ...context, ...additionalContext };
    const actualValue = this.getNestedValue(data, condition.path);
    
    switch (condition.operator) {
      case 'equals':
        return actualValue === condition.value;
      case 'contains':
        return String(actualValue).includes(String(condition.value));
      case 'matches':
        return new RegExp(condition.value).test(String(actualValue));
      case 'gt':
        return Number(actualValue) > Number(condition.value);
      case 'lt':
        return Number(actualValue) < Number(condition.value);
      default:
        return false;
    }
  }
  
  /**
   * Check hook conditions
   */
  private checkConditions(
    conditions: Array<{ type: string; condition: string; negate?: boolean }>, 
    context: HookContext
  ): boolean {
    return conditions.every(cond => {
      let result = false;
      
      switch (cond.type) {
        case 'file_exists':
          result = this.fileExists(path.resolve(context.repoPath, cond.condition));
          break;
        case 'command_available':
          result = this.commandAvailable(cond.condition);
          break;
        case 'env_var':
          result = Boolean(process.env[cond.condition]);
          break;
        case 'git_status':
          result = this.checkGitStatus(cond.condition, context.repoPath);
          break;
        default:
          result = false;
      }
      
      return cond.negate ? !result : result;
    });
  }
  
  /**
   * Register built-in and user-defined hooks
   */
  private async registerHooks(): Promise<void> {
    this.hooks.clear();
    
    for (const hook of this.config.hooks) {
      const hookType = hook.type;
      if (!this.hooks.has(hookType)) {
        this.hooks.set(hookType, []);
      }
      this.hooks.get(hookType)!.push(hook);
    }
    
    // Register built-in hooks
    const builtinHooks = BuiltinHooks.getAll();
    for (const hook of builtinHooks) {
      if (!this.hooks.has(hook.type)) {
        this.hooks.set(hook.type, []);
      }
      this.hooks.get(hook.type)!.push(hook);
    }
  }
  
  /**
   * Load configuration from file
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(configData);
      
      // Validate configuration
      const validated = HookConfigSchema.parse(parsed);
      this.config = validated as any;
      
      log.debug(`Loaded ${this.config.hooks.length} hooks from configuration`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        log.info("No hook configuration found, using defaults");
        await this.saveConfiguration();
      } else {
        log.warn("Failed to load hook configuration:", error);
        this.config = this.getDefaultConfig();
      }
    }
  }
  
  /**
   * Save current configuration to file
   */
  private async saveConfiguration(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
      log.debug("Hook configuration saved");
    } catch (error) {
      log.error("Failed to save hook configuration:", error);
    }
  }
  
  /**
   * Validate configuration
   */
  private async validateConfiguration(): Promise<void> {
    const errors: string[] = [];
    
    for (const hook of this.config.hooks) {
      const validation = await this.validator.validate(hook);
      if (!validation.valid) {
        errors.push(`Hook ${hook.id}: ${validation.errors.join(', ')}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Hook configuration validation failed:\n${errors.join('\n')}`);
    }
  }
  
  /**
   * Get default configuration
   */
  private getDefaultConfig(): HookConfig {
    return {
      enabled: true,
      hooks: [],
      globalTimeout: 300000,
      maxConcurrency: 5,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        maxBackoffTime: 30000
      },
      logging: {
        enabled: true,
        level: 'info'
      }
    };
  }
  
  /**
   * Utility methods
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private fileExists(filePath: string): boolean {
    try {
      const fs = require('node:fs');
      fs.accessSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  private commandAvailable(command: string): boolean {
    try {
      const { execSync } = require('node:child_process');
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
  
  private checkGitStatus(condition: string, repoPath: string): boolean {
    try {
      const { execSync } = require('node:child_process');
      const result = execSync('git status --porcelain', { 
        cwd: repoPath, 
        encoding: 'utf8' 
      });
      
      switch (condition) {
        case 'clean':
          return result.trim() === '';
        case 'dirty':
          return result.trim() !== '';
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private getTotalHookCount(): number {
    return Array.from(this.hooks.values()).reduce((total, hooks) => total + hooks.length, 0);
  }
  
  private cleanupExecutionHistory(): void {
    // Keep only last 1000 execution results
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }
  
  /**
   * Public API methods
   */
  
  /**
   * Add a new hook
   */
  async addHook(hook: Hook): Promise<void> {
    const validation = await this.validator.validate(hook);
    if (!validation.valid) {
      throw new Error(`Invalid hook: ${validation.errors.join(', ')}`);
    }
    
    this.config.hooks.push(hook);
    await this.saveConfiguration();
    await this.registerHooks();
    
    log.info(`Hook ${hook.id} added successfully`);
  }
  
  /**
   * Remove a hook
   */
  async removeHook(hookId: string): Promise<void> {
    const index = this.config.hooks.findIndex(h => h.id === hookId);
    if (index === -1) {
      throw new Error(`Hook ${hookId} not found`);
    }
    
    this.config.hooks.splice(index, 1);
    await this.saveConfiguration();
    await this.registerHooks();
    
    log.info(`Hook ${hookId} removed successfully`);
  }
  
  /**
   * Enable/disable a hook
   */
  async toggleHook(hookId: string, enabled: boolean): Promise<void> {
    const hook = this.config.hooks.find(h => h.id === hookId);
    if (!hook) {
      throw new Error(`Hook ${hookId} not found`);
    }
    
    hook.enabled = enabled;
    await this.saveConfiguration();
    await this.registerHooks();
    
    log.info(`Hook ${hookId} ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Get hook execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number;
    successRate: number;
    averageExecutionTime: number;
    mostUsedHooks: Array<{ hookId: string; count: number }>;
    recentFailures: HookExecutionResult[];
  } {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(r => r.success).length;
    const successRate = total > 0 ? (successful / total) * 100 : 0;
    
    const avgTime = total > 0 ? 
      this.executionHistory.reduce((sum, r) => sum + r.executionTime, 0) / total : 0;
    
    const hookCounts = new Map<string, number>();
    this.executionHistory.forEach(r => {
      hookCounts.set(r.hookId, (hookCounts.get(r.hookId) || 0) + 1);
    });
    
    const mostUsed = Array.from(hookCounts.entries())
      .map(([hookId, count]) => ({ hookId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const recentFailures = this.executionHistory
      .filter(r => !r.success)
      .slice(-10);
    
    return {
      totalExecutions: total,
      successRate,
      averageExecutionTime: avgTime,
      mostUsedHooks: mostUsed,
      recentFailures
    };
  }
  
  /**
   * List all hooks
   */
  listHooks(): Hook[] {
    return [...this.config.hooks];
  }
  
  /**
   * Get hook by ID
   */
  getHook(hookId: string): Hook | undefined {
    return this.config.hooks.find(h => h.id === hookId);
  }
}

// Export singleton instance
export const hookManager = new HookManager();