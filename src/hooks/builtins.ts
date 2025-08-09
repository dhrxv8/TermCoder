import { Hook, HookResult, HookContext, ToolUseContext, DiffContext, CommitContext } from "./types.js";
import { log } from "../util/logging.js";
import { sandbox } from "../security/sandbox.js";

/**
 * Built-in hooks that provide enhanced Claude Code-inspired functionality
 */
export class BuiltinHooks {
  /**
   * Command validator hook - Claude Code inspired
   */
  static commandValidator: Hook = {
    id: 'builtin_command_validator',
    name: 'Command Validator',
    description: 'Validates and suggests improvements for shell commands',
    type: 'PreToolUse',
    matcher: {
      toolNames: ['shell', 'bash']
    },
    handler: {
      type: 'builtin',
      builtin: 'command_validator'
    },
    priority: 10,
    enabled: true,
    timeout: 5000,
    retries: 0
  };

  /**
   * Security scanner hook
   */
  static securityScanner: Hook = {
    id: 'builtin_security_scanner',
    name: 'Security Scanner',
    description: 'Scans for potential security issues in commands and code',
    type: 'PreToolUse',
    matcher: {},
    handler: {
      type: 'builtin',
      builtin: 'security_scanner'
    },
    priority: 5,
    enabled: true,
    timeout: 10000,
    retries: 1
  };

  /**
   * Diff optimizer hook
   */
  static diffOptimizer: Hook = {
    id: 'builtin_diff_optimizer',
    name: 'Diff Optimizer',
    description: 'Optimizes and validates diffs before application',
    type: 'PreDiff',
    matcher: {},
    handler: {
      type: 'builtin',
      builtin: 'diff_optimizer'
    },
    priority: 20,
    enabled: true,
    timeout: 15000,
    retries: 0
  };

  /**
   * Commit enhancer hook
   */
  static commitEnhancer: Hook = {
    id: 'builtin_commit_enhancer',
    name: 'Commit Enhancer',
    description: 'Enhances commit messages and validates changes',
    type: 'PreCommit',
    matcher: {},
    handler: {
      type: 'builtin',
      builtin: 'commit_enhancer'
    },
    priority: 15,
    enabled: true,
    timeout: 10000,
    retries: 0
  };

  /**
   * Error analyzer hook
   */
  static errorAnalyzer: Hook = {
    id: 'builtin_error_analyzer',
    name: 'Error Analyzer',
    description: 'Analyzes errors and provides intelligent suggestions',
    type: 'OnError',
    matcher: {},
    handler: {
      type: 'builtin',
      builtin: 'error_analyzer'
    },
    priority: 50,
    enabled: true,
    timeout: 8000,
    retries: 0
  };

  /**
   * Performance monitor hook
   */
  static performanceMonitor: Hook = {
    id: 'builtin_performance_monitor',
    name: 'Performance Monitor',
    description: 'Monitors and reports on operation performance',
    type: 'PostTask',
    matcher: {},
    handler: {
      type: 'builtin',
      builtin: 'performance_monitor'
    },
    priority: 100,
    enabled: true,
    timeout: 5000,
    retries: 0
  };

  /**
   * Get all built-in hooks
   */
  static getAll(): Hook[] {
    return [
      this.commandValidator,
      this.securityScanner,
      this.diffOptimizer,
      this.commitEnhancer,
      this.errorAnalyzer,
      this.performanceMonitor
    ];
  }

  /**
   * Execute built-in hook logic
   */
  static async execute(
    hookType: string,
    context: HookContext,
    additionalContext?: any
  ): Promise<HookResult> {
    switch (hookType) {
      case 'command_validator':
        return this.executeCommandValidator(context as ToolUseContext);
      case 'security_scanner':
        return this.executeSecurityScanner(context, additionalContext);
      case 'diff_optimizer':
        return this.executeDiffOptimizer(context as DiffContext);
      case 'commit_enhancer':
        return this.executeCommitEnhancer(context as CommitContext);
      case 'error_analyzer':
        return this.executeErrorAnalyzer(context, additionalContext);
      case 'performance_monitor':
        return this.executePerformanceMonitor(context, additionalContext);
      default:
        return { success: false, error: `Unknown builtin hook: ${hookType}` };
    }
  }

