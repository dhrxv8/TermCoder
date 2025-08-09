import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { log } from "../util/logging.js";

const sharedMemoryPath = path.join(os.homedir(), ".termcode", "shared-memory.json");

export interface SharedMemoryEntry {
  id: string;
  category: "architecture" | "style" | "pattern" | "convention" | "framework" | "library";
  title: string;
  content: string;
  tags: string[];
  repos: string[]; // List of repo paths where this applies
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface SharedMemory {
  entries: SharedMemoryEntry[];
  lastUpdated: string;
}

// Ensure shared memory file exists
async function ensureSharedMemoryFile(): Promise<void> {
  try {
    await fs.access(sharedMemoryPath);
  } catch {
    const defaultMemory: SharedMemory = {
      entries: [],
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(sharedMemoryPath, JSON.stringify(defaultMemory, null, 2), "utf8");
  }
}

// Load shared memory
export async function loadSharedMemory(): Promise<SharedMemory> {
  try {
    await ensureSharedMemoryFile();
    const content = await fs.readFile(sharedMemoryPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    log.warn("Failed to load shared memory:", error);
    return { entries: [], lastUpdated: new Date().toISOString() };
  }
}

// Save shared memory
export async function saveSharedMemory(memory: SharedMemory): Promise<void> {
  try {
    memory.lastUpdated = new Date().toISOString();
    await fs.writeFile(sharedMemoryPath, JSON.stringify(memory, null, 2), "utf8");
  } catch (error) {
    log.warn("Failed to save shared memory:", error);
  }
}

// Add entry to shared memory
export async function addSharedMemoryEntry(
  category: SharedMemoryEntry["category"],
  title: string,
  content: string,
  tags: string[] = [],
  repoPath?: string
): Promise<void> {
  const memory = await loadSharedMemory();
  
  const entry: SharedMemoryEntry = {
    id: generateId(),
    category,
    title,
    content,
    tags,
    repos: repoPath ? [repoPath] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0
  };
  
  memory.entries.push(entry);
  await saveSharedMemory(memory);
  
  log.success(`Added shared memory entry: "${title}"`);
}

// Update existing entry
export async function updateSharedMemoryEntry(
  id: string,
  updates: Partial<Omit<SharedMemoryEntry, "id" | "createdAt" | "updatedAt">>
): Promise<boolean> {
  const memory = await loadSharedMemory();
  const entry = memory.entries.find(e => e.id === id);
  
  if (!entry) return false;
  
  Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
  await saveSharedMemory(memory);
  
  return true;
}

// Associate entry with a repo
export async function associateWithRepo(entryId: string, repoPath: string): Promise<boolean> {
  const memory = await loadSharedMemory();
  const entry = memory.entries.find(e => e.id === entryId);
  
  if (!entry) return false;
  
  if (!entry.repos.includes(repoPath)) {
    entry.repos.push(repoPath);
    entry.updatedAt = new Date().toISOString();
    await saveSharedMemory(memory);
  }
  
  return true;
}

// Get relevant entries for a repo
export async function getRelevantEntries(
  repoPath: string,
  tags?: string[],
  category?: SharedMemoryEntry["category"]
): Promise<SharedMemoryEntry[]> {
  const memory = await loadSharedMemory();
  
  let relevant = memory.entries.filter(entry => {
    // Check if entry applies to this repo or is general
    const repoMatch = entry.repos.length === 0 || entry.repos.includes(repoPath);
    
    // Check category filter
    const categoryMatch = !category || entry.category === category;
    
    // Check tag overlap
    const tagMatch = !tags || tags.length === 0 || 
      tags.some(tag => entry.tags.includes(tag));
    
    return repoMatch && categoryMatch && tagMatch;
  });
  
  // Sort by usage count and recency
  relevant.sort((a, b) => {
    const usageDiff = b.usageCount - a.usageCount;
    if (usageDiff !== 0) return usageDiff;
    
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  
  return relevant;
}

// Mark entry as used (increment usage count)
export async function markEntryUsed(entryId: string): Promise<void> {
  const memory = await loadSharedMemory();
  const entry = memory.entries.find(e => e.id === entryId);
  
  if (entry) {
    entry.usageCount++;
    entry.updatedAt = new Date().toISOString();
    await saveSharedMemory(memory);
  }
}

// Delete entry
export async function deleteSharedMemoryEntry(entryId: string): Promise<boolean> {
  const memory = await loadSharedMemory();
  const index = memory.entries.findIndex(e => e.id === entryId);
  
  if (index === -1) return false;
  
  memory.entries.splice(index, 1);
  await saveSharedMemory(memory);
  
  return true;
}

// Search entries by content
export async function searchSharedMemory(
  query: string,
  repoPath?: string
): Promise<SharedMemoryEntry[]> {
  const memory = await loadSharedMemory();
  const queryLower = query.toLowerCase();
  
  let results = memory.entries.filter(entry => {
    const contentMatch = 
      entry.title.toLowerCase().includes(queryLower) ||
      entry.content.toLowerCase().includes(queryLower) ||
      entry.tags.some(tag => tag.toLowerCase().includes(queryLower));
    
    const repoMatch = !repoPath || 
      entry.repos.length === 0 || 
      entry.repos.includes(repoPath);
    
    return contentMatch && repoMatch;
  });
  
  // Mark searched entries as used
  for (const entry of results.slice(0, 5)) { // Top 5 results
    await markEntryUsed(entry.id);
  }
  
  return results;
}

// Generate context string for AI prompts
export async function generateSharedContext(
  repoPath: string,
  taskDescription?: string
): Promise<string> {
  let context = "";
  
  try {
    // Get relevant entries based on task keywords
    let tags: string[] = [];
    if (taskDescription) {
      const keywords = extractKeywords(taskDescription);
      tags = keywords;
    }
    
    const entries = await getRelevantEntries(repoPath, tags);
    
    if (entries.length === 0) return "";
    
    context = "## Shared Knowledge Base\n\n";
    
    const topEntries = entries.slice(0, 5); // Limit to prevent prompt bloat
    
    for (const entry of topEntries) {
      context += `### ${entry.title} (${entry.category})\n`;
      context += `${entry.content}\n`;
      if (entry.tags.length > 0) {
        context += `Tags: ${entry.tags.join(", ")}\n`;
      }
      context += "\n";
      
      // Mark as used
      await markEntryUsed(entry.id);
    }
    
    context += "---\n\n";
  } catch (error) {
    log.warn("Failed to generate shared context:", error);
  }
  
  return context;
}

// Extract keywords from task description for better matching
function extractKeywords(text: string): string[] {
  const commonPatterns = [
    /\b(react|vue|angular|svelte)\b/i,
    /\b(typescript|javascript|python|go|rust|java)\b/i,
    /\b(api|rest|graphql|database|sql)\b/i,
    /\b(test|testing|unit|integration|e2e)\b/i,
    /\b(auth|authentication|authorization|login)\b/i,
    /\b(component|hook|service|util|helper)\b/i,
    /\b(style|css|sass|styled)\b/i,
    /\b(config|environment|env|settings)\b/i,
  ];
  
  const keywords: string[] = [];
  
  for (const pattern of commonPatterns) {
    const match = text.match(pattern);
    if (match) {
      keywords.push(match[1].toLowerCase());
    }
  }
  
  return keywords;
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Get memory statistics
export async function getSharedMemoryStats(): Promise<{
  totalEntries: number;
  categoryCounts: Record<string, number>;
  topTags: Array<{ tag: string; count: number }>;
  totalUsage: number;
}> {
  const memory = await loadSharedMemory();
  
  const categoryCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let totalUsage = 0;
  
  for (const entry of memory.entries) {
    // Count categories
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    
    // Count tags
    for (const tag of entry.tags) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    
    totalUsage += entry.usageCount;
  }
  
  // Get top tags
  const topTags = Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
  
  return {
    totalEntries: memory.entries.length,
    categoryCounts,
    topTags,
    totalUsage
  };
}