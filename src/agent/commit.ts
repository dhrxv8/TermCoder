import { getProvider } from "../providers/index.js";
import { loadConfig } from "../state/config.js";
import { getDiffSummary, getDiffContent, getAllChanges, commitWithMessage, addAll } from "../tools/git.js";
import { log } from "../util/logging.js";
import { trackTaskUsage } from "../util/costs.js";

export interface CommitInfo {
  message: string;
  files: string[];
  type: "feat" | "fix" | "docs" | "style" | "refactor" | "test" | "chore" | "build";
  scope?: string;
  breaking?: boolean;
}

export async function generateCommitMessage(
  repo: string,
  context?: string
): Promise<CommitInfo | null> {
  try {
    // Get changes
    const changesResult = getAllChanges(repo);
    if (!changesResult.ok || !changesResult.data.trim()) {
      log.warn("No changes to commit");
      return null;
    }

    const files = changesResult.data.trim().split('\n').filter(Boolean);
    
    // Get diff summary for overview
    const diffSummary = getDiffSummary(repo);
    const summaryText = diffSummary.ok ? diffSummary.data : "";
    
    // Get actual diff content (limited to avoid token explosion)
    const diffContent = getDiffContent(repo);
    const diffText = diffContent.ok ? 
      diffContent.data.split('\n').slice(0, 200).join('\n') : // Limit to first 200 lines
      "";

    // Generate commit message using AI
    const config = await loadConfig();
    if (!config) {
      throw new Error("No configuration found");
    }

    const provider = getProvider(config.defaultProvider);
    const model = config.models[config.defaultProvider]?.chat;
    
    if (!model) {
      throw new Error("No chat model configured");
    }

    const prompt = buildCommitPrompt(files, summaryText, diffText, context);
    
    const response = await provider.chat([
      { role: "system", content: COMMIT_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ], { model, temperature: 0.3, maxTokens: 200 });

    // Track usage
    await trackTaskUsage(
      config.defaultProvider,
      model,
      "Generate commit message",
      prompt,
      response,
      repo
    );

    // Parse response
    const commitInfo = parseCommitResponse(response, files);
    
    if (!commitInfo) {
      log.warn("Failed to parse commit message from AI response");
      return generateFallbackCommit(files, summaryText);
    }

    return commitInfo;

  } catch (error) {
    log.warn("Failed to generate AI commit message:", error);
    
    // Fallback to simple conventional commit
    const changesResult = getAllChanges(repo);
    const files = changesResult.ok ? 
      changesResult.data.trim().split('\n').filter(Boolean) : [];
    const diffSummary = getDiffSummary(repo);
    const summaryText = diffSummary.ok ? diffSummary.data : "";
    
    return generateFallbackCommit(files, summaryText);
  }
}

export async function autoCommit(
  repo: string, 
  taskDescription?: string
): Promise<boolean> {
  try {
    log.step("Auto-commit", "generating commit message...");
    
    const commitInfo = await generateCommitMessage(repo, taskDescription);
    
    if (!commitInfo) {
      log.warn("No changes to commit");
      return false;
    }

    // Stage all changes
    const addResult = addAll(repo);
    if (!addResult.ok) {
      log.error("Failed to stage changes:", (addResult as any).error);
      return false;
    }

    // Commit with generated message
    const commitResult = commitWithMessage(repo, commitInfo.message);
    
    if (commitResult.ok) {
      log.success(`Committed: ${commitInfo.message}`);
      return true;
    } else {
      log.error("Failed to commit:", (commitResult as any).error);
      return false;
    }

  } catch (error) {
    log.error("Auto-commit failed:", error);
    return false;
  }
}

const COMMIT_SYSTEM_PROMPT = `You are an expert at writing concise, conventional commit messages. 

Follow the Conventional Commits specification:
- Format: type(scope): description
- Types: feat, fix, docs, style, refactor, test, chore, build
- Keep under 72 characters
- Use present tense, imperative mood
- Don't capitalize the first letter of description
- Don't end with period

Examples:
- feat(auth): add JWT token validation
- fix(api): handle null response in user endpoint  
- docs(readme): update installation instructions
- refactor(utils): extract common validation logic
- test(auth): add login integration tests
- chore(deps): upgrade typescript to v5.0
- build(docker): optimize production image size

Respond with JSON in this format:
{
  "message": "feat(scope): description",
  "type": "feat",
  "scope": "auth", 
  "breaking": false
}

If the change introduces breaking changes, set "breaking": true and add "BREAKING CHANGE:" to description or use ! after scope.`;

function buildCommitPrompt(
  files: string[],
  diffSummary: string,
  diffContent: string,
  context?: string
): string {
  let prompt = `Generate a conventional commit message for these changes:

Files changed (${files.length}):
${files.map(f => `- ${f}`).join('\n')}

Diff summary:
${diffSummary}

`;

  if (diffContent.trim()) {
    prompt += `Code changes (sample):
\`\`\`
${diffContent.substring(0, 1000)}${diffContent.length > 1000 ? '...' : ''}
\`\`\`

`;
  }

  if (context) {
    prompt += `Context: ${context}

`;
  }

  prompt += `Analyze the changes and generate an appropriate conventional commit message. Focus on the most significant change if there are multiple types.`;

  return prompt;
}

function parseCommitResponse(response: string, files: string[]): CommitInfo | null {
  try {
    // Try to parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (data.message && data.type) {
        return {
          message: data.message,
          files,
          type: data.type,
          scope: data.scope,
          breaking: data.breaking || false
        };
      }
    }

    // Fallback: try to extract message from text
    const messageMatch = response.match(/(?:message["']?\s*:\s*["']?)([^"'\n]+)/i);
    if (messageMatch) {
      const message = messageMatch[1].trim();
      const type = detectCommitType(message);
      
      return {
        message,
        files,
        type,
        breaking: message.includes('BREAKING CHANGE') || message.includes('!')
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

function detectCommitType(message: string): CommitInfo["type"] {
  const msg = message.toLowerCase();
  
  if (msg.startsWith('feat')) return 'feat';
  if (msg.startsWith('fix')) return 'fix';
  if (msg.startsWith('docs')) return 'docs';
  if (msg.startsWith('style')) return 'style';
  if (msg.startsWith('refactor')) return 'refactor';
  if (msg.startsWith('test')) return 'test';
  if (msg.startsWith('build')) return 'build';
  if (msg.startsWith('chore')) return 'chore';
  
  return 'chore';
}

function generateFallbackCommit(files: string[], diffSummary: string): CommitInfo {
  // Analyze file types and changes to determine commit type
  let type: CommitInfo["type"] = "chore";
  let scope: string | undefined;
  
  // Determine type based on files
  const hasTests = files.some(f => f.includes('test') || f.includes('spec'));
  const hasDocs = files.some(f => f.includes('readme') || f.includes('doc') || f.endsWith('.md'));
  const hasPackageJson = files.some(f => f.includes('package.json') || f.includes('package-lock.json'));
  const hasSourceCode = files.some(f => /\.(js|ts|jsx|tsx|py|go|java|c|cpp|rs)$/.test(f));
  
  if (hasTests && !hasSourceCode) {
    type = "test";
  } else if (hasDocs && !hasSourceCode) {
    type = "docs";
  } else if (hasPackageJson) {
    type = "chore";
    scope = "deps";
  } else if (hasSourceCode) {
    type = "feat"; // Default to feat for code changes
  }

  // Generate simple message
  const fileCount = files.length;
  let message = `${type}`;
  
  if (scope) {
    message += `(${scope})`;
  }
  
  if (fileCount === 1) {
    const fileName = files[0].split('/').pop() || files[0];
    message += `: update ${fileName}`;
  } else {
    message += `: update ${fileCount} files`;
  }

  return {
    message,
    files,
    type,
    scope,
    breaking: false
  };
}