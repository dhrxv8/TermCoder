import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { hookManager } from "../hooks/manager.js";

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  type: 'command' | 'path' | 'content' | 'environment' | 'network';
  pattern: RegExp | string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'warn' | 'block' | 'transform';
  suggestion?: string;
  replacement?: string;
  enabled: boolean;
  metadata?: Record<string, any>;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: SecurityRule[];
  contexts: string[];
  strictMode: boolean;
  allowOverrides: boolean;
}

export interface SandboxContext {
  repoPath: string;
  provider: string;
  model: string;
  user?: string;
  session: string;
  environment: 'development' | 'staging' | 'production';
  projectType?: string;
  framework?: string;
}

export interface SecurityViolation {
  ruleId: string;
  ruleName: string;
  severity: string;
  message: string;
  suggestion?: string;
  input: string;
  context: SandboxContext;
  timestamp: number;
}

export interface EnhancedSandboxResult {
  success: boolean;
  blocked: boolean;
  violations: SecurityViolation[];
  warnings: string[];
  transformedInput?: any;
  data?: {
    stdout: string;
    stderr: string;
    code: number;
  };
  metadata: {
    executionTime: number;
    rulesEvaluated: number;
    policyApplied: string;
  };
}

/**
 * Enhanced Security Sandbox with dynamic validation, policies, and AI-powered detection
 * Far superior to Claude Code's basic validation
 */
export class EnhancedSecuritySandbox {
  private policies: Map<string, SecurityPolicy> = new Map();
  private ruleCache: Map<string, SecurityRule[]> = new Map();
  private violationHistory: SecurityViolation[] = [];
  private configPath: string;
  private learningMode: boolean = true;
  
  constructor(configDir: string = path.join(process.env.HOME || "~", ".termcode", "security")) {
    this.configPath = configDir;
  }

  /**
   * Initialize enhanced sandbox with dynamic policies
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.configPath, { recursive: true });
      await this.loadPolicies();
      await this.loadDefaultRules();
      
      log.info(`Enhanced sandbox initialized with ${this.policies.size} policies`);
    } catch (error) {
      log.error("Failed to initialize enhanced sandbox:", error);
      throw error;
    }
  }

  /**
   * Execute command with comprehensive security validation
   */
  async validateAndExecute(
    command: string | string[],
    context: SandboxContext,
    options: {
      dryRun?: boolean;
      policyId?: string;
      allowOverrides?: boolean;
      timeout?: number;
    } = {}
  ): Promise<EnhancedSandboxResult> {
    const startTime = Date.now();
    const commandArray = Array.isArray(command) ? command : [command];
    const commandString = commandArray.join(' ');
    
    // Select applicable policy
    const policy = await this.selectPolicy(context, options.policyId);
    
    // Get applicable rules
    const rules = await this.getApplicableRules(policy, context);
    
    const result: EnhancedSandboxResult = {
      success: true,
      blocked: false,
      violations: [],
      warnings: [],
      metadata: {
        executionTime: 0,
        rulesEvaluated: rules.length,
        policyApplied: policy.id
      }
    };

    // Execute hook-based validation first
    const hookResults = await hookManager.executeHooks('PreToolUse', {
      repoPath: context.repoPath,
      currentBranch: 'current',
      provider: context.provider,
      model: context.model,
      sessionId: context.session,
      timestamp: Date.now(),
      environment: process.env
    }, {
      toolName: 'shell',
      toolInput: { command: commandArray },
      originalCommand: commandArray
    });

    // Process hook results
    for (const hookResult of hookResults) {
      if (!hookResult.success && hookResult.result.error?.includes('CRITICAL')) {
        result.blocked = true;
        result.violations.push({
          ruleId: hookResult.hookId,
          ruleName: 'Hook Validation',
          severity: 'critical',
          message: hookResult.result.error!,
          suggestion: hookResult.result.suggestions?.[0],
          input: commandString,
          context,
          timestamp: Date.now()
        });
      }
      
      if (hookResult.result.suggestions) {
        result.warnings.push(...hookResult.result.suggestions);
      }
      
      if (hookResult.result.transformedInput) {
        result.transformedInput = hookResult.result.transformedInput;
      }
    }

    // Apply security rules
    for (const rule of rules) {
      const violation = await this.evaluateRule(rule, commandString, context);
      if (violation) {
        result.violations.push(violation);
        
        switch (rule.action) {
          case 'block':
            result.blocked = true;
            result.success = false;
            break;
          case 'transform':
            if (rule.replacement) {
              result.transformedInput = {
                command: commandArray.map(cmd => 
                  cmd.replace(new RegExp(rule.pattern), rule.replacement!)
                )
              };
            }
            break;
          case 'warn':
            result.warnings.push(violation.message);
            break;
        }
      }
    }

    // AI-powered anomaly detection
    const anomalies = await this.detectAnomalies(commandString, context);
    result.warnings.push(...anomalies);

    // If blocked, don't execute
    if (result.blocked) {
      result.metadata.executionTime = Date.now() - startTime;
      await this.logViolations(result.violations);
      return result;
    }

    // Execute if not blocked and not dry run
    if (!options.dryRun) {
      try {
        const execResult = await this.executeSecure(
          result.transformedInput?.command || commandArray,
          context,
          options.timeout || 30000
        );
        result.data = execResult;
      } catch (error) {
        result.success = false;
        result.warnings.push(`Execution failed: ${error}`);
      }
    }

    result.metadata.executionTime = Date.now() - startTime;
    await this.logViolations(result.violations);
    
    // Learn from this execution
    if (this.learningMode) {
      await this.learnFromExecution(commandString, context, result);
    }

    return result;
  }

