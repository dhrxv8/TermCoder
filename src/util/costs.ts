import { getProvider, listProviders } from "../providers/index.js";
import { loadConfig } from "../state/config.js";
import { updateSession } from "../state/session.js";
import { log } from "./logging.js";
import { saveUsageRecord, getCurrentMonthSpending as getCurrentMonthSpendingFromTracker } from "./usage-tracker.js";

export interface UsageRecord {
  timestamp: string;
  provider: string;
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  repoPath?: string;
}

export interface BudgetStatus {
  monthlyBudget: number;
  currentSpent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
  daysIntoMonth: number;
  projectedMonthlySpend: number;
}

// Simple token estimation for different content types
export function estimateTokens(text: string, model: string = "gpt-4"): number {
  // Rough approximation: 1 token ≈ 0.75 words ≈ 4 characters
  // More accurate for English text, less for code
  const chars = text.length;
  const baseTokens = Math.ceil(chars / 4);
  
  // Adjust based on model type
  if (model.includes("gpt-4") || model.includes("claude")) {
    return Math.ceil(baseTokens * 1.1); // Slightly higher for advanced models
  } else if (model.includes("code") || model.includes("codellama")) {
    return Math.ceil(baseTokens * 1.2); // Code models tend to use more tokens
  }
  
  return baseTokens;
}

export async function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): Promise<number> {
  try {
    const providerInstance = getProvider(provider);
    
    if (providerInstance.estimateCost) {
      const inputCost = providerInstance.estimateCost(inputTokens, model, "chat");
      const outputCost = outputTokens > 0 ? 
        providerInstance.estimateCost(outputTokens, model, "chat") : 0;
      return inputCost + outputCost;
    }
    
    // Fallback to generic pricing
    return getGenericCost(provider, model, inputTokens + outputTokens);
  } catch (error) {
    log.warn(`Failed to calculate cost for ${provider}/${model}, using fallback`);
    return getGenericCost(provider, model, inputTokens + outputTokens);
  }
}

function getGenericCost(provider: string, model: string, tokens: number): number {
  // Fallback pricing per 1K tokens (USD)
  const genericPricing: Record<string, Record<string, number>> = {
    openai: {
      "gpt-4o": 0.005,
      "gpt-4o-mini": 0.00015,
      "gpt-4": 0.03,
      "gpt-3.5-turbo": 0.001,
    },
    anthropic: {
      "claude-3-5-sonnet": 0.003,
      "claude-3-haiku": 0.00025,
      "claude-3-opus": 0.015,
    },
    google: {
      "gemini-pro": 0.001,
      "gemini-1.5-pro": 0.0035,
    },
    xai: {
      "grok-beta": 0.005,
    },
    mistral: {
      "mistral-large": 0.008,
      "mistral-medium": 0.0027,
    },
    cohere: {
      "command": 0.001,
      "command-r-plus": 0.003,
    },
    ollama: {
      // Local models have no API cost
      default: 0,
    }
  };
  
  const providerPricing = genericPricing[provider];
  if (!providerPricing) return 0;
  
  const price = providerPricing[model] || providerPricing.default || 0.002;
  return (tokens / 1000) * price;
}

