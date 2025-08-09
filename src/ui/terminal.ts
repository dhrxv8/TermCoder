import { log } from "../util/logging.js";
import { ProjectInfo } from "../tools/test.js";

export interface TerminalTheme {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  dim: string;
}

export const themes: Record<string, TerminalTheme> = {
  default: {
    primary: "blue",
    secondary: "cyan", 
    success: "green",
    warning: "yellow",
    error: "red",
    dim: "dim"
  },
  claude: {
    primary: "magenta",
    secondary: "blue",
    success: "green", 
    warning: "yellow",
    error: "red",
    dim: "dim"
  },
  minimal: {
    primary: "white",
    secondary: "gray",
    success: "green",
    warning: "yellow", 
    error: "red",
    dim: "dim"
  }
};

export class TerminalUI {
  private theme: TerminalTheme;
  private promptStyle: string = "";
  
  constructor(theme: string = "claude") {
    this.theme = themes[theme] || themes.default;
    this.updatePromptStyle();
  }
  
  private updatePromptStyle(): void {
    this.promptStyle = log.colors.dim("termcode") + log.colors[this.theme.primary](" > ");
  }
  
  getPrompt(): string {
    return this.promptStyle;
  }
  
  setTheme(themeName: string): void {
    if (themes[themeName]) {
      this.theme = themes[themeName];
      this.updatePromptStyle();
    }
  }
  
  /**
   * Enhanced welcome message with project context
   */
  showWelcome(projectInfo: ProjectInfo, sessionInfo: any): void {
    log.raw("");
    log.raw(log.colors[this.theme.primary]("🚀 TermCode") + log.colors.dim(" — Universal Terminal Coding Agent"));
    log.raw("");
    
    // Project information
    const projectType = projectInfo.framework ? 
      `${projectInfo.type} (${projectInfo.framework})` : 
      projectInfo.type;
    
    log.raw(`  ${log.colors.dim("Project:")} ${log.colors[this.theme.secondary](projectType)}`);
    
    if (projectInfo.hasTests) {
      log.raw(`  ${log.colors.dim("Tests:")} ${log.colors[this.theme.success](projectInfo.testFiles.length.toString())} test files found`);
    }
    
    if (projectInfo.dependencies.length > 0) {
      const depCount = projectInfo.dependencies.length + projectInfo.devDependencies.length;
      log.raw(`  ${log.colors.dim("Dependencies:")} ${log.colors[this.theme.secondary](depCount.toString())} packages`);
    }
    
    // Session info
    log.raw(`  ${log.colors.dim("Provider:")} ${log.colors[this.theme.primary](sessionInfo.provider)} (${sessionInfo.model})`);
    log.raw(`  ${log.colors.dim("Branch:")} ${log.colors.magenta(sessionInfo.branchName)}`);
    
    log.raw("");
    log.raw(log.colors[this.theme.success]("✅ Ready! Type your request or 'help' for commands"));
    log.raw("");
  }
  
