#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "node:path";
import readline from "node:readline";
import { ensureMemory } from "./memory.js";
import { runTask } from "./agent/planner.js";
import { buildIndex } from "./retriever/indexer.js";
import { ensureCleanGit, createBranch, checkoutBranch, deleteBranch, mergeBranch } from "./tools/git.js";
import { createPullRequest } from "./tools/github.js";
import { runTestsLegacy, runLinterLegacy, runBuildLegacy, detectProjectType } from "./tools/test.js";
import { runShell } from "./tools/shell.js";
import { getSessionLogs, clearSessionLogs } from "./util/sessionLog.js";
import { log } from "./util/logging.js";
import { runOnboarding, getProviderKey, setProviderKey, listProviderKeys } from "./onboarding.js";
import { loadConfig, configExists, validateConfig, resetConfig, configPath } from "./state/config.js";
import { loadSession, createSession, updateSession, listRecentSessions } from "./state/session.js";
import { formatBudgetStatus, formatDetailedBudgetStatus } from "./util/costs.js";
import { getIndexStats } from "./retriever/indexer.js";
import { getProvider, registry } from "./providers/index.js";

const argv = yargs(hideBin(process.argv))
  .scriptName("termcode")
  .usage("$0 [task] --repo <path> [options]")
  .command("$0 [task]", "Execute a coding task or start interactive session", (yargs) => {
    yargs.positional("task", {
      describe: "High-level coding request (feature/refactor/fix/etc.)",
      type: "string",
    });
  })
  .option("repo", {
    alias: "r",
    type: "string",
    demandOption: true,
    describe: "Path to repository (required)",
  })
  .option("dry", {
    alias: "d",
    type: "boolean",
    default: false,
    describe: "Preview changes without applying them",
  })
  .option("model", {
    alias: "m",
    type: "string",
    describe: "Override model (gpt-4o, claude-3-5-sonnet, etc.)",
  })
  .option("provider", {
    alias: "p",
    type: "string",
    describe: "Override provider (openai, anthropic, xai, google, etc.)",
  })
  .option("ui", {
    alias: "u",
    type: "boolean",
    default: false,
    describe: "Launch full-screen TUI interface",
  })
  .example("$0 --repo .", "Start interactive session in current directory")
  .example('$0 "Add user auth" --repo .', "Execute one-shot task")
  .example("$0 --repo . --provider anthropic", "Use specific AI provider")
  .example("$0 --repo . --model gpt-4o --dry", "Preview changes with GPT-4o")
  .example("$0 --repo . --ui", "Launch full-screen TUI interface")
  .version()
  .help()
  .parseSync();

const repo = path.resolve(String((argv as any).repo));
const initialTask = String((argv as any)._?.[0] || "");
const dry = Boolean((argv as any).dry);
const cliModel = String((argv as any).model || "");
const cliProvider = String((argv as any).provider || "");
const launchUI = Boolean((argv as any).ui);

