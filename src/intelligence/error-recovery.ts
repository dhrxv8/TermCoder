import { log } from "../util/logging.js";
import { runShell } from "../tools/shell.js";
import { getProvider } from "../providers/index.js";
import { workspaceManager } from "../workspace/manager.js";
import path from "node:path";

export interface ErrorContext {
  command?: string[];
  error: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  repoPath: string;
  provider: string;
  model: string;
  timestamp: number;
  retryCount?: number;
  projectType?: string;
  framework?: string;
  environment?: string;
}

export interface RecoveryAction {
  id: string;
  type: 'command' | 'fix' | 'install' | 'config' | 'manual';
  title: string;
  description: string;
  command?: string[];
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  automation: 'automatic' | 'prompted' | 'manual';
  prerequisites?: string[];
  followUp?: RecoveryAction[];
}

export interface RecoveryPlan {
  error: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: RecoveryAction[];
  explanation: string;
  prevention: string[];
  relatedIssues?: string[];
  estimatedTime: number;
  success: boolean;
}

export interface ErrorPattern {
  id: string;
  name: string;
  patterns: RegExp[];
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  platforms: string[];
  languages: string[];
  frameworks: string[];
  solutions: Array<{
    title: string;
    commands?: string[];
    description: string;
    confidence: number;
    automatic: boolean;
  }>;
}

/**
 * Advanced Error Recovery System with AI-powered suggestions
 * Far superior to Claude Code's basic error handling
 */
export class IntelligentErrorRecovery {
  private errorPatterns: ErrorPattern[] = [];
  private recoveryHistory: Map<string, RecoveryPlan[]> = new Map();
  private successfulRecoveries: Map<string, RecoveryAction> = new Map();
  private knowledgeBase: Map<string, any> = new Map();
  
  constructor() {
    this.initializeErrorPatterns();
    this.loadKnowledgeBase();
  }

  /**
   * Analyze error and generate comprehensive recovery plan
   */
  async analyzeAndRecover(context: ErrorContext): Promise<RecoveryPlan> {
    log.info(`Analyzing error: ${context.error.substring(0, 100)}...`);

    // Step 1: Pattern matching for known errors
    const pattern = this.matchErrorPattern(context);
    
    // Step 2: Context-aware analysis
    const contextualInfo = await this.gatherContextualInformation(context);
    
    // Step 3: AI-powered analysis for unknown errors
    const aiAnalysis = pattern ? null : await this.performAIAnalysis(context, contextualInfo);
    
    // Step 4: Generate recovery plan
    const plan = this.generateRecoveryPlan(context, pattern, contextualInfo, aiAnalysis);
    
    // Step 5: Learn from this error
    await this.learnFromError(context, plan);
    
    return plan;
  }

  /**
   * Execute recovery plan with user confirmation
   */
  async executeRecoveryPlan(
    plan: RecoveryPlan,
    context: ErrorContext,
    options: { autoExecute?: boolean; maxRetries?: number } = {}
  ): Promise<{ success: boolean; executedActions: RecoveryAction[]; finalError?: string }> {
    const executedActions: RecoveryAction[] = [];
    const maxRetries = options.maxRetries || 3;
    let currentRetry = 0;

    log.info(`Executing recovery plan for: ${plan.category}`);

    for (const action of plan.actions) {
      if (currentRetry >= maxRetries) {
        log.warn('Maximum retry count reached, stopping recovery execution');
        break;
      }

      try {
        // Check prerequisites
        if (action.prerequisites && !await this.checkPrerequisites(action.prerequisites, context)) {
          log.warn(`Prerequisites not met for action: ${action.title}`);
          continue;
        }

        // Determine if we should execute automatically
        const shouldExecute = this.shouldAutoExecute(action, options.autoExecute);
        
        if (!shouldExecute) {
          log.info(`Skipping action (user confirmation required): ${action.title}`);
          continue;
        }

        log.info(`Executing recovery action: ${action.title}`);
        const success = await this.executeAction(action, context);
        
        if (success) {
          executedActions.push(action);
          log.success(`Recovery action succeeded: ${action.title}`);
          
          // Execute follow-up actions if any
          if (action.followUp) {
            for (const followUp of action.followUp) {
              const followUpSuccess = await this.executeAction(followUp, context);
              if (followUpSuccess) {
                executedActions.push(followUp);
              }
            }
          }
          
          // Test if original issue is resolved
          if (await this.verifyRecovery(context)) {
            return { success: true, executedActions };
          }
        } else {
          log.warn(`Recovery action failed: ${action.title}`);
        }

      } catch (error) {
        log.error(`Error executing recovery action ${action.title}:`, error);
        currentRetry++;
      }
    }

    // If we get here, recovery didn't fully succeed
    return { 
      success: false, 
      executedActions, 
      finalError: 'Recovery plan execution incomplete or unsuccessful'
    };
  }

