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
  const status = runGit(["status", "--porcelain"], cwd);
  if (!status.ok) return { ok: false, error: status.error };
  if (status.data) return { ok: false, error: "Uncommitted changes present. Commit/stash first." };
  return { ok: true, data: undefined };
}

export function createBranch(cwd: string, name: string): ToolResult<void> {
  return runGit(["checkout", "-b", name], cwd) as ToolResult<void>;
}

export function commitAll(cwd: string, message: string): ToolResult<void> {
  runGit(["add", "-A"], cwd);
  return runGit(["commit", "-m", message], cwd) as ToolResult<void>;
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