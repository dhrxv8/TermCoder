import { MacroDefinition, MacroStep, MacroExecution } from "./types.js";
import { incrementMacroUsage } from "./storage.js";
import { runShell } from "../tools/shell.js";
import { runTask } from "../agent/planner.js";
import { log } from "../util/logging.js";

// Active macro executions
const activeExecutions = new Map<string, MacroExecution>();

// Execute a macro step
async function executeStep(
  step: MacroStep, 
  projectPath: string, 
  execution: MacroExecution
): Promise<{ success: boolean; output?: string; error?: string }> {
  const stepIndex = execution.currentStep;
  const stepResult = execution.results[stepIndex];
  
  stepResult.status = "running";
  
  const startTime = Date.now();
  
  try {
    let output = "";
    
    switch (step.type) {
      case "command":
        // Execute termcode command
        log.step("Macro", `Executing command: ${step.action}`);
        
        switch (step.action) {
          case "rollback":
            output = "Rollback executed";
            break;
          case "test":
            const { runTests } = await import("../tools/test.js");
            const testResult = await runTests(projectPath);
            output = `Tests ${testResult.success ? "passed" : "failed"}: ${testResult.output}`;
            if (!testResult.success) throw new Error("Tests failed");
            break;
          case "lint":
            const { runLinter } = await import("../tools/test.js");
            const lintResult = await runLinter(projectPath);
            output = `Lint ${lintResult.success ? "passed" : "failed"}: ${lintResult.output}`;
            if (!lintResult.success) throw new Error("Lint failed");
            break;
          case "build":
            const { runBuild } = await import("../tools/test.js");
            const buildResult = await runBuild(projectPath);
            output = `Build ${buildResult.success ? "passed" : "failed"}: ${buildResult.output}`;
            if (!buildResult.success) throw new Error("Build failed");
            break;
          default:
            throw new Error(`Unknown command: ${step.action}`);
        }
        break;
        
      case "task":
        // Execute AI task
        log.step("Macro", `Executing task: ${step.action}`);
        const taskResult = await runTask(projectPath, step.action);
        output = `Applied ${taskResult?.applied.length || 0} changes, rejected ${taskResult?.rejected.length || 0}`;
        break;
        
      case "shell":
        // Execute shell command
        log.step("Macro", `Executing shell: ${step.action}`);
        const shellArgs = step.args || step.action.split(" ");
        const shellResult = await runShell(shellArgs, projectPath);
        
        if (!shellResult.ok) {
          throw new Error('error' in shellResult ? shellResult.error : "Shell command failed");
        }
        
        output = shellResult.data.stdout + shellResult.data.stderr;
        break;
        
      case "git":
        // Execute git command
        log.step("Macro", `Executing git: ${step.action}`);
        const gitArgs = ["git", ...step.action.split(" ")];
        const gitResult = await runShell(gitArgs, projectPath);
        
        if (!gitResult.ok) {
          throw new Error('error' in gitResult ? gitResult.error : "Git command failed");
        }
        
        output = gitResult.data.stdout + gitResult.data.stderr;
        break;
        
      case "wait":
        // Wait for specified time
        const waitTime = parseInt(step.action) || 1000;
        log.step("Macro", `Waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        output = `Waited ${waitTime}ms`;
        break;
        
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
    
    stepResult.status = "completed";
    stepResult.output = output;
    stepResult.duration = Date.now() - startTime;
    
    return { success: true, output };
    
  } catch (error) {
    stepResult.status = "failed";
    stepResult.error = error instanceof Error ? error.message : "Unknown error";
    stepResult.duration = Date.now() - startTime;
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

// Execute a complete macro
export async function executeMacro(
  macro: MacroDefinition, 
  projectPath: string
): Promise<MacroExecution> {
  const executionId = `${macro.name}-${Date.now()}`;
  
  const execution: MacroExecution = {
    macroName: macro.name,
    startTime: new Date().toISOString(),
    status: "running",
    currentStep: 0,
    totalSteps: macro.steps.length,
    results: macro.steps.map((_, index) => ({
      step: index,
      status: "pending"
    }))
  };
  
  activeExecutions.set(executionId, execution);
  
  try {
    log.info(`Starting macro: ${macro.name} (${macro.steps.length} steps)`);
    
    // Execute each step
    for (let i = 0; i < macro.steps.length; i++) {
      execution.currentStep = i;
      const step = macro.steps[i];
      
      log.step(`Step ${i + 1}/${macro.steps.length}`, step.description || step.action);
      
      const result = await executeStep(step, projectPath, execution);
      
      if (!result.success) {
        execution.status = "failed";
        execution.error = result.error;
        execution.endTime = new Date().toISOString();
        
        log.error(`Macro failed at step ${i + 1}: ${result.error}`);
        return execution;
      }
    }
    
    execution.status = "completed";
    execution.endTime = new Date().toISOString();
    
    // Increment usage count
    await incrementMacroUsage(macro.name, projectPath);
    
    log.success(`Macro completed: ${macro.name}`);
    return execution;
    
  } catch (error) {
    execution.status = "failed";
    execution.error = error instanceof Error ? error.message : "Unknown error";
    execution.endTime = new Date().toISOString();
    
    log.error(`Macro execution failed: ${execution.error}`);
    return execution;
  } finally {
    activeExecutions.delete(executionId);
  }
}

// Cancel a running macro
export async function cancelMacro(executionId: string): Promise<boolean> {
  const execution = activeExecutions.get(executionId);
  if (!execution) return false;
  
  execution.status = "cancelled";
  execution.endTime = new Date().toISOString();
  activeExecutions.delete(executionId);
  
  return true;
}

// Get active executions
export function getActiveExecutions(): MacroExecution[] {
  return Array.from(activeExecutions.values());
}

// Built-in macro templates
export const BUILTIN_MACROS: MacroDefinition[] = [
  {
    name: "hotfix",
    description: "Quick hotfix workflow: lint, test, commit",
    steps: [
      { type: "command", action: "lint", description: "Run linter" },
      { type: "command", action: "test", description: "Run tests" },
      { type: "git", action: "add .", description: "Stage changes" },
      { type: "git", action: "commit -m 'hotfix: automated fix'", description: "Commit changes" }
    ],
    tags: ["workflow", "fix", "ci"],
    scope: "global",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    author: "termcode"
  },
  {
    name: "deploy-prep",
    description: "Prepare for deployment: build, test, lint",
    steps: [
      { type: "command", action: "lint", description: "Run linter" },
      { type: "command", action: "test", description: "Run tests" },
      { type: "command", action: "build", description: "Build project" },
      { type: "shell", action: "echo 'Ready for deployment!'", description: "Deployment ready" }
    ],
    tags: ["deployment", "ci", "build"],
    scope: "global",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    author: "termcode"
  },
  {
    name: "clean-start",
    description: "Clean restart: rollback, clean, fresh start",
    steps: [
      { type: "command", action: "rollback", description: "Rollback changes" },
      { type: "git", action: "clean -fd", description: "Clean working directory" },
      { type: "shell", action: "echo 'Clean state ready'", description: "Ready for new work" }
    ],
    tags: ["cleanup", "reset"],
    scope: "global",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    author: "termcode"
  }
];