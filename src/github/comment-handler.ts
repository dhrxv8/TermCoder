import { GitHubWebhookEvent, TermCoderCommand, parseTermCoderCommands } from "./webhook-server.js";
import { getRepoInfo, createPullRequest } from "../tools/github.js";
import { runTask } from "../agent/planner.js";
import { runShell } from "../tools/shell.js";
import { log } from "../util/logging.js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";

export interface GitHubCommentContext {
  repoOwner: string;
  repoName: string;
  repoPath: string;
  branchName: string;
  author: string;
  authorAssociation: string;
  issueNumber?: number;
  prNumber?: number;
}

// Handle GitHub issue/PR comments
export async function handleCommentEvent(event: GitHubWebhookEvent): Promise<void> {
  if (event.event !== 'issue_comment' && event.event !== 'pull_request_review_comment') {
    return;
  }

  const { payload } = event;
  
  // Only handle created comments
  if (payload.action !== 'created') {
    return;
  }

  const comment = payload.comment;
  const commands = parseTermCoderCommands(comment.body, payload);

  if (commands.length === 0) {
    return;
  }

  log.info(`📝 Found ${commands.length} @termcoder command(s) in comment from ${comment.user.login}`);

  // Process each command
  for (const cmd of commands) {
    await processTermCoderCommand(cmd, payload);
  }
}