  /**
   * Command validator implementation
   */
  private static async executeCommandValidator(context: ToolUseContext): Promise<HookResult> {
    const { toolInput } = context;
    
    if (!toolInput?.command) {
      return { success: true };
    }

    const command = Array.isArray(toolInput.command) ? toolInput.command : [toolInput.command];
    const suggestions: string[] = [];
    let transformedInput = toolInput;

    // Validate command safety
    const securityCheck = await sandbox.execute(command, context.repoPath);
    if (securityCheck.blocked) {
      return {
        success: false,
        error: `CRITICAL: Command blocked by security policy: ${securityCheck.blocked}`,
        suggestions: ['Review command for security issues', 'Use allowed alternatives']
      };
    }

    // Command optimization suggestions (Claude Code style)
    const optimizations = this.getCommandOptimizations(command);
    if (optimizations.suggestions.length > 0) {
      suggestions.push(...optimizations.suggestions);
      if (optimizations.transformedCommand) {
        transformedInput = {
          ...toolInput,
          command: optimizations.transformedCommand
        };
      }
    }

    // Performance warnings
    const performanceWarnings = this.getPerformanceWarnings(command);
    suggestions.push(...performanceWarnings);

    return {
      success: true,
      suggestions,
      transformedInput: suggestions.length > 0 ? transformedInput : undefined,
      metadata: {
        originalCommand: command,
        optimized: optimizations.transformedCommand !== undefined
      }
    };
  }

  /**
   * Security scanner implementation
   */
  private static async executeSecurityScanner(
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for credential exposure
    const credentialCheck = this.checkForCredentials(additionalContext);
    if (credentialCheck.found) {
      issues.push('Potential credentials detected in input');
      suggestions.push('Remove or redact sensitive information');
    }

    // Check for dangerous patterns
    const dangerousPatterns = this.checkDangerousPatterns(additionalContext);
    issues.push(...dangerousPatterns);

    // Environment security check
    const envCheck = this.checkEnvironmentSecurity(context);
    issues.push(...envCheck);

    if (issues.length > 0) {
      return {
        success: false,
        error: `Security issues detected: ${issues.join(', ')}`,
        suggestions,
        metadata: { securityIssues: issues }
      };
    }

    return { success: true, metadata: { securityScan: 'passed' } };
  }

  /**
   * Diff optimizer implementation
   */
  private static async executeDiffOptimizer(context: DiffContext): Promise<HookResult> {
    const suggestions: string[] = [];
    const optimizations: any[] = [];

    for (const diff of context.diffs) {
      // Check for large changes
      const lines = diff.unified.split('\n');
      const additions = lines.filter(l => l.startsWith('+')).length;
      const deletions = lines.filter(l => l.startsWith('-')).length;

      if (additions + deletions > 100) {
        suggestions.push(`Large diff in ${diff.file} (${additions}+, ${deletions}-). Consider breaking into smaller changes.`);
      }

      // Check for sensitive file changes
      if (this.isSensitiveFile(diff.file)) {
        suggestions.push(`Changes to sensitive file ${diff.file} - review carefully`);
      }

      // Detect potential issues
      const issues = this.analyzeDiffContent(diff);
      suggestions.push(...issues);

      // Suggest improvements
      const improvements = this.suggestDiffImprovements(diff);
      optimizations.push(...improvements);
    }

    return {
      success: true,
      suggestions,
      metadata: {
        totalFiles: context.diffs.length,
        optimizations,
        largeChanges: suggestions.filter(s => s.includes('Large diff')).length
      }
    };
  }

