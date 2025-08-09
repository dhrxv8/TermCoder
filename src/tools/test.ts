import { runShell } from "./shell.js";
import { log } from "../util/logging.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { testFailurePrompt } from "../agent/prompts.js";
import { getProvider } from "../providers/index.js";
import { loadConfig } from "../state/config.js";

export interface TestResult {
  success: boolean;
  runner: string;
  command: string[];
  output: string;
  testsRun?: number;
  testsPassed?: number;
  testsFailed?: number;
  coverage?: number;
  duration?: number;
  failureAnalysis?: string;
  failingTests?: string[];
}

export interface ProjectInfo {
  type: "javascript" | "typescript" | "python" | "go" | "rust" | "java" | "other";
  testRunner?: string;
  buildTool?: string;
  linter?: string;
  hasTests: boolean;
  testFiles: string[];
  configFiles: string[];
}

export async function detectProjectType(repo: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    type: "other",
    hasTests: false,
    testFiles: [],
    configFiles: []
  };

  try {
    const files = await fs.readdir(repo);
    
    // Check for package.json (Node.js/TypeScript)
    if (files.includes("package.json")) {
      try {
        const pkgContent = await fs.readFile(path.join(repo, "package.json"), "utf8");
        const pkg = JSON.parse(pkgContent);
        
        info.type = pkg.devDependencies?.typescript ? "typescript" : "javascript";
        
        // Detect test runner
        if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
          info.testRunner = "jest";
        } else if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
          info.testRunner = "vitest";
        } else if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) {
          info.testRunner = "mocha";
        } else if (pkg.scripts?.test) {
          info.testRunner = "npm";
        }
        
        // Detect build tool
        if (pkg.devDependencies?.vite) {
          info.buildTool = "vite";
        } else if (pkg.devDependencies?.webpack) {
          info.buildTool = "webpack";
        } else if (pkg.scripts?.build) {
          info.buildTool = "npm";
        }
        
        // Detect linter
        if (pkg.devDependencies?.eslint) {
          info.linter = "eslint";
        }
        
      } catch (error) {
        // Invalid package.json
      }
    }
    
    // Check for Python
    else if (files.some(f => f === "requirements.txt" || f === "pyproject.toml" || f === "setup.py")) {
      info.type = "python";
      info.testRunner = "pytest";
      info.linter = "ruff";
    }
    
    // Check for Go
    else if (files.includes("go.mod")) {
      info.type = "go";
      info.testRunner = "go";
      info.buildTool = "go";
      info.linter = "golangci-lint";
    }
    
    // Check for Rust
    else if (files.includes("Cargo.toml")) {
      info.type = "rust";
      info.testRunner = "cargo";
      info.buildTool = "cargo";
      info.linter = "clippy";
    }
    
    // Check for Java
    else if (files.some(f => f === "pom.xml" || f === "build.gradle")) {
      info.type = "java";
      info.buildTool = files.includes("pom.xml") ? "maven" : "gradle";
    }

    // Find test files
    info.testFiles = await findTestFiles(repo);
    info.hasTests = info.testFiles.length > 0;
    
    // Find config files
    info.configFiles = files.filter(f => 
      f.includes("config") || 
      f.includes(".json") ||
      f.includes(".yml") ||
      f.includes(".yaml") ||
      f.startsWith(".")
    );

  } catch (error) {
    log.warn("Failed to detect project type:", error);
  }

  return info;
}

async function findTestFiles(repo: string): Promise<string[]> {
  const testFiles: string[] = [];
  
  try {
    const scanDir = async (dir: string, relativePath = ""): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name === 'test' || entry.name === 'tests' || entry.name === '__tests__') {
            // Found test directory
            await scanDir(fullPath, relPath);
          } else if (relativePath.split('/').length < 3) { // Don't go too deep
            await scanDir(fullPath, relPath);
          }
        } else if (entry.isFile()) {
          // Check if file is a test file
          if (isTestFile(entry.name)) {
            testFiles.push(relPath);
          }
        }
      }
    };
    
    await scanDir(repo);
  } catch (error) {
    // Ignore scan errors
  }
  
  return testFiles;
}

