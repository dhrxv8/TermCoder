import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { log } from "../util/logging.js";

export interface DiffResult {
  applied: string[];
  rejected: string[];
  conflicts: ConflictInfo[];
  warnings: string[];
}

export interface ConflictInfo {
  file: string;
  line: number;
  type: "merge" | "context" | "whitespace";
  message: string;
  original?: string;
  incoming?: string;
}

export interface FileDiff {
  file: string;
  oldPath: string;
  newPath: string;
  patch: string;
  operation: "modify" | "create" | "delete" | "rename";
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  context: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Enhanced unified diff applier with comprehensive error handling and conflict resolution.
 */
export async function applyUnifiedDiff(repo: string, patch: string): Promise<DiffResult> {
  const result: DiffResult = {
    applied: [],
    rejected: [],
    conflicts: [],
    warnings: []
  };

  // Parse patch into individual file diffs
  const fileDiffs = parseUnifiedDiff(patch);
  
  // First try git apply with 3-way merge
  const gitResult = await tryGitApply(repo, patch);
  if (gitResult.success) {
    result.applied = gitResult.files;
    
    // Check for conflicts after git apply
    const conflicts = await detectGitConflicts(repo);
    if (conflicts.length > 0) {
      result.conflicts = conflicts;
      log.warn(`Applied with ${conflicts.length} conflicts that need resolution`);
    }
    
    return result;
  }
  
  log.step("Git apply failed", "trying manual patch application...");
  
  // Fallback to manual patch application
  for (const fileDiff of fileDiffs) {
    try {
      const patchResult = await applyFileDiff(repo, fileDiff);
      
      if (patchResult.success) {
        result.applied.push(fileDiff.file);
        result.conflicts.push(...patchResult.conflicts);
        result.warnings.push(...patchResult.warnings);
      } else {
        result.rejected.push(fileDiff.file);
        if (patchResult.error) {
          result.warnings.push(`${fileDiff.file}: ${patchResult.error}`);
        }
      }
    } catch (error) {
      result.rejected.push(fileDiff.file);
      result.warnings.push(`${fileDiff.file}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  
  // Log summary
  if (result.applied.length > 0) {
    log.success(`Applied changes to ${result.applied.length} files`);
  }
  if (result.rejected.length > 0) {
    log.warn(`Failed to apply changes to ${result.rejected.length} files`);
  }
  if (result.conflicts.length > 0) {
    log.warn(`${result.conflicts.length} conflicts need manual resolution`);
  }
  
  return result;
}

async function tryGitApply(repo: string, patch: string): Promise<{ success: boolean; files: string[] }> {
  try {
    // Write patch to temp file
    const tempPatch = path.join(repo, ".termcode-temp.patch");
    await fs.writeFile(tempPatch, patch, "utf8");
    
    // Try git apply with 3-way merge
    const result = spawnSync("git", ["apply", "--3way", "--whitespace=fix", tempPatch], {
      cwd: repo,
      encoding: "utf8"
    });
    
    // Cleanup temp file
    await fs.unlink(tempPatch).catch(() => {});
    
    if (result.status === 0) {
      // Get list of changed files
      const statusResult = spawnSync("git", ["diff", "--name-only", "--cached"], {
        cwd: repo,
        encoding: "utf8"
      });
      
      const files = statusResult.stdout.trim().split("\n").filter(Boolean);
      return { success: true, files };
    }
    
    log.warn("Git apply failed:", result.stderr);
    return { success: false, files: [] };
  } catch (error) {
    log.warn("Git apply error:", error);
    return { success: false, files: [] };
  }
}

export function parseUnifiedDiff(patch: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const fileBlocks = patch.split(/^diff --git /m).filter(Boolean).map(p => "diff --git " + p);
  
  for (const block of fileBlocks) {
    const lines = block.split('\n');
    const gitLine = lines[0];
    
    // Parse git header
    const gitMatch = gitLine.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (!gitMatch) continue;
    
    const oldPath = gitMatch[1];
    const newPath = gitMatch[2];
    
    // Determine operation type
    let operation: FileDiff["operation"] = "modify";
    if (lines.some(l => l.startsWith("new file mode"))) operation = "create";
    else if (lines.some(l => l.startsWith("deleted file mode"))) operation = "delete";
    else if (oldPath !== newPath) operation = "rename";
    
    // Parse hunks
    const hunks: DiffHunk[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/);
      
      if (hunkMatch) {
        const oldStart = parseInt(hunkMatch[1]);
        const oldCount = parseInt(hunkMatch[2] || "1");
        const newStart = parseInt(hunkMatch[3]);
        const newCount = parseInt(hunkMatch[4] || "1");
        const context = hunkMatch[5] || "";
        
        // Parse hunk lines
        const hunkLines: DiffLine[] = [];
        i++;
        let oldLineNum = oldStart;
        let newLineNum = newStart;
        
        while (i < lines.length && !lines[i].startsWith("@@")) {
          const hunkLine = lines[i];
          if (hunkLine.startsWith("+")) {
            hunkLines.push({
              type: "add",
              content: hunkLine.slice(1),
              newLineNumber: newLineNum++
            });
          } else if (hunkLine.startsWith("-")) {
            hunkLines.push({
              type: "remove",
              content: hunkLine.slice(1),
              oldLineNumber: oldLineNum++
            });
          } else if (hunkLine.startsWith(" ")) {
            hunkLines.push({
              type: "context",
              content: hunkLine.slice(1),
              oldLineNumber: oldLineNum++,
              newLineNumber: newLineNum++
            });
          }
          i++;
        }
        
        hunks.push({
          oldStart,
          oldCount,
          newStart,
          newCount,
          context,
          lines: hunkLines
        });
        continue;
      }
      i++;
    }
    
    fileDiffs.push({
      file: newPath,
      oldPath,
      newPath,
      patch: block,
      operation,
      hunks
    });
  }
  
  return fileDiffs;
}

async function applyFileDiff(repo: string, fileDiff: FileDiff): Promise<{
  success: boolean;
  conflicts: ConflictInfo[];
  warnings: string[];
  error?: string;
}> {
  const result = {
    success: false,
    conflicts: [] as ConflictInfo[],
    warnings: [] as string[],
    error: undefined as string | undefined
  };
  
  const filePath = path.resolve(repo, fileDiff.file);
  
  try {
    // Handle different operations
    if (fileDiff.operation === "delete") {
      try {
        await fs.unlink(filePath);
        result.success = true;
        return result;
      } catch (error) {
        result.error = `Failed to delete file: ${error}`;
        return result;
      }
    }
    
    // Read existing file content
    let originalContent = "";
    try {
      originalContent = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (fileDiff.operation !== "create") {
        result.warnings.push("File doesn't exist, treating as new file");
      }
    }
    
    // Apply hunks
    const lines = originalContent.split('\n');
    let offset = 0;
    
    for (const hunk of fileDiff.hunks) {
      const applyResult = applyHunkToLines(lines, hunk, offset);
      
      if (!applyResult.success) {
        result.error = `Failed to apply hunk at line ${hunk.oldStart}: ${applyResult.error}`;
        return result;
      }
      
      offset += applyResult.offset;
      result.conflicts.push(...applyResult.conflicts);
      result.warnings.push(...applyResult.warnings);
    }
    
    // Write updated content
    const newContent = lines.join('\n');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, newContent, "utf8");
    
    result.success = true;
    return result;
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

function applyHunkToLines(lines: string[], hunk: DiffHunk, globalOffset: number): {
  success: boolean;
  offset: number;
  conflicts: ConflictInfo[];
  warnings: string[];
  error?: string;
} {
  const result = {
    success: false,
    offset: 0,
    conflicts: [] as ConflictInfo[],
    warnings: [] as string[],
    error: undefined as string | undefined
  };
  
  const startIdx = hunk.oldStart - 1 + globalOffset;
  
  // Validate context
  const contextLines = hunk.lines.filter(l => l.type === "context" || l.type === "remove");
  for (let i = 0; i < contextLines.length; i++) {
    const expectedLine = contextLines[i].content;
    const actualLine = lines[startIdx + i] || "";
    
    if (expectedLine.trim() !== actualLine.trim()) {
      // Context mismatch - try fuzzy matching
      const similarity = calculateSimilarity(expectedLine, actualLine);
      if (similarity < 0.8) {
        result.error = `Context mismatch at line ${startIdx + i + 1}`;
        return result;
      } else {
        result.warnings.push(`Fuzzy matched line ${startIdx + i + 1}`);
      }
    }
  }
  
  // Apply changes
  const newLines: string[] = [];
  const removeCount = hunk.lines.filter(l => l.type === "remove" || l.type === "context").length;
  
  for (const line of hunk.lines) {
    if (line.type === "add") {
      newLines.push(line.content);
    } else if (line.type === "context") {
      newLines.push(line.content);
    }
    // Remove lines are simply not added to newLines
  }
  
  // Replace lines
  lines.splice(startIdx, removeCount, ...newLines);
  result.offset = newLines.length - removeCount;
  result.success = true;
  
  return result;
}

async function detectGitConflicts(repo: string): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];
  
  try {
    // Check for files with conflict markers
    const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=U"], {
      cwd: repo,
      encoding: "utf8"
    });
    
    if (result.stdout.trim()) {
      const conflictedFiles = result.stdout.trim().split('\n');
      
      for (const file of conflictedFiles) {
        try {
          const content = await fs.readFile(path.resolve(repo, file), "utf8");
          const lines = content.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('<<<<<<<')) {
              conflicts.push({
                file,
                line: i + 1,
                type: "merge",
                message: "Merge conflict detected",
                original: findConflictSection(lines, i, "======="),
                incoming: findConflictSection(lines, i, ">>>>>>>")
              });
            }
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }
  } catch (error) {
    // Git command failed - not necessarily an error
  }
  
  return conflicts;
}

function findConflictSection(lines: string[], start: number, marker: string): string {
  const section: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith(marker)) break;
    section.push(lines[i]);
  }
  return section.join('\n');
}

function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  const distance = matrix[len2][len1];
  return 1 - distance / Math.max(len1, len2);
}

// Legacy function for backward compatibility
function applyFilePatch(original: string, fp: string): { ok: boolean; text: string } {
  try {
    const fileDiffs = parseUnifiedDiff(fp);
    if (fileDiffs.length === 0) return { ok: false, text: original };
    
    const fileDiff = fileDiffs[0];
    const lines = original.split('\n');
    let offset = 0;
    
    for (const hunk of fileDiff.hunks) {
      const result = applyHunkToLines(lines, hunk, offset);
      if (!result.success) {
        return { ok: false, text: original };
      }
      offset += result.offset;
    }
    
    return { ok: true, text: lines.join('\n') };
  } catch (error) {
    return { ok: false, text: original };
  }
}