  /**
   * Initialize comprehensive error patterns
   */
  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      // Node.js / NPM errors
      {
        id: 'npm_missing_package',
        name: 'Missing NPM Package',
        patterns: [
          /Cannot find module ['"]([^'"]+)['"]/,
          /Module not found: Error: Can't resolve ['"]([^'"]+)['"]/,
          /Error: Cannot resolve module ['"]([^'"]+)['"]/
        ],
        category: 'dependency',
        severity: 'medium',
        platforms: ['node', 'npm'],
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'vue', 'angular', 'express'],
        solutions: [
          {
            title: 'Install missing package',
            commands: ['npm install {package}'],
            description: 'Install the missing package using npm',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Install as dev dependency',
            commands: ['npm install --save-dev {package}'],
            description: 'Install as development dependency if it\'s a dev tool',
            confidence: 0.7,
            automatic: false
          }
        ]
      },
      {
        id: 'npm_peer_dependency',
        name: 'NPM Peer Dependency Warning',
        patterns: [
          /npm WARN .* requires a peer of ([^@\s]+)@([^\s]+)/,
          /Could not resolve dependency.*peer ([^@\s]+)@([^\s]+)/
        ],
        category: 'dependency',
        severity: 'medium',
        platforms: ['npm'],
        languages: ['javascript', 'typescript'],
        frameworks: ['react', 'vue', 'angular'],
        solutions: [
          {
            title: 'Install peer dependency',
            commands: ['npm install {package}@{version}'],
            description: 'Install the required peer dependency',
            confidence: 0.8,
            automatic: true
          }
        ]
      },
      {
        id: 'npm_package_json_missing',
        name: 'Package.json Missing',
        patterns: [
          /ENOENT.*package\.json/,
          /npm ERR!.*no such file or directory.*package\.json/
        ],
        category: 'configuration',
        severity: 'high',
        platforms: ['npm'],
        languages: ['javascript', 'typescript'],
        frameworks: [],
        solutions: [
          {
            title: 'Initialize npm project',
            commands: ['npm init -y'],
            description: 'Create a new package.json file',
            confidence: 0.9,
            automatic: false
          }
        ]
      },

      // Python errors
      {
        id: 'python_module_not_found',
        name: 'Python Module Not Found',
        patterns: [
          /ModuleNotFoundError: No module named '([^']+)'/,
          /ImportError: No module named ([^\s]+)/
        ],
        category: 'dependency',
        severity: 'medium',
        platforms: ['python', 'pip'],
        languages: ['python'],
        frameworks: ['django', 'flask', 'fastapi'],
        solutions: [
          {
            title: 'Install missing package with pip',
            commands: ['pip install {package}'],
            description: 'Install the missing Python package',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Install from requirements.txt',
            commands: ['pip install -r requirements.txt'],
            description: 'Install all dependencies from requirements file',
            confidence: 0.7,
            automatic: true
          }
        ]
      },
      {
        id: 'python_version_mismatch',
        name: 'Python Version Mismatch',
        patterns: [
          /SyntaxError.*invalid syntax.*python ([0-9.]+)/,
          /requires python ([0-9.]+)/i
        ],
        category: 'environment',
        severity: 'high',
        platforms: ['python'],
        languages: ['python'],
        frameworks: [],
        solutions: [
          {
            title: 'Check Python version',
            commands: ['python --version', 'python3 --version'],
            description: 'Verify which Python version is active',
            confidence: 0.8,
            automatic: true
          },
          {
            title: 'Use Python 3 explicitly',
            commands: ['python3 {original_command}'],
            description: 'Use python3 command instead of python',
            confidence: 0.7,
            automatic: false
          }
        ]
      },

      // Git errors
      {
        id: 'git_not_initialized',
        name: 'Git Repository Not Initialized',
        patterns: [
          /fatal: not a git repository/,
          /Not a git repository/
        ],
        category: 'version_control',
        severity: 'medium',
        platforms: ['git'],
        languages: [],
        frameworks: [],
        solutions: [
          {
            title: 'Initialize Git repository',
            commands: ['git init'],
            description: 'Initialize a new Git repository',
            confidence: 0.9,
            automatic: false
          }
        ]
      },
      {
        id: 'git_merge_conflict',
        name: 'Git Merge Conflict',
        patterns: [
          /CONFLICT.*Merge conflict in/,
          /Automatic merge failed/,
          /both modified:/
        ],
        category: 'version_control',
        severity: 'high',
        platforms: ['git'],
        languages: [],
        frameworks: [],
        solutions: [
          {
            title: 'Check conflicted files',
            commands: ['git status --porcelain | grep "^UU"'],
            description: 'List files with merge conflicts',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Open merge tool',
            commands: ['git mergetool'],
            description: 'Open configured merge tool to resolve conflicts',
            confidence: 0.8,
            automatic: false
          },
          {
            title: 'Abort merge',
            commands: ['git merge --abort'],
            description: 'Cancel the merge and return to previous state',
            confidence: 0.9,
            automatic: false
          }
        ]
      },

      // Permission errors
      {
        id: 'permission_denied',
        name: 'Permission Denied',
        patterns: [
          /permission denied/i,
          /EACCES/,
          /Operation not permitted/
        ],
        category: 'permissions',
        severity: 'medium',
        platforms: ['linux', 'macos'],
        languages: [],
        frameworks: [],
        solutions: [
          {
            title: 'Check file permissions',
            commands: ['ls -la {file}'],
            description: 'Check current file permissions',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Make file executable',
            commands: ['chmod +x {file}'],
            description: 'Add execute permission to file',
            confidence: 0.7,
            automatic: false
          },
          {
            title: 'Change ownership',
            commands: ['sudo chown $USER:$USER {file}'],
            description: 'Change file ownership to current user',
            confidence: 0.6,
            automatic: false
          }
        ]
      },

      // Network/connectivity errors
      {
        id: 'network_timeout',
        name: 'Network Timeout',
        patterns: [
          /timeout/i,
          /ETIMEDOUT/,
          /connection timed out/i,
          /network is unreachable/i
        ],
        category: 'network',
        severity: 'medium',
        platforms: ['network'],
        languages: [],
        frameworks: [],
        solutions: [
          {
            title: 'Check internet connectivity',
            commands: ['ping -c 3 8.8.8.8'],
            description: 'Test basic internet connectivity',
            confidence: 0.8,
            automatic: true
          },
          {
            title: 'Check DNS resolution',
            commands: ['nslookup google.com'],
            description: 'Test DNS resolution',
            confidence: 0.8,
            automatic: true
          },
          {
            title: 'Retry with increased timeout',
            commands: [],
            description: 'Retry the original command with increased timeout',
            confidence: 0.6,
            automatic: false
          }
        ]
      },

      // Compilation errors
      {
        id: 'typescript_compilation_error',
        name: 'TypeScript Compilation Error',
        patterns: [
          /error TS[0-9]+:/,
          /TypeScript error in/
        ],
        category: 'compilation',
        severity: 'high',
        platforms: ['typescript'],
        languages: ['typescript'],
        frameworks: ['react', 'angular', 'vue'],
        solutions: [
          {
            title: 'Run TypeScript compiler',
            commands: ['npx tsc --noEmit'],
            description: 'Check for TypeScript compilation errors',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Fix type errors',
            commands: [],
            description: 'Review and fix type annotations',
            confidence: 0.7,
            automatic: false
          }
        ]
      },

      // Database connection errors
      {
        id: 'database_connection_error',
        name: 'Database Connection Error',
        patterns: [
          /connection refused.*[0-9]+/,
          /database.*not.*connect/i,
          /ECONNREFUSED.*[0-9]+/
        ],
        category: 'database',
        severity: 'high',
        platforms: ['database'],
        languages: [],
        frameworks: ['django', 'rails', 'express'],
        solutions: [
          {
            title: 'Check database service status',
            commands: ['systemctl status postgresql', 'systemctl status mysql'],
            description: 'Check if database service is running',
            confidence: 0.8,
            automatic: true
          },
          {
            title: 'Check database configuration',
            commands: [],
            description: 'Verify database connection parameters',
            confidence: 0.7,
            automatic: false
          }
        ]
      },

      // Memory/resource errors
      {
        id: 'out_of_memory',
        name: 'Out of Memory Error',
        patterns: [
          /out of memory/i,
          /killed.*signal 9/,
          /ENOMEM/,
          /heap out of memory/i
        ],
        category: 'resources',
        severity: 'critical',
        platforms: ['system'],
        languages: [],
        frameworks: [],
        solutions: [
          {
            title: 'Check memory usage',
            commands: ['free -h', 'ps aux --sort=-%mem | head -10'],
            description: 'Check current memory usage and top processes',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Increase Node.js memory limit',
            commands: ['export NODE_OPTIONS="--max-old-space-size=4096"'],
            description: 'Increase Node.js heap size limit',
            confidence: 0.7,
            automatic: false
          }
        ]
      },

      // Port/address in use errors
      {
        id: 'port_already_in_use',
        name: 'Port Already in Use',
        patterns: [
          /port [0-9]+ is already in use/i,
          /EADDRINUSE.*:[0-9]+/,
          /address already in use/i
        ],
        category: 'network',
        severity: 'medium',
        platforms: ['network'],
        languages: [],
        frameworks: ['express', 'django', 'rails'],
        solutions: [
          {
            title: 'Find process using port',
            commands: ['lsof -i :{port}', 'netstat -tulpn | grep :{port}'],
            description: 'Find which process is using the port',
            confidence: 0.9,
            automatic: true
          },
          {
            title: 'Kill process on port',
            commands: ['kill -9 $(lsof -t -i:{port})'],
            description: 'Kill the process using the port',
            confidence: 0.8,
            automatic: false
          },
          {
            title: 'Use different port',
            commands: [],
            description: 'Configure application to use a different port',
            confidence: 0.7,
            automatic: false
          }
        ]
      }
    ];
  }

  /**
   * Load knowledge base with common solutions
   */
  private loadKnowledgeBase(): void {
    this.knowledgeBase.set('npm_common_solutions', {
      'react-scripts': 'npm install react-scripts',
      'typescript': 'npm install typescript @types/node',
      'eslint': 'npm install eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin',
      '@types/react': 'npm install @types/react @types/react-dom'
    });

    this.knowledgeBase.set('python_common_solutions', {
      'requests': 'pip install requests',
      'numpy': 'pip install numpy',
      'pandas': 'pip install pandas',
      'django': 'pip install django'
    });

    this.knowledgeBase.set('environment_fixes', {
      'node_version': 'Use nvm to manage Node.js versions: nvm install node',
      'python_version': 'Use pyenv to manage Python versions: pyenv install 3.x',
      'path_issues': 'Add to PATH: export PATH=$PATH:/new/path'
    });
  }

  /**
   * Match error against known patterns
   */
  private matchErrorPattern(context: ErrorContext): ErrorPattern | null {
    const errorText = `${context.error} ${context.stderr || ''} ${context.stdout || ''}`;
    
    for (const pattern of this.errorPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(errorText)) {
          // Check if pattern applies to current context
          if (this.patternApplies(pattern, context)) {
            return pattern;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if error pattern applies to current context
   */
  private patternApplies(pattern: ErrorPattern, context: ErrorContext): boolean {
    // Check platforms
    if (pattern.platforms.length > 0) {
      const hasApplicablePlatform = pattern.platforms.some(platform => {
        if (platform === 'node' && context.command?.[0] === 'node') return true;
        if (platform === 'npm' && context.command?.[0] === 'npm') return true;
        if (platform === 'python' && context.command?.[0]?.includes('python')) return true;
        if (platform === 'git' && context.command?.[0] === 'git') return true;
        return false;
      });
      
      if (!hasApplicablePlatform) return false;
    }

    // Check project type
    if (pattern.languages.length > 0 && context.projectType) {
      if (!pattern.languages.includes(context.projectType)) return false;
    }

    // Check framework
    if (pattern.frameworks.length > 0 && context.framework) {
      if (!pattern.frameworks.includes(context.framework)) return false;
    }

    return true;
  }

  /**
   * Gather contextual information about the error
   */
  private async gatherContextualInformation(context: ErrorContext): Promise<any> {
    const info: any = {
      fileSystem: {},
      processes: {},
      network: {},
      environment: {}
    };

    try {
      // Check common files existence
      const commonFiles = ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', '.git'];
      for (const file of commonFiles) {
        const filePath = path.join(context.repoPath, file);
        try {
          const fs = await import('node:fs/promises');
          await fs.access(filePath);
          info.fileSystem[file] = true;
        } catch {
          info.fileSystem[file] = false;
        }
      }

      // Get environment variables
      info.environment.nodeVersion = process.env.NODE_VERSION || 'unknown';
      info.environment.pythonPath = process.env.PYTHON_PATH || 'unknown';
      info.environment.path = process.env.PATH || '';

      // Check running processes (if command involves ports)
      if (context.error.includes('port') || context.error.includes('EADDRINUSE')) {
        try {
          const result = await runShell(['lsof', '-i', '-P', '-n'], context.repoPath);
          if (result.ok) {
            info.processes.ports = result.data.stdout;
          }
        } catch {
          // Ignore if lsof not available
        }
      }

      // Get workspace information
      const workspace = workspaceManager.getCurrentWorkspace();
      if (workspace) {
        info.workspace = {
          type: workspace.type,
          framework: workspace.framework,
          preferences: workspace.preferences
        };
      }

    } catch (error) {
      log.warn('Error gathering contextual information:', error);
    }

    return info;
  }

  /**
   * Perform AI-powered error analysis for unknown errors
   */
  private async performAIAnalysis(context: ErrorContext, contextualInfo: any): Promise<any> {
    try {
      const provider = getProvider(context.provider);
      
      const prompt = this.buildAnalysisPrompt(context, contextualInfo);
      
      const response = await provider.chat([
        { role: 'user', content: prompt }
      ], { 
        model: context.model,
        temperature: 0.1,
        maxTokens: 1000
      });

      return this.parseAIResponse(response);
    } catch (error) {
      log.warn('AI analysis failed:', error);
      return null;
    }
  }

  /**
   * Build comprehensive analysis prompt for AI
   */
  private buildAnalysisPrompt(context: ErrorContext, contextualInfo: any): string {
    return `Analyze this error and provide solutions:

ERROR DETAILS:
Command: ${context.command?.join(' ') || 'unknown'}
Error: ${context.error}
Exit Code: ${context.exitCode || 'unknown'}
STDERR: ${context.stderr || 'none'}
STDOUT: ${context.stdout || 'none'}

CONTEXT:
Project Type: ${context.projectType || 'unknown'}
Framework: ${context.framework || 'unknown'}
Environment: ${context.environment || 'unknown'}

FILE SYSTEM:
${Object.entries(contextualInfo.fileSystem)
  .map(([file, exists]) => `${file}: ${exists ? 'exists' : 'missing'}`)
  .join('\n')}

WORKSPACE INFO:
${JSON.stringify(contextualInfo.workspace || {}, null, 2)}

Please provide:
1. Error category (dependency, configuration, permissions, network, compilation, etc.)
2. Severity (low, medium, high, critical)
3. Root cause analysis
4. 2-3 concrete solutions with commands
5. Prevention strategies
6. Confidence level for each solution (0-1)

Format as JSON:
{
  "category": "",
  "severity": "",
  "rootCause": "",
  "solutions": [
    {
      "title": "",
      "description": "",
      "commands": [],
      "confidence": 0.0,
      "automatic": true/false
    }
  ],
  "prevention": [],
  "explanation": ""
}`;
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(response: any): any {
    try {
      // Extract JSON from response
      const content = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.warn('Failed to parse AI response:', error);
    }
    
    return null;
  }

  /**
   * Generate comprehensive recovery plan
   */
  private generateRecoveryPlan(
    context: ErrorContext,
    pattern: ErrorPattern | null,
    contextualInfo: any,
    aiAnalysis: any
  ): RecoveryPlan {
    const actions: RecoveryAction[] = [];
    let category = 'unknown';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let explanation = '';
    let prevention: string[] = [];

    if (pattern) {
      // Use pattern-based solutions
      category = pattern.category;
      severity = pattern.severity;
      explanation = `Known error pattern: ${pattern.name}`;
      
      for (const solution of pattern.solutions) {
        actions.push({
          id: `${pattern.id}_${actions.length}`,
          type: solution.commands ? 'command' : 'manual',
          title: solution.title,
          description: solution.description,
          command: solution.commands ? this.substituteVariables(solution.commands, context) : undefined,
          confidence: solution.confidence,
          impact: 'medium',
          automation: solution.automatic ? 'automatic' : 'prompted'
        });
      }
    }

    if (aiAnalysis) {
      // Use AI-generated solutions
      category = aiAnalysis.category || category;
      severity = aiAnalysis.severity || severity;
      explanation = aiAnalysis.explanation || aiAnalysis.rootCause || explanation;
      prevention = aiAnalysis.prevention || prevention;

      for (const solution of aiAnalysis.solutions || []) {
        actions.push({
          id: `ai_${actions.length}`,
          type: solution.commands?.length > 0 ? 'command' : 'manual',
          title: solution.title,
          description: solution.description,
          command: solution.commands,
          confidence: solution.confidence || 0.5,
          impact: 'medium',
          automation: solution.automatic ? 'automatic' : 'prompted'
        });
      }
    }

    // Add generic diagnostic actions if no specific solutions found
    if (actions.length === 0) {
      actions.push(
        {
          id: 'generic_diagnose',
          type: 'command',
          title: 'Basic System Check',
          description: 'Run basic diagnostic commands',
          command: ['echo "System: $(uname -a)"', 'echo "Node: $(node --version 2>/dev/null || echo \'not found\')"', 'echo "Python: $(python --version 2>/dev/null || echo \'not found\')"'],
          confidence: 0.3,
          impact: 'low',
          automation: 'automatic'
        },
        {
          id: 'generic_retry',
          type: 'manual',
          title: 'Retry Command',
          description: 'Retry the original command after environment check',
          confidence: 0.4,
          impact: 'low',
          automation: 'prompted'
        }
      );
    }

    // Estimate time based on actions
    const estimatedTime = actions.reduce((total, action) => {
      if (action.type === 'command') return total + 30; // 30 seconds per command
      if (action.type === 'install') return total + 120; // 2 minutes per install
      return total + 60; // 1 minute for manual actions
    }, 0);

    return {
      error: context.error.substring(0, 200),
      category,
      severity,
      actions,
      explanation,
      prevention,
      estimatedTime,
      success: actions.length > 0
    };
  }

  /**
   * Substitute variables in command templates
   */
  private substituteVariables(commands: string[], context: ErrorContext): string[] {
    return commands.map(cmd => {
      let substituted = cmd;
      
      // Extract package name from error if possible
      const packageMatch = context.error.match(/Cannot find module ['"]([^'"]+)['"]/);
      if (packageMatch) {
        substituted = substituted.replace('{package}', packageMatch[1]);
      }

      // Extract version if available
      const versionMatch = context.error.match(/requires.*@([^\s]+)/);
      if (versionMatch) {
        substituted = substituted.replace('{version}', versionMatch[1]);
      }

      // Extract port number
      const portMatch = context.error.match(/:([0-9]+)/);
      if (portMatch) {
        substituted = substituted.replace('{port}', portMatch[1]);
      }

      // Extract file path
      const fileMatch = context.error.match(/([\/\w.-]+\.[a-zA-Z]+)/);
      if (fileMatch) {
        substituted = substituted.replace('{file}', fileMatch[1]);
      }

      return substituted;
    });
  }

  /**
   * Check if action should be executed automatically
   */
  private shouldAutoExecute(action: RecoveryAction, autoExecuteFlag?: boolean): boolean {
    if (action.automation === 'manual') return false;
    if (action.automation === 'automatic') return true;
    
    // For 'prompted' actions, check confidence and user preference
    if (autoExecuteFlag && action.confidence > 0.7) return true;
    
    return false;
  }

  /**
   * Check prerequisites for an action
   */
  private async checkPrerequisites(
    prerequisites: string[], 
    context: ErrorContext
  ): Promise<boolean> {
    for (const prereq of prerequisites) {
      // Simple prerequisite checks
      if (prereq.startsWith('command:')) {
        const cmd = prereq.substring(8);
        try {
          const result = await runShell([cmd, '--version'], context.repoPath);
          if (!result.ok) return false;
        } catch {
          return false;
        }
      }
      
      if (prereq.startsWith('file:')) {
        const filePath = prereq.substring(5);
        try {
          const fs = await import('node:fs/promises');
          await fs.access(path.join(context.repoPath, filePath));
        } catch {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Execute recovery action
   */
  private async executeAction(action: RecoveryAction, context: ErrorContext): Promise<boolean> {
    try {
      switch (action.type) {
        case 'command':
          if (!action.command) return false;
          
          for (const cmd of action.command) {
            const parts = cmd.split(' ');
            const result = await runShell(parts, context.repoPath);
            
            if (!result.ok) {
              log.warn(`Command failed: ${cmd}`);
              return false;
            }
          }
          return true;

        case 'install':
        case 'config':
        case 'fix':
          // These might involve specific handlers
          return await this.executeSpecializedAction(action, context);

        case 'manual':
          log.info(`Manual action required: ${action.title}`);
          log.info(action.description);
          return true; // Assume user will handle it

        default:
          return false;
      }
    } catch (error) {
      log.error(`Error executing action ${action.title}:`, error);
      return false;
    }
  }

  /**
   * Execute specialized actions
   */
  private async executeSpecializedAction(
    action: RecoveryAction, 
    context: ErrorContext
  ): Promise<boolean> {
    // This could be extended with specific handlers for different action types
    if (action.command) {
      return await this.executeAction({ ...action, type: 'command' }, context);
    }
    
    log.info(`Specialized action: ${action.title}`);
    return true;
  }

  /**
   * Verify if recovery was successful
   */
  private async verifyRecovery(context: ErrorContext): Promise<boolean> {
    if (!context.command) return false;

    try {
      // Retry the original command
      const result = await runShell(context.command, context.repoPath);
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * Learn from error patterns for future improvements
   */
  private async learnFromError(context: ErrorContext, plan: RecoveryPlan): Promise<void> {
    const errorKey = this.generateErrorKey(context);
    
    if (!this.recoveryHistory.has(errorKey)) {
      this.recoveryHistory.set(errorKey, []);
    }
    
    this.recoveryHistory.get(errorKey)!.push(plan);
    
    // Keep only recent recovery attempts
    const history = this.recoveryHistory.get(errorKey)!;
    if (history.length > 5) {
      this.recoveryHistory.set(errorKey, history.slice(-5));
    }
  }

  /**
   * Generate unique key for error type
   */
  private generateErrorKey(context: ErrorContext): string {
    // Create a key that identifies similar errors
    const errorHash = context.error
      .replace(/['"]/g, '')
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{8,}/g, 'HASH')
      .toLowerCase()
      .substring(0, 100);
    
    return `${context.command?.[0] || 'unknown'}-${errorHash}`;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    totalErrors: number;
    successfulRecoveries: number;
    topErrorCategories: Array<{ category: string; count: number }>;
    averageRecoveryTime: number;
    mostEffectiveActions: Array<{ actionType: string; successRate: number }>;
  } {
    const totalErrors = Array.from(this.recoveryHistory.values())
      .reduce((sum, plans) => sum + plans.length, 0);

    const successful = Array.from(this.recoveryHistory.values())
      .flatMap(plans => plans)
      .filter(plan => plan.success).length;

    const categories = new Map<string, number>();
    Array.from(this.recoveryHistory.values())
      .flatMap(plans => plans)
      .forEach(plan => {
        categories.set(plan.category, (categories.get(plan.category) || 0) + 1);
      });

    const topCategories = Array.from(categories.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const avgTime = Array.from(this.recoveryHistory.values())
      .flatMap(plans => plans)
      .reduce((sum, plan) => sum + plan.estimatedTime, 0) / Math.max(totalErrors, 1);

    return {
      totalErrors,
      successfulRecoveries: successful,
      topErrorCategories: topCategories,
      averageRecoveryTime: avgTime,
      mostEffectiveActions: [] // Could be implemented with more detailed tracking
    };
  }
}

// Export singleton instance
export const intelligentErrorRecovery = new IntelligentErrorRecovery();