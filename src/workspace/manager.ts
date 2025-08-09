import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { ProjectInfo } from "../tools/test.js";

export interface WorkspaceConfig {
  name: string;
  path: string;
  type: string;
  framework?: string;
  lastUsed: string;
  preferences: {
    defaultProvider: string;
    defaultModel: string;
    enabledTools: string[];
    theme: string;
  };
  contexts: string[];
  bookmarks: string[];
}

export interface WorkspaceSession {
  id: string;
  workspacePath: string;
  startedAt: string;
  endedAt?: string;
  provider: string;
  model: string;
  branchName: string;
  tasks: Array<{
    task: string;
    timestamp: string;
    success: boolean;
    filesModified: string[];
  }>;
  totalTokens: number;
  totalCost: number;
}

/**
 * Enhanced workspace management inspired by Claude Code
 * Provides project-aware context and persistent settings
 */
export class WorkspaceManager {
  private configDir: string;
  private workspacesFile: string;
  private sessionsFile: string;
  private workspaces: Map<string, WorkspaceConfig> = new Map();
  private currentWorkspace?: WorkspaceConfig;
  
  constructor() {
    this.configDir = path.join(process.env.HOME || "~", ".termcode", "workspaces");
    this.workspacesFile = path.join(this.configDir, "workspaces.json");
    this.sessionsFile = path.join(this.configDir, "sessions.json");
  }
  
  /**
   * Initialize workspace manager
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await this.loadWorkspaces();
    } catch (error) {
      log.warn("Failed to initialize workspace manager:", error);
    }
  }
  
  /**
   * Load or create workspace for a project path
   */
  async loadWorkspace(projectPath: string, projectInfo: ProjectInfo): Promise<WorkspaceConfig> {
    const normalizedPath = path.resolve(projectPath);
    const existing = this.workspaces.get(normalizedPath);
    
    if (existing) {
      existing.lastUsed = new Date().toISOString();
      this.currentWorkspace = existing;
      await this.saveWorkspaces();
      return existing;
    }
    
    // Create new workspace
    const workspace: WorkspaceConfig = {
      name: path.basename(normalizedPath),
      path: normalizedPath,
      type: projectInfo.type,
      framework: projectInfo.framework,
      lastUsed: new Date().toISOString(),
      preferences: {
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini",
        enabledTools: ["git", "test", "lint", "build", "shell"],
        theme: "claude"
      },
      contexts: projectInfo.contexts || [],
      bookmarks: []
    };
    
    // Auto-detect better defaults based on project
    this.optimizeWorkspaceDefaults(workspace, projectInfo);
    
    this.workspaces.set(normalizedPath, workspace);
    this.currentWorkspace = workspace;
    await this.saveWorkspaces();
    
    log.info(`Created workspace: ${workspace.name} (${workspace.type})`);
    return workspace;
  }
  
  /**
   * Get current workspace
   */
  getCurrentWorkspace(): WorkspaceConfig | undefined {
    return this.currentWorkspace;
  }
  
