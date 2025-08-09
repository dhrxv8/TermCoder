import { runTests, TestResult } from "../tools/test.js";
import { runTask } from "./planner.js";
import { log } from "../util/logging.js";
import { loadConfig } from "../state/config.js";

export interface AutoDebugConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number; // milliseconds
  failureModes: Array<"tests" | "lint" | "build">;
  retryStrategies: Array<"fix-failures" | "rollback-retry" | "incremental">;
}

export interface AutoDebugResult {
  success: boolean;
  totalAttempts: number;
  finalResult: TestResult;
  retryHistory: Array<{
    attempt: number;
    strategy: string;
    testResult: TestResult;
    fixApplied?: string;
    timestamp: string;
  }>;
}

// Default auto-debug configuration
const defaultConfig: AutoDebugConfig = {
  enabled: true,
  maxRetries: 3,
  retryDelay: 2000,
  failureModes: ["tests", "lint", "build"],
  retryStrategies: ["fix-failures", "incremental"]
};

// Load auto-debug config from main config
async function loadAutoDebugConfig(): Promise<AutoDebugConfig> {
  try {
    const config = await loadConfig();
    // If config has autoDebug section, merge with defaults
    return {
      ...defaultConfig,
      ...(config as any)?.autoDebug
    };
  } catch {
    return defaultConfig;
  }
}

// Generate fix prompt based on test failures
function generateAutoFixPrompt(testResult: TestResult, attemptNumber: number): string {
  let prompt = `The tests are failing after my recent changes. Please analyze and fix the issues.\n\n`;
  
  prompt += `**Test Output:**\n\`\`\`\n${testResult.output}\n\`\`\`\n\n`;
  
  if (testResult.failingTests && testResult.failingTests.length > 0) {
    prompt += `**Failing Tests:**\n`;
    testResult.failingTests.forEach(test => {
      prompt += `- ${test}\n`;
    });
    prompt += `\n`;
  }
  
  if (testResult.failureAnalysis) {
    prompt += `**Previous Analysis:**\n${testResult.failureAnalysis}\n\n`;
  }
  
  if (attemptNumber > 1) {
    prompt += `**Note:** This is retry attempt #${attemptNumber}. Previous fixes didn't work.\n`;
    prompt += `Please try a different approach or more targeted fixes.\n\n`;
  }
  
  prompt += `Please provide a focused fix that addresses the failing tests. `;
  prompt += `Avoid making unnecessary changes that might break other parts of the code.`;
  
  return prompt;
}

// Generate incremental fix prompt for gradual improvements
function generateIncrementalFixPrompt(
  testResult: TestResult, 
  failingTests: string[], 
  attemptNumber: number
): string {
  // Focus on subset of failures for incremental approach
  const maxTestsPerAttempt = Math.max(1, Math.ceil(failingTests.length / 3));
  const targetTests = failingTests.slice(0, maxTestsPerAttempt);
  
  let prompt = `I want to fix the failing tests incrementally. `;
  prompt += `Let's focus on fixing just these ${targetTests.length} test(s) first:\n\n`;
  
  targetTests.forEach(test => {
    prompt += `- ${test}\n`;
  });
  
  prompt += `\n**Test Output (focusing on these tests):**\n\`\`\`\n${testResult.output}\n\`\`\`\n\n`;
  
  prompt += `Please provide a minimal fix that addresses only these specific tests. `;
  prompt += `Don't try to fix all failures at once - we'll handle the rest in subsequent iterations.`;
  
  return prompt;
}

