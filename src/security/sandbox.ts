import { runShell } from "../tools/shell.js";
import { log } from "../util/logging.js";
import path from "node:path";

export interface SandboxConfig {
  allowedCommands: string[];
  blockedPaths: string[];
  allowedPaths: string[];
  timeout: number;
  maxOutputSize: number;
}

export interface SandboxResult {
  ok: boolean;
  data?: {
    stdout: string;
    stderr: string;
    code: number;
  };
  error?: string;
  blocked?: string;
}

/**
 * Enhanced security sandbox for command execution
 * Inspired by Claude Code's safety-first approach
 */
export class SecuritySandbox {
  private config: SandboxConfig;
  private dangerousPatterns = [
    // System modification
    /rm\s+-rf\s+\//,
    /sudo\s+/,
    /chmod\s+777/,
    /chown\s+/,
    
    // Network operations
    /curl\s+.*?\|\s*sh/,
    /wget\s+.*?\|\s*sh/,
    /nc\s+-l/,
    
    // Process manipulation
    /kill\s+-9/,
    /killall/,
    /pkill/,
    
    // Data exfiltration
    /scp\s+/,
    /rsync\s+.*?:/,
    /ssh\s+.*?@/,
    
    // Dangerous file operations
    />\s*\/dev\/null/,
    />\s*\/dev\/zero/,
    /cat\s+\/etc\/passwd/,
    /cat\s+\/etc\/shadow/,
    
    // Command injection
    /;\s*rm\s+/,
    /&&\s*rm\s+/,
    /\|\s*rm\s+/,
    /`.*`/,
    /\$\(.*\)/
  ];
  
  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = {
      allowedCommands: [
        // Package managers & build tools
        "npm", "pnpm", "yarn", "node", "python", "pip", "pipx", "uv",
        // Test runners
        "pytest", "npx", "jest", "vitest", "mocha",
        // Compilers & tools
        "go", "cargo", "tsc", "rustc", "javac", "gcc", "clang",
        // Linters & formatters
        "eslint", "prettier", "ruff", "flake8", "golangci-lint", "clippy",
        // Version control
        "git",
        // Safe utilities
        "cat", "ls", "find", "grep", "head", "tail", "wc", "sort",
        // Database tools (read-only)
        "sqlite3"
      ],
      blockedPaths: [
        "/etc",
        "/sys", 
        "/proc",
        "/dev",
        "/boot",
        "/root",
        "/var/log",
        "/usr/bin",
        "/usr/sbin",
        "/sbin",
        "/bin"
      ],
      allowedPaths: [
        process.cwd(),
        "/tmp",
        "/var/tmp"
      ],
      timeout: 300000, // 5 minutes
      maxOutputSize: 10 * 1024 * 1024, // 10MB
      ...config
    };
  }
  
  /**
   * Execute command in sandbox with security checks
   */
  async execute(command: string[], cwd: string, stdin?: string): Promise<SandboxResult> {
    // Pre-execution security checks
    const securityCheck = this.checkSecurity(command, cwd);
    if (!securityCheck.safe) {
      return {
        ok: false,
        blocked: securityCheck.reason
      };
    }
    
    // Sanitize environment
    const sanitizedEnv = this.sanitizeEnvironment();
    
    try {
      // Execute with restricted environment
      const result = await this.executeRestricted(command, cwd, stdin, sanitizedEnv);
      
      // Post-execution validation
      if (result.ok) {
        const validation = this.validateOutput(result.data!);
        if (!validation.safe) {
          return {
            ok: false,
            error: `Output validation failed: ${validation.reason}`
          };
        }
      }
      
      return result;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Sandbox execution failed"
      };
    }
  }
  
  /**
   * Check command security before execution
   */
  private checkSecurity(command: string[], cwd: string): { safe: boolean; reason?: string } {
    const [cmd, ...args] = command;
    
    // Check if command is allowed
    if (!this.config.allowedCommands.includes(cmd)) {
      return {
        safe: false,
        reason: `Command '${cmd}' not in allowlist. Allowed: ${this.config.allowedCommands.join(", ")}`
      };
    }
    
    // Check working directory
    const absoluteCwd = path.resolve(cwd);
    const isAllowedPath = this.config.allowedPaths.some(allowedPath => 
      absoluteCwd.startsWith(path.resolve(allowedPath))
    );
    
    if (!isAllowedPath) {
      return {
        safe: false,
        reason: `Working directory '${cwd}' not in allowed paths`
      };
    }
    
    // Check for blocked paths in arguments
    for (const arg of args) {
      if (typeof arg === "string") {
        const resolvedArg = path.resolve(cwd, arg);
        const isBlockedPath = this.config.blockedPaths.some(blockedPath =>
          resolvedArg.startsWith(blockedPath)
        );
        
        if (isBlockedPath) {
          return {
            safe: false,
            reason: `Argument '${arg}' references blocked path`
          };
        }
      }
    }
    
    // Check for dangerous patterns
    const fullCommand = command.join(" ");
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        return {
          safe: false,
          reason: `Command contains dangerous pattern: ${pattern.source}`
        };
      }
    }
    
    // Additional npm/node security checks
    if (cmd === "npm" || cmd === "npx" || cmd === "yarn" || cmd === "pnpm") {
      return this.checkPackageManagerSecurity(args);
    }
    
    return { safe: true };
  }
  
  /**
   * Additional security checks for package managers
   */
  private checkPackageManagerSecurity(args: string[]): { safe: boolean; reason?: string } {
    const dangerousNpmCommands = ["publish", "adduser", "login", "logout"];
    const dangerousFlags = ["--unsafe-perm", "--allow-root", "--no-audit"];
    
    for (const arg of args) {
      if (dangerousNpmCommands.includes(arg)) {
        return {
          safe: false,
          reason: `Dangerous npm command: ${arg}`
        };
      }
      
      if (dangerousFlags.includes(arg)) {
        return {
          safe: false,
          reason: `Dangerous flag: ${arg}`
        };
      }
    }
    
    return { safe: true };
  }
  
  /**
   * Sanitize environment variables
   */
  private sanitizeEnvironment(): Record<string, string> {
    const safe = {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      USER: process.env.USER || "",
      NODE_ENV: process.env.NODE_ENV || "development",
      // Preserve necessary Node.js variables
      NODE_PATH: process.env.NODE_PATH || "",
      npm_config_cache: process.env.npm_config_cache || "",
      // Preserve CI variables for testing
      CI: process.env.CI || "",
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS || ""
    };
    
    // Remove sensitive variables
    const sensitivePatterns = [/KEY/, /SECRET/, /TOKEN/, /PASSWORD/, /AUTH/];
    
    for (const [key, value] of Object.entries(process.env)) {
      if (!sensitivePatterns.some(pattern => pattern.test(key.toUpperCase()))) {
        safe[key] = value || "";
      }
    }
    
    return safe;
  }
  
  /**
   * Execute command with restrictions
   */
  private async executeRestricted(
    command: string[],
    cwd: string,
    stdin?: string,
    env?: Record<string, string>
  ): Promise<SandboxResult> {
    const { spawn } = await import("node:child_process");
    
    return new Promise((resolve) => {
      const child = spawn(command[0], command.slice(1), {
        cwd,
        env: env || process.env,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: this.config.timeout
      });
      
      let stdout = "";
      let stderr = "";
      let outputSize = 0;
      
      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        outputSize += chunk.length;
        
        if (outputSize > this.config.maxOutputSize) {
          child.kill("SIGKILL");
          resolve({
            ok: false,
            error: "Output size limit exceeded"
          });
          return;
        }
        
        stdout += chunk;
      });
      
      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        outputSize += chunk.length;
        
        if (outputSize > this.config.maxOutputSize) {
          child.kill("SIGKILL");
          resolve({
            ok: false,
            error: "Output size limit exceeded"
          });
          return;
        }
        
        stderr += chunk;
      });
      
      child.on("close", (code, signal) => {
        if (signal === "SIGKILL") {
          resolve({
            ok: false,
            error: "Command killed due to timeout or resource limits"
          });
        } else {
          resolve({
            ok: true,
            data: {
              stdout,
              stderr,
              code: code || 0
            }
          });
        }
      });
      
      child.on("error", (error) => {
        resolve({
          ok: false,
          error: error.message
        });
      });
      
      // Send stdin if provided
      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  }
  
  /**
   * Validate command output for security issues
   */
  private validateOutput(data: { stdout: string; stderr: string }): { safe: boolean; reason?: string } {
    const combined = data.stdout + data.stderr;
    
    // Check for credential leaks
    const credentialPatterns = [
      /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
      /(?:api[_-]?key|apikey)\s*[:=]\s*\S+/i,
      /(?:secret|token)\s*[:=]\s*\S+/i,
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
      /ssh-rsa\s+[A-Za-z0-9+\/]+=*/
    ];
    
    for (const pattern of credentialPatterns) {
      if (pattern.test(combined)) {
        log.warn("Potential credential leak detected in command output");
        return {
          safe: false,
          reason: "Output contains potential credentials"
        };
      }
    }
    
    return { safe: true };
  }
  
  /**
   * Update sandbox configuration
   */
  updateConfig(newConfig: Partial<SandboxConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
  
  /**
   * Get current sandbox configuration
   */
  getConfig(): SandboxConfig {
    return { ...this.config };
  }
}

// Export default sandbox instance
export const sandbox = new SecuritySandbox();