function isTestFile(filename: string): boolean {
  const testPatterns = [
    /\.test\.(js|ts|jsx|tsx|py|go|rs|java)$/,
    /\.spec\.(js|ts|jsx|tsx|py|go|rs|java)$/,
    /_test\.(js|ts|jsx|tsx|py|go|rs|java)$/,
    /test_.*\.(py)$/,
    /Test\.java$/,
  ];
  
  return testPatterns.some(pattern => pattern.test(filename));
}

export async function runTests(repo: string, verbose: boolean = false): Promise<TestResult> {
  const projectInfo = await detectProjectType(repo);
  
  if (!projectInfo.hasTests) {
    return {
      success: true, // No tests to run is considered success
      runner: "none",
      command: [],
      output: "No tests found in project",
      testsRun: 0
    };
  }

  log.step("Running tests", `detected ${projectInfo.type} project with ${projectInfo.testFiles.length} test files`);
  
  // Determine best test command based on project type
  const testCommands = getTestCommands(projectInfo, verbose);
  
  for (const cmd of testCommands) {
    log.step("Executing", `${cmd.join(" ")}`);
    
    const startTime = Date.now();
    const result = await runShell(cmd, repo);
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      const output = result.data.stdout + result.data.stderr;
      const parsed = parseTestOutput(output, cmd[0]);
      const success = result.data.code === 0;
      
      const testResult: TestResult = {
        success,
        runner: cmd[0],
        command: cmd,
        output,
        duration,
        ...parsed
      };
      
      // Add failure analysis if tests failed
      if (!success) {
        const failingTests = extractFailingTests(output, cmd[0]);
        testResult.failingTests = failingTests;
        
        if (failingTests.length > 0) {
          log.step("Analyzing failures", "getting AI insights...");
          testResult.failureAnalysis = await analyzeTestFailures(output, failingTests, repo);
        }
      }
      
      return testResult;
    }
  }
  
  return {
    success: false,
    runner: "unknown",
    command: [],
    output: "No suitable test runner found",
    testsRun: 0
  };
}

function getTestCommands(projectInfo: ProjectInfo, verbose: boolean): string[][] {
  const commands: string[][] = [];
  
  switch (projectInfo.type) {
    case "javascript":
    case "typescript":
      if (projectInfo.testRunner === "jest") {
        commands.push(["npx", "jest", "--passWithNoTests", verbose ? "--verbose" : ""]);
      } else if (projectInfo.testRunner === "vitest") {
        commands.push(["npx", "vitest", "run"]);
      } else if (projectInfo.testRunner === "mocha") {
        commands.push(["npx", "mocha"]);
      }
      
      // Fallback npm commands
      commands.push(["npm", "test"]);
      commands.push(["yarn", "test"]);
      commands.push(["pnpm", "test"]);
      break;
      
    case "python":
      commands.push(["pytest", verbose ? "-v" : "--tb=short"]);
      commands.push(["python", "-m", "pytest"]);
      commands.push(["python", "-m", "unittest", "discover"]);
      break;
      
    case "go":
      commands.push(["go", "test", verbose ? "-v" : "", "./..."]);
      break;
      
    case "rust":
      commands.push(["cargo", "test", verbose ? "--verbose" : ""]);
      break;
      
    case "java":
      if (projectInfo.buildTool === "maven") {
        commands.push(["mvn", "test"]);
      } else if (projectInfo.buildTool === "gradle") {
        commands.push(["gradle", "test"]);
      }
      break;
  }
  
  return commands.filter(cmd => cmd.every(arg => arg !== "")); // Remove empty args
}

