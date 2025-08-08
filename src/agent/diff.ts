import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { log } from "../util/logging.js";

/**
 * Enhanced unified diff applier with 3-way merge support.
 * First tries direct patch application, falls back to git 3-way merge.
 */
export async function applyUnifiedDiff(repo: string, patch: string): Promise<{ applied: string[]; rejected: string[] }> {
  // First try git apply with 3-way merge
  const gitResult = await tryGitApply(repo, patch);
  if (gitResult.success) {
    return { applied: gitResult.files, rejected: [] };
  }
  
  log.warn("Git apply failed, trying manual patch application...");
  
  // Fallback to manual patch application
  const applied: string[] = [];
  const rejected: string[] = [];

  const filePatches = patch.split(/^diff --git /m).filter(Boolean).map(p => "diff --git " + p);
  for (const fp of filePatches) {
    const m = fp.match(/^diff --git a\/(\S+) b\/(\S+)/);
    if (!m) { 
      rejected.push("<unknown>");
      continue;
    }
    
    const rel = m[2];
    const full = path.resolve(repo, rel);
    let original = "";
    
    try { 
      original = await fs.readFile(full, "utf8"); 
    } catch { 
      // File doesn't exist, create new
      original = ""; 
    }
    
    const result = applyFilePatch(original, fp);
    if (result.ok) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, result.text, "utf8");
      applied.push(rel);
    } else {
      rejected.push(rel);
    }
  }
  
  return { applied, rejected };
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

function applyFilePatch(original: string, fp: string): { ok: boolean; text: string } {
  // Very conservative: if we can't parse all hunks, reject.
  const hunks = [...fp.matchAll(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@.*$/mg)];
  if (hunks.length === 0) return { ok: false, text: original };
  let lines = original.split("\n");
  let offset = 0;
  const blocks = fp.split(/\n(?=@@ -\d+,\d+ \+\d+,\d+ @@)/g).filter(b => b.includes("@@ -"));

  for (const block of blocks) {
    const header = block.match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@.*$/m);
    if (!header) return { ok: false, text: original };
    const startNew = parseInt(header[3], 10) - 1 + offset;
    const body = block.split("\n").slice(1);
    const newChunk: string[] = [];
    let idx = startNew;

    // Reconstruct by walking signs
    for (const line of body) {
      if (line.startsWith("+")) newChunk.push(line.slice(1));
      else if (line.startsWith("-")) { /* deletion: skip */ }
      else if (line.startsWith(" ")) newChunk.push(line.slice(1));
    }

    // Replace segment
    const lengthOld = body.filter(l => l.startsWith(" ") || l.startsWith("-")).length;
    lines.splice(idx, lengthOld, ...newChunk);
    offset += newChunk.length - lengthOld;
  }
  return { ok: true, text: lines.join("\n") };
}