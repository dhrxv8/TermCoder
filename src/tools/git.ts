import { spawnSync } from "node:child_process";
import path from "node:path";
import { ToolResult } from "../util/types.js";

function runGit(args: string[], cwd: string): ToolResult<string> {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.error) return { ok: false, error: res.error.message };
  if (res.status !== 0) return { ok: false, error: res.stderr.trim() };
  return { ok: true, data: res.stdout.trim() };
}

export function ensureCleanGit(cwd: string): ToolResult<void> {
  // First check if we're in a git repo
  const isRepo = runGit(["rev-parse", "--git-dir"], cwd);
  if (!isRepo.ok) {
    return { ok: false, error: `Not a git repository: ${cwd}. Initialize with 'git init' first.` };
  }

  const status = runGit(["status", "--porcelain"], cwd);
  if (!status.ok) return { ok: false, error: `Git status check failed: ${(status as any).error}` };
  
  if (status.data) {
    const lines = status.data.split('\n').filter(Boolean);
    const summary = lines.length > 3 ? 
      `${lines.slice(0, 3).join(', ')} and ${lines.length - 3} more files` : 
      lines.join(', ');
    return { 
      ok: false, 
      error: `Uncommitted changes present: ${summary}. Commit or stash changes first.` 
    };
  }
  
  return { ok: true, data: undefined };
}

export function createBranch(cwd: string, name: string): ToolResult<void> {
  return runGit(["checkout", "-b", name], cwd) as ToolResult<void>;
}

export function addAll(cwd: string): ToolResult<void> {
  return runGit(["add", "-A"], cwd) as ToolResult<void>;
}

export function commitAll(cwd: string, message: string): ToolResult<void> {
  return runGit(["commit", "-m", message], cwd) as ToolResult<void>;
}

export function commitWithMessage(cwd: string, message: string): ToolResult<void> {
  // Add all changes first
  const addResult = addAll(cwd);
  if (!addResult.ok) return addResult;
  
  // Then commit
  return commitAll(cwd, message);
}

export function getUnstagedChanges(cwd: string): ToolResult<string> {
  return runGit(["diff", "--name-only"], cwd);
}

export function getStagedChanges(cwd: string): ToolResult<string> {
  return runGit(["diff", "--cached", "--name-only"], cwd);
}

export function getAllChanges(cwd: string): ToolResult<string> {
  return runGit(["diff", "--name-only", "HEAD"], cwd);
}

export function getDiffSummary(cwd: string): ToolResult<string> {
  return runGit(["diff", "--stat"], cwd);
}

export function getDiffContent(cwd: string, file?: string): ToolResult<string> {
  const args = ["diff"];
  if (file) args.push(file);
  return runGit(args, cwd);
}

export function checkoutBranch(cwd: string, name: string): ToolResult<void> {
  return runGit(["checkout", name], cwd) as ToolResult<void>;
}

export function deleteBranch(cwd: string, name: string): ToolResult<void> {
  return runGit(["branch", "-D", name], cwd) as ToolResult<void>;
}

export function mergeBranch(cwd: string, name: string): ToolResult<void> {
  return runGit(["merge", name], cwd) as ToolResult<void>;
}