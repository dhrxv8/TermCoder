import { runShell } from "./shell.js";
import { log } from "../util/logging.js";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function runTests(repo: string): Promise<boolean> {
  log.info("Running tests...");
  
  // Try package.json test script first
  try {
    const pkgPath = path.join(repo, "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf8");
    const pkg = JSON.parse(pkgContent);
    
    if (pkg.scripts?.test) {
      log.info("Found npm test script");
      const r = await runShell(["npm", "test", "--", "--watchAll=false", "--passWithNoTests"], repo);
      if (!r.ok) { 
        log.error("npm test failed:", r.error); 
        return false; 
      }
      return r.data.code === 0;
    }
  } catch (e) {
    // No package.json or no test script
  }
  
  // Try other common test runners
  const testCommands = [
    ["pytest", "--tb=short"],
    ["go", "test", "./..."],
    ["cargo", "test"],
    ["npm", "run", "test:unit"],
    ["yarn", "test"],
    ["pnpm", "test"]
  ];
  
  for (const cmd of testCommands) {
    log.info(`Trying: ${cmd.join(" ")}`);
    const r = await runShell(cmd, repo);
    if (r.ok && r.data.code === 0) {
      log.info(`✅ Tests passed with: ${cmd[0]}`);
      return true;
    }
  }
  
  log.warn("No known test runner found or tests failed.");
  return false;
}

export async function runLinter(repo: string): Promise<boolean> {
  log.info("Running linter...");
  
  const lintCommands = [
    ["npm", "run", "lint"],
    ["yarn", "lint"],
    ["pnpm", "lint"],
    ["eslint", "."],
    ["ruff", "check", "."],
    ["flake8", "."],
    ["golangci-lint", "run"]
  ];
  
  for (const cmd of lintCommands) {
    const r = await runShell(cmd, repo);
    if (r.ok && r.data.code === 0) {
      log.info(`✅ Linting passed with: ${cmd[0]}`);
      return true;
    }
  }
  
  log.warn("No linter found or linting failed.");
  return false;
}

export async function runBuild(repo: string): Promise<boolean> {
  log.info("Running build...");
  
  const buildCommands = [
    ["npm", "run", "build"],
    ["yarn", "build"], 
    ["pnpm", "build"],
    ["go", "build", "./..."],
    ["cargo", "build"],
    ["tsc", "--noEmit"]
  ];
  
  for (const cmd of buildCommands) {
    const r = await runShell(cmd, repo);
    if (r.ok && r.data.code === 0) {
      log.info(`✅ Build passed with: ${cmd[0]}`);
      return true;
    }
  }
  
  log.warn("No build command found or build failed.");
  return false;
}