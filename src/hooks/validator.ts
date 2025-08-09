import { Hook, HookSchema } from "./types.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class HookValidator {
  /**
   * Validate a hook configuration
   */
  async validate(hook: Hook): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Schema validation
      HookSchema.parse(hook);
    } catch (error: any) {
      if (error.errors) {
        errors.push(...error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`));
      } else {
        errors.push(`Schema validation failed: ${error.message}`);
      }
    }

    // Handler validation
    const handlerValidation = await this.validateHandler(hook);
    errors.push(...handlerValidation.errors);
    warnings.push(...handlerValidation.warnings);

    // Security validation
    const securityValidation = this.validateSecurity(hook);
    errors.push(...securityValidation.errors);
    warnings.push(...securityValidation.warnings);

    // Performance validation
    const performanceValidation = this.validatePerformance(hook);
    warnings.push(...performanceValidation.warnings);

    // Logic validation
    const logicValidation = this.validateLogic(hook);
    errors.push(...logicValidation.errors);
    warnings.push(...logicValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate hook handler
   */
  private async validateHandler(hook: Hook): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (hook.handler.type) {
      case 'builtin':
        if (!hook.handler.builtin) {
          errors.push('Builtin hook must specify builtin type');
        }
        break;

      case 'javascript':
        if (!hook.handler.script && !hook.handler.file) {
          errors.push('JavaScript hook must provide script or file');
        }
        
        if (hook.handler.file) {
          const fileValidation = await this.validateFile(hook.handler.file, 'javascript');
          errors.push(...fileValidation.errors);
          warnings.push(...fileValidation.warnings);
        }

        if (hook.handler.script) {
          const scriptValidation = this.validateJavaScript(hook.handler.script);
          errors.push(...scriptValidation.errors);
          warnings.push(...scriptValidation.warnings);
        }
        break;

      case 'python':
        if (!hook.handler.script && !hook.handler.file) {
          errors.push('Python hook must provide script or file');
        }

        if (hook.handler.file) {
          const fileValidation = await this.validateFile(hook.handler.file, 'python');
          errors.push(...fileValidation.errors);
          warnings.push(...fileValidation.warnings);
        }

        if (hook.handler.script) {
          const scriptValidation = this.validatePython(hook.handler.script);
          warnings.push(...scriptValidation.warnings);
        }
        break;

      case 'shell':
        if (!hook.handler.script && !hook.handler.file) {
          errors.push('Shell hook must provide script or file');
        }

        if (hook.handler.file) {
          const fileValidation = await this.validateFile(hook.handler.file, 'shell');
          errors.push(...fileValidation.errors);
          warnings.push(...fileValidation.warnings);
        }

        if (hook.handler.script) {
          const scriptValidation = this.validateShell(hook.handler.script);
          warnings.push(...scriptValidation.warnings);
        }
        break;

      default:
        errors.push(`Unknown handler type: ${hook.handler.type}`);
    }

    return { errors, warnings };
  }

  /**
   * Validate file existence and permissions
   */
  private async validateFile(
    filePath: string, 
    type: string
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        errors.push(`Hook file is not a regular file: ${filePath}`);
        return { errors, warnings };
      }

      // Check file extension matches type
      const ext = path.extname(filePath);
      const expectedExtensions: Record<string, string[]> = {
        javascript: ['.js', '.mjs', '.ts'],
        python: ['.py'],
        shell: ['.sh', '.bash']
      };

      if (expectedExtensions[type] && !expectedExtensions[type].includes(ext)) {
        warnings.push(`File extension ${ext} doesn't match hook type ${type}`);
      }

      // Check file size
      if (stats.size > 1024 * 1024) { // 1MB
        warnings.push(`Hook file is large (${Math.round(stats.size / 1024)}KB) - may impact performance`);
      }

      // Check file permissions
      try {
        await fs.access(filePath, fs.constants.R_OK);
      } catch {
        errors.push(`Hook file is not readable: ${filePath}`);
      }

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        errors.push(`Hook file not found: ${filePath}`);
      } else {
        errors.push(`Failed to access hook file ${filePath}: ${error.message}`);
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate JavaScript code
   */
  private validateJavaScript(script: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic syntax validation
    try {
      new Function(script);
    } catch (error: any) {
      errors.push(`JavaScript syntax error: ${error.message}`);
    }

    // Security checks
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, message: 'Use of eval() is dangerous' },
      { pattern: /Function\s*\(/, message: 'Dynamic function creation can be dangerous' },
      { pattern: /require\s*\(\s*['"]child_process['"]/, message: 'Direct child_process usage not allowed' },
      { pattern: /require\s*\(\s*['"]fs['"]/, message: 'Direct fs usage - use provided fs methods' },
      { pattern: /process\.exit/, message: 'process.exit() should not be used in hooks' },
      { pattern: /global\./, message: 'Global variable modification not recommended' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(script)) {
        warnings.push(message);
      }
    }

    // Check for common issues
    if (script.length < 10) {
      warnings.push('Hook script is very short - may not be functional');
    }

    if (!script.includes('return')) {
      warnings.push('Hook script should return a result');
    }

    return { errors, warnings };
  }

  /**
   * Validate Python code
   */
  private validatePython(script: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Security checks
    const dangerousPatterns = [
      { pattern: /import\s+os/, message: 'Direct os module usage should be careful' },
      { pattern: /import\s+subprocess/, message: 'subprocess usage should be restricted' },
      { pattern: /exec\s*\(/, message: 'exec() usage can be dangerous' },
      { pattern: /eval\s*\(/, message: 'eval() usage can be dangerous' },
      { pattern: /open\s*\(/, message: 'File operations should be restricted to repo path' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(script)) {
        warnings.push(message);
      }
    }

    if (script.length < 10) {
      warnings.push('Hook script is very short - may not be functional');
    }

    return { warnings };
  }

  /**
   * Validate shell script
   */
  private validateShell(script: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Security checks
    const dangerousPatterns = [
      { pattern: /rm\s+-rf/, message: 'rm -rf usage can be dangerous' },
      { pattern: /sudo\s+/, message: 'sudo usage in hooks not recommended' },
      { pattern: /curl.*\|.*sh/, message: 'Piping downloads to shell is dangerous' },
      { pattern: /wget.*\|.*sh/, message: 'Piping downloads to shell is dangerous' },
      { pattern: /dd\s+/, message: 'dd command usage can be dangerous' },
      { pattern: /mkfs/, message: 'Filesystem operations not allowed' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(script)) {
        warnings.push(message);
      }
    }

    // Check for missing error handling
    if (!script.includes('set -e') && !script.includes('trap')) {
      warnings.push('Consider adding error handling (set -e or trap)');
    }

    return { warnings };
  }

  /**
   * Validate security aspects
   */
  private validateSecurity(hook: Hook): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check timeout values
    if (hook.timeout > 300000) { // 5 minutes
      warnings.push('Hook timeout is very long - may block other operations');
    }

    if (hook.timeout < 1000) {
      warnings.push('Hook timeout is very short - may cause premature failures');
    }

    // Check priority values
    if (hook.priority < 0) {
      warnings.push('Negative priority values may cause unexpected execution order');
    }

    // Check retry values
    if (hook.retries > 5) {
      warnings.push('High retry count may cause long delays on failures');
    }

    // Check conditions for safety
    if (hook.conditions) {
      for (const condition of hook.conditions) {
        if (condition.type === 'custom' && condition.condition.includes('rm ')) {
          warnings.push('Custom condition contains potentially dangerous command');
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate performance aspects
   */
  private validatePerformance(hook: Hook): { warnings: string[] } {
    const warnings: string[] = [];

    // Check for performance issues
    if (hook.type === 'PreToolUse' && hook.timeout > 10000) {
      warnings.push('PreToolUse hook with long timeout may slow down operations');
    }

    if (hook.type === 'PostToolUse' && hook.priority < 50) {
      warnings.push('PostToolUse hook with high priority may delay results');
    }

    // Check handler performance implications
    if (hook.handler.type === 'python' && hook.timeout < 5000) {
      warnings.push('Python hooks may need more time due to interpreter startup');
    }

    return { warnings };
  }

  /**
   * Validate logical consistency
   */
  private validateLogic(hook: Hook): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check matcher logic
    const { matcher } = hook;

    // Warn about overly broad matchers
    if (!matcher.toolNames && !matcher.patterns && !matcher.conditions && 
        !matcher.fileTypes && !matcher.providers && !matcher.models) {
      warnings.push('Hook matcher is very broad - will execute for all operations');
    }

    // Check for conflicting conditions
    if (matcher.providers && matcher.models) {
      warnings.push('Both provider and model filters specified - ensure compatibility');
    }

    // Check hook type and matcher compatibility
    if (hook.type === 'PreDiff' && matcher.toolNames && 
        !matcher.toolNames.some(name => name.includes('diff') || name.includes('edit'))) {
      warnings.push('PreDiff hook matcher may not match diff operations');
    }

    if (hook.type === 'PreCommit' && matcher.toolNames && 
        !matcher.toolNames.some(name => name.includes('git') || name.includes('commit'))) {
      warnings.push('PreCommit hook matcher may not match commit operations');
    }

    return { errors, warnings };
  }

  /**
   * Validate hook ID uniqueness within a set of hooks
   */
  validateUniqueIds(hooks: Hook[]): { errors: string[] } {
    const errors: string[] = [];
    const seen = new Set<string>();
    
    for (const hook of hooks) {
      if (seen.has(hook.id)) {
        errors.push(`Duplicate hook ID: ${hook.id}`);
      } else {
        seen.add(hook.id);
      }
    }
    
    return { errors };
  }
}