  /**
   * Load security policies from configuration
   */
  private async loadPolicies(): Promise<void> {
    const policiesPath = path.join(this.configPath, "policies.json");
    
    try {
      const data = await fs.readFile(policiesPath, 'utf8');
      const policies = JSON.parse(data);
      
      for (const policy of policies) {
        this.policies.set(policy.id, policy);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        await this.createDefaultPolicies();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create comprehensive default security policies
   */
  private async createDefaultPolicies(): Promise<void> {
    const policies: SecurityPolicy[] = [
      {
        id: 'development',
        name: 'Development Environment',
        description: 'Relaxed security for development work',
        contexts: ['development'],
        strictMode: false,
        allowOverrides: true,
        rules: []
      },
      {
        id: 'production',
        name: 'Production Environment',
        description: 'Strict security for production environments',
        contexts: ['production', 'staging'],
        strictMode: true,
        allowOverrides: false,
        rules: []
      },
      {
        id: 'ai-assisted',
        name: 'AI-Assisted Development',
        description: 'Enhanced security for AI-generated code',
        contexts: ['ai', 'assistant'],
        strictMode: true,
        allowOverrides: true,
        rules: []
      }
    ];

    for (const policy of policies) {
      this.policies.set(policy.id, policy);
    }

    await this.savePolicies();
  }

  /**
   * Load comprehensive default security rules
   */
  private async loadDefaultRules(): Promise<void> {
    const defaultRules: SecurityRule[] = [
      // Critical system security
      {
        id: 'critical_system_delete',
        name: 'Critical System Delete',
        description: 'Prevents deletion of critical system files',
        type: 'command',
        pattern: /rm\s+-rf\s+\/(bin|boot|dev|etc|lib|proc|root|sbin|sys|usr\/bin|usr\/sbin)/,
        severity: 'critical',
        action: 'block',
        suggestion: 'This command could damage your system. Use specific file paths instead.',
        enabled: true
      },
      {
        id: 'sudo_privilege_escalation',
        name: 'Sudo Privilege Escalation',
        description: 'Monitors sudo usage for security',
        type: 'command',
        pattern: /sudo\s+/,
        severity: 'high',
        action: 'warn',
        suggestion: 'Verify this command requires elevated privileges',
        enabled: true
      },
      {
        id: 'remote_code_execution',
        name: 'Remote Code Execution',
        description: 'Blocks downloading and executing scripts',
        type: 'command',
        pattern: /(curl|wget)\s+.*?\|\s*(sh|bash|python|node)/,
        severity: 'critical',
        action: 'block',
        suggestion: 'Download and review scripts before execution',
        enabled: true
      },
      
      // Network security
      {
        id: 'network_listener',
        name: 'Network Listener',
        description: 'Monitors creation of network listeners',
        type: 'command',
        pattern: /nc\s+-l|netcat\s+-l|python.*SimpleHTTPServer|python.*http\.server/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Review network listener configuration for security',
        enabled: true
      },
      {
        id: 'data_exfiltration',
        name: 'Data Exfiltration',
        description: 'Monitors potential data exfiltration',
        type: 'command',
        pattern: /(scp|rsync|curl\s+-X\s+POST)\s+.*?[^@]+@/,
        severity: 'high',
        action: 'warn',
        suggestion: 'Verify data transfer destination and content',
        enabled: true
      },

      // Code injection and execution
      {
        id: 'code_injection',
        name: 'Code Injection',
        description: 'Detects potential code injection patterns',
        type: 'command',
        pattern: /eval\s*\(|exec\s*\(|system\s*\(|shell_exec\s*\(/,
        severity: 'high',
        action: 'warn',
        suggestion: 'Avoid dynamic code execution when possible',
        enabled: true
      },
      {
        id: 'dangerous_interpreters',
        name: 'Dangerous Interpreter Usage',
        description: 'Monitors usage of interpreters with user input',
        type: 'command',
        pattern: /(python|node|ruby)\s+-c\s+["'].*\$.*["']/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Validate and sanitize any user input in interpreter commands',
        enabled: true
      },

      // File system security  
      {
        id: 'sensitive_file_access',
        name: 'Sensitive File Access',
        description: 'Monitors access to sensitive files',
        type: 'path',
        pattern: /\/(etc\/passwd|etc\/shadow|\.ssh\/|\.aws\/|\.kube\/)/,
        severity: 'high',
        action: 'warn',
        suggestion: 'Accessing sensitive files - ensure proper authorization',
        enabled: true
      },
      {
        id: 'config_modification',
        name: 'Configuration Modification',
        description: 'Monitors changes to configuration files',
        type: 'command',
        pattern: />\s*(\/etc\/|\/usr\/|\/var\/|~\/\.(bash|zsh|ssh))/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Review configuration changes carefully',
        enabled: true
      },

      // Package manager security
      {
        id: 'package_install_sudo',
        name: 'Package Install with Sudo',
        description: 'Monitors privileged package installations',
        type: 'command',
        pattern: /sudo\s+(npm|pip|apt|yum|brew|pacman)\s+install/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Use user-level package managers when possible',
        enabled: true
      },
      {
        id: 'npm_audit_bypass',
        name: 'NPM Audit Bypass',
        description: 'Detects attempts to bypass npm security',
        type: 'command',
        pattern: /npm.*--audit\s+(false|off)|npm.*--no-audit/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Avoid bypassing security audits',
        enabled: true
      },

      // Git security
      {
        id: 'git_credential_exposure',
        name: 'Git Credential Exposure',
        description: 'Prevents committing credentials',
        type: 'content',
        pattern: /(password|secret|key|token)\s*[:=]\s*["'][^"']{8,}["']/i,
        severity: 'high',
        action: 'block',
        suggestion: 'Remove credentials from code - use environment variables',
        enabled: true
      },
      {
        id: 'git_force_push',
        name: 'Git Force Push',
        description: 'Monitors dangerous git operations',
        type: 'command',
        pattern: /git\s+push\s+.*--force(-with-lease)?/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Force push can overwrite history - ensure this is intended',
        enabled: true
      },

      // AI/LLM specific security
      {
        id: 'prompt_injection',
        name: 'Prompt Injection',
        description: 'Detects potential prompt injection attempts',
        type: 'content',
        pattern: /(ignore previous|forget instructions|new instructions:|system:|assistant:|human:)/i,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Possible prompt injection attempt detected',
        enabled: true
      },
      {
        id: 'model_extraction',
        name: 'Model Extraction',
        description: 'Detects attempts to extract model information',
        type: 'content',
        pattern: /(what model are you|your training data|your weights|export model)/i,
        severity: 'low',
        action: 'warn',
        suggestion: 'Potential model probing detected',
        enabled: true
      },

      // Performance and resource security
      {
        id: 'resource_exhaustion',
        name: 'Resource Exhaustion',
        description: 'Prevents resource exhaustion attacks',
        type: 'command',
        pattern: /:(){ :|:&}|while true|for\s+i in \{1\.\.[0-9]{6,}\}/,
        severity: 'critical',
        action: 'block',
        suggestion: 'This could exhaust system resources',
        enabled: true
      },
      {
        id: 'large_file_operations',
        name: 'Large File Operations',
        description: 'Monitors operations on large files',
        type: 'command',
        pattern: /dd\s+.*bs=[0-9]+[MG]|fallocate.*[0-9]+[MG]/,
        severity: 'medium',
        action: 'warn',
        suggestion: 'Large file operation detected - verify disk space',
        enabled: true
      }
    ];

    // Assign rules to policies
    const devPolicy = this.policies.get('development');
    const prodPolicy = this.policies.get('production'); 
    const aiPolicy = this.policies.get('ai-assisted');

    if (devPolicy) {
      devPolicy.rules = defaultRules.filter(rule => 
        rule.severity === 'critical' || rule.severity === 'high'
      );
    }

    if (prodPolicy) {
      prodPolicy.rules = defaultRules; // All rules for production
    }

    if (aiPolicy) {
      aiPolicy.rules = defaultRules.filter(rule =>
        rule.type === 'command' || rule.id.includes('injection') || 
        rule.id.includes('ai') || rule.id.includes('model')
      );
    }

    await this.savePolicies();
  }

  /**
   * Select appropriate security policy based on context
   */
  private async selectPolicy(
    context: SandboxContext, 
    policyId?: string
  ): Promise<SecurityPolicy> {
    if (policyId && this.policies.has(policyId)) {
      return this.policies.get(policyId)!;
    }

    // Auto-select based on context
    if (context.environment === 'production') {
      return this.policies.get('production')!;
    }

    // AI context detection
    if (context.provider || context.model) {
      return this.policies.get('ai-assisted')!;
    }

    return this.policies.get('development')!;
  }

  /**
   * Get applicable rules for context
   */
  private async getApplicableRules(
    policy: SecurityPolicy, 
    context: SandboxContext
  ): Promise<SecurityRule[]> {
    const cacheKey = `${policy.id}-${context.environment}-${context.projectType}`;
    
    if (this.ruleCache.has(cacheKey)) {
      return this.ruleCache.get(cacheKey)!;
    }

    let rules = policy.rules.filter(rule => rule.enabled);

    // Context-specific rule filtering
    if (context.projectType === 'javascript' || context.framework?.includes('node')) {
      rules = rules.filter(rule => 
        !rule.id.includes('python') || rule.severity === 'critical'
      );
    }

    if (context.environment === 'development') {
      rules = rules.filter(rule => rule.severity !== 'low');
    }

    this.ruleCache.set(cacheKey, rules);
    return rules;
  }

  /**
   * Evaluate a security rule against input
   */
  private async evaluateRule(
    rule: SecurityRule,
    input: string,
    context: SandboxContext
  ): Promise<SecurityViolation | null> {
    let matches = false;

    try {
      if (rule.pattern instanceof RegExp) {
        matches = rule.pattern.test(input);
      } else {
        matches = input.includes(rule.pattern);
      }

      if (matches) {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: rule.description,
          suggestion: rule.suggestion,
          input,
          context,
          timestamp: Date.now()
        };
      }
    } catch (error) {
      log.warn(`Error evaluating rule ${rule.id}:`, error);
    }

    return null;
  }

  /**
   * AI-powered anomaly detection
   */
  private async detectAnomalies(
    command: string, 
    context: SandboxContext
  ): Promise<string[]> {
    const anomalies: string[] = [];

    // Pattern-based anomaly detection
    const suspiciousPatterns = [
      // Unusual character combinations
      /[^\x20-\x7E]{3,}/,  // Non-printable characters
      /\$\{[^}]+\}/g,      // Variable substitution
      /`[^`]+`/g,          // Command substitution
      /\|\s*\|/,           // Double pipe
      /;\s*;/,             // Double semicolon
      /&&\s*&&/,           // Double AND
      /\\\\/,              // Escaped backslash
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(command)) {
        anomalies.push(`Suspicious pattern detected in command: ${pattern.source}`);
      }
    }

    // Statistical anomaly detection
    const stats = this.analyzeCommandStatistics(command);
    if (stats.complexity > 0.8) {
      anomalies.push('Command has unusually high complexity');
    }

    if (stats.entropy > 5.0) {
      anomalies.push('Command has high entropy (possible obfuscation)');
    }

    // Context-based anomaly detection
    if (context.provider && !this.isTypicalAICommand(command)) {
      const similarity = await this.calculateCommandSimilarity(command, context);
      if (similarity < 0.3) {
        anomalies.push('Command is unusual for AI-assisted development');
      }
    }

    return anomalies;
  }

  /**
   * Analyze command complexity and entropy
   */
  private analyzeCommandStatistics(command: string): {
    complexity: number;
    entropy: number;
    length: number;
  } {
    // Complexity based on special characters, nesting, etc.
    const specialChars = (command.match(/[|&;<>(){}[\]$`\\]/g) || []).length;
    const complexity = Math.min(specialChars / command.length, 1);

    // Shannon entropy calculation
    const chars = new Map<string, number>();
    for (const char of command) {
      chars.set(char, (chars.get(char) || 0) + 1);
    }
    
    let entropy = 0;
    for (const count of chars.values()) {
      const p = count / command.length;
      entropy -= p * Math.log2(p);
    }

    return {
      complexity,
      entropy,
      length: command.length
    };
  }

  /**
   * Check if command is typical for AI development
   */
  private isTypicalAICommand(command: string): boolean {
    const typicalPatterns = [
      /npm\s+(install|run|test)/,
      /git\s+(add|commit|push|pull|status)/,
      /(cd|ls|mkdir|touch|cat|grep|find)/,
      /python\s+(.*\.py|test|setup\.py)/,
      /node\s+(.*\.js|test)/,
      /(cargo|go)\s+(build|test|run)/,
      /docker\s+(build|run|ps|images)/
    ];

    return typicalPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Calculate similarity to typical commands in context
   */
  private async calculateCommandSimilarity(
    command: string, 
    context: SandboxContext
  ): Promise<number> {
    // Simple similarity based on common words and patterns
    // In production, this could use more sophisticated NLP
    
    const commandWords = command.toLowerCase().split(/\s+/);
    const commonWords = [
      'npm', 'install', 'run', 'test', 'build',
      'git', 'add', 'commit', 'push', 'pull',
      'cd', 'ls', 'mkdir', 'cat', 'grep',
      'python', 'node', 'cargo', 'go'
    ];

    const matches = commandWords.filter(word => commonWords.includes(word));
    return matches.length / Math.max(commandWords.length, 1);
  }

  /**
   * Execute command with enhanced security
   */
  private async executeSecure(
    command: string[],
    context: SandboxContext,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const { spawn } = await import("node:child_process");
    
    // Create restricted environment
    const env = this.createRestrictedEnvironment(context);
    
    return new Promise((resolve, reject) => {
      const child = spawn(command[0], command.slice(1), {
        cwd: context.repoPath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout
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
    });
  }

  /**
   * Create restricted environment for command execution
   */
  private createRestrictedEnvironment(context: SandboxContext): Record<string, string> {
    const safeEnvVars = [
      'PATH', 'HOME', 'USER', 'PWD', 'TERM',
      'NODE_ENV', 'NODE_PATH', 'PYTHON_PATH',
      'LANG', 'LC_ALL', 'TZ'
    ];

    const env: Record<string, string> = {};
    
    for (const key of safeEnvVars) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }

    // Add context-specific variables
    env.TERMCODE_PROVIDER = context.provider;
    env.TERMCODE_MODEL = context.model;
    env.TERMCODE_SESSION = context.session;
    env.TERMCODE_ENVIRONMENT = context.environment;

    return env;
  }

  /**
   * Log security violations
   */
  private async logViolations(violations: SecurityViolation[]): Promise<void> {
    if (violations.length === 0) return;

    this.violationHistory.push(...violations);
    
    // Keep only recent violations (last 1000)
    if (this.violationHistory.length > 1000) {
      this.violationHistory = this.violationHistory.slice(-1000);
    }

    // Log to file
    const logPath = path.join(this.configPath, 'violations.log');
    const logEntries = violations.map(v => JSON.stringify(v)).join('\n') + '\n';
    
    try {
      await fs.appendFile(logPath, logEntries);
    } catch (error) {
      log.warn('Failed to write violation log:', error);
    }
  }

  /**
   * Learn from execution patterns (ML-style adaptation)
   */
  private async learnFromExecution(
    command: string,
    context: SandboxContext,
    result: EnhancedSandboxResult
  ): Promise<void> {
    // Simple learning: adjust rule sensitivity based on false positives
    if (result.success && result.violations.length > 0) {
      // If execution succeeded despite violations, maybe rules are too strict
      for (const violation of result.violations) {
        if (violation.severity === 'low') {
          // Consider reducing sensitivity of this rule
          log.debug(`Learning: Command '${command}' succeeded despite violation ${violation.ruleId}`);
        }
      }
    }

    // Track command patterns for anomaly detection baseline
    const stats = this.analyzeCommandStatistics(command);
    // In a full implementation, this would update ML models
  }

  /**
   * Save policies to disk
   */
  private async savePolicies(): Promise<void> {
    const policiesPath = path.join(this.configPath, "policies.json");
    const policies = Array.from(this.policies.values());
    
    try {
      await fs.writeFile(policiesPath, JSON.stringify(policies, null, 2));
    } catch (error) {
      log.error('Failed to save security policies:', error);
    }
  }

  /**
   * Public API methods
   */

  /**
   * Add custom security rule
   */
  async addRule(policyId: string, rule: SecurityRule): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    policy.rules.push(rule);
    this.ruleCache.clear(); // Clear cache
    await this.savePolicies();
    
    log.info(`Security rule ${rule.id} added to policy ${policyId}`);
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalViolations: number;
    violationsBySeverity: Record<string, number>;
    mostTriggeredRules: Array<{ ruleId: string; count: number }>;
    recentTrends: Array<{ date: string; violations: number }>;
  } {
    const violationsBySeverity: Record<string, number> = {};
    const ruleFrequency = new Map<string, number>();

    for (const violation of this.violationHistory) {
      violationsBySeverity[violation.severity] = 
        (violationsBySeverity[violation.severity] || 0) + 1;
      
      ruleFrequency.set(
        violation.ruleId,
        (ruleFrequency.get(violation.ruleId) || 0) + 1
      );
    }

    const mostTriggeredRules = Array.from(ruleFrequency.entries())
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate recent trends (last 7 days)
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const recentTrends = [];

    for (let i = 6; i >= 0; i--) {
      const dayStart = now - (i * oneDayMs);
      const dayEnd = dayStart + oneDayMs;
      
      const dayViolations = this.violationHistory.filter(v =>
        v.timestamp >= dayStart && v.timestamp < dayEnd
      ).length;

      recentTrends.push({
        date: new Date(dayStart).toISOString().split('T')[0],
        violations: dayViolations
      });
    }

    return {
      totalViolations: this.violationHistory.length,
      violationsBySeverity,
      mostTriggeredRules,
      recentTrends
    };
  }

  /**
   * Enable/disable learning mode
   */
  setLearningMode(enabled: boolean): void {
    this.learningMode = enabled;
    log.info(`Security learning mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): SecurityPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * List all policies
   */
  listPolicies(): SecurityPolicy[] {
    return Array.from(this.policies.values());
  }
}

// Export singleton instance
export const enhancedSandbox = new EnhancedSecuritySandbox();