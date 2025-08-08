import { spawnSync } from "node:child_process";
import { CFG } from "../config.js";
import { log } from "../util/logging.js";

export async function createPullRequest(
  repoPath: string, 
  branchName: string, 
  title: string, 
  body: string
): Promise<string> {
  // Get repo info from git remote
  const remote = spawnSync("git", ["config", "--get", "remote.origin.url"], { 
    cwd: repoPath, 
    encoding: "utf8" 
  }).stdout.trim();
  
  if (!remote) {
    throw new Error("No git remote origin found");
  }
  
  // Parse GitHub repo from remote URL
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match) {
    throw new Error("Not a GitHub repo or unsupported remote URL");
  }
  
  const [owner, repo] = match[1].split("/");
  
  if (!CFG.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not set in environment");
  }
  
  // Create PR via GitHub API
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `token ${CFG.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        head: branchName,
        base: "main", // Could be configurable
        body
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }
    
    const data = await response.json() as { html_url: string };
    log.info(`✅ Created PR: ${data.html_url}`);
    return data.html_url;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create PR: ${error.message}`);
    }
    throw error;
  }
}

export function getRepoInfo(repoPath: string): { owner: string; repo: string } | null {
  const remote = spawnSync("git", ["config", "--get", "remote.origin.url"], {
    cwd: repoPath,
    encoding: "utf8"
  }).stdout.trim();
  
  if (!remote) return null;
  
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match) return null;
  
  const [owner, repo] = match[1].split("/");
  return { owner, repo };
}

export function getCurrentBranch(repoPath: string): string | null {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoPath,
    encoding: "utf8"
  });
  
  return result.status === 0 ? result.stdout.trim() : null;
}