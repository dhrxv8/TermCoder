import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const sessionDir = path.join(os.homedir(), ".termcode", "sessions");

export const SessionStateSchema = z.object({
  repoPath: z.string(),
  repoHash: z.string(),
  lastUsed: z.string(),
  provider: z.string(),
  model: z.string(),
  branchName: z.string().optional(),
  recentTasks: z.array(z.string()).max(10), // Last 10 tasks
  lastFilesChanged: z.array(z.string()).max(20), // Last 20 files
  lastDiff: z.string().optional(),
  totalTokensUsed: z.number().default(0),
  totalCostUSD: z.number().default(0),
  sessionStartTime: z.string(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

function getRepoHash(repoPath: string): string {
  const normalized = path.resolve(repoPath);
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

function getSessionPath(repoPath: string): string {
  const hash = getRepoHash(repoPath);
  return path.join(sessionDir, `${hash}.json`);
}

async function ensureSessionDir(): Promise<void> {
  await fs.mkdir(sessionDir, { recursive: true });
}

export async function loadSession(repoPath: string): Promise<SessionState | null> {
  try {
    await ensureSessionDir();
    const sessionPath = getSessionPath(repoPath);
    const content = await fs.readFile(sessionPath, "utf8");
    const data = JSON.parse(content);
    return SessionStateSchema.parse(data);
  } catch (error) {
    return null;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  try {
    await ensureSessionDir();
    const sessionPath = getSessionPath(session.repoPath);
    const validated = SessionStateSchema.parse(session);
    await fs.writeFile(sessionPath, JSON.stringify(validated, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

export async function createSession(
  repoPath: string,
  provider: string,
  model: string,
  branchName?: string
): Promise<SessionState> {
  const session: SessionState = {
    repoPath: path.resolve(repoPath),
    repoHash: getRepoHash(repoPath),
    lastUsed: new Date().toISOString(),
    provider,
    model,
    branchName,
    recentTasks: [],
    lastFilesChanged: [],
    totalTokensUsed: 0,
    totalCostUSD: 0,
    sessionStartTime: new Date().toISOString(),
  };
  
  await saveSession(session);
  return session;
}

export async function updateSession(
  repoPath: string,
  updates: Partial<SessionState>
): Promise<SessionState | null> {
  const existing = await loadSession(repoPath);
  if (!existing) return null;
  
  const updated = {
    ...existing,
    ...updates,
    lastUsed: new Date().toISOString(),
  };
  
  await saveSession(updated);
  return updated;
}

export async function addTaskToSession(
  repoPath: string,
  task: string,
  filesChanged: string[] = []
): Promise<void> {
  const session = await loadSession(repoPath);
  if (!session) return;
  
  // Add task to recent tasks (keep only last 10)
  session.recentTasks = [task, ...session.recentTasks.filter(t => t !== task)].slice(0, 10);
  
  // Add files to recently changed (keep only last 20)
  const newFiles = filesChanged.filter(f => !session.lastFilesChanged.includes(f));
  session.lastFilesChanged = [...newFiles, ...session.lastFilesChanged].slice(0, 20);
  
  await saveSession(session);
}

export async function addUsageToSession(
  repoPath: string,
  tokens: number,
  cost: number
): Promise<void> {
  const session = await loadSession(repoPath);
  if (!session) return;
  
  session.totalTokensUsed += tokens;
  session.totalCostUSD += cost;
  
  await saveSession(session);
}

export async function listRecentSessions(limit: number = 5): Promise<SessionState[]> {
  try {
    await ensureSessionDir();
    const files = await fs.readdir(sessionDir);
    const sessions: SessionState[] = [];
    
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(sessionDir, file), "utf8");
        const session = SessionStateSchema.parse(JSON.parse(content));
        sessions.push(session);
      } catch (error) {
        // Skip invalid session files
        continue;
      }
    }
    
    // Sort by lastUsed and return most recent
    return sessions
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, limit);
  } catch (error) {
    return [];
  }
}

export async function cleanupOldSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
  try {
    await ensureSessionDir();
    const files = await fs.readdir(sessionDir);
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;
    
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const filePath = path.join(sessionDir, file);
        const content = await fs.readFile(filePath, "utf8");
        const session = SessionStateSchema.parse(JSON.parse(content));
        
        if (new Date(session.lastUsed) < cutoff) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (error) {
        // Delete corrupted files
        try {
          await fs.unlink(path.join(sessionDir, file));
          cleaned++;
        } catch {}
      }
    }
    
    return cleaned;
  } catch (error) {
    return 0;
  }
}