export async function recordUsage(
  provider: string,
  model: string,
  task: string,
  inputTokens: number,
  outputTokens: number = 0,
  repoPath?: string
): Promise<UsageRecord> {
  const totalTokens = inputTokens + outputTokens;
  const costUSD = await calculateCost(provider, model, inputTokens, outputTokens);
  
  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    provider,
    model,
    task: task.substring(0, 100), // Truncate long tasks
    inputTokens,
    outputTokens,
    totalTokens,
    costUSD,
    repoPath
  };
  
  // Save usage record to persistent storage
  await saveUsageRecord(record);
  
  // Update session if repo path provided
  if (repoPath) {
    await updateSession(repoPath, {
      totalTokensUsed: totalTokens,
      totalCostUSD: costUSD
    });
  }
  
  // Check budget and warn if needed
  await checkBudgetAndWarn(costUSD);
  
  return record;
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const config = await loadConfig();
  const monthlyBudget = config?.routing?.budgetUSDMonthly || 10;
  
  // Get current month's spending
  // For now, we'll use a simple approximation based on session data
  // In a real implementation, you'd want to persist usage records
  const currentSpent = await getCurrentMonthSpending();
  
  const remaining = Math.max(0, monthlyBudget - currentSpent);
  const percentage = (currentSpent / monthlyBudget) * 100;
  const isOverBudget = currentSpent > monthlyBudget;
  
  // Calculate days into current month
  const now = new Date();
  const daysIntoMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  // Project monthly spend based on current usage
  const dailyAverage = currentSpent / daysIntoMonth;
  const projectedMonthlySpend = dailyAverage * daysInMonth;
  
  return {
    monthlyBudget,
    currentSpent,
    remaining,
    percentage,
    isOverBudget,
    daysIntoMonth,
    projectedMonthlySpend
  };
}

async function getCurrentMonthSpending(): Promise<number> {
  return getCurrentMonthSpendingFromTracker();
}

async function checkBudgetAndWarn(newCost: number): Promise<void> {
  const status = await getBudgetStatus();
  const newTotal = status.currentSpent + newCost;
  const newPercentage = (newTotal / status.monthlyBudget) * 100;
  
  // Warn at different thresholds
  if (newPercentage >= 100 && status.percentage < 100) {
    log.error(`🚨 Monthly budget exceeded! Spent $${newTotal.toFixed(4)} of $${status.monthlyBudget}`);
    log.warn("Consider upgrading your budget in /config or using cheaper models");
  } else if (newPercentage >= 90 && status.percentage < 90) {
    log.warn(`⚠️  Approaching budget limit: $${newTotal.toFixed(4)} of $${status.monthlyBudget} (${newPercentage.toFixed(1)}%)`);
  } else if (newPercentage >= 75 && status.percentage < 75) {
    log.warn(`💰 Budget notice: $${newTotal.toFixed(4)} of $${status.monthlyBudget} used (${newPercentage.toFixed(1)}%)`);
  }
}

// Check if a task should be allowed to proceed based on budget
export async function checkBudgetBeforeTask(
  provider: string,
  model: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number = 0
): Promise<{ allowed: boolean; reason?: string; estimatedCost?: number }> {
  const estimatedCost = await calculateCost(provider, model, estimatedInputTokens, estimatedOutputTokens);
  const status = await getBudgetStatus();
  
  const newTotal = status.currentSpent + estimatedCost;
  const newPercentage = (newTotal / status.monthlyBudget) * 100;
  
  // Hard stop at 120% of budget to prevent runaway costs
  if (newPercentage > 120) {
    return {
      allowed: false,
      reason: `Task would exceed budget limit by too much ($${newTotal.toFixed(4)} vs $${status.monthlyBudget} budget)`,
      estimatedCost
    };
  }
  
  // Soft warning at 100% - ask for confirmation
  if (newPercentage > 100) {
    return {
      allowed: false,
      reason: `Task would exceed monthly budget ($${newTotal.toFixed(4)} vs $${status.monthlyBudget}). Continue anyway?`,
      estimatedCost
    };
  }
  
  return {
    allowed: true,
    estimatedCost
  };
}

// Estimate cost for a task before executing
export async function estimateTaskCost(
  provider: string,
  model: string,
  taskDescription: string,
  contextSize: number = 0
): Promise<{ inputTokens: number; outputTokens: number; estimatedCost: number }> {
  // Estimate input tokens (task + context + system prompts)
  const systemPromptTokens = 500; // Rough estimate for system prompts
  const taskTokens = estimateTokens(taskDescription, model);
  const inputTokens = systemPromptTokens + taskTokens + contextSize;
  
  // Estimate output tokens based on task complexity
  let outputTokens: number;
  if (taskDescription.toLowerCase().includes('implement') || taskDescription.toLowerCase().includes('create')) {
    outputTokens = Math.max(inputTokens * 2, 1000); // Code generation tasks produce more output
  } else if (taskDescription.toLowerCase().includes('fix') || taskDescription.toLowerCase().includes('debug')) {
    outputTokens = Math.max(inputTokens * 1, 500); // Bug fixes are usually smaller
  } else if (taskDescription.toLowerCase().includes('refactor') || taskDescription.toLowerCase().includes('improve')) {
    outputTokens = Math.max(inputTokens * 1.5, 750); // Refactoring is moderate
  } else {
    outputTokens = Math.max(inputTokens * 0.8, 300); // General tasks
  }
  
  const estimatedCost = await calculateCost(provider, model, inputTokens, outputTokens);
  
  return {
    inputTokens,
    outputTokens,
    estimatedCost
  };
}