  /**
   * Commit enhancer implementation
   */
  private static async executeCommitEnhancer(context: CommitContext): Promise<HookResult> {
    const suggestions: string[] = [];
    let enhancedMessage = context.message;

    // Check commit message quality
    if (context.message.length < 10) {
      suggestions.push('Commit message is too short - provide more detail');
    }

    if (!context.message.match(/^(feat|fix|docs|style|refactor|test|chore):/)) {
      const type = this.inferCommitType(context);
      enhancedMessage = `${type}: ${context.message}`;
      suggestions.push(`Consider using conventional commit format: ${enhancedMessage}`);
    }

    // Add file statistics if significant
    if (context.stats.files > 10) {
      enhancedMessage += `\n\nChanged ${context.stats.files} files (+${context.stats.additions} -${context.stats.deletions})`;
    }

    // Check for breaking changes
    const breakingChanges = this.detectBreakingChanges(context);
    if (breakingChanges.length > 0) {
      enhancedMessage += '\n\nBREAKING CHANGES:\n' + breakingChanges.join('\n');
      suggestions.push('Breaking changes detected - ensure proper versioning');
    }

    return {
      success: true,
      suggestions,
      transformedInput: enhancedMessage !== context.message ? { message: enhancedMessage } : undefined,
      metadata: {
        originalLength: context.message.length,
        enhancedLength: enhancedMessage.length,
        hasBreakingChanges: breakingChanges.length > 0
      }
    };
  }

  /**
   * Error analyzer implementation
   */
  private static async executeErrorAnalyzer(
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const error = additionalContext?.error || '';
    const suggestions: string[] = [];
    const solutions: string[] = [];

    // Common error patterns and solutions
    const errorPatterns = [
      {
        pattern: /ENOENT.*package\.json/,
        suggestion: 'Run npm init to create package.json',
        solution: 'npm init -y'
      },
      {
        pattern: /Module not found/,
        suggestion: 'Install missing dependency',
        solution: 'npm install <missing-module>'
      },
      {
        pattern: /Permission denied/,
        suggestion: 'Check file permissions or use sudo if appropriate',
        solution: 'chmod +x <file> or sudo <command>'
      },
      {
        pattern: /git.*not a git repository/,
        suggestion: 'Initialize git repository',
        solution: 'git init'
      },
      {
        pattern: /No such file or directory/,
        suggestion: 'Verify file path exists',
        solution: 'Check file path and create if necessary'
      }
    ];

    // Match error patterns
    for (const { pattern, suggestion, solution } of errorPatterns) {
      if (pattern.test(error)) {
        suggestions.push(suggestion);
        solutions.push(solution);
      }
    }

    // Provider-specific error handling
    const providerSuggestions = this.getProviderSpecificSuggestions(context.provider, error);
    suggestions.push(...providerSuggestions);

    // Generic suggestions if no specific match
    if (suggestions.length === 0) {
      suggestions.push(
        'Check command syntax and arguments',
        'Verify required dependencies are installed',
        'Review error message for specific details'
      );
    }

    return {
      success: true,
      suggestions,
      data: solutions,
      metadata: {
        errorType: this.categorizeError(error),
        provider: context.provider,
        hasAutofix: solutions.length > 0
      }
    };
  }

  /**
   * Performance monitor implementation
   */
  private static async executePerformanceMonitor(
    context: HookContext, 
    additionalContext?: any
  ): Promise<HookResult> {
    const performance = additionalContext?.performance || {};
    const warnings: string[] = [];
    const metrics: any = {};

    // Check execution time
    if (performance.executionTime > 30000) {
      warnings.push(`Long execution time: ${performance.executionTime}ms`);
    }

    // Memory usage check
    if (performance.memoryUsage && performance.memoryUsage > 500 * 1024 * 1024) {
      warnings.push(`High memory usage: ${Math.round(performance.memoryUsage / 1024 / 1024)}MB`);
    }

    // Token usage analysis
    if (performance.tokenCount > 8000) {
      warnings.push(`High token usage: ${performance.tokenCount} tokens`);
    }

    // Rate limiting check
    if (performance.rateLimited) {
      warnings.push('Rate limiting detected - consider throttling requests');
    }

    metrics.executionTime = performance.executionTime;
    metrics.memoryUsage = performance.memoryUsage;
    metrics.tokenCount = performance.tokenCount;
    metrics.provider = context.provider;
    metrics.model = context.model;

    return {
      success: true,
      suggestions: warnings,
      data: metrics,
      metadata: {
        performanceGrade: this.calculatePerformanceGrade(performance),
        optimizationSuggestions: this.getOptimizationSuggestions(performance)
      }
    };
  }

