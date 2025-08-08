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
import { runTests, runLinter, runBuild } from "./tools/test.js";
import { runShell } from "./tools/shell.js";
import { getSessionLogs, clearSessionLogs } from "./util/sessionLog.js";
import { log } from "./util/logging.js";
import { runOnboarding, getProviderKey, setProviderKey, listProviderKeys } from "./onboarding.js";
import { loadConfig, configExists } from "./state/config.js";
import { getProvider, registry } from "./providers/index.js";

const argv = yargs(hideBin(process.argv))
  .scriptName("termcode")
  .usage("$0 [task] [options]")
  .positional("task", { describe: "High-level request (feature/refactor/fix)", type: "string" })
  .option("repo", { type: "string", demandOption: true, describe: "Path to repo" })
  .option("dry", { type: "boolean", default: false, describe: "Dry run (don't write changes)" })
  .option("model", { type: "string", describe: "Model to use (overrides config)" })
  .option("provider", { type: "string", describe: "Provider to use (overrides config)" })
  .help().parseSync();

const repo = path.resolve(String((argv as any).repo));
const initialTask = String((argv as any)._?.[0] || "");
const dry = Boolean((argv as any).dry);
const cliModel = String((argv as any).model || "");
const cliProvider = String((argv as any).provider || "");

(async () => {
  // Check if first run (no config)
  let config = await loadConfig();
  if (!config) {
    console.log("🚀 Welcome to TermCode — first-run setup:");
    config = await runOnboarding();
  }

  // Override with CLI options
  const currentProvider = cliProvider || config.defaultProvider;
  const currentModel = cliModel || config.models[currentProvider]?.chat;

  if (!currentModel) {
    log.error(`No model configured for provider ${currentProvider}`);
    process.exit(1);
  }

  log.info(`Using ${currentProvider} (${currentModel})`);
  log.info("Loading repo:", repo);

  // Check for clean Git state
  const clean = ensureCleanGit(repo);
  if (!clean.ok) {
    log.error(clean.error);
    process.exit(1);
  }

  // Create working branch
  const branchName = `termcode-${Date.now()}`;
  const branch = createBranch(repo, branchName);
  if (!branch.ok) {
    log.error("Failed to create branch:", branch.error);
    process.exit(1);
  }
  log.info(`Working on branch: ${branchName}`);

  await ensureMemory(repo);
  await buildIndex(repo);
  log.info("Index ready. Memory loaded.");

  // Session state for REPL
  let sessionState = {
    provider: currentProvider,
    model: currentModel,
    config: config
  };

  // If user gave a one-shot task, run & exit
  if (initialTask) {
    await runTask(repo, initialTask, dry, sessionState.model, branchName, sessionState.provider);
    process.exit(0);
  }

  // Otherwise start REPL session
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "[termcode] > ",
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
      
      log.info(`Provider → ${providerId} (${sessionState.model})`);
      rl.prompt();
      return;
    }
    
    if (input.startsWith("/model ")) {
      const modelId = input.slice(7).trim();
      sessionState.model = modelId;
      log.info(`Model → ${modelId}`);
      rl.prompt();
      return;
    }
    
    if (cmd === "/keys") {
      console.log("\\n🔐 API Key Status:");
      const providerKeys = await listProviderKeys();
      const availableProviders = Object.keys(registry);
      
      for (const providerId of availableProviders) {
        if (providerId === "ollama") {
          console.log(`  ${providerId}: ✓ local (no key needed)`);
        } else {
          const hasKey = providerKeys.includes(providerId);
          console.log(`  ${providerId}: ${hasKey ? "✓ configured" : "❌ missing"}`);
        }
      }
      console.log("\\nUse /provider <name> to add missing keys");
      rl.prompt();
      return;
    }
    
    if (cmd === "/whoami") {
      console.log("\\n🤖 Current Session:");
      console.log(`  Provider: ${sessionState.provider}`);
      console.log(`  Model: ${sessionState.model}`);
      console.log(`  Branch: ${branchName}`);
      console.log(`  Tools: ${Object.entries(sessionState.config.tools).filter(([_, enabled]) => enabled).map(([name]) => name).join(", ")}`);
      rl.prompt();
      return;
    }
    
    // Git workflow commands
    if (cmd === "rollback") {
      log.warn("Rolling back all changes...");
      checkoutBranch(repo, "main");
      deleteBranch(repo, branchName);
      log.info("Rollback complete. Switched back to main.");
      rl.close();
      return;
    }
    
    if (cmd === "merge") {
      log.info(`Merging ${branchName} into main...`);
      checkoutBranch(repo, "main");
      const m = mergeBranch(repo, branchName);
      if (!m.ok) log.error("Merge failed:", m.error);
      else {
        log.info("Merge complete.");
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
        log.info(`✅ Created PR: ${prUrl}`);
      } catch (error) {
        log.error("Failed to create PR:", (error as Error).message);
      }
      rl.prompt();
      return;
    }

    // Test commands
    if (cmd === "test") {
      const success = await runTests(repo);
      log.info(success ? "✅ Tests passed" : "❌ Tests failed");
      rl.prompt();
      return;
    }

    if (cmd === "lint") {
      const success = await runLinter(repo);
      log.info(success ? "✅ Linting passed" : "❌ Linting failed");
      rl.prompt();
      return;
    }

    if (cmd === "build") {
      const success = await runBuild(repo);
      log.info(success ? "✅ Build passed" : "❌ Build failed");
      rl.prompt();
      return;
    }

    // Log commands
    if (cmd === "log") {
      const logs = await getSessionLogs(repo);
      const branchLogs = logs.filter(l => l.branchName === branchName);
      
      if (branchLogs.length === 0) {
        log.info("No session logs found for this branch");
      } else {
        console.log("\\n📋 Session Log:");
        branchLogs.forEach((entry, i) => {
          console.log(`${i + 1}. ${entry.task}`);
          console.log(`   Applied: ${entry.applied.join(", ") || "none"}`);
          console.log(`   Model: ${entry.model}`);
        });
      }
      rl.prompt();
      return;
    }

    if (cmd === "clear-log") {
      await clearSessionLogs(repo);
      log.info("Session logs cleared");
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
      
      const result = await runShell(shellCmd.split(" "), repo);
      if (result.ok) {
        console.log(result.data.stdout);
        if (result.data.stderr) console.error(result.data.stderr);
        log.info(`Exit code: ${result.data.code}`);
      } else {
        log.error("Shell command failed:", result.error);
      }
      rl.prompt();
      return;
    }

    // Help command
    if (cmd === "help") {
      console.log(`
📚 TermCode Commands:
  
  General:
    <task>           - Execute a coding task
    help            - Show this help
    exit/quit       - Exit session
  
  Configuration:
    /provider <id>   - Switch provider (${Object.keys(registry).join(", ")})
    /model <id>      - Switch model
    /keys           - Show API key status
    /whoami         - Show current session info
  
  Git Workflow:
    rollback        - Discard all changes and return to main
    merge           - Merge changes to main
    pr "title"      - Create GitHub PR
  
  Development:
    test            - Run tests
    lint            - Run linter
    build           - Run build
    !<cmd>          - Execute shell command
  
  Logging:
    log             - Show session history
    clear-log       - Clear all logs
`);
      rl.prompt();
      return;
    }

    // Default: treat as coding task
    await runTask(repo, input, dry, sessionState.model, branchName, sessionState.provider);
    rl.prompt();
  });

  rl.on("close", () => {
    log.info("Goodbye!");
    process.exit(0);
  });
})();