  /**
   * List recent workspaces
   */
  getRecentWorkspaces(limit: number = 10): WorkspaceConfig[] {
    return Array.from(this.workspaces.values())
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, limit);
  }
  
  /**
   * Update workspace preferences
   */
  async updateWorkspacePreferences(
    workspacePath: string,
    preferences: Partial<WorkspaceConfig["preferences"]>
  ): Promise<void> {
    const workspace = this.workspaces.get(path.resolve(workspacePath));
    if (workspace) {
      workspace.preferences = { ...workspace.preferences, ...preferences };
      await this.saveWorkspaces();
      log.info("Workspace preferences updated");
    }
  }
  
  /**
   * Add bookmark to workspace
   */
  async addBookmark(workspacePath: string, bookmark: string): Promise<void> {
    const workspace = this.workspaces.get(path.resolve(workspacePath));
    if (workspace && !workspace.bookmarks.includes(bookmark)) {
      workspace.bookmarks.push(bookmark);
      await this.saveWorkspaces();
      log.info(`Bookmark added: ${bookmark}`);
    }
  }
  
  /**
   * Remove bookmark from workspace
   */
  async removeBookmark(workspacePath: string, bookmark: string): Promise<void> {
    const workspace = this.workspaces.get(path.resolve(workspacePath));
    if (workspace) {
      workspace.bookmarks = workspace.bookmarks.filter(b => b !== bookmark);
      await this.saveWorkspaces();
      log.info(`Bookmark removed: ${bookmark}`);
    }
  }
  
  /**
   * Create a new session for workspace
   */
  async createSession(
    workspacePath: string,
    provider: string,
    model: string,
    branchName: string
  ): Promise<WorkspaceSession> {
    const session: WorkspaceSession = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workspacePath: path.resolve(workspacePath),
      startedAt: new Date().toISOString(),
      provider,
      model,
      branchName,
      tasks: [],
      totalTokens: 0,
      totalCost: 0
    };
    
    await this.saveSession(session);
    return session;
  }
  
  /**
   * Update session with task completion
   */
  async updateSession(
    sessionId: string,
    task: string,
    success: boolean,
    filesModified: string[] = [],
    tokens: number = 0,
    cost: number = 0
  ): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      
      if (sessionIndex >= 0) {
        const session = sessions[sessionIndex];
        session.tasks.push({
          task,
          timestamp: new Date().toISOString(),
          success,
          filesModified
        });
        session.totalTokens += tokens;
        session.totalCost += cost;
        
        await this.saveSessions(sessions);
      }
    } catch (error) {
      log.warn("Failed to update session:", error);
    }
  }
  
  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      
      if (sessionIndex >= 0) {
        sessions[sessionIndex].endedAt = new Date().toISOString();
        await this.saveSessions(sessions);
      }
    } catch (error) {
      log.warn("Failed to end session:", error);
    }
  }
  
  /**
   * Get session history for workspace
   */
  async getWorkspaceHistory(workspacePath: string, limit: number = 20): Promise<WorkspaceSession[]> {
    try {
      const sessions = await this.loadSessions();
      return sessions
        .filter(s => s.workspacePath === path.resolve(workspacePath))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, limit);
    } catch (error) {
      log.warn("Failed to get workspace history:", error);
      return [];
    }
  }
  
  /**
   * Get workspace analytics
   */
  async getWorkspaceAnalytics(workspacePath: string): Promise<{
    totalSessions: number;
    totalTasks: number;
    successRate: number;
    mostUsedProvider: string;
    totalCost: number;
    totalTokens: number;
    averageSessionLength: number;
  }> {
    const sessions = await this.getWorkspaceHistory(workspacePath, 1000);
    
    const totalSessions = sessions.length;
    const totalTasks = sessions.reduce((sum, s) => sum + s.tasks.length, 0);
    const successfulTasks = sessions.reduce((sum, s) => 
      sum + s.tasks.filter(t => t.success).length, 0);
    const successRate = totalTasks > 0 ? (successfulTasks / totalTasks) * 100 : 0;
    
    const providerCounts = sessions.reduce((counts, s) => {
      counts[s.provider] = (counts[s.provider] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    const mostUsedProvider = Object.entries(providerCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || "none";
    
    const totalCost = sessions.reduce((sum, s) => sum + s.totalCost, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);
    
    const sessionLengths = sessions
      .filter(s => s.endedAt)
      .map(s => new Date(s.endedAt!).getTime() - new Date(s.startedAt).getTime());
    const averageSessionLength = sessionLengths.length > 0 ?
      sessionLengths.reduce((sum, length) => sum + length, 0) / sessionLengths.length / 1000 / 60 : 0;
    
    return {
      totalSessions,
      totalTasks,
      successRate,
      mostUsedProvider,
      totalCost,
      totalTokens,
      averageSessionLength
    };
  }
  
  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(maxAge: number = 90 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      const cutoffDate = new Date(Date.now() - maxAge);
      
      const activeSessions = sessions.filter(s => 
        new Date(s.startedAt) > cutoffDate
      );
      
      const removed = sessions.length - activeSessions.length;
      if (removed > 0) {
        await this.saveSessions(activeSessions);
        log.info(`Cleaned up ${removed} old sessions`);
      }
    } catch (error) {
      log.warn("Failed to cleanup old sessions:", error);
    }
  }
  
  /**
   * Export workspace data
   */
  async exportWorkspace(workspacePath: string): Promise<string> {
    const workspace = this.workspaces.get(path.resolve(workspacePath));
    const sessions = await this.getWorkspaceHistory(workspacePath);
    const analytics = await this.getWorkspaceAnalytics(workspacePath);
    
    return JSON.stringify({
      workspace,
      sessions,
      analytics,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
  
  /**
   * Optimize workspace defaults based on project type
   */
  private optimizeWorkspaceDefaults(workspace: WorkspaceConfig, projectInfo: ProjectInfo): void {
    // Optimize based on project type
    switch (projectInfo.type) {
      case "typescript":
      case "javascript":
        if (projectInfo.framework === "react") {
          workspace.preferences.defaultProvider = "anthropic"; // Good for React
        }
        break;
      case "python":
        workspace.preferences.defaultProvider = "openai"; // GPT-4 good for Python
        workspace.preferences.defaultModel = "gpt-4o";
        break;
      case "rust":
      case "go":
        workspace.preferences.defaultProvider = "anthropic"; // Claude good for systems
        break;
    }
    
    // Add relevant contexts
    if (projectInfo.hasTests) {
      workspace.contexts.push("Test-driven development");
    }
    if (projectInfo.framework) {
      workspace.contexts.push(`${projectInfo.framework} best practices`);
    }
  }
  
  /**
   * Load workspaces from disk
   */
  private async loadWorkspaces(): Promise<void> {
    try {
      const data = await fs.readFile(this.workspacesFile, "utf8");
      const workspaces = JSON.parse(data) as WorkspaceConfig[];
      
      this.workspaces.clear();
      for (const workspace of workspaces) {
        this.workspaces.set(workspace.path, workspace);
      }
    } catch (error) {
      // File doesn't exist or invalid JSON, start fresh
      this.workspaces.clear();
    }
  }
  
  /**
   * Save workspaces to disk
   */
  private async saveWorkspaces(): Promise<void> {
    try {
      const workspaces = Array.from(this.workspaces.values());
      await fs.writeFile(this.workspacesFile, JSON.stringify(workspaces, null, 2));
    } catch (error) {
      log.warn("Failed to save workspaces:", error);
    }
  }
  
  /**
   * Load sessions from disk
   */
  private async loadSessions(): Promise<WorkspaceSession[]> {
    try {
      const data = await fs.readFile(this.sessionsFile, "utf8");
      return JSON.parse(data) as WorkspaceSession[];
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Save sessions to disk
   */
  private async saveSessions(sessions: WorkspaceSession[]): Promise<void> {
    try {
      await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
    } catch (error) {
      log.warn("Failed to save sessions:", error);
    }
  }
  
  /**
   * Save single session
   */
  private async saveSession(session: WorkspaceSession): Promise<void> {
    try {
      const sessions = await this.loadSessions();
      sessions.push(session);
      await this.saveSessions(sessions);
    } catch (error) {
      log.warn("Failed to save session:", error);
    }
  }
}

// Export singleton instance
export const workspaceManager = new WorkspaceManager();