// Auto-debug main function
export async function autoDebugLoop(
  projectPath: string,
  initialTask?: string
): Promise<AutoDebugResult> {
  const config = await loadAutoDebugConfig();
  
  if (!config.enabled) {
    const result = await runTests(projectPath);
    return {
      success: result.success,
      totalAttempts: 1,
      finalResult: result,
      retryHistory: []
    };
  }
  
  log.info("🔄 Starting auto-debug loop");
  
  const retryHistory: AutoDebugResult['retryHistory'] = [];
  let currentAttempt = 0;
  let lastResult = await runTests(projectPath);
  
  // If tests pass initially, we're done
  if (lastResult.success) {
    return {
      success: true,
      totalAttempts: 1,
      finalResult: lastResult,
      retryHistory: []
    };
  }
  
  log.warn(`Initial test run failed: ${lastResult.testsFailed || 0} failures`);
  
  // Auto-debug retry loop
  while (currentAttempt < config.maxRetries && !lastResult.success) {
    currentAttempt++;
    
    log.step(`Auto-debug attempt ${currentAttempt}/${config.maxRetries}`, "analyzing failures...");
    
    if (config.retryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, config.retryDelay));
    }
    
    // Choose retry strategy
    const strategy = config.retryStrategies[
      (currentAttempt - 1) % config.retryStrategies.length
    ];
    
    let fixPrompt: string;
    let strategyName: string;
    
    switch (strategy) {
      case "incremental":
        if (lastResult.failingTests && lastResult.failingTests.length > 1) {
          fixPrompt = generateIncrementalFixPrompt(
            lastResult, 
            lastResult.failingTests, 
            currentAttempt
          );
          strategyName = "incremental-fix";
          break;
        }
        // Fall through to fix-failures if only one test or no specific tests
      
      case "fix-failures":
      default:
        fixPrompt = generateAutoFixPrompt(lastResult, currentAttempt);
        strategyName = "fix-failures";
        break;
    }
    
    try {
      log.step("Applying fix", `strategy: ${strategyName}`);
      
      // Apply the auto-generated fix
      await runTask(projectPath, fixPrompt, false);
      
      // Re-run tests
      log.step("Re-running tests", "checking if fix worked...");
      const newResult = await runTests(projectPath);
      
      // Record this attempt
      retryHistory.push({
        attempt: currentAttempt,
        strategy: strategyName,
        testResult: newResult,
        fixApplied: fixPrompt.substring(0, 100) + "...",
        timestamp: new Date().toISOString()
      });
      
      // Check if we improved
      const oldFailures = lastResult.testsFailed || 0;
      const newFailures = newResult.testsFailed || 0;
      
      if (newResult.success) {
        log.success(`🎉 Auto-debug succeeded on attempt ${currentAttempt}!`);
        return {
          success: true,
          totalAttempts: currentAttempt + 1,
          finalResult: newResult,
          retryHistory
        };
      } else if (newFailures < oldFailures) {
        log.info(`📈 Progress: ${oldFailures} → ${newFailures} failures`);
        lastResult = newResult;
      } else if (newFailures > oldFailures) {
        log.warn(`📉 Fix made things worse: ${oldFailures} → ${newFailures} failures`);
        lastResult = newResult;
      } else {
        log.warn(`😐 No change in failure count: ${newFailures} failures`);
        lastResult = newResult;
      }
      
    } catch (error) {
      log.error(`Fix attempt ${currentAttempt} failed:`, error);
      
      retryHistory.push({
        attempt: currentAttempt,
        strategy: strategyName,
        testResult: lastResult,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // All retries exhausted
  if (currentAttempt >= config.maxRetries) {
    log.error(`🚨 Auto-debug failed after ${config.maxRetries} attempts`);
  }
  
  return {
    success: false,
    totalAttempts: currentAttempt + 1,
    finalResult: lastResult,
    retryHistory
  };
}

// Integration with existing test runner
export async function runTestsWithAutoDebug(
  projectPath: string, 
  enableAutoDebug: boolean = true
): Promise<TestResult> {
  if (!enableAutoDebug) {
    return await runTests(projectPath);
  }
  
  const config = await loadAutoDebugConfig();
  
  if (!config.enabled) {
    return await runTests(projectPath);
  }
  
  const debugResult = await autoDebugLoop(projectPath);
  
  // Enhance the final test result with debug info
  const enhancedResult = {
    ...debugResult.finalResult,
    autoDebugAttempts: debugResult.totalAttempts,
    autoDebugSuccess: debugResult.success
  };
  
  return enhancedResult;
}

// Helper function to check if auto-debug should be triggered
export function shouldAutoDebug(testResult: TestResult): boolean {
  return !testResult.success && 
         (testResult.testsFailed || 0) > 0 && 
         (testResult.testsFailed || 0) <= 10; // Don't auto-debug if too many failures
}