  // Helper methods for built-in hooks

  private static getCommandOptimizations(command: string[]): {
    suggestions: string[];
    transformedCommand?: string[];
  } {
    const suggestions: string[] = [];
    let transformedCommand: string[] | undefined;

    const cmdStr = command.join(' ');

    // grep -> rg optimization (Claude Code style)
    if (cmdStr.includes('grep ') && !cmdStr.includes('|')) {
      suggestions.push("Use 'rg' (ripgrep) instead of 'grep' for better performance");
      transformedCommand = command.map(arg => arg === 'grep' ? 'rg' : arg);
    }

    // find -> rg optimization
    if (cmdStr.match(/find\s+\S+\s+-name/)) {
      suggestions.push("Use 'rg --files -g pattern' instead of 'find -name' for better performance");
    }

    // npm -> pnpm suggestion
    if (command[0] === 'npm' && command[1] === 'install') {
      suggestions.push("Consider using 'pnpm' for faster installs and better disk usage");
    }

    // Add parallel flag suggestions
    if (command[0] === 'npm' && command.includes('test')) {
      suggestions.push("Add --parallel flag for faster test execution");
    }

    return { suggestions, transformedCommand };
  }

  private static getPerformanceWarnings(command: string[]): string[] {
    const warnings: string[] = [];
    const cmdStr = command.join(' ');

    // Warn about potentially slow operations
    if (cmdStr.includes('npm install') && !cmdStr.includes('--production')) {
      warnings.push('Installing dev dependencies - use --production for faster installs in production');
    }

    if (cmdStr.includes('recursive') || cmdStr.includes('-r')) {
      warnings.push('Recursive operation detected - may be slow on large directories');
    }

    return warnings;
  }