function parseTestOutput(output: string, runner: string): Partial<TestResult> {
  const result: Partial<TestResult> = {};
  
  switch (runner) {
    case "jest":
    case "npx":
      const jestMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (jestMatch) {
        result.testsFailed = parseInt(jestMatch[1]);
        result.testsPassed = parseInt(jestMatch[2]);
        result.testsRun = parseInt(jestMatch[3]);
      }
      
      const jestCoverage = output.match(/All files[^|]+\|\s+([0-9.]+)/);
      if (jestCoverage) {
        result.coverage = parseFloat(jestCoverage[1]);
      }
      break;
      
    case "pytest":
      const pytestMatch = output.match(/=+ (\d+) failed.*?(\d+) passed.*? in ([0-9.]+)s/);
      if (pytestMatch) {
        result.testsFailed = parseInt(pytestMatch[1]);
        result.testsPassed = parseInt(pytestMatch[2]);
        result.duration = parseFloat(pytestMatch[3]) * 1000;
      }
      
      const pytestTotal = output.match(/=+ (\d+) passed in ([0-9.]+)s/);
      if (pytestTotal) {
        result.testsPassed = parseInt(pytestTotal[1]);
        result.testsRun = result.testsPassed;
        result.duration = parseFloat(pytestTotal[2]) * 1000;
      }
      break;
      
    case "go":
      const goMatch = output.match(/ok\s+.*\s+([0-9.]+)s/);
      if (goMatch) {
        result.duration = parseFloat(goMatch[1]) * 1000;
      }
      break;
      
    case "cargo":
      const cargoMatch = output.match(/test result: (\w+)\. (\d+) passed; (\d+) failed/);
      if (cargoMatch) {
        result.testsPassed = parseInt(cargoMatch[2]);
        result.testsFailed = parseInt(cargoMatch[3]);
        result.testsRun = result.testsPassed + result.testsFailed;
      }
      break;
  }
  
  return result;
}

export async function runLinter(repo: string): Promise<TestResult> {
  const projectInfo = await detectProjectType(repo);
  
  log.step("Running linter", `detected ${projectInfo.type} project`);
  
  const lintCommands = getLintCommands(projectInfo);
  
  for (const cmd of lintCommands) {
    log.step("Executing", `${cmd.join(" ")}`);
    
    const startTime = Date.now();
    const result = await runShell(cmd, repo);
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      const output = result.data.stdout + result.data.stderr;
      
      return {
        success: result.data.code === 0,
        runner: cmd[0],
        command: cmd,
        output,
        duration
      };
    }
  }
  
  return {
    success: false,
    runner: "unknown",
    command: [],
    output: "No suitable linter found"
  };
}

export async function runBuild(repo: string): Promise<TestResult> {
  const projectInfo = await detectProjectType(repo);
  
  log.step("Running build", `detected ${projectInfo.type} project`);
  
  const buildCommands = getBuildCommands(projectInfo);
  
  for (const cmd of buildCommands) {
    log.step("Executing", `${cmd.join(" ")}`);
    
    const startTime = Date.now();
    const result = await runShell(cmd, repo);
    const duration = Date.now() - startTime;
    
    if (result.ok) {
      const output = result.data.stdout + result.data.stderr;
      
      return {
        success: result.data.code === 0,
        runner: cmd[0],
        command: cmd,
        output,
        duration
      };
    }
  }
  
  return {
    success: false,
    runner: "unknown", 
    command: [],
    output: "No suitable build tool found"
  };
}

function getLintCommands(projectInfo: ProjectInfo): string[][] {
  const commands: string[][] = [];
  
  switch (projectInfo.type) {
    case "javascript":
    case "typescript":
      if (projectInfo.linter === "eslint") {
        commands.push(["npx", "eslint", "."]);
      }
      commands.push(["npm", "run", "lint"]);
      commands.push(["yarn", "lint"]);
      commands.push(["pnpm", "lint"]);
      break;
      
    case "python":
      commands.push(["ruff", "check", "."]);
      commands.push(["flake8", "."]);
      commands.push(["pylint", "."]);
      break;
      
    case "go":
      commands.push(["golangci-lint", "run"]);
      commands.push(["go", "vet", "./..."]);
      break;
      
    case "rust":
      commands.push(["cargo", "clippy"]);
      break;
  }
  
  return commands;
}