  /**
   * Enhanced help display with categorized commands
   */
  showHelp(): void {
    log.raw("");
    log.raw(log.colors[this.theme.primary]("📚 TermCode Commands"));
    log.raw("");
    
    const sections = [
      {
        title: "💬 Chat & Tasks",
        commands: [
          { cmd: "<task>", desc: "Execute any coding task in natural language" },
          { cmd: "help", desc: "Show this help message" },
          { cmd: "exit/quit", desc: "Exit TermCode session" }
        ]
      },
      {
        title: "🔧 Configuration",
        commands: [
          { cmd: "/provider <id>", desc: "Switch AI provider (openai, anthropic, etc.)" },
          { cmd: "/model <id>", desc: "Switch model within current provider" },
          { cmd: "/keys", desc: "Show API key status for all providers" },
          { cmd: "/health", desc: "Check provider connectivity and status" },
          { cmd: "/whoami", desc: "Show current session information" },
          { cmd: "/budget", desc: "Show usage statistics and costs" },
          { cmd: "/theme <name>", desc: "Change terminal theme (default, claude, minimal)" }
        ]
      },
      {
        title: "🌿 Git Workflow", 
        commands: [
          { cmd: "rollback", desc: "Discard all changes and return to main branch" },
          { cmd: "merge", desc: "Merge changes from working branch to main" },
          { cmd: 'pr "title"', desc: "Create GitHub pull request" },
          { cmd: "status", desc: "Show git status and branch information" }
        ]
      },
      {
        title: "🧪 Development Tools",
        commands: [
          { cmd: "test", desc: "Run project tests (auto-detects test runner)" },
          { cmd: "lint", desc: "Run code linter (auto-detects linter)" },
          { cmd: "build", desc: "Run project build (auto-detects build tool)" },
          { cmd: "!<command>", desc: "Execute shell command safely" }
        ]
      },
      {
        title: "📋 Session Management",
        commands: [
          { cmd: "log", desc: "Show session history and changes" },
          { cmd: "sessions", desc: "List recent TermCode sessions" },
          { cmd: "clear-log", desc: "Clear session history" },
          { cmd: "/config", desc: "Configuration management commands" }
        ]
      }
    ];
    
    for (const section of sections) {
      log.raw(log.colors[this.theme.secondary](`  ${section.title}`));
      
      for (const { cmd, desc } of section.commands) {
        const cmdFormatted = log.colors[this.theme.primary](cmd.padEnd(20));
        const descFormatted = log.colors.dim(`— ${desc}`);
        log.raw(`    ${cmdFormatted} ${descFormatted}`);
      }
      
      log.raw("");
    }
    
    // Usage examples
    log.raw(log.colors[this.theme.secondary]("  💡 Example Usage"));
    const examples = [
      "Add user authentication with JWT tokens",
      "Fix the bug in the payment processing function", 
      "Refactor the API to use TypeScript",
      "/provider anthropic   # Switch to Claude",
      'pr "Add user auth system"   # Create PR'
    ];
    
    for (const example of examples) {
      log.raw(`    ${log.colors.dim(example)}`);
    }
    
    log.raw("");
  }
  
  /**
   * Show provider status with enhanced formatting
   */
  showProviderStatus(providers: any[]): void {
    log.raw("");
    log.raw(log.colors[this.theme.primary]("🔐 Provider Status"));
    log.raw("");
    
    for (const provider of providers) {
      const name = provider.id.padEnd(12);
      const nameFormatted = log.colors[this.theme.secondary](name);
      
      let status = "";
      if (provider.id === "ollama") {
        status = `${log.colors[this.theme.success]("✓")} ${log.colors.dim("local (no key needed)")}`;
      } else {
        const hasKey = provider.hasKey;
        status = hasKey ? 
          `${log.colors[this.theme.success]("✓")} ${log.colors.dim("configured")}` : 
          `${log.colors[this.theme.error]("❌")} ${log.colors.dim("missing")}`;
      }
      
      log.raw(`  ${nameFormatted} ${status}`);
    }
    
    log.raw("");
    log.raw(log.colors.dim("Use /provider <name> to configure missing providers"));
    log.raw("");
  }
  
  /**
   * Enhanced error display with suggestions
   */
  showError(error: string, suggestion?: string): void {
    log.raw("");
    log.raw(`${log.colors[this.theme.error]("❌ Error:")} ${error}`);
    
    if (suggestion) {
      log.raw(`${log.colors[this.theme.warning]("💡 Suggestion:")} ${suggestion}`);
    }
    
    log.raw("");
  }
  
  /**
   * Progress indicator for long-running tasks
   */
  showProgress(message: string, step: number, total: number): void {
    const percentage = Math.round((step / total) * 100);
    const bar = "█".repeat(Math.floor(percentage / 5)) + "░".repeat(20 - Math.floor(percentage / 5));
    
    process.stdout.write(`\\r${log.colors.dim("[")}${log.colors[this.theme.primary](bar)}${log.colors.dim("]")} ${percentage}% ${message}`);
    
    if (step === total) {
      console.log(); // New line when complete
    }
  }
}

// Export default instance
export const terminal = new TerminalUI();