  private static checkForCredentials(data: any): { found: boolean; types: string[] } {
    const text = JSON.stringify(data);
    const patterns = [
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/, type: 'password' },
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/, type: 'api_key' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/, type: 'secret' },
      { pattern: /token\s*[:=]\s*['"][^'"]+['"]/, type: 'token' },
    ];

    const found = patterns.some(p => p.pattern.test(text));
    const types = patterns.filter(p => p.pattern.test(text)).map(p => p.type);

    return { found, types };
  }

  private static checkDangerousPatterns(data: any): string[] {
    const issues: string[] = [];
    const text = JSON.stringify(data);

    const dangerousPatterns = [
      { pattern: /rm\s+-rf\s+\//, issue: 'Dangerous recursive delete of root directory' },
      { pattern: /sudo\s+.*\|\s*sh/, issue: 'Piping to shell with sudo privileges' },
      { pattern: /curl.*\|\s*sh/, issue: 'Executing downloaded script directly' },
      { pattern: /eval\s*\(/, issue: 'Dynamic code evaluation detected' },
    ];

    for (const { pattern, issue } of dangerousPatterns) {
      if (pattern.test(text)) {
        issues.push(issue);
      }
    }

    return issues;
  }

  private static checkEnvironmentSecurity(context: HookContext): string[] {
    const issues: string[] = [];

    // Check for development environment in production context
    if (context.environment.NODE_ENV === 'production' && context.environment.DEBUG) {
      issues.push('Debug mode enabled in production environment');
    }

    // Check for missing security variables
    if (!context.environment.NODE_ENV) {
      issues.push('NODE_ENV not set - may cause security issues');
    }

    return issues;
  }

  private static isSensitiveFile(filePath: string): boolean {
    const sensitivePatterns = [
      /\.env/,
      /\.key$/,
      /\.pem$/,
      /\.p12$/,
      /config\/database/,
      /config\/secrets/,
      /\.ssh\//,
      /package-lock\.json$/,
      /yarn\.lock$/
    ];

    return sensitivePatterns.some(pattern => pattern.test(filePath));
  }

  private static analyzeDiffContent(diff: any): string[] {
    const issues: string[] = [];
    const lines = diff.unified.split('\n');

    // Check for debug code
    const debugPatterns = [/console\.log/, /debugger/, /print\(/, /dump\(/];
    if (lines.some(line => debugPatterns.some(pattern => pattern.test(line)))) {
      issues.push(`Possible debug code in ${diff.file}`);
    }

    // Check for TODO/FIXME comments
    const todoPatterns = [/TODO/, /FIXME/, /HACK/, /XXX/];
    if (lines.some(line => todoPatterns.some(pattern => pattern.test(line)))) {
      issues.push(`TODO/FIXME comments in ${diff.file}`);
    }

    return issues;
  }

  private static suggestDiffImprovements(diff: any): any[] {
    const improvements: any[] = [];

    // Suggest formatting if mixed indentation
    const lines = diff.newContent.split('\n');
    const hasSpaces = lines.some(line => line.startsWith('  '));
    const hasTabs = lines.some(line => line.startsWith('\t'));

    if (hasSpaces && hasTabs) {
      improvements.push({
        type: 'formatting',
        message: `Mixed indentation in ${diff.file}`,
        suggestion: 'Use consistent indentation (spaces or tabs)'
      });
    }

    return improvements;
  }

  private static inferCommitType(context: CommitContext): string {
    const files = context.files;
    
    // Infer type based on files changed
    if (files.some(f => f.includes('test'))) return 'test';
    if (files.some(f => f.endsWith('.md'))) return 'docs';
    if (files.some(f => f.includes('config') || f.includes('.json'))) return 'chore';
    if (files.some(f => f.includes('fix') || context.message.toLowerCase().includes('fix'))) return 'fix';
    
    return 'feat';
  }

  private static detectBreakingChanges(context: CommitContext): string[] {
    const breaking: string[] = [];
    
    // Simple heuristics for breaking changes
    if (context.message.toLowerCase().includes('breaking')) {
      breaking.push('Explicit breaking change mentioned in commit message');
    }
    
    if (context.stats.deletions > context.stats.additions * 2) {
      breaking.push('Large amount of code removed - potential breaking change');
    }

    return breaking;
  }

  private static getProviderSpecificSuggestions(provider: string, error: string): string[] {
    const suggestions: string[] = [];

    switch (provider) {
      case 'openai':
        if (error.includes('rate_limit_exceeded')) {
          suggestions.push('OpenAI rate limit exceeded - wait and retry or upgrade plan');
        }
        if (error.includes('context_length_exceeded')) {
          suggestions.push('Context too long for OpenAI - reduce input size or use different model');
        }
        break;

      case 'anthropic':
        if (error.includes('rate_limit')) {
          suggestions.push('Anthropic rate limit - consider using Claude-3-haiku for lighter tasks');
        }
        break;

      case 'ollama':
        if (error.includes('connection refused')) {
          suggestions.push('Ollama server not running - start with: ollama serve');
        }
        break;
    }

    return suggestions;
  }

  private static categorizeError(error: string): string {
    if (error.includes('permission') || error.includes('access')) return 'permission';
    if (error.includes('not found') || error.includes('ENOENT')) return 'file_not_found';
    if (error.includes('network') || error.includes('connection')) return 'network';
    if (error.includes('syntax') || error.includes('parse')) return 'syntax';
    if (error.includes('rate limit')) return 'rate_limit';
    if (error.includes('timeout')) return 'timeout';
    return 'unknown';
  }

  private static calculatePerformanceGrade(performance: any): string {
    let score = 100;
    
    if (performance.executionTime > 60000) score -= 30;
    else if (performance.executionTime > 30000) score -= 15;
    
    if (performance.memoryUsage > 1024 * 1024 * 1024) score -= 20;
    else if (performance.memoryUsage > 500 * 1024 * 1024) score -= 10;
    
    if (performance.tokenCount > 10000) score -= 15;
    else if (performance.tokenCount > 5000) score -= 5;

    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private static getOptimizationSuggestions(performance: any): string[] {
    const suggestions: string[] = [];

    if (performance.executionTime > 30000) {
      suggestions.push('Consider breaking large tasks into smaller chunks');
    }

    if (performance.tokenCount > 8000) {
      suggestions.push('Reduce context size or use summarization');
    }

    if (performance.memoryUsage > 500 * 1024 * 1024) {
      suggestions.push('Optimize memory usage - avoid loading large files entirely');
    }

    return suggestions;
  }
}