function getBuildCommands(projectInfo: ProjectInfo): string[][] {
  const commands: string[][] = [];
  
  switch (projectInfo.type) {
    case "javascript":
    case "typescript":
      if (projectInfo.buildTool === "vite") {
        commands.push(["npx", "vite", "build"]);
      } else if (projectInfo.buildTool === "webpack") {
        commands.push(["npx", "webpack", "--mode", "production"]);
      }
      commands.push(["npm", "run", "build"]);
      commands.push(["yarn", "build"]);
      commands.push(["pnpm", "build"]);
      commands.push(["tsc", "--noEmit"]);
      break;
      
    case "python":
      commands.push(["python", "-m", "py_compile", "."]);
      break;
      
    case "go":
      commands.push(["go", "build", "./..."]);
      break;
      
    case "rust":
      commands.push(["cargo", "build", "--release"]);
      commands.push(["cargo", "build"]);
      break;
      
    case "java":
      if (projectInfo.buildTool === "maven") {
        commands.push(["mvn", "compile"]);
      } else if (projectInfo.buildTool === "gradle") {
        commands.push(["gradle", "build"]);
      }
      break;
  }
  
  return commands;
}

// Extract failing test names from output
function extractFailingTests(output: string, runner: string): string[] {
  const failingTests: string[] = [];
  
  switch (runner) {
    case "jest":
    case "npx":
      // Jest format: "● TestSuite › test name"
      const jestMatches = output.match(/● .+ › .+/g);
      if (jestMatches) {
        failingTests.push(...jestMatches.map(m => m.replace('● ', '')));
      }
      break;
      
    case "pytest":
      // Pytest format: "test_file.py::test_name FAILED"
      const pytestMatches = output.match(/(.+::.+) FAILED/g);
      if (pytestMatches) {
        failingTests.push(...pytestMatches.map(m => m.replace(' FAILED', '')));
      }
      break;
      
    case "go":
      // Go format: "--- FAIL: TestName"
      const goMatches = output.match(/--- FAIL: (\w+)/g);
      if (goMatches) {
        failingTests.push(...goMatches.map(m => m.replace('--- FAIL: ', '')));
      }
      break;
      
    case "cargo":
      // Rust format: "test tests::test_name ... FAILED"
      const cargoMatches = output.match(/test (.+) \.\.\. FAILED/g);
      if (cargoMatches) {
        failingTests.push(...cargoMatches.map(m => m.replace(/test (.+) \.\.\. FAILED/, '$1')));
      }
      break;
  }
  
  return failingTests;
}

// AI-powered test failure analysis
async function analyzeTestFailures(
  testOutput: string, 
  failingTests: string[], 
  projectPath: string
): Promise<string | undefined> {
  try {
    const config = await loadConfig();
    if (!config) return undefined;
    
    const provider = getProvider(config.defaultProvider);
    const model = config.models[config.defaultProvider]?.chat;
    
    if (!model) return undefined;
    
    // Get some project context
    let projectContext = "";
    try {
      const packageJson = path.join(projectPath, "package.json");
      const packageContent = await fs.readFile(packageJson, "utf8");
      const pkg = JSON.parse(packageContent);
      projectContext = `Project: ${pkg.name || "Unknown"}\nFramework: ${pkg.dependencies ? Object.keys(pkg.dependencies).slice(0, 5).join(", ") : "Unknown"}`;
    } catch {
      projectContext = "Project context unavailable";
    }
    
    const prompt = testFailurePrompt(testOutput, failingTests, projectContext);
    
    const analysis = await provider.chat([
      { role: "user", content: prompt }
    ], {
      model,
      temperature: 0.3
    });
    
    return analysis;
  } catch (error) {
    log.warn("Failed to analyze test failures:", error);
    return undefined;
  }
}

// Legacy functions for backward compatibility
export async function runTestsLegacy(repo: string): Promise<boolean> {
  const result = await runTests(repo);
  return result.success;
}

export async function runLinterLegacy(repo: string): Promise<boolean> {
  const result = await runLinter(repo);
  return result.success;
}

export async function runBuildLegacy(repo: string): Promise<boolean> {
  const result = await runBuild(repo);
  return result.success;
}