(async () => {
  try {
    // Validate repository path exists
    try {
      const fs = await import("node:fs/promises");
      const stat = await fs.stat(repo);
      if (!stat.isDirectory()) {
        log.error(`Repository path is not a directory: ${repo}`);
        process.exit(1);
      }
    } catch (error) {
      log.error(`Repository path does not exist: ${repo}`);
      process.exit(1);
    }

    // Check if first run (no config)
    let config = await loadConfig();
    if (!config) {
      console.log("🚀 Welcome to TermCode — first-run setup:");
      config = await runOnboarding();
    }

    // Validate provider exists
    if (cliProvider && !Object.keys(registry).includes(cliProvider)) {
      log.error(`Unknown provider: ${cliProvider}. Available: ${Object.keys(registry).join(", ")}`);
      process.exit(1);
    }

    // Override with CLI options
    const currentProvider = cliProvider || config.defaultProvider;
    const currentModel = cliModel || config.models[currentProvider]?.chat;

    if (!currentModel) {
      log.error(`No model configured for provider ${currentProvider}`);
      if (!cliModel) {
        log.info(`Try: termcode --repo ${repo} --provider ${currentProvider} --model <model-name>`);
      }
      process.exit(1);
    }

    // Validate provider has required API key (except ollama)
    if (currentProvider !== "ollama" && !(await getProviderKey(currentProvider))) {
      log.error(`No API key found for ${currentProvider}. Run 'termcode --repo ${repo}' to set up keys.`);
      process.exit(1);
    }

  log.step("Initializing", `${currentProvider} (${currentModel})`);
  log.step("Loading repository", repo);

  // Check for clean Git state
  const clean = ensureCleanGit(repo);
  if (!clean.ok) {
    log.error((clean as any).error);
    process.exit(1);
  }

  // Create working branch
  const branchName = `termcode-${Date.now()}`;
  const branch = createBranch(repo, branchName);
  if (!branch.ok) {
    log.error("Failed to create branch:", (branch as any).error);
    process.exit(1);
  }
  log.step("Created branch", branchName);

  log.step("Building index", "scanning codebase...");
  await ensureMemory(repo);
  await buildIndex(repo);
  
  // Load or create session
  let session = await loadSession(repo);
  if (!session) {
    session = await createSession(repo, currentProvider, currentModel, branchName);
    log.step("Created session", "new project session");
  } else {
    // Update session with current info
    await updateSession(repo, {
      provider: currentProvider,
      model: currentModel,
      branchName: branchName
    });
    log.step("Loaded session", `${session.recentTasks.length} recent tasks`);
  }
  
  // Show project info
  const projectInfo = await detectProjectType(repo);
  const indexStats = await getIndexStats(repo);
  
  // Initialize macro system
  const { initializeMacros } = await import("./macros/index.js");
  await initializeMacros();
  
  // Initialize GitHub integration if enabled
  if (process.env.GITHUB_WEBHOOK_ENABLED === 'true') {
    const { initializeGitHubIntegration } = await import("./github/index.js");
    await initializeGitHubIntegration();
  }

  log.success("Ready! Type your request or 'help' for commands");
  
  if (projectInfo.hasTests) {
    log.raw(`  ${log.colors.dim("Project:")} ${log.colors.cyan(projectInfo.type)} with ${log.colors.green(projectInfo.testFiles.length.toString())} test files`);
  } else {
    log.raw(`  ${log.colors.dim("Project:")} ${log.colors.cyan(projectInfo.type)} (no tests detected)`);
  }
  
  if (indexStats) {
    log.raw(`  ${log.colors.dim("Index:")} ${log.colors.green(indexStats.chunkCount.toString())} chunks from ${log.colors.green(indexStats.fileCount.toString())} files`);
  }

  // Session state for REPL
  let sessionState = {
    provider: currentProvider,
    model: currentModel,
    config: config,
    session: session,
    projectInfo: projectInfo
  };

  // If user gave a one-shot task, run & exit
  if (initialTask) {
    await runTask(repo, initialTask, dry, sessionState.model, branchName, sessionState.provider);
    process.exit(0);
  }

  // Launch TUI if requested
  if (launchUI) {
    log.info("TUI is temporarily disabled - compiling React components...");
    log.info("Use the regular CLI mode for now");
    // const { startTUI } = await import("./ui/App.js");
    // 
    // log.step("Launching TUI", "full-screen interface");
    // 
    // startTUI({
    //   repo,
    //   provider: currentProvider,
    //   model: currentModel,
    //   config,
    //   session,
    //   projectInfo,
    // });
    // 
    // return; // TUI handles everything from here
  }

  // Otherwise start REPL session  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: log.colors.dim("termcode") + log.colors.blue(" > "),
    historySize: 100,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    const args = input.split(/\s+/);
    const cmd = args[0]?.toLowerCase() || "";

    if (!input) {
      rl.prompt();
      return;
    }

    // Exit commands
    if (cmd === "exit" || cmd === "quit") {
      rl.close();
      return;
    }

    // Provider/Model switching commands
    if (input.startsWith("/provider ")) {
      const providerId = input.split(" ")[1];
      const availableProviders = Object.keys(registry);
      
      if (!availableProviders.includes(providerId)) {
        log.error(`Unknown provider: ${providerId}. Available: ${availableProviders.join(", ")}`);
        rl.prompt();
        return;
      }
      
      // Check if provider has required key (except for ollama)
      if (providerId !== "ollama" && !(await getProviderKey(providerId))) {
        log.warn(`No API key found for ${providerId}. Please add one:`);
        const inquirer = await import("inquirer");
        const { key } = await inquirer.default.prompt([{
          type: "password",
          name: "key",
          message: `API key for ${providerId}:`,
          mask: "•"
        }]);
        if (key) {
          await setProviderKey(providerId, key);
          log.info("✓ API key saved");
        } else {
          log.error("No API key provided");
          rl.prompt();
          return;
        }
      }
      
      sessionState.provider = providerId;
      sessionState.model = sessionState.config.models[providerId]?.chat || "";
      
      if (!sessionState.model) {
        log.error(`No chat model configured for ${providerId}`);
        rl.prompt();
        return;
      }
      
      log.success(`Switched to ${log.colors.bright(providerId)} (${sessionState.model})`);
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/model ")) {
      const modelId = input.slice(7).trim();
      sessionState.model = modelId;
      log.success(`Model updated to ${log.colors.bright(modelId)}`);
      rl.prompt();
      return;
    }
    
    if (cmd === "/keys") {
      log.raw("");
      log.raw(log.colors.bright("🔐 API Key Status:"));
      const providerKeys = await listProviderKeys();
      const availableProviders = Object.keys(registry);
      
      for (const providerId of availableProviders) {
        const providerName = log.colors.cyan(providerId.padEnd(12));
        if (providerId === "ollama") {
          log.raw(`  ${providerName} ${log.colors.green("✓")} ${log.colors.dim("local (no key needed)")}`);
        } else {
          const hasKey = providerKeys.includes(providerId);
          const status = hasKey ? 
            `${log.colors.green("✓")} ${log.colors.dim("configured")}` : 
            `${log.colors.red("❌")} ${log.colors.dim("missing")}`;
          log.raw(`  ${providerName} ${status}`);
        }
      }
      log.raw("");
      log.raw(log.colors.dim("Use /provider <name> to add missing keys"));
      rl.prompt();
      return;
    }
    
    if (cmd === "/health") {
      log.raw("");
      log.raw(log.colors.bright("🏥 Provider Health Check:"));
      const availableProviders = Object.keys(registry);
      
      for (const providerId of availableProviders) {
        const providerName = log.colors.cyan(providerId.padEnd(12));
        process.stdout.write(`  ${providerName} ${log.colors.dim("checking...")}`);
        
        try {
          const provider = getProvider(providerId);
          if (provider.healthCheck) {
            const health = await provider.healthCheck();
            const statusIcon = health.status === "healthy" ? log.colors.green("✅") : 
                             health.status === "degraded" ? log.colors.yellow("⚠️") : log.colors.red("❌");
            const statusText = health.status === "healthy" ? log.colors.green("healthy") :
                              health.status === "degraded" ? log.colors.yellow("degraded") : log.colors.red("error");
            const latencyText = health.latency ? log.colors.dim(` (${health.latency}ms)`) : "";
            
            process.stdout.write(`\\r  ${providerName} ${statusIcon} ${statusText}${latencyText}\\n`);
            
            if (health.error) {
              log.raw(`    ${log.colors.dim("Error:")} ${log.colors.red(health.error)}`);
            }
            if (health.models && health.models.length > 0) {
              const modelList = health.models.slice(0, 3).join(", ");
              const moreText = health.models.length > 3 ? `... (${health.models.length} total)` : "";
              log.raw(`    ${log.colors.dim("Models:")} ${log.colors.dim(modelList + moreText)}`);
            }
          } else {
            process.stdout.write(`\\r  ${providerName} ${log.colors.dim("➖ health check not implemented")}\\n`);
          }
        } catch (error) {
          const errorText = error instanceof Error ? error.message : "unknown";
          process.stdout.write(`\\r  ${providerName} ${log.colors.red("❌ error")} ${log.colors.dim("- " + errorText)}\\n`);
        }
      }
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/whoami") {
      log.raw("");
      log.raw(log.colors.bright("🤖 Current Session:"));
      log.raw(`  ${log.colors.dim("Provider:")} ${log.colors.cyan(sessionState.provider)}`);
      log.raw(`  ${log.colors.dim("Model:")} ${log.colors.bright(sessionState.model)}`);
      log.raw(`  ${log.colors.dim("Branch:")} ${log.colors.magenta(branchName)}`);
      log.raw(`  ${log.colors.dim("Project:")} ${log.colors.cyan(sessionState.projectInfo.type)}`);
      
      const enabledTools = Object.entries(sessionState.config.tools)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);
      log.raw(`  ${log.colors.dim("Tools:")} ${log.colors.green(enabledTools.join(", "))}`);
      
      // Show session stats
      if (sessionState.session.totalTokensUsed > 0) {
        log.raw(`  ${log.colors.dim("Usage:")} ${log.colors.yellow(sessionState.session.totalTokensUsed.toString())} tokens, ${log.colors.yellow("$" + sessionState.session.totalCostUSD.toFixed(4))}`);
      }
      
      log.raw(`  ${log.colors.dim("Config:")} ${log.colors.dim(configPath())}`);
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/budget") {
      log.raw("");
      const budgetStatus = await formatDetailedBudgetStatus();
      log.raw(budgetStatus);
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/sessions") {
      log.raw("");
      log.raw(log.colors.bright("📋 Recent Sessions:"));
      
      const recentSessions = await listRecentSessions(5);
      if (recentSessions.length === 0) {
        log.raw(log.colors.dim("  No recent sessions found"));
      } else {
        for (const sess of recentSessions) {
          const timeAgo = new Date(Date.now() - new Date(sess.lastUsed).getTime()).toISOString().substr(11, 8);
          const current = sess.repoPath === repo ? log.colors.green(" (current)") : "";
          log.raw(`  ${log.colors.cyan(sess.repoPath.split('/').pop() || sess.repoPath)} - ${log.colors.dim(sess.provider)}/${log.colors.dim(sess.model)} - ${log.colors.dim(timeAgo)} ago${current}`);
          
          if (sess.recentTasks.length > 0) {
            log.raw(`    ${log.colors.dim("Last:")} ${log.colors.dim(sess.recentTasks[0])}`);
          }
        }
      }
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/config") {
      log.raw("");
      log.raw(log.colors.bright("⚙️ Configuration Commands:"));
      log.raw(`  ${log.colors.cyan("/config validate")}  ${log.colors.dim("- Validate current configuration")}`);
      log.raw(`  ${log.colors.cyan("/config reset")}     ${log.colors.dim("- Reset configuration (requires re-setup)")}`);
      log.raw(`  ${log.colors.cyan("/config path")}      ${log.colors.dim("- Show config file path")}`);
      log.raw(`  ${log.colors.cyan("/config edit")}      ${log.colors.dim("- Open config in editor")}`);
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/config ")) {
      const subCmd = input.split(" ")[1];
      
      switch (subCmd) {
        case "validate":
          const validation = await validateConfig();
          if (validation.valid) {
            log.info("✅ Configuration is valid");
          } else {
            log.error("❌ Configuration errors:");
            validation.errors.forEach(err => console.log(`  • ${err}`));
          }
          break;
          
        case "reset":
          const inquirer = await import("inquirer");
          const { confirm } = await inquirer.default.prompt([{
            type: "confirm",
            name: "confirm",
            message: "Reset configuration? This will require re-setup.",
            default: false
          }]);
          
          if (confirm) {
            await resetConfig();
            log.info("✅ Configuration reset. Run termcode again to re-configure.");
            rl.close();
            return;
          } else {
            log.info("Reset cancelled");
          }
          break;
          
        case "path":
          console.log(`\\n📁 Configuration file: ${configPath()}`);
          break;
          
        case "edit":
          const { spawn } = await import("node:child_process");
          const editor = process.env.EDITOR || "nano";
          spawn(editor, [configPath()], { stdio: "inherit" });
          break;
          
        default:
          log.error(`Unknown config command: ${subCmd}`);
          log.info("Use '/config' to see available commands");
      }
      
      rl.prompt();
      return;
    }
    
    // Git workflow commands
    if (cmd === "rollback") {
      log.step("Rolling back", "discarding all changes...");
      checkoutBranch(repo, "main");
      deleteBranch(repo, branchName);
      log.success("Rollback complete - switched back to main");
      rl.close();
      return;
    }
    
    if (cmd === "merge") {
      log.step("Merging", `${branchName} into main...`);
      checkoutBranch(repo, "main");
      const m = mergeBranch(repo, branchName);
      if (!m.ok) {
        log.error("Merge failed:", (m as any).error);
      } else {
        log.success("Merge complete");
        deleteBranch(repo, branchName);
      }
      rl.close();
      return;
    }

    // PR command: pr "Title"
    if (input.startsWith("pr ")) {
      const title = input.slice(3).replace(/^["']|["']$/g, "");
      if (!title) {
        log.error("Usage: pr \"Pull request title\"");
        rl.prompt();
        return;
      }
      
      try {
        const logs = await getSessionLogs(repo);
        const branchLogs = logs.filter(l => l.branchName === branchName);
        const body = branchLogs.map(l => `• ${l.task}`).join("\\n") + "\\n\\n🤖 Generated with TermCode";
        
        const prUrl = await createPullRequest(repo, branchName, title, body);
        log.success(`Pull request created: ${log.colors.blue(prUrl)}`);
      } catch (error) {
        log.error("Failed to create PR:", (error as Error).message);
      }
      rl.prompt();
      return;
    }

    // Test commands
    if (cmd === "test") {
      const autoDebugFlag = args[1] === "--auto-debug" || args[1] === "-a";
      
      if (autoDebugFlag) {
        const { runTestsWithAutoDebug } = await import("./agent/auto-debugger.js");
        const result = await runTestsWithAutoDebug(repo, true);
        
        if (result.success) {
          log.success(`🎉 Tests passed with auto-debug${(result as any).autoDebugAttempts > 1 ? ` (${(result as any).autoDebugAttempts} attempts)` : ""}`);
        } else {
          log.error(`❌ Auto-debug failed after ${(result as any).autoDebugAttempts || 1} attempts`);
        }
      } else {
        const { runTests } = await import("./tools/test.js");
        const result = await runTests(repo);
        
        if (result.success) {
        let message = `Tests passed with ${result.runner}`;
        if (result.testsRun) {
          message += ` (${result.testsRun} tests`;
          if (result.testsPassed) message += `, ${result.testsPassed} passed`;
          if (result.testsFailed) message += `, ${result.testsFailed} failed`;
          message += ")";
        }
        if (result.duration) {
          message += ` in ${(result.duration / 1000).toFixed(1)}s`;
        }
        log.success(message);
      } else {
        log.error(`Tests failed: ${result.output.split('\n')[0]}`);
        
        // Show failure analysis if available
        if (result.failureAnalysis) {
          log.raw("");
          log.raw(log.colors.bright("🔍 Failure Analysis:"));
          log.raw(result.failureAnalysis);
        }
        
        // Show failing test names
        if (result.failingTests && result.failingTests.length > 0) {
          log.raw("");
          log.raw(log.colors.bright("❌ Failing Tests:"));
          for (const test of result.failingTests.slice(0, 5)) { // Show max 5
            log.raw(`  • ${log.colors.red(test)}`);
          }
          if (result.failingTests.length > 5) {
            log.raw(`  ... and ${result.failingTests.length - 5} more`);
          }
        }
        }
      }
      rl.prompt();
      return;
    }

    if (cmd === "lint") {
      const { runLinter } = await import("./tools/test.js");
      const result = await runLinter(repo);
      
      if (result.success) {
        let message = `Linting passed with ${result.runner}`;
        if (result.duration) {
          message += ` in ${(result.duration / 1000).toFixed(1)}s`;
        }
        log.success(message);
      } else {
        log.error(`Linting failed: ${result.output.split('\n')[0]}`);
      }
      rl.prompt();
      return;
    }

    if (cmd === "build") {
      const { runBuild } = await import("./tools/test.js");
      const result = await runBuild(repo);
      
      if (result.success) {
        let message = `Build passed with ${result.runner}`;
        if (result.duration) {
          message += ` in ${(result.duration / 1000).toFixed(1)}s`;
        }
        log.success(message);
      } else {
        log.error(`Build failed: ${result.output.split('\n')[0]}`);
      }
      rl.prompt();
      return;
    }

    // Log commands
    if (cmd === "log") {
      const logs = await getSessionLogs(repo);
      const branchLogs = logs.filter(l => l.branchName === branchName);
      
      if (branchLogs.length === 0) {
        log.raw("");
        log.raw(log.colors.dim("📋 No session logs found for this branch"));
        log.raw("");
      } else {
        log.raw("");
        log.raw(log.colors.bright("📋 Session Log:"));
        branchLogs.forEach((entry, i) => {
          const num = log.colors.dim(`${i + 1}.`);
          const task = log.colors.bright(entry.task);
          log.raw(`${num} ${task}`);
          
          if (entry.applied && entry.applied.length > 0) {
            const files = entry.applied.map(f => log.colors.cyan(f)).join(", ");
            log.raw(`   ${log.colors.dim("Applied:")} ${files}`);
          }
          
          log.raw(`   ${log.colors.dim("Model:")} ${log.colors.magenta(entry.model)}`);
          if (i < branchLogs.length - 1) log.raw("");
        });
        log.raw("");
      }
      rl.prompt();
      return;
    }

    if (cmd === "clear-log") {
      await clearSessionLogs(repo);
      log.success("Session logs cleared");
      rl.prompt();
      return;
    }

    // Shell command: !<command>
    if (input.startsWith("!")) {
      const shellCmd = input.slice(1).trim();
      if (!shellCmd) {
        log.error("Usage: !<command>");
        rl.prompt();
        return;
      }
      
      log.step("Executing", shellCmd);
      const result = await runShell(shellCmd.split(" "), repo);
      
      if (result.ok) {
        if (result.data.stdout) {
          log.raw(result.data.stdout);
        }
        if (result.data.stderr) {
          log.raw(log.colors.yellow(result.data.stderr));
        }
        const code = result.data.code;
        if (code === 0) {
          log.success(`Command completed successfully`);
        } else {
          log.warn(`Command exited with code ${code}`);
        }
      } else {
        log.error("Shell command failed:", (result as any).error);
      }
      rl.prompt();
      return;
    }

    // Tools commands
    if (cmd === "/tools") {
      log.raw("");
      log.raw(log.colors.bright("🛠️  Tool Status:"));
      log.raw("");
      
      const toolsStatus = [
        { name: "shell", enabled: sessionState.config.tools.shell, description: "Execute shell commands" },
        { name: "git", enabled: sessionState.config.tools.git, description: "Git operations and branch management" },
        { name: "tests", enabled: sessionState.config.tools.tests, description: "Run tests automatically" },
        { name: "browser", enabled: sessionState.config.tools.browser, description: "Web browsing capabilities" }
      ];
      
      for (const tool of toolsStatus) {
        const status = tool.enabled ? log.colors.green("✓ ON ") : log.colors.red("✗ OFF");
        const name = log.colors.cyan(tool.name.padEnd(8));
        const desc = log.colors.dim(tool.description);
        log.raw(`  ${status} ${name} ${desc}`);
      }
      
      log.raw("");
      log.raw(log.colors.dim("Usage: /tools <name> on|off"));
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/tools ")) {
      const parts = input.split(" ");
      if (parts.length !== 3) {
        log.error("Usage: /tools <name> on|off");
        log.raw("Available tools: shell, git, tests, browser");
        rl.prompt();
        return;
      }
      
      const [, toolName, action] = parts;
      const validTools = ["shell", "git", "tests", "browser"];
      const validActions = ["on", "off"];
      
      if (!validTools.includes(toolName)) {
        log.error(`Unknown tool: ${toolName}`);
        log.raw("Available tools: " + validTools.join(", "));
        rl.prompt();
        return;
      }
      
      if (!validActions.includes(action)) {
        log.error("Action must be 'on' or 'off'");
        rl.prompt();
        return;
      }
      
      const enabled = action === "on";
      const oldValue = sessionState.config.tools[toolName as keyof typeof sessionState.config.tools];
      
      // Update config
      (sessionState.config.tools as any)[toolName] = 
        toolName === "tests" ? (enabled ? "auto" : false) : enabled;
      
      // Save updated config
      try {
        const { saveConfig } = await import("./state/config.js");
        await saveConfig(sessionState.config);
        
        const statusText = enabled ? log.colors.green("enabled") : log.colors.red("disabled");
        log.success(`Tool '${log.colors.cyan(toolName)}' ${statusText}`);
        
        if (toolName === "shell" && enabled) {
          log.warn("Shell commands (!cmd) are now enabled - use with caution");
        } else if (toolName === "browser" && enabled) {
          log.warn("Browser tools are experimental - may require additional setup");
        }
      } catch (error) {
        log.error("Failed to save config:", error);
        // Revert the change
        (sessionState.config.tools as any)[toolName] = oldValue;
      }
      
      rl.prompt();
      return;
    }

    // Hunks command
    if (cmd === "/hunks") {
      const currentStatus = process.env.TERMCODE_INTERACTIVE_HUNKS === 'true';
      const statusText = currentStatus ? log.colors.green("enabled") : log.colors.red("disabled");
      
      log.raw("");
      log.raw(log.colors.bright("🔍 Interactive Hunk Approval:"));
      log.raw(`  Status: ${statusText}`);
      log.raw("");
      
      if (currentStatus) {
        log.raw("  When enabled, you can review and approve/reject individual hunks");
        log.raw("  before they are applied to your codebase.");
        log.raw("");
        log.raw("  Commands during review:");
        log.raw("  • s: Select/deselect current hunk");
        log.raw("  • n/p: Navigate next/previous");
        log.raw("  • a: Toggle all hunks");
        log.raw("  • q: Apply selected hunks");
      } else {
        log.raw("  All diff hunks are applied automatically without review.");
      }
      
      log.raw("");
      log.raw(log.colors.dim("Toggle with: TERMCODE_INTERACTIVE_HUNKS=true termcode"));
      log.raw("");
      rl.prompt();
      return;
    }

    // Memory commands
    if (cmd === "/memory") {
      log.raw("");
      log.raw(log.colors.bright("🧠 Shared Memory Commands:"));
      log.raw("");
      log.raw(`  ${log.colors.cyan("/memory add")}      ${log.colors.dim("- Add knowledge entry")}`);
      log.raw(`  ${log.colors.cyan("/memory list")}     ${log.colors.dim("- List all entries")}`);
      log.raw(`  ${log.colors.cyan("/memory search")}   ${log.colors.dim("- Search entries")}`);
      log.raw(`  ${log.colors.cyan("/memory stats")}    ${log.colors.dim("- Show memory statistics")}`);
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/memory ")) {
      const { 
        addSharedMemoryEntry, 
        searchSharedMemory, 
        getRelevantEntries, 
        getSharedMemoryStats 
      } = await import("./state/shared-memory.js");
      
      const parts = input.split(" ");
      const subCmd = parts[1];
      
      switch (subCmd) {
        case "add":
          log.raw("");
          log.info("📝 Adding shared memory entry...");
          
          const inquirer = await import("inquirer");
          const answers = await inquirer.default.prompt([
            {
              type: "list",
              name: "category",
              message: "Category:",
              choices: ["architecture", "style", "pattern", "convention", "framework", "library"]
            },
            {
              type: "input",
              name: "title",
              message: "Title:",
              validate: (input: string) => input.trim().length > 0 || "Title is required"
            },
            {
              type: "editor",
              name: "content",
              message: "Content (will open editor):",
              validate: (input: string) => input.trim().length > 0 || "Content is required"
            },
            {
              type: "input",
              name: "tags",
              message: "Tags (comma-separated):",
              filter: (input: string) => input.split(",").map(s => s.trim()).filter(s => s.length > 0)
            }
          ]);
          
          await addSharedMemoryEntry(
            answers.category,
            answers.title,
            answers.content,
            answers.tags,
            repo
          );
          break;
          
        case "list":
          const relevant = await getRelevantEntries(repo);
          
          if (relevant.length === 0) {
            log.info("No shared memory entries found");
          } else {
            log.raw("");
            log.raw(log.colors.bright("🧠 Shared Memory Entries:"));
            log.raw("");
            
            for (const entry of relevant.slice(0, 10)) {
              const category = log.colors.cyan(`[${entry.category}]`);
              const title = log.colors.bright(entry.title);
              const usage = log.colors.dim(`(used ${entry.usageCount}x)`);
              log.raw(`  ${category} ${title} ${usage}`);
              
              if (entry.tags.length > 0) {
                const tags = entry.tags.map(tag => log.colors.yellow(`#${tag}`)).join(" ");
                log.raw(`    Tags: ${tags}`);
              }
              
              // Show truncated content
              const preview = entry.content.substring(0, 100);
              log.raw(`    ${log.colors.dim(preview)}${entry.content.length > 100 ? "..." : ""}`);
              log.raw("");
            }
            
            if (relevant.length > 10) {
              log.raw(`  ... and ${relevant.length - 10} more entries`);
            }
          }
          break;
          
        case "search":
          const searchQuery = parts.slice(2).join(" ");
          if (!searchQuery) {
            log.error("Usage: /memory search <query>");
            break;
          }
          
          const results = await searchSharedMemory(searchQuery, repo);
          
          if (results.length === 0) {
            log.info(`No entries found for "${searchQuery}"`);
          } else {
            log.raw("");
            log.raw(log.colors.bright(`🔍 Search Results for "${searchQuery}":`));
            log.raw("");
            
            for (const entry of results.slice(0, 5)) {
              const category = log.colors.cyan(`[${entry.category}]`);
              const title = log.colors.bright(entry.title);
              log.raw(`  ${category} ${title}`);
              
              // Show matching content excerpt
              const queryLower = searchQuery.toLowerCase();
              const content = entry.content.toLowerCase();
              const matchIndex = content.indexOf(queryLower);
              
              if (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(entry.content.length, matchIndex + 150);
                const excerpt = entry.content.substring(start, end);
                log.raw(`    ${log.colors.dim("..." + excerpt + "...")}`);
              }
              log.raw("");
            }
          }
          break;
          
        case "stats":
          const stats = await getSharedMemoryStats();
          
          log.raw("");
          log.raw(log.colors.bright("📊 Shared Memory Statistics:"));
          log.raw("");
          log.raw(`  Total entries: ${log.colors.green(stats.totalEntries.toString())}`);
          log.raw(`  Total usage: ${log.colors.yellow(stats.totalUsage.toString())}`);
          log.raw("");
          
          if (Object.keys(stats.categoryCounts).length > 0) {
            log.raw("  Categories:");
            for (const [category, count] of Object.entries(stats.categoryCounts)) {
              log.raw(`    ${log.colors.cyan(category)}: ${count}`);
            }
            log.raw("");
          }
          
          if (stats.topTags.length > 0) {
            log.raw("  Top tags:");
            for (const { tag, count } of stats.topTags.slice(0, 5)) {
              log.raw(`    ${log.colors.yellow(`#${tag}`)}: ${count}`);
            }
          }
          break;
          
        default:
          log.error(`Unknown memory command: ${subCmd}`);
          log.info("Use '/memory' to see available commands");
      }
      
      log.raw("");
      rl.prompt();
      return;
    }

    // Macro commands
    if (cmd === "/macro" || cmd === "/macros") {
      const { loadAllMacros, getMacro, removeMacro } = await import("./macros/storage.js");
      const { executeMacro, getActiveExecutions } = await import("./macros/executor.js");
      const { startRecording, stopRecording, cancelRecording, isRecording, getRecordingSession } = await import("./macros/recorder.js");
      
      const subCmd = args[1];
      
      if (!subCmd) {
        log.raw("");
        log.raw(log.colors.bright("🎯 Macro Commands:"));
        log.raw("");
        log.raw(`  ${log.colors.cyan("/macro list")}              ${log.colors.dim("- List all macros")}`);
        log.raw(`  ${log.colors.cyan("/macro run <name>")}        ${log.colors.dim("- Execute a macro")}`);
        log.raw(`  ${log.colors.cyan("/macro create <name>")}     ${log.colors.dim("- Start recording a macro")}`);
        log.raw(`  ${log.colors.cyan("/macro stop")}             ${log.colors.dim("- Stop recording and save")}`);
        log.raw(`  ${log.colors.cyan("/macro cancel")}           ${log.colors.dim("- Cancel recording")}`);
        log.raw(`  ${log.colors.cyan("/macro delete <name>")}    ${log.colors.dim("- Delete a macro")}`);
        log.raw(`  ${log.colors.cyan("/macro status")}           ${log.colors.dim("- Show recording/execution status")}`);
        log.raw("");
        log.raw("Built-in macros:");
        log.raw(`  ${log.colors.dim("hotfix, deploy-prep, clean-start")}`);
        log.raw("");
        rl.prompt();
        return;
      }
      
      switch (subCmd) {
        case "list":
          const macros = await loadAllMacros(repo);
          if (macros.length === 0) {
            log.info("No macros found");
          } else {
            log.raw("");
            log.raw(log.colors.bright("📋 Available Macros:"));
            log.raw("");
            for (const macro of macros.sort((a, b) => b.usageCount - a.usageCount)) {
              const scope = macro.scope === "global" ? "🌐" : "📁";
              const usage = macro.usageCount > 0 ? log.colors.dim(` (used ${macro.usageCount}x)`) : "";
              log.raw(`  ${scope} ${log.colors.cyan(macro.name.padEnd(20))} ${macro.description}${usage}`);
              log.raw(`     ${log.colors.dim(`${macro.steps.length} steps • ${macro.tags.join(", ")}`)}`);
            }
            log.raw("");
          }
          break;
          
        case "run":
          const macroName = args[2];
          if (!macroName) {
            log.error("Please specify macro name: /macro run <name>");
            break;
          }
          
          const macro = await getMacro(macroName, repo);
          if (!macro) {
            log.error(`Macro not found: ${macroName}`);
            break;
          }
          
          log.info(`Executing macro: ${macro.name}`);
          const execution = await executeMacro(macro, repo);
          
          if (execution.status === "completed") {
            log.success(`Macro completed successfully in ${Date.now() - new Date(execution.startTime).getTime()}ms`);
          } else {
            log.error(`Macro failed: ${execution.error}`);
          }
          break;
          
        case "create":
          const newMacroName = args[2];
          if (!newMacroName) {
            log.error("Please specify macro name: /macro create <name>");
            break;
          }
          
          const description = args.slice(3).join(" ") || "Recorded macro";
          await startRecording(newMacroName, description, repo, "project");
          break;
          
        case "stop":
          const savedMacro = await stopRecording(repo);
          if (!savedMacro) {
            log.warn("No recording session active or no steps recorded");
          }
          break;
          
        case "cancel":
          const cancelled = await cancelRecording(repo);
          if (!cancelled) {
            log.warn("No recording session active");
          }
          break;
          
        case "delete":
          const deleteTarget = args[2];
          if (!deleteTarget) {
            log.error("Please specify macro name: /macro delete <name>");
            break;
          }
          
          const deleted = await removeMacro(deleteTarget, repo);
          if (deleted) {
            log.success(`Deleted macro: ${deleteTarget}`);
          } else {
            log.error(`Macro not found: ${deleteTarget}`);
          }
          break;
          
        case "status":
          const recording = getRecordingSession(repo);
          const activeExecs = getActiveExecutions();
          
          log.raw("");
          if (recording) {
            const status = recording.isRecording ? "🔴 Recording" : "⏸️ Paused";
            log.raw(`${status}: ${recording.name} (${recording.steps.length} steps)`);
          } else {
            log.raw("🟦 No active recording");
          }
          
          if (activeExecs.length > 0) {
            log.raw("");
            log.raw("🏃 Active executions:");
            for (const exec of activeExecs) {
              log.raw(`  ${exec.macroName}: Step ${exec.currentStep + 1}/${exec.totalSteps} (${exec.status})`);
            }
          }
          log.raw("");
          break;
          
        default:
          log.error(`Unknown macro command: ${subCmd}`);
          log.info("Use '/macro' to see available commands");
      }
      
      rl.prompt();
      return;
    }

    // GitHub integration commands
    if (cmd === "/github" || cmd === "/gh") {
      const { runDependencyUpdate, getGitHubIntegrationStatus } = await import("./github/index.js");
      
      const subCmd = args[1];
      
      if (!subCmd) {
        log.raw("");
        log.raw(log.colors.bright("🐙 GitHub Integration Commands:"));
        log.raw("");
        log.raw(`  ${log.colors.cyan("/github status")}           ${log.colors.dim("- Show GitHub integration status")}`);
        log.raw(`  ${log.colors.cyan("/github deps")}             ${log.colors.dim("- Check dependency updates")}`);
        log.raw(`  ${log.colors.cyan("/github deps --update")}    ${log.colors.dim("- Apply dependency updates")}`);
        log.raw(`  ${log.colors.cyan("/github deps --major")}     ${log.colors.dim("- Include major updates")}`);
        log.raw("");
        log.raw("Environment variables:");
        log.raw(`  ${log.colors.dim("GITHUB_WEBHOOK_ENABLED=true")}   - Enable webhook server`);
        log.raw(`  ${log.colors.dim("GITHUB_WEBHOOK_PORT=3000")}      - Webhook server port`);
        log.raw(`  ${log.colors.dim("GITHUB_WEBHOOK_SECRET=...")}     - Webhook signature secret`);
        log.raw(`  ${log.colors.dim("GITHUB_TOKEN=...")}             - GitHub API token`);
        log.raw("");
        rl.prompt();
        return;
      }
      
      switch (subCmd) {
        case "status":
          const status = getGitHubIntegrationStatus();
          log.raw("");
          log.raw(log.colors.bright("🐙 GitHub Integration Status:"));
          log.raw("");
          
          if (status.enabled) {
            log.raw(`  ${log.colors.green("✅")} Webhook server: ${status.listening ? 'Running' : 'Stopped'} (port ${status.port})`);
            log.raw(`  ${log.colors.cyan("📝")} Supported commands: fix, test, lint, build, pr, hotfix, deploy-prep`);
            log.raw(`  ${log.colors.cyan("🔒")} Permissions: OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR`);
          } else {
            log.raw(`  ${log.colors.red("❌")} Webhook server: Disabled`);
            log.raw(`  ${log.colors.dim("Set GITHUB_WEBHOOK_ENABLED=true to enable")}`);
          }
          
          const hasToken = !!process.env.GITHUB_TOKEN;
          log.raw(`  ${hasToken ? log.colors.green("✅") : log.colors.red("❌")} GitHub token: ${hasToken ? 'Configured' : 'Missing'}`);
          
          if (!hasToken) {
            log.raw(`  ${log.colors.dim("Set GITHUB_TOKEN environment variable for full functionality")}`);
          }
          log.raw("");
          break;
          
        case "deps":
        case "dependencies":
          const updateFlag = args.includes("--update");
          const majorFlag = args.includes("--major");
          const dryFlag = args.includes("--dry") || !updateFlag;
          
          const updateTypes: Array<"patch" | "minor" | "major"> = majorFlag 
            ? ["patch", "minor", "major"] 
            : ["patch", "minor"];
          
          await runDependencyUpdate(repo, {
            types: updateTypes,
            createPR: true,
            dry: dryFlag
          });
          break;
          
        default:
          log.error(`Unknown GitHub command: ${subCmd}`);
          log.info("Use '/github' to see available commands");
      }
      
      rl.prompt();
      return;
    }

    // Documentation commands
    if (cmd === "/doc" || cmd === "/docs") {
      log.raw("");
      log.raw(log.colors.bright("📚 Documentation Commands:"));
      log.raw("");
      log.raw(`  ${log.colors.cyan("/doc module <file>")}    ${log.colors.dim("- Document a module/file")}`);
      log.raw(`  ${log.colors.cyan("/doc readme")}           ${log.colors.dim("- Generate project README")}`);
      log.raw(`  ${log.colors.cyan("/doc api")}              ${log.colors.dim("- Generate API documentation")}`);
      log.raw("");
      log.raw("Examples:");
      log.raw(`  ${log.colors.dim("/doc module src/utils.ts")}`);
      log.raw(`  ${log.colors.dim("/doc readme")}`);
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/doc ")) {
      const { generateDocumentation } = await import("./agent/doc-generator.js");
      const fs = await import("node:fs/promises");
      
      const parts = input.split(" ");
      const docType = parts[1];
      const targetFile = parts[2];
      
      switch (docType) {
        case "module":
        case "file":
          if (!targetFile) {
            log.error("Usage: /doc module <file-path>");
            log.raw("Example: /doc module src/utils.ts");
            break;
          }
          
          log.step("Generating docs", `for ${targetFile}...`);
          
          const moduleResult = await generateDocumentation(repo, {
            type: "module",
            targetPath: targetFile,
            includeExamples: true,
            includeTypes: true,
            style: "markdown"
          });
          
          if (!moduleResult.success) {
            log.error("Documentation generation failed:", moduleResult.error);
            break;
          }
          
          log.success(`Generated documentation for ${targetFile}`);
          log.raw("");
          log.raw(log.colors.bright("📄 Generated Documentation:"));
          log.raw("");
          
          // Show preview of generated docs
          const preview = moduleResult.generatedDocs.substring(0, 500);
          log.raw(preview);
          if (moduleResult.generatedDocs.length > 500) {
            log.raw(log.colors.dim("... (truncated for display)"));
          }
          
          // Ask if user wants to apply the documentation
          if (moduleResult.filesToUpdate.length > 0) {
            log.raw("");
            const inquirer = await import("inquirer");
            const { apply } = await inquirer.default.prompt([{
              type: "confirm",
              name: "apply",
              message: "Apply this documentation to files?",
              default: true
            }]);
            
            if (apply) {
              for (const file of moduleResult.filesToUpdate) {
                try {
                  await fs.writeFile(file.path, file.content, "utf8");
                  log.success(`${file.type === "create" ? "Created" : "Updated"}: ${file.path}`);
                } catch (error) {
                  log.error(`Failed to ${file.type} ${file.path}:`, error);
                }
              }
            }
          }
          break;
          
        case "readme":
          log.step("Generating README", "analyzing project structure...");
          
          const readmeResult = await generateDocumentation(repo, {
            type: "readme",
            targetPath: "README.md",
            includeExamples: true,
            style: "markdown"
          });
          
          if (!readmeResult.success) {
            log.error("README generation failed:", readmeResult.error);
            break;
          }
          
          log.success("Generated project README");
          log.raw("");
          log.raw(log.colors.bright("📋 Generated README:"));
          log.raw("");
          
          // Show preview
          const readmePreview = readmeResult.generatedDocs.split('\n').slice(0, 20).join('\n');
          log.raw(readmePreview);
          log.raw(log.colors.dim("... (showing first 20 lines)"));
          
          // Ask if user wants to save README
          log.raw("");
          const inquirer2 = await import("inquirer");
          const { saveReadme } = await inquirer2.default.prompt([{
            type: "confirm",
            name: "saveReadme",
            message: "Save this README.md to the project?",
            default: true
          }]);
          
          if (saveReadme && readmeResult.filesToUpdate.length > 0) {
            const file = readmeResult.filesToUpdate[0];
            try {
              await fs.writeFile(file.path, file.content, "utf8");
              log.success(`Created: README.md`);
            } catch (error) {
              log.error("Failed to create README.md:", error);
            }
          }
          break;
          
        case "api":
          log.info("API documentation generation - analyzing project...");
          
          // Find API-related files
          const glob = (await import("fast-glob")).default;
          const apiFiles = await glob("**/{api,routes,controllers,handlers}/**/*.{ts,js,py,go}", {
            cwd: repo,
            ignore: ["node_modules/**", ".git/**", "dist/**", "build/**"]
          });
          
          if (apiFiles.length === 0) {
            log.warn("No API files found. Tried looking for files in api/, routes/, controllers/, handlers/ directories");
            break;
          }
          
          log.info(`Found ${apiFiles.length} API files`);
          
          // Generate docs for each API file
          const apiDocs: string[] = [];
          
          for (const apiFile of apiFiles.slice(0, 5)) { // Limit to prevent overload
            log.step("Documenting API", apiFile);
            
            const apiResult = await generateDocumentation(repo, {
              type: "api",
              targetPath: apiFile,
              includeExamples: true,
              includeTypes: true,
              style: "markdown"
            });
            
            if (apiResult.success) {
              apiDocs.push(`## ${apiFile}\n\n${apiResult.generatedDocs}\n\n---\n`);
            }
          }
          
          if (apiDocs.length > 0) {
            const combinedApiDocs = `# API Documentation\n\n${apiDocs.join('\n')}`;
            
            log.success(`Generated API documentation for ${apiDocs.length} files`);
            
            // Save to API.md
            const inquirer3 = await import("inquirer");
            const { saveApiDocs } = await inquirer3.default.prompt([{
              type: "confirm",
              name: "saveApiDocs",
              message: "Save API documentation to API.md?",
              default: true
            }]);
            
            if (saveApiDocs) {
              try {
                await fs.writeFile(path.join(repo, "API.md"), combinedApiDocs, "utf8");
                log.success("Created: API.md");
              } catch (error) {
                log.error("Failed to create API.md:", error);
              }
            }
          }
          break;
          
        default:
          log.error(`Unknown documentation type: ${docType}`);
          log.info("Use '/doc' to see available commands");
      }
      
      log.raw("");
      rl.prompt();
      return;
    }

    // Help command
    if (cmd === "help") {
      log.raw("");
      log.raw(log.colors.bright("📚 TermCode Commands:"));
      log.raw("");
      
      log.raw(log.colors.cyan("  General:"));
      log.raw(`    ${log.colors.magenta("<task>")}           ${log.colors.dim("- Execute a coding task")}`);
      log.raw(`    ${log.colors.magenta("help")}            ${log.colors.dim("- Show this help")}`);
      log.raw(`    ${log.colors.magenta("exit/quit")}       ${log.colors.dim("- Exit session")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Configuration:"));
      log.raw(`    ${log.colors.magenta("/provider <id>")}   ${log.colors.dim("- Switch provider")} ${log.colors.dim("(" + Object.keys(registry).join(", ") + ")")}`);
      log.raw(`    ${log.colors.magenta("/model <id>")}      ${log.colors.dim("- Switch model")}`);
      log.raw(`    ${log.colors.magenta("/keys")}           ${log.colors.dim("- Show API key status")}`);
      log.raw(`    ${log.colors.magenta("/health")}         ${log.colors.dim("- Check provider health and connectivity")}`);
      log.raw(`    ${log.colors.magenta("/whoami")}         ${log.colors.dim("- Show current session info")}`);
      log.raw(`    ${log.colors.magenta("/budget")}         ${log.colors.dim("- Show budget and usage status")}`);
      log.raw(`    ${log.colors.magenta("/sessions")}       ${log.colors.dim("- Show recent sessions")}`);
      log.raw(`    ${log.colors.magenta("/config")}         ${log.colors.dim("- Configuration management commands")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Git Workflow:"));
      log.raw(`    ${log.colors.magenta("rollback")}        ${log.colors.dim("- Discard all changes and return to main")}`);
      log.raw(`    ${log.colors.magenta("merge")}           ${log.colors.dim("- Merge changes to main")}`);
      log.raw(`    ${log.colors.magenta('pr "title"')}      ${log.colors.dim("- Create GitHub PR")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Development:"));
      log.raw(`    ${log.colors.magenta("test")}            ${log.colors.dim("- Run tests")}`);
      log.raw(`    ${log.colors.magenta("lint")}            ${log.colors.dim("- Run linter")}`);
      log.raw(`    ${log.colors.magenta("build")}           ${log.colors.dim("- Run build")}`);
      log.raw(`    ${log.colors.magenta("!<cmd>")}          ${log.colors.dim("- Execute shell command")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Tools:"));
      log.raw(`    ${log.colors.magenta("/tools")}          ${log.colors.dim("- Show tool status")}`);
      log.raw(`    ${log.colors.magenta("/tools <name> on|off")} ${log.colors.dim("- Toggle tools (shell, git, tests, browser)")}`);
      log.raw(`    ${log.colors.magenta("/hunks")}          ${log.colors.dim("- Toggle interactive hunk approval")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Memory:"));
      log.raw(`    ${log.colors.magenta("/memory")}         ${log.colors.dim("- Shared knowledge base commands")}`);
      log.raw(`    ${log.colors.magenta("/memory add")}     ${log.colors.dim("- Add knowledge entry")}`);
      log.raw(`    ${log.colors.magenta("/memory search")}  ${log.colors.dim("- Search entries")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Documentation:"));
      log.raw(`    ${log.colors.magenta("/doc")}            ${log.colors.dim("- Documentation commands")}`);
      log.raw(`    ${log.colors.magenta("/doc module <file>")} ${log.colors.dim("- Document a specific file")}`);
      log.raw(`    ${log.colors.magenta("/doc readme")}     ${log.colors.dim("- Generate project README")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Macros:"));
      log.raw(`    ${log.colors.magenta("/macro")}          ${log.colors.dim("- Macro system commands")}`);
      log.raw(`    ${log.colors.magenta("/macro run <name>")} ${log.colors.dim("- Execute a saved macro")}`);
      log.raw(`    ${log.colors.magenta("/macro create <name>")} ${log.colors.dim("- Start recording a macro")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  GitHub Integration:"));
      log.raw(`    ${log.colors.magenta("/github")}         ${log.colors.dim("- GitHub integration commands")}`);
      log.raw(`    ${log.colors.magenta("/github status")}  ${log.colors.dim("- Show integration status")}`);
      log.raw(`    ${log.colors.magenta("/github deps")}    ${log.colors.dim("- Check dependency updates")}`);
      log.raw("");
      
      log.raw(log.colors.cyan("  Logging:"));
      log.raw(`    ${log.colors.magenta("log")}             ${log.colors.dim("- Show session history")}`);
      log.raw(`    ${log.colors.magenta("clear-log")}       ${log.colors.dim("- Clear all logs")}`);
      log.raw("");
      
      rl.prompt();
      return;
    }

    // Default: treat as coding task
    await runTask(repo, input, dry, sessionState.model, branchName, sessionState.provider);
    
    // Record command for macro if recording is active
    const { recordCommandIfActive } = await import("./macros/index.js");
    await recordCommandIfActive(repo, input);
    
    rl.prompt();
  });

  rl.on("close", async () => {
    log.info("Goodbye!");
    
    // Cleanup GitHub integration
    if (process.env.GITHUB_WEBHOOK_ENABLED === 'true') {
      const { cleanupGitHubIntegration } = await import("./github/index.js");
      await cleanupGitHubIntegration();
    }
    
    process.exit(0);
  });

  } catch (error) {
    if (error instanceof Error) {
      log.error("Fatal error:", error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      log.error("Unknown error occurred");
    }
    process.exit(1);
  }
})();