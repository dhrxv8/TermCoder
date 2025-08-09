import { GitHubWebhookServer, startWebhookServer, stopWebhookServer } from "./webhook-server.js";
import { handleCommentEvent } from "./comment-handler.js";
import { checkOutdatedDependencies, applyDependencyUpdates, scheduleNightlyUpdates } from "./dependency-updater.js";
import { log } from "../util/logging.js";

let webhookServer: GitHubWebhookServer | null = null;

// Initialize GitHub integration
export async function initializeGitHubIntegration(): Promise<void> {
  try {
    const port = parseInt(process.env.GITHUB_WEBHOOK_PORT || '3000');
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (!secret) {
      log.warn("GITHUB_WEBHOOK_SECRET not set - webhook signature verification disabled");
    }
    
    // Start webhook server
    webhookServer = await startWebhookServer(port, secret);
    
    // Register event handlers
    webhookServer.on('issue_comment', handleCommentEvent);
    webhookServer.on('pull_request_review_comment', handleCommentEvent);
    
    // Handle repository events for CI integration
    webhookServer.on('status', handleStatusEvent);
    webhookServer.on('check_run', handleCheckRunEvent);
    
    log.success(`🐙 GitHub integration initialized on port ${port}`);
    
  } catch (error) {
    log.error("Failed to initialize GitHub integration:", error);
    log.info("GitHub integration will not be available");
  }
}

// Cleanup GitHub integration
export async function cleanupGitHubIntegration(): Promise<void> {
  if (webhookServer) {
    await stopWebhookServer();
    webhookServer = null;
  }
}

// Handle GitHub status events (for CI integration)
async function handleStatusEvent(event: any): Promise<void> {
  const { payload } = event;
  
  if (payload.state === 'failure' && payload.context?.includes('test')) {
    log.info(`🔍 CI tests failed for ${payload.repository.full_name}:${payload.sha}`);
    // Could trigger auto-debug here if configured
  }
}

// Handle GitHub check run events
async function handleCheckRunEvent(event: any): Promise<void> {
  const { payload } = event;
  
  if (payload.action === 'completed' && payload.check_run.conclusion === 'failure') {
    log.info(`❌ Check run failed: ${payload.check_run.name} on ${payload.repository.full_name}`);
  }
}

// Manual dependency update command
export async function runDependencyUpdate(
  projectPath: string,
  options: {
    types?: Array<"patch" | "minor" | "major">;
    createPR?: boolean;
    dry?: boolean;
  } = {}
): Promise<void> {
  const { types = ['patch', 'minor'], createPR = true, dry = false } = options;
  
  log.step("Dependency check", "scanning for outdated packages...");
  
  const updates = await checkOutdatedDependencies(projectPath);
  
  if (updates.length === 0) {
    log.success("✅ All dependencies are up to date");
    return;
  }
  
  const filteredUpdates = updates.filter(u => types.includes(u.updateType));
  
  if (dry) {
    log.raw("");
    log.raw(log.colors.bright("📋 Available Updates:"));
    log.raw("");
    
    for (const update of updates) {
      const emoji = update.updateType === 'major' ? '🚨' : 
                   update.updateType === 'minor' ? '⚠️' : '✅';
      const included = filteredUpdates.includes(update) ? '✓' : '✗';
      
      log.raw(`  ${emoji} ${included} ${update.name}: ${update.currentVersion} → ${update.latestVersion} (${update.updateType})`);
    }
    
    log.raw("");
    log.raw(`Total: ${updates.length} updates available, ${filteredUpdates.length} would be applied`);
    return;
  }
  
  if (filteredUpdates.length === 0) {
    log.warn(`No ${types.join('/')} updates available. Use --types to include major updates.`);
    return;
  }
  
  log.info(`🔄 Applying ${filteredUpdates.length} dependency updates...`);
  
  const result = await applyDependencyUpdates(projectPath, filteredUpdates, {
    createPR,
    updateTypes: types
  });
  
  if (result.success) {
    log.success(`✅ Applied ${result.updates.length} updates${result.prUrl ? ` - PR: ${result.prUrl}` : ''}`);
  } else {
    log.error(`❌ Update failed: ${result.error}`);
  }
}

// Get webhook server status
export function getGitHubIntegrationStatus(): {
  enabled: boolean;
  port?: number;
  listening: boolean;
} {
  return {
    enabled: webhookServer !== null,
    port: webhookServer ? parseInt(process.env.GITHUB_WEBHOOK_PORT || '3000') : undefined,
    listening: webhookServer?.isListening() || false
  };
}

// Re-export everything for convenience
export * from "./webhook-server.js";
export * from "./comment-handler.js";
export * from "./dependency-updater.js";
export { createPullRequest, getRepoInfo, getCurrentBranch } from "../tools/github.js";