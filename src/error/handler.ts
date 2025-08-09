import { log } from "../util/logging.js";
import { terminal } from "../ui/terminal.js";

export interface ErrorContext {
  command?: string;
  provider?: string;
  model?: string;
  repo?: string;
  task?: string;
  stackTrace?: string;
  timestamp?: string;
}

export interface ErrorSuggestion {
  message: string;
  action?: () => Promise<void> | void;
  autoFix?: boolean;
}

export interface ErrorPattern {
  pattern: RegExp | string;
  category: "network" | "auth" | "config" | "provider" | "git" | "system" | "user";
  suggestions: ErrorSuggestion[];
}

/**
 * Enhanced error handling system inspired by Claude Code
 * Provides intelligent error recovery and user guidance
 */
export class ErrorHandler {
  private errorPatterns: ErrorPattern[] = [
    // Authentication errors
    {
      pattern: /401|unauthorized|invalid.?api.?key|authentication.?failed/i,
      category: "auth",
      suggestions: [
        { 
          message: "Check your API key with '/keys' command",
        },
        {
          message: "Re-authenticate with '/provider <name>' command",
        },
        {
          message: "Verify API key has necessary permissions",
        }
      ]
    },
    
    // Network errors
    {
      pattern: /network|connection|timeout|ECONNREFUSED|ENOTFOUND/i,
      category: "network",
      suggestions: [
        {
          message: "Check internet connection",
        },
        {
          message: "Try different provider with '/provider <name>'",
        },
        {
          message: "Check provider status with '/health' command",
        }
      ]
    },
    
    // Rate limiting
    {
      pattern: /rate.?limit|too.?many.?requests|429/i,
      category: "provider",
      suggestions: [
        {
          message: "Wait a moment before retrying",
        },
        {
          message: "Switch to different provider to continue working",
        },
        {
          message: "Check usage limits in provider dashboard",
        }
      ]
    },
    
    // Git errors
    {
      pattern: /git|merge.?conflict|not.?a.?git.?repository|uncommitted.?changes/i,
      category: "git",
      suggestions: [
        {
          message: "Run 'git status' to check repository state",
        },
        {
          message: "Use 'rollback' command to reset changes",
        },
        {
          message: "Commit changes before starting new session",
        }
      ]
    },
    
    // Configuration errors
    {
      pattern: /config|not.?found|missing|invalid.?json/i,
      category: "config",
      suggestions: [
        {
          message: "Run configuration validation with '/config validate'",
        },
        {
          message: "Reset configuration with '/config reset'",
        },
        {
          message: "Check configuration file at path shown by '/config path'",
        }
      ]
    },
    
    // Model/Provider errors
    {
      pattern: /model.?not.?found|unsupported.?model|invalid.?model/i,
      category: "provider",
      suggestions: [
        {
          message: "List available models with '/health' command",
        },
        {
          message: "Switch to known working model",
        },
        {
          message: "Update provider configuration",
        }
      ]
    },
    
    // System errors
    {
      pattern: /permission.?denied|eacces|enoent|command.?not.?found/i,
      category: "system",
      suggestions: [
        {
          message: "Check file permissions in project directory",
        },
        {
          message: "Ensure required tools are installed (npm, python, etc.)",
        },
        {
          message: "Run from correct directory",
        }
      ]
    }
  ];
  
  private errorLog: Array<{ error: Error; context: ErrorContext; timestamp: string }> = [];
  
  constructor() {}
  
  /**
   * Handle an error with intelligent recovery suggestions
   */
  async handleError(error: Error | string, context: ErrorContext = {}): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const timestamp = new Date().toISOString();
    
    // Log error
    if (error instanceof Error) {
      this.errorLog.push({ error, context, timestamp });
    }
    
    // Find matching patterns
    const matches = this.findErrorPatterns(errorMessage);
    
    if (matches.length > 0) {
      // Show categorized error with suggestions
      this.showCategorizedError(errorMessage, matches, context);
    } else {
      // Show generic error
      this.showGenericError(errorMessage, context);
    }
    