// Process a single @termcoder command
async function processTermCoderCommand(
  cmd: TermCoderCommand, 
  payload: any
): Promise<void> {
  try {
    log.step('Processing command', `${cmd.command} ${cmd.args.join(' ')}`);

    // Check if user has permission to execute commands
    if (!hasPermissionToExecute(cmd.authorAssociation)) {
      log.warn(`User ${cmd.author} lacks permission to execute commands (${cmd.authorAssociation})`);
      await postComment(payload, `❌ @${cmd.author} You need collaborator access or higher to execute @termcoder commands.`);
      return;
    }

    // Get repo context
    const context = await getRepoContext(payload);
    if (!context) {
      log.error("Failed to get repository context");
      await postComment(payload, `❌ Failed to process command: Could not access repository`);
      return;
    }

    // Execute the command
    await executeCommand(cmd, context, payload);

  } catch (error) {
    log.error(`Failed to process command ${cmd.command}:`, error);
    await postComment(payload, `❌ Command failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Check if user has permission to execute commands
function hasPermissionToExecute(authorAssociation: string): boolean {
  const allowedAssociations = [
    'OWNER',
    'MEMBER', 
    'COLLABORATOR',
    'CONTRIBUTOR'
  ];
  
  return allowedAssociations.includes(authorAssociation);
}

// Get repository context for execution
async function getRepoContext(payload: any): Promise<GitHubCommentContext | null> {
  const repoOwner = payload.repository.owner.login;
  const repoName = payload.repository.name;
  const author = payload.comment.user.login;
  const authorAssociation = payload.comment.author_association;
  
  // Determine repo path (this would need to be configured per installation)
  const repoPath = await findLocalRepoPath(repoOwner, repoName);
  if (!repoPath) {
    log.error(`No local path found for ${repoOwner}/${repoName}`);
    return null;
  }

  // Create a temporary branch for the work
  const timestamp = Date.now();
  const branchName = `termcoder-${payload.comment.id}-${timestamp}`;

  return {
    repoOwner,
    repoName,
    repoPath,
    branchName,
    author,
    authorAssociation,
    issueNumber: payload.issue?.number,
    prNumber: payload.pull_request?.number
  };
}

// Find local repository path (this would be configured based on installation)
async function findLocalRepoPath(owner: string, repo: string): Promise<string | null> {
  // Check common locations
  const possiblePaths = [
    path.join(process.cwd(), repo),
    path.join(process.env.HOME || '~', 'repos', repo),
    path.join(process.env.HOME || '~', 'workspace', repo),
    path.join('/workspace', repo),
    path.join('/repos', owner, repo),
  ];

  for (const repoPath of possiblePaths) {
    try {
      const gitPath = path.join(repoPath, '.git');
      await fs.access(gitPath);
      return repoPath;
    } catch {
      // Continue to next path
    }
  }

  return null;
}

// Execute @termcoder command
async function executeCommand(
  cmd: TermCoderCommand, 
  context: GitHubCommentContext, 
  payload: any
): Promise<void> {
  
  // Post initial reaction/comment
  await postComment(payload, `🤖 @${cmd.author} Executing: \`${cmd.command} ${cmd.args.join(' ')}\``);

  try {
    // Create and checkout new branch
    await createWorkingBranch(context.repoPath, context.branchName);

    let resultMessage = "";

    switch (cmd.command.toLowerCase()) {
      case 'fix':
      case 'implement':
      case 'add':
      case 'update':
      case 'refactor':
        // General coding tasks
        const task = cmd.args.join(' ') || `Fix the issue mentioned in this ${payload.issue ? 'issue' : 'PR'}`;
        await runTask(context.repoPath, task, false, undefined, context.branchName);
        resultMessage = `✅ Applied changes for: ${task}`;
        break;

      case 'test':
        // Run tests
        const { runTests } = await import("../tools/test.js");
        const testResult = await runTests(context.repoPath);
        resultMessage = testResult.success 
          ? `✅ All tests passed (${testResult.testsRun || 0} tests)`
          : `❌ Tests failed: ${testResult.testsFailed || 0}/${testResult.testsRun || 0}`;
        break;

      case 'lint':
        // Run linter
        const { runLinter } = await import("../tools/test.js");
        const lintResult = await runLinter(context.repoPath);
        resultMessage = lintResult.success ? `✅ Linting passed` : `❌ Linting failed`;
        break;

      case 'build':
        // Run build
        const { runBuild } = await import("../tools/test.js");
        const buildResult = await runBuild(context.repoPath);
        resultMessage = buildResult.success ? `✅ Build succeeded` : `❌ Build failed`;
        break;

      case 'hotfix':
      case 'deploy-prep':
      case 'clean-start':
        // Execute predefined macro
        const { getMacro } = await import("../macros/storage.js");
        const { executeMacro } = await import("../macros/executor.js");
        const macro = await getMacro(cmd.command, context.repoPath);
        if (macro) {
          const execution = await executeMacro(macro, context.repoPath);
          resultMessage = execution.status === "completed"
            ? `✅ Macro '${cmd.command}' completed successfully`
            : `❌ Macro '${cmd.command}' failed: ${execution.error}`;
        } else {
          throw new Error(`Unknown macro: ${cmd.command}`);
        }
        break;

      case 'pr':
      case 'pull-request':
        // Create PR with current changes
        const title = cmd.args.join(' ') || `TermCoder fix for ${payload.issue ? `issue #${payload.issue.number}` : 'PR review'}`;
        const body = `🤖 Automated fix by TermCoder\n\nTriggered by: ${cmd.author}\nOriginal request: ${cmd.command} ${cmd.args.join(' ')}`;
        
        const prUrl = await createPullRequest(context.repoPath, context.branchName, title, body);
        resultMessage = `✅ Created pull request: ${prUrl}`;
        break;

      default:
        throw new Error(`Unknown command: ${cmd.command}. Available: fix, test, lint, build, pr, hotfix, deploy-prep, clean-start`);
    }

    // Post success comment
    await postComment(payload, resultMessage);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await postComment(payload, `❌ Command failed: ${errorMsg}`);
    log.error(`Command execution failed:`, error);
  }
}

// Create and checkout working branch
async function createWorkingBranch(repoPath: string, branchName: string): Promise<void> {
  // Ensure we're on main/master
  const mainBranch = await getDefaultBranch(repoPath);
  await runShell(['git', 'checkout', mainBranch], repoPath);
  
  // Pull latest changes
  await runShell(['git', 'pull', 'origin', mainBranch], repoPath);
  
  // Create and checkout new branch
  await runShell(['git', 'checkout', '-b', branchName], repoPath);
}

// Get default branch name
async function getDefaultBranch(repoPath: string): Promise<string> {
  const result = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
    cwd: repoPath,
    encoding: 'utf8'
  });
  
  if (result.status === 0) {
    return result.stdout.trim().replace('refs/remotes/origin/', '');
  }
  
  // Fallback to common names
  for (const branch of ['main', 'master']) {
    const check = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: repoPath
    });
    if (check.status === 0) {
      return branch;
    }
  }
  
  return 'main'; // Default fallback
}

// Post comment to GitHub issue/PR
async function postComment(payload: any, message: string): Promise<void> {
  try {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      log.warn("No GITHUB_TOKEN set, cannot post comment");
      return;
    }

    const { repository } = payload;
    const issueNumber = payload.issue?.number || payload.pull_request?.number;
    
    if (!issueNumber) {
      log.warn("No issue/PR number found for comment");
      return;
    }

    const url = `https://api.github.com/repos/${repository.owner.login}/${repository.name}/issues/${issueNumber}/comments`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: message
      })
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to post comment: ${response.status} ${error}`);
    } else {
      log.info("✅ Posted comment to GitHub");
    }
  } catch (error) {
    log.error("Failed to post GitHub comment:", error);
  }
}