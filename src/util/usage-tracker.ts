import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { UsageRecord } from "./costs.js";

const usageDir = path.join(os.homedir(), ".termcode", "usage");

// Ensure usage directory exists
async function ensureUsageDir(): Promise<void> {
  try {
    await fs.mkdir(usageDir, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }
}

// Get the usage file path for a given month
function getUsageFilePath(year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return path.join(usageDir, `${year}-${monthStr}.json`);
}

// Get current month's usage file path
function getCurrentUsageFilePath(): string {
  const now = new Date();
  return getUsageFilePath(now.getFullYear(), now.getMonth() + 1);
}

// Load usage records for a specific month
export async function loadMonthlyUsage(year: number, month: number): Promise<UsageRecord[]> {
  try {
    await ensureUsageDir();
    const filePath = getUsageFilePath(year, month);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // Return empty array if file doesn't exist or can't be read
    return [];
  }
}

// Load current month's usage records
export async function getCurrentMonthUsage(): Promise<UsageRecord[]> {
  const now = new Date();
  return loadMonthlyUsage(now.getFullYear(), now.getMonth() + 1);
}

// Save a usage record
export async function saveUsageRecord(record: UsageRecord): Promise<void> {
  await ensureUsageDir();
  
  const recordDate = new Date(record.timestamp);
  const year = recordDate.getFullYear();
  const month = recordDate.getMonth() + 1;
  
  const filePath = getUsageFilePath(year, month);
  
  // Load existing records
  const existingRecords = await loadMonthlyUsage(year, month);
  
  // Add new record
  existingRecords.push(record);
  
  // Save updated records
  await fs.writeFile(filePath, JSON.stringify(existingRecords, null, 2), 'utf8');
}

// Calculate total spending for current month
export async function getCurrentMonthSpending(): Promise<number> {
  const records = await getCurrentMonthUsage();
  return records.reduce((total, record) => total + record.costUSD, 0);
}

// Calculate spending for a specific month
export async function getMonthSpending(year: number, month: number): Promise<number> {
  const records = await loadMonthlyUsage(year, month);
  return records.reduce((total, record) => total + record.costUSD, 0);
}

// Get usage statistics for current month
export async function getCurrentMonthStats(): Promise<{
  totalRecords: number;
  totalCost: number;
  totalTokens: number;
  byProvider: Record<string, { cost: number; tokens: number; calls: number }>;
  byModel: Record<string, { cost: number; tokens: number; calls: number }>;
}> {
  const records = await getCurrentMonthUsage();
  
  const stats = {
    totalRecords: records.length,
    totalCost: 0,
    totalTokens: 0,
    byProvider: {} as Record<string, { cost: number; tokens: number; calls: number }>,
    byModel: {} as Record<string, { cost: number; tokens: number; calls: number }>
  };
  
  for (const record of records) {
    stats.totalCost += record.costUSD;
    stats.totalTokens += record.totalTokens;
    
    // Provider stats
    if (!stats.byProvider[record.provider]) {
      stats.byProvider[record.provider] = { cost: 0, tokens: 0, calls: 0 };
    }
    stats.byProvider[record.provider].cost += record.costUSD;
    stats.byProvider[record.provider].tokens += record.totalTokens;
    stats.byProvider[record.provider].calls += 1;
    
    // Model stats
    const modelKey = `${record.provider}/${record.model}`;
    if (!stats.byModel[modelKey]) {
      stats.byModel[modelKey] = { cost: 0, tokens: 0, calls: 0 };
    }
    stats.byModel[modelKey].cost += record.costUSD;
    stats.byModel[modelKey].tokens += record.totalTokens;
    stats.byModel[modelKey].calls += 1;
  }
  
  return stats;
}

// Clean up old usage files (keep last 12 months)
export async function cleanupOldUsage(): Promise<void> {
  try {
    await ensureUsageDir();
    const files = await fs.readdir(usageDir);
    
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 12 months ago
    
    for (const file of files) {
      if (!file.match(/^\d{4}-\d{2}\.json$/)) continue;
      
      const [year, month] = file.replace('.json', '').split('-').map(Number);
      const fileDate = new Date(year, month - 1, 1);
      
      if (fileDate < cutoffDate) {
        await fs.unlink(path.join(usageDir, file));
      }
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}