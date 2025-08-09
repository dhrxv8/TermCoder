import { runShell } from "./shell.js";
import { log } from "../util/logging.js";

export interface PipeCommand {
  command: string;
  args: string[];
}

export interface PipeResult {
  ok: boolean;
  data?: string;
  error?: string;
}

/**
 * Enhanced Unix-style pipe support for TermCoder
 * Supports chaining commands like: termcode "analyze" | grep "error" | head -10
 */
export class PipelineProcessor {
  private commands: PipeCommand[] = [];
  
  constructor(private repoPath: string) {}
  
  /**
   * Parse a pipe-separated command string
   */
  parse(input: string): PipeCommand[] {
    const commands = input.split('|').map(cmd => cmd.trim());
    return commands.map(cmd => {
      const parts = cmd.split(/\s+/);
      return {
        command: parts[0],
        args: parts.slice(1)
      };
    });
  }
  
  /**
   * Execute a pipeline of commands
   */
  async execute(input: string, initialData?: string): Promise<PipeResult> {
    const commands = this.parse(input);
    let currentData = initialData || "";
    
    for (const cmd of commands) {
      try {
        if (cmd.command === "termcode") {
          // Handle internal TermCoder commands
          const result = await this.executeTermcodeCommand(cmd.args.join(" "), currentData);
          if (!result.ok) return result;
          currentData = result.data || "";
        } else {
          // Handle external shell commands
          const result = await this.executeShellCommand(cmd, currentData);
          if (!result.ok) return result;
          currentData = result.data || "";
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
    
    return { ok: true, data: currentData };
  }
  
  /**
   * Execute a TermCoder internal command
   */
  private async executeTermcodeCommand(task: string, stdin?: string): Promise<PipeResult> {
    try {
      // This would integrate with the main task runner
      // For now, return the input task as processed
      return {
        ok: true,
        data: `Processed task: ${task}` + (stdin ? `\nWith input: ${stdin}` : "")
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Task execution failed"
      };
    }
  }
  
  /**
   * Execute a shell command with stdin
   */
  private async executeShellCommand(cmd: PipeCommand, stdin?: string): Promise<PipeResult> {
    try {
      const result = await runShell([cmd.command, ...cmd.args], this.repoPath, stdin);
      
      if (result.ok) {
        return {
          ok: true,
          data: result.data.stdout || result.data.stderr || ""
        };
      } else {
        return {
          ok: false,
          error: (result as any).error
        };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Shell command failed"
      };
    }
  }
  
  /**
   * Check if input contains pipe operators
   */
  static hasPipes(input: string): boolean {
    return input.includes('|');
  }
}

/**
 * Enhanced shell execution with stdin support
 */
export async function executeWithPipes(
  input: string, 
  repoPath: string, 
  initialData?: string
): Promise<PipeResult> {
  const processor = new PipelineProcessor(repoPath);
  return await processor.execute(input, initialData);
}