    // Auto-recovery attempts
    await this.attemptAutoRecovery(errorMessage, matches, context);
  }
  
  /**
   * Find matching error patterns
   */
  private findErrorPatterns(errorMessage: string): ErrorPattern[] {
    return this.errorPatterns.filter(pattern => {
      if (pattern.pattern instanceof RegExp) {
        return pattern.pattern.test(errorMessage);
      } else {
        return errorMessage.toLowerCase().includes(pattern.pattern.toLowerCase());
      }
    });
  }
  
  /**
   * Show categorized error with suggestions
   */
  private showCategorizedError(
    message: string, 
    patterns: ErrorPattern[], 
    context: ErrorContext
  ): void {
    const category = patterns[0].category;
    const categoryEmojis = {
      network: "🌐",
      auth: "🔐",
      config: "⚙️",
      provider: "🤖", 
      git: "📋",
      system: "💻",
      user: "👤"
    };
    
    log.raw("");
    log.raw(`${categoryEmojis[category]} ${log.colors.red("Error")} (${category}): ${message}`);
    
    // Add context if available
    if (context.command) {
      log.raw(`  ${log.colors.dim("Command:")} ${context.command}`);
    }
    if (context.provider) {
      log.raw(`  ${log.colors.dim("Provider:")} ${context.provider}`);
    }
    
    // Show suggestions
    const allSuggestions = patterns.flatMap(p => p.suggestions);
    if (allSuggestions.length > 0) {
      log.raw("");
      log.raw(log.colors.yellow("💡 Suggestions:"));
      
      allSuggestions.slice(0, 3).forEach((suggestion, i) => {
        log.raw(`  ${i + 1}. ${suggestion.message}`);
      });
    }
    
    log.raw("");
  }
  
  /**
   * Show generic error without specific suggestions
   */
  private showGenericError(message: string, context: ErrorContext): void {
    terminal.showError(
      message,
      "Try '/help' for available commands or check '/health' for provider status"
    );
  }
  
  /**
   * Attempt automatic error recovery
   */
  private async attemptAutoRecovery(
    errorMessage: string, 
    patterns: ErrorPattern[], 
    context: ErrorContext
  ): Promise<void> {
    // Auto-fix suggestions
    for (const pattern of patterns) {
      for (const suggestion of pattern.suggestions) {
        if (suggestion.autoFix && suggestion.action) {
          try {
            log.step("Auto-recovery", suggestion.message);
            await suggestion.action();
            log.success("Auto-recovery completed");
            return;
          } catch (recoveryError) {
            log.warn("Auto-recovery failed:", recoveryError);
          }
        }
      }
    }
  }
  
  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    recent: Array<{ message: string; timestamp: string; context: ErrorContext }>;
  } {
    const byCategory: Record<string, number> = {};
    
    for (const entry of this.errorLog) {
      const patterns = this.findErrorPatterns(entry.error.message);
      const category = patterns[0]?.category || "unknown";
      byCategory[category] = (byCategory[category] || 0) + 1;
    }
    
    const recent = this.errorLog
      .slice(-10)
      .map(entry => ({
        message: entry.error.message,
        timestamp: entry.timestamp,
        context: entry.context
      }));
    
    return {
      total: this.errorLog.length,
      byCategory,
      recent
    };
  }
  
  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
    log.info("Error log cleared");
  }
  
  /**
   * Export error log for debugging
   */
  exportErrorLog(): string {
    return JSON.stringify({
      errors: this.errorLog,
      stats: this.getErrorStats(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
  
  /**
   * Add custom error pattern
   */
  addErrorPattern(pattern: ErrorPattern): void {
    this.errorPatterns.push(pattern);
  }
  
  /**
   * Show error statistics
   */
  showErrorStats(): void {
    const stats = this.getErrorStats();
    
    if (stats.total === 0) {
      log.raw("");
      log.raw(log.colors.green("✅ No errors recorded in this session"));
      log.raw("");
      return;
    }
    
    log.raw("");
    log.raw(log.colors.bright("📊 Error Statistics"));
    log.raw(`  ${log.colors.dim("Total errors:")} ${log.colors.red(stats.total.toString())}`);
    log.raw("");
    
    if (Object.keys(stats.byCategory).length > 0) {
      log.raw(log.colors.cyan("  By Category:"));
      Object.entries(stats.byCategory)
        .sort(([, a], [, b]) => b - a)
        .forEach(([category, count]) => {
          log.raw(`    ${category.padEnd(10)} ${log.colors.red(count.toString())}`);
        });
      log.raw("");
    }
    
    if (stats.recent.length > 0) {
      log.raw(log.colors.cyan("  Recent Errors:"));
      stats.recent.slice(-5).forEach(({ message, timestamp }, i) => {
        const time = new Date(timestamp).toLocaleTimeString();
        log.raw(`    ${time} ${log.colors.dim(message.substring(0, 60))}${message.length > 60 ? "..." : ""}`);
      });
      log.raw("");
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();