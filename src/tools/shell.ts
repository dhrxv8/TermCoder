import { spawn } from "node:child_process";
import path from "node:path";
import { CFG } from "../config.js";
import { ToolResult } from "../util/types.js";

// Dangerous command patterns to block
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+[\/~]/,  // rm -rf / or ~/
  /sudo/,                // sudo commands
  /su\b/,               // su commands  
  /passwd/,             // password changes
  /chmod\s+777/,        // chmod 777
  />\s*\/dev\/null/,    // redirects that might hide output
  /curl.*\|\s*sh/,      // pipe curl to shell
  /wget.*\|\s*sh/,      // pipe wget to shell
  /eval/,               // eval commands
  /exec/,               // exec commands
];

const ALLOWED_COMMANDS = new Set([
  // Package managers & build tools
  "npm", "pnpm", "yarn", "bun", "node", 
  "uv", "python", "python3", "pip", "pipx", "poetry",
  "go", "cargo", "rustc", "tsc", "javac", "mvn", "gradle",
  
  // Test runners
  "pytest", "npx", "jest", "vitest", "mocha", "karma",
  
  // Linters & formatters
  "eslint", "prettier", "ruff", "flake8", "black", "isort",
  "golangci-lint", "clippy", "rustfmt",
  
  // VCS (limited)
  "git",
  
  // Safe utilities
  "which", "where", "echo", "cat", "ls", "pwd", "whoami",
]);

function validateCommand(cmd: string[]): { valid: boolean; error?: string } {
  if (cmd.length === 0) {
    return { valid: false, error: "Empty command" };
  }
  
  const bin = cmd[0];
  const fullCommand = cmd.join(" ");
  
  // Check if command is in allow list
  if (!ALLOWED_COMMANDS.has(bin)) {
    return { 
      valid: false, 
      error: `Command not allowed: ${bin}. Allowed: ${Array.from(ALLOWED_COMMANDS).join(", ")}` 
    };
  }
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(fullCommand)) {
      return { 
        valid: false, 
        error: `Command contains dangerous pattern: ${fullCommand}` 
      };
    }
  }
  
  // Additional git safety checks
  if (bin === "git") {
    const subCommand = cmd[1];
    const dangerousGitCommands = ["push", "pull", "fetch", "clone", "remote"];
    if (dangerousGitCommands.includes(subCommand)) {
      return { 
        valid: false, 
        error: `Dangerous git command blocked: git ${subCommand}. Use TermCode's built-in git workflow instead.` 
      };
    }
  }
  
  return { valid: true };
}

export async function runShell(cmd: string[], cwd: string, stdin?: string): Promise<ToolResult<{ code: number; stdout: string; stderr: string }>> {
  // Use enhanced security sandbox for validation and execution
  try {
    // Import sandbox here to avoid circular dependencies
    const { sandbox } = await import("../security/sandbox.js");
    const result = await sandbox.execute(cmd, cwd, stdin);
    
    if (result.ok) {
      return { ok: true, data: result.data! };
    } else if (result.blocked) {
      return { ok: false, error: `Security: ${result.blocked}` };
    } else {
      return { ok: false, error: result.error || "Shell execution failed" };
    }
  } catch (error) {
    // Fallback to legacy validation if sandbox fails
    const validation = validateCommand(cmd);
    if (!validation.valid) {
      return { ok: false, error: validation.error! };
    }
    
    // Ensure working directory is safe (no directory traversal)
    const resolvedCwd = path.resolve(cwd);
    if (!resolvedCwd.startsWith(path.resolve(process.cwd()))) {
      return { ok: false, error: "Working directory outside project bounds" };
    }
    
    // Fallback to legacy execution
    return legacyExecute(cmd, resolvedCwd, stdin);
  }
}

function legacyExecute(cmd: string[], resolvedCwd: string, stdin?: string): Promise<ToolResult<{ code: number; stdout: string; stderr: string }>> {
  return new Promise((resolve) => {
    const bin = cmd[0];
    const args = cmd.slice(1);
    
    // Use spawn with shell: false for better security
    const child = spawn(bin, args, { 
      cwd: resolvedCwd, 
      shell: false,
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"], // Enable stdin if provided
      env: {
        ...process.env,
        // Remove potentially dangerous environment variables
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER,
        PWD: resolvedCwd,
        // Clear shell-related variables
        SHELL: undefined,
        BASH_ENV: undefined,
        ENV: undefined
      }
    });
    
    let stdout = "";
    let stderr = "";
    let killed = false;
    
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
      resolve({ ok: false, error: `Command timed out after ${CFG.SHELL_TIMEOUT_MS}ms` });
    }, CFG.SHELL_TIMEOUT_MS);
    
    child.stdout?.on("data", (data) => {
      stdout += String(data);
      // Prevent memory exhaustion from large outputs
      if (stdout.length > 1024 * 1024) { // 1MB limit
        child.kill("SIGKILL");
        clearTimeout(timer);
        resolve({ ok: false, error: "Output too large (>1MB)" });
      }
    });
    
    child.stderr?.on("data", (data) => {
      stderr += String(data);
      // Prevent memory exhaustion from large outputs  
      if (stderr.length > 1024 * 1024) { // 1MB limit
        child.kill("SIGKILL");
        clearTimeout(timer);
        resolve({ ok: false, error: "Error output too large (>1MB)" });
      }
    });
    
    child.on("error", (error) => {
      if (!killed) {
        clearTimeout(timer);
        resolve({ ok: false, error: `Failed to start command: ${error.message}` });
      }
    });
    
    child.on("close", (code, signal) => {
      if (!killed) {
        clearTimeout(timer);
        resolve({ 
          ok: true, 
          data: { 
            code: code ?? -1, 
            stdout: stdout.trim(), 
            stderr: stderr.trim() 
          } 
        });
      }
    });
    
    // Send stdin if provided
    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}