import { promises as fs } from "node:fs";
import path from "node:path";

export interface SessionEntry {
  timestamp: string;
  branchName: string;
  task: string;
  diff: string;
  applied: string[];
  rejected: string[];
  model: string;
}

export async function logSession(
  repo: string, 
  entry: SessionEntry
): Promise<void> {
  const logDir = path.join(repo, ".termcode-logs");
  await fs.mkdir(logDir, { recursive: true });
  
  const filename = `${entry.timestamp}-${entry.branchName}.log`;
  const logFile = path.join(logDir, filename);
  
  const logEntry = [
    `TIMESTAMP: ${entry.timestamp}`,
    `BRANCH: ${entry.branchName}`,
    `MODEL: ${entry.model}`,
    `TASK: ${entry.task}`,
    `APPLIED: ${entry.applied.join(", ") || "none"}`,
    `REJECTED: ${entry.rejected.join(", ") || "none"}`,
    "",
    "DIFF:",
    entry.diff,
    "",
    "---",
    ""
  ].join("\n");
  
  await fs.appendFile(logFile, logEntry, "utf8");
}

export async function getSessionLogs(repo: string): Promise<SessionEntry[]> {
  const logDir = path.join(repo, ".termcode-logs");
  
  try {
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(f => f.endsWith(".log"));
    const entries: SessionEntry[] = [];
    
    for (const file of logFiles) {
      try {
        const content = await fs.readFile(path.join(logDir, file), "utf8");
        const logs = parseLogFile(content);
        entries.push(...logs);
      } catch (e) {
        // Skip corrupted log files
        continue;
      }
    }
    
    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (e) {
    // No log directory
    return [];
  }
}

function parseLogFile(content: string): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const sections = content.split("\n---\n");
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    try {
      const lines = section.split("\n");
      const entry: Partial<SessionEntry> = {};
      
      let diffStart = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith("TIMESTAMP: ")) entry.timestamp = line.substring(11);
        else if (line.startsWith("BRANCH: ")) entry.branchName = line.substring(8);
        else if (line.startsWith("MODEL: ")) entry.model = line.substring(7);
        else if (line.startsWith("TASK: ")) entry.task = line.substring(6);
        else if (line.startsWith("APPLIED: ")) {
          const applied = line.substring(9);
          entry.applied = applied === "none" ? [] : applied.split(", ");
        }
        else if (line.startsWith("REJECTED: ")) {
          const rejected = line.substring(10);
          entry.rejected = rejected === "none" ? [] : rejected.split(", ");
        }
        else if (line === "DIFF:") {
          diffStart = i + 1;
          break;
        }
      }
      
      if (diffStart > -1) {
        entry.diff = lines.slice(diffStart).join("\n").trim();
      }
      
      if (entry.timestamp && entry.branchName && entry.task) {
        entries.push(entry as SessionEntry);
      }
    } catch (e) {
      // Skip malformed entries
      continue;
    }
  }
  
  return entries;
}

export async function clearSessionLogs(repo: string): Promise<void> {
  const logDir = path.join(repo, ".termcode-logs");
  
  try {
    await fs.rm(logDir, { recursive: true });
  } catch (e) {
    // Directory doesn't exist
  }
}