export async function formatBudgetStatus(): Promise<string> {
  const status = await getBudgetStatus();
  
  const spentFormatted = `$${status.currentSpent.toFixed(4)}`;
  const budgetFormatted = `$${status.monthlyBudget}`;
  const remainingFormatted = `$${status.remaining.toFixed(4)}`;
  const percentageFormatted = `${status.percentage.toFixed(1)}%`;
  
  let statusIcon = "💚";
  if (status.isOverBudget) statusIcon = "🚨";
  else if (status.percentage >= 90) statusIcon = "⚠️";
  else if (status.percentage >= 75) statusIcon = "💛";
  
  let output = `${statusIcon} Budget Status:\n`;
  output += `   Current: ${spentFormatted} of ${budgetFormatted} (${percentageFormatted})\n`;
  output += `   Remaining: ${remainingFormatted}\n`;
  
  if (status.projectedMonthlySpend > status.monthlyBudget * 1.1) {
    const projectedFormatted = `$${status.projectedMonthlySpend.toFixed(2)}`;
    output += `   📈 Projected monthly: ${projectedFormatted} (over budget!)\n`;
  } else {
    const projectedFormatted = `$${status.projectedMonthlySpend.toFixed(2)}`;
    output += `   📈 Projected monthly: ${projectedFormatted}\n`;
  }
  
  output += `   📅 Day ${status.daysIntoMonth} of month`;
  
  return output;
}

// Enhanced budget status with usage breakdown
export async function formatDetailedBudgetStatus(): Promise<string> {
  const status = await getBudgetStatus();
  let output = await formatBudgetStatus();
  
  try {
    const { getCurrentMonthStats } = await import("./usage-tracker.js");
    const stats = await getCurrentMonthStats();
    
    if (stats.totalRecords > 0) {
      output += `\n\n📊 Usage Statistics:\n`;
      output += `   Total API calls: ${stats.totalRecords}\n`;
      output += `   Total tokens: ${stats.totalTokens.toLocaleString()}\n`;
      
      // Top providers
      const sortedProviders = Object.entries(stats.byProvider)
        .sort(([,a], [,b]) => b.cost - a.cost)
        .slice(0, 3);
      
      if (sortedProviders.length > 0) {
        output += `\n   Top Providers:\n`;
        for (const [provider, data] of sortedProviders) {
          output += `   • ${provider}: $${data.cost.toFixed(4)} (${data.calls} calls)\n`;
        }
      }
      
      // Top models
      const sortedModels = Object.entries(stats.byModel)
        .sort(([,a], [,b]) => b.cost - a.cost)
        .slice(0, 3);
      
      if (sortedModels.length > 0) {
        output += `\n   Top Models:\n`;
        for (const [model, data] of sortedModels) {
          output += `   • ${model}: $${data.cost.toFixed(4)} (${data.calls} calls)\n`;
        }
      }
    }
  } catch (error) {
    // Ignore stats errors
  }
  
  return output;
}

// Utility function for the agent to use when processing tasks
export async function trackTaskUsage(
  provider: string,
  model: string,
  task: string,
  inputText: string,
  outputText: string = "",
  repoPath?: string
): Promise<void> {
  const inputTokens = estimateTokens(inputText, model);
  const outputTokens = outputText ? estimateTokens(outputText, model) : 0;
  
  await recordUsage(provider, model, task, inputTokens, outputTokens, repoPath);
}