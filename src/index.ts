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
import { formatBudgetStatus } from "./util/costs.js";
import { getIndexStats } from "./retriever/indexer.js";
import { getProvider, registry } from "./providers/index.js";
import { terminal } from "./ui/terminal.js";
import { workspaceManager } from "./workspace/manager.js";
import { mcpClient } from "./mcp/client.js";
import { PipelineProcessor } from "./tools/pipe.js";
import { sandbox } from "./security/sandbox.js";
import { enhancedSandbox } from "./security/enhanced-sandbox.js";
import { hookManager } from "./hooks/manager.js";
import { intelligentErrorRecovery } from "./intelligence/error-recovery.js";
import { enhancedDiffManager } from "./agent/enhanced-diff.js";
import { performanceMonitor } from "./monitoring/performance.js";
import { smartSuggestionEngine } from "./cli/smart-suggestions.js";
import { pluginSystem } from "./plugins/system.js";

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
  
  // Initialize enhanced systems
  await workspaceManager.initialize();
  await hookManager.initialize();
  await enhancedSandbox.initialize();
  await performanceMonitor.initialize();
  await pluginSystem.initialize();
  
  // Show project info
  const projectInfo = await detectProjectType(repo);
  const indexStats = await getIndexStats(repo);
  
  // Load workspace
  const workspace = await workspaceManager.loadWorkspace(repo, projectInfo);
  
  // Show enhanced welcome screen
  terminal.setTheme(workspace.preferences.theme);
  terminal.showWelcome(projectInfo, { 
    provider: currentProvider, 
    model: currentModel, 
    branchName 
  });
  
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
    prompt: terminal.getPrompt(),
    historySize: 100,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    const cmd = input.toLowerCase();

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
      const providerKeys = await listProviderKeys();
      const availableProviders = Object.keys(registry);
      const providers = availableProviders.map(id => ({
        id,
        hasKey: id === "ollama" || providerKeys.includes(id)
      }));
      
      terminal.showProviderStatus(providers);
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
      const budgetStatus = await formatBudgetStatus();
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

    // Enhanced system commands
    if (cmd === "/hooks") {
      const hooks = hookManager.listHooks();
      log.raw("");
      log.raw(log.colors.bright("🔗 Active Hooks:"));
      hooks.forEach(hook => {
        const status = hook.enabled ? log.colors.green("✓") : log.colors.red("❌");
        log.raw(`  ${status} ${log.colors.cyan(hook.name)} - ${log.colors.dim(hook.description)}`);
      });
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/security") {
      const stats = enhancedSandbox.getSecurityStats();
      log.raw("");
      log.raw(log.colors.bright("🛡️  Security Statistics:"));
      log.raw(`  ${log.colors.dim("Total Violations:")} ${log.colors.yellow(stats.totalViolations.toString())}`);
      log.raw(`  ${log.colors.dim("By Severity:")}`);
      Object.entries(stats.violationsBySeverity).forEach(([severity, count]) => {
        const color = severity === 'critical' ? 'red' : severity === 'high' ? 'yellow' : 'green';
        log.raw(`    ${log.colors[color](severity)}: ${count}`);
      });
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/diffs") {
      const activeDiffs = enhancedDiffManager.getActiveDiffs();
      const stats = enhancedDiffManager.getDiffStats();
      log.raw("");
      log.raw(log.colors.bright("📝 Diff Management:"));
      log.raw(`  ${log.colors.dim("Active Diffs:")} ${log.colors.cyan(stats.activeDiffs.toString())}`);
      log.raw(`  ${log.colors.dim("Success Rate:")} ${log.colors.green((stats.successRate * 100).toFixed(1) + '%')}`);
      
      if (activeDiffs.length > 0) {
        log.raw(`  ${log.colors.dim("Recent:")}`);
        activeDiffs.slice(-5).forEach(diff => {
          const risk = diff.impact.riskLevel;
          const color = risk === 'critical' ? 'red' : risk === 'high' ? 'yellow' : 'green';
          log.raw(`    ${log.colors[color](risk)} ${diff.id} - ${diff.changes.length} files`);
        });
      }
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/intelligence") {
      const stats = intelligentErrorRecovery.getRecoveryStats();
      log.raw("");
      log.raw(log.colors.bright("🧠 Intelligence Statistics:"));
      log.raw(`  ${log.colors.dim("Total Errors:")} ${log.colors.yellow(stats.totalErrors.toString())}`);
      log.raw(`  ${log.colors.dim("Successful Recoveries:")} ${log.colors.green(stats.successfulRecoveries.toString())}`);
      log.raw(`  ${log.colors.dim("Average Recovery Time:")} ${log.colors.cyan((stats.averageRecoveryTime / 1000).toFixed(1) + 's')}`);
      
      if (stats.topErrorCategories.length > 0) {
        log.raw(`  ${log.colors.dim("Top Error Categories:")}`);
        stats.topErrorCategories.forEach(({ category, count }) => {
          log.raw(`    ${log.colors.magenta(category)}: ${count}`);
        });
      }
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/performance") {
      const stats = performanceMonitor.getPerformanceStats();
      const recommendations = performanceMonitor.getOptimizationRecommendations();
      
      log.raw("");
      log.raw(log.colors.bright("⚡ Performance Statistics:"));
      log.raw(`  ${log.colors.dim("Total Metrics:")} ${log.colors.cyan(stats.overview.totalMetrics.toString())}`);
      log.raw(`  ${log.colors.dim("Active Alerts:")} ${log.colors.yellow(stats.overview.activeAlerts.toString())}`);
      log.raw(`  ${log.colors.dim("Avg Response Time:")} ${log.colors.magenta(Math.round(stats.overview.avgResponseTime).toString() + 'ms')}`);
      log.raw(`  ${log.colors.dim("Success Rate:")} ${log.colors.green((stats.overview.successRate * 100).toFixed(1) + '%')}`);
      
      if (Object.keys(stats.breakdown.byProvider).length > 0) {
        log.raw(`  ${log.colors.dim("By Provider:")}`);
        Object.entries(stats.breakdown.byProvider).forEach(([provider, data]) => {
          log.raw(`    ${log.colors.cyan(provider)}: ${Math.round(data.avgTime)}ms (${data.calls} calls)`);
        });
      }
      
      if (recommendations.length > 0) {
        log.raw(`  ${log.colors.dim("Recommendations:")}`);
        recommendations.slice(0, 3).forEach(rec => {
          const priority = rec.priority === 'high' ? log.colors.red('HIGH') : 
                          rec.priority === 'medium' ? log.colors.yellow('MED') : log.colors.green('LOW');
          log.raw(`    ${priority} ${rec.title}`);
          log.raw(`      ${log.colors.dim(rec.description)}`);
        });
      }
      
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/plugins") {
      const plugins = pluginSystem.listPlugins();
      const stats = pluginSystem.getPluginStats();
      
      log.raw("");
      log.raw(log.colors.bright("🔌 Plugin System:"));
      log.raw(`  ${log.colors.dim("Total Plugins:")} ${log.colors.cyan(stats.totalPlugins.toString())}`);
      log.raw(`  ${log.colors.dim("Enabled:")} ${log.colors.green(stats.enabledPlugins.toString())}`);
      
      if (Object.keys(stats.pluginsByType).length > 0) {
        log.raw(`  ${log.colors.dim("By Type:")}`);
        Object.entries(stats.pluginsByType).forEach(([type, count]) => {
          log.raw(`    ${log.colors.magenta(type)}: ${count}`);
        });
      }
      
      if (plugins.length > 0) {
        log.raw(`  ${log.colors.dim("Installed Plugins:")}`);
        plugins.slice(0, 5).forEach(plugin => {
          const status = plugin.enabled ? log.colors.green("✓") : log.colors.red("❌");
          log.raw(`    ${status} ${log.colors.cyan(plugin.manifest.name)} v${plugin.version}`);
          log.raw(`      ${log.colors.dim(plugin.manifest.description)}`);
        });
      }
      
      log.raw("");
      rl.prompt();
      return;
    }
    
    if (cmd === "/suggestions") {
      const suggestions = await smartSuggestionEngine.getSmartSuggestions("", {
        repoPath: repo,
        provider: sessionState.provider,
        model: sessionState.model,
        projectInfo: sessionState.projectInfo,
        currentBranch: branchName
      });
      
      const suggestionStats = smartSuggestionEngine.getSuggestionStats();
      
      log.raw("");
      log.raw(log.colors.bright("💡 Smart Suggestions:"));
      log.raw(`  ${log.colors.dim("Total Patterns:")} ${log.colors.cyan(suggestionStats.learnedPatterns.toString())}`);
      log.raw(`  ${log.colors.dim("Accuracy:")} ${log.colors.green((suggestionStats.accuracy * 100).toFixed(1) + '%')}`);
      
      if (suggestions.length > 0) {
        log.raw(`  ${log.colors.dim("Current Suggestions:")}`);
        suggestions.slice(0, 5).forEach((suggestion, i) => {
          const priority = suggestion.priority === 'high' ? log.colors.red('HIGH') : 
                          suggestion.priority === 'medium' ? log.colors.yellow('MED') : log.colors.green('LOW');
          log.raw(`    ${i + 1}. ${priority} ${suggestion.title} (${Math.round(suggestion.confidence * 100)}%)`);
          log.raw(`       ${log.colors.dim(suggestion.description)}`);
        });
      }
      
      log.raw("");
      rl.prompt();
      return;
    }

    // Help command
    if (cmd === "help") {
      terminal.showHelp();
      rl.prompt();
      return;
    }

    // Check for pipe commands
    if (PipelineProcessor.hasPipes(input)) {
      log.step("Executing", "pipe command");
      const processor = new PipelineProcessor(repo);
      const result = await processor.execute(input);
      
      if (result.ok) {
        if (result.data) {
          log.raw(result.data);
        }
        log.success("Pipe command completed");
      } else {
        terminal.showError(result.error || "Pipe execution failed");
      }
      rl.prompt();
      return;
    }
    
    // Check for theme command
    if (input.startsWith("/theme ")) {
      const themeName = input.slice(7).trim();
      terminal.setTheme(themeName);
      rl.setPrompt(terminal.getPrompt());
      log.success(`Theme changed to: ${themeName}`);
      
      // Update workspace preferences
      await workspaceManager.updateWorkspacePreferences(repo, { theme: themeName });
      rl.prompt();
      return;
    }
    
    // Check for workspace commands
    if (cmd === "/workspace") {
      const workspace = workspaceManager.getCurrentWorkspace();
      if (workspace) {
        log.raw("");
        log.raw(log.colors.bright("📁 Current Workspace"));
        log.raw(`  ${log.colors.dim("Name:")} ${log.colors.cyan(workspace.name)}`);
        log.raw(`  ${log.colors.dim("Type:")} ${log.colors.magenta(workspace.type)}`);
        if (workspace.framework) {
          log.raw(`  ${log.colors.dim("Framework:")} ${log.colors.yellow(workspace.framework)}`);
        }
        log.raw(`  ${log.colors.dim("Path:")} ${log.colors.dim(workspace.path)}`);
        log.raw(`  ${log.colors.dim("Last Used:")} ${log.colors.dim(new Date(workspace.lastUsed).toLocaleString())}`);
        
        if (workspace.bookmarks.length > 0) {
          log.raw(`  ${log.colors.dim("Bookmarks:")} ${workspace.bookmarks.map(b => log.colors.blue(b)).join(", ")}`);
        }
        log.raw("");
      }
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/bookmark ")) {
      const bookmark = input.slice(10).trim();
      await workspaceManager.addBookmark(repo, bookmark);
      log.success(`Bookmark added: ${bookmark}`);
      rl.prompt();
      return;
    }

    // Default: treat as coding task with enhanced error handling
    try {
      // Monitor task performance
      const taskResult = await performanceMonitor.monitorAICall(
        sessionState.provider,
        sessionState.model,
        () => runTask(repo, input, dry, sessionState.model, branchName, sessionState.provider),
        {
          task: input,
          repoPath: repo,
          branch: branchName
        }
      );
      
      // Learn from command usage
      smartSuggestionEngine.learnFromCommand(input, {
        projectType: sessionState.projectInfo.type,
        provider: sessionState.provider,
        framework: sessionState.projectInfo.framework
      }, true);
      
    } catch (error) {
      // Enhanced error recovery
      const errorContext = {
        error: error instanceof Error ? error.message : String(error),
        repoPath: repo,
        provider: sessionState.provider,
        model: sessionState.model,
        timestamp: Date.now(),
        projectType: sessionState.projectInfo.type,
        framework: sessionState.projectInfo.framework
      };
      
      log.error("Task execution failed:", error);
      
      // Attempt intelligent recovery
      const recoveryPlan = await intelligentErrorRecovery.analyzeAndRecover(errorContext);
      
      if (recoveryPlan.success && recoveryPlan.actions.length > 0) {
        log.info("🧠 Intelligent recovery suggestions available:");
        recoveryPlan.actions.slice(0, 3).forEach((action, i) => {
          log.raw(`  ${i + 1}. ${log.colors.cyan(action.title)} (${Math.round(action.confidence * 100)}% confidence)`);
          log.raw(`     ${log.colors.dim(action.description)}`);
        });
        log.raw("");
        log.info("Use '/recover' to execute recovery suggestions");
      }
    }
    rl.prompt();
  });

  rl.on("close", () => {
    log.info("Goodbye!");
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