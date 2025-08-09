import { log } from "../util/logging.js";
import { workspaceManager } from "../workspace/manager.js";
import { intelligentErrorRecovery } from "../intelligence/error-recovery.js";
import { getProvider } from "../providers/index.js";
import { enhancedDiffManager } from "../agent/enhanced-diff.js";

export interface Suggestion {
  id: string;
  type: 'command' | 'task' | 'fix' | 'optimization' | 'workflow';
  title: string;
  description: string;
  command?: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  category: string;
  context: any;
  learnFromUsage: boolean;
}

export interface AutoComplete {
  suggestions: Array<{
    text: string;
    description: string;
    type: 'command' | 'path' | 'option' | 'value';
    score: number;
  }>;
  prefix: string;
}

export interface ContextAnalysis {
  projectType: string;
  recentCommands: string[];
  currentBranch: string;
  pendingChanges: boolean;
  commonPatterns: string[];
  suggestedNextSteps: string[];
}

/**
 * Smart CLI Suggestions System
 * Provides intelligent command suggestions, autocomplete, and context-aware help
 */
export class SmartSuggestionEngine {
  private commandHistory: string[] = [];
  private usagePatterns: Map<string, number> = new Map();
  private contextHistory: Map<string, any[]> = new Map();
  private learnedSuggestions: Map<string, Suggestion> = new Map();
  private recentSuggestions: Suggestion[] = [];

  /**
   * Get smart suggestions based on current context
   */
  async getSmartSuggestions(
    input: string,
    context: {
      repoPath: string;
      provider: string;
      model: string;
      projectInfo: any;
      currentBranch: string;
    }
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // 1. Context-aware command suggestions
    const contextSuggestions = await this.generateContextSuggestions(context);
    suggestions.push(...contextSuggestions);

    // 2. Pattern-based suggestions from history
    const patternSuggestions = this.generatePatternSuggestions(input, context);
    suggestions.push(...patternSuggestions);

    // 3. AI-powered suggestions
    const aiSuggestions = await this.generateAISuggestions(input, context);
    suggestions.push(...aiSuggestions);

    // 4. Workflow suggestions
    const workflowSuggestions = await this.generateWorkflowSuggestions(context);
    suggestions.push(...workflowSuggestions);

    // 5. Error-based suggestions
    const errorSuggestions = await this.generateErrorBasedSuggestions(context);
    suggestions.push(...errorSuggestions);

    // Sort by priority and confidence
    const sortedSuggestions = suggestions
      .filter(s => s.confidence > 0.2)
      .sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        return b.confidence - a.confidence;
      })
      .slice(0, 10);

    this.recentSuggestions = sortedSuggestions;
    return sortedSuggestions;
  }

  /**
   * Get autocomplete suggestions for partial input
   */
  async getAutoComplete(partialInput: string, context: any): Promise<AutoComplete> {
    const words = partialInput.split(' ');
    const currentWord = words[words.length - 1];
    const previousWords = words.slice(0, -1);

    const suggestions = [];

    // Command suggestions
    if (words.length === 1) {
      const commandSuggestions = this.getCommandSuggestions(currentWord);
      suggestions.push(...commandSuggestions);
    }

    // Slash command suggestions
    if (partialInput.startsWith('/')) {
      const slashSuggestions = this.getSlashCommandSuggestions(currentWord);
      suggestions.push(...slashSuggestions);
    }

    // File path suggestions
    if (this.isFilePath(currentWord)) {
      const pathSuggestions = await this.getFilePathSuggestions(currentWord, context.repoPath);
      suggestions.push(...pathSuggestions);
    }

    // Provider/model suggestions
    if (previousWords.includes('/provider') || previousWords.includes('/model')) {
      const providerModelSuggestions = this.getProviderModelSuggestions(currentWord, previousWords);
      suggestions.push(...providerModelSuggestions);
    }

    // Git-specific suggestions
    if (previousWords[0] === 'git' || partialInput.includes('git ')) {
      const gitSuggestions = this.getGitSuggestions(currentWord, previousWords);
      suggestions.push(...gitSuggestions);
    }

    // Sort by relevance score
    const sortedSuggestions = suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return {
      suggestions: sortedSuggestions,
      prefix: currentWord
    };
  }

  /**
   * Analyze current context for smart suggestions
   */
  async analyzeContext(
    repoPath: string,
    provider: string,
    projectInfo: any
  ): Promise<ContextAnalysis> {
    const analysis: ContextAnalysis = {
      projectType: projectInfo.type || 'unknown',
      recentCommands: this.commandHistory.slice(-10),
      currentBranch: 'main', // Would get from git
      pendingChanges: false, // Would check git status
      commonPatterns: [],
      suggestedNextSteps: []
    };

    // Analyze recent commands for patterns
    analysis.commonPatterns = this.findCommandPatterns(this.commandHistory);

    // Generate next step suggestions based on project state
    analysis.suggestedNextSteps = await this.generateNextSteps(analysis, projectInfo);

    return analysis;
  }

  /**
   * Learn from user command usage
   */
  learnFromCommand(command: string, context: any, successful: boolean): void {
    this.commandHistory.push(command);
    
    // Keep last 1000 commands
    if (this.commandHistory.length > 1000) {
      this.commandHistory = this.commandHistory.slice(-1000);
    }

    // Update usage patterns
    const pattern = this.extractCommandPattern(command);
    const currentCount = this.usagePatterns.get(pattern) || 0;
    this.usagePatterns.set(pattern, currentCount + 1);

    // Store context for learning
    const contextKey = `${context.projectType}-${context.provider}`;
    if (!this.contextHistory.has(contextKey)) {
      this.contextHistory.set(contextKey, []);
    }
    
    const contextCommands = this.contextHistory.get(contextKey)!;
    contextCommands.push({ command, successful, timestamp: Date.now() });
    
    // Keep last 100 commands per context
    if (contextCommands.length > 100) {
      this.contextHistory.set(contextKey, contextCommands.slice(-100));
    }

    // Learn successful patterns
    if (successful) {
      this.learnSuccessfulPattern(command, context);
    }
  }

  /**
   * Get suggestion feedback and improve
   */
  provideFeedback(suggestionId: string, feedback: 'used' | 'helpful' | 'not_helpful'): void {
    const suggestion = this.recentSuggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    // Adjust confidence based on feedback
    switch (feedback) {
      case 'used':
        suggestion.confidence = Math.min(suggestion.confidence * 1.2, 1.0);
        break;
      case 'helpful':
        suggestion.confidence = Math.min(suggestion.confidence * 1.1, 1.0);
        break;
      case 'not_helpful':
        suggestion.confidence = Math.max(suggestion.confidence * 0.8, 0.1);
        break;
    }

    // Update learned suggestions
    if (suggestion.learnFromUsage) {
      this.learnedSuggestions.set(suggestionId, suggestion);
    }
  }

  /**
   * Private implementation methods
   */

  private async generateContextSuggestions(context: any): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const workspace = workspaceManager.getCurrentWorkspace();

    // Project-type specific suggestions
    switch (context.projectInfo.type) {
      case 'javascript':
      case 'typescript':
        suggestions.push({
          id: 'npm-install',
          type: 'command',
          title: 'Install Dependencies',
          description: 'Install npm dependencies',
          command: 'npm install',
          confidence: 0.8,
          priority: 'medium',
          category: 'setup',
          context,
          learnFromUsage: true
        });

        if (context.projectInfo.framework === 'react') {
          suggestions.push({
            id: 'react-dev',
            type: 'command',
            title: 'Start Development Server',
            description: 'Run React development server',
            command: 'npm run dev',
            confidence: 0.9,
            priority: 'high',
            category: 'development',
            context,
            learnFromUsage: true
          });
        }
        break;

      case 'python':
        suggestions.push({
          id: 'pip-install',
          type: 'command',
          title: 'Install Requirements',
          description: 'Install Python requirements',
          command: 'pip install -r requirements.txt',
          confidence: 0.8,
          priority: 'medium',
          category: 'setup',
          context,
          learnFromUsage: true
        });
        break;
    }

    // Workspace-specific suggestions
    if (workspace) {
      if (workspace.bookmarks.length > 0) {
        suggestions.push({
          id: 'goto-bookmark',
          type: 'workflow',
          title: 'Go to Bookmark',
          description: `Navigate to saved bookmark: ${workspace.bookmarks[0]}`,
          command: `cd ${workspace.bookmarks[0]}`,
          confidence: 0.6,
          priority: 'low',
          category: 'navigation',
          context,
          learnFromUsage: false
        });
      }
    }

    return suggestions;
  }

  private generatePatternSuggestions(input: string, context: any): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Find similar commands from history
    const similarCommands = this.findSimilarCommands(input);
    
    for (const cmd of similarCommands.slice(0, 3)) {
      suggestions.push({
        id: `pattern-${cmd.replace(/\s+/g, '-')}`,
        type: 'command',
        title: `Run: ${cmd}`,
        description: `Previously used command`,
        command: cmd,
        confidence: 0.7,
        priority: 'medium',
        category: 'history',
        context,
        learnFromUsage: true
      });
    }

    // Pattern-based task suggestions
    if (input.toLowerCase().includes('test')) {
      suggestions.push({
        id: 'run-tests',
        type: 'command',
        title: 'Run Tests',
        description: 'Execute project test suite',
        command: 'test',
        confidence: 0.9,
        priority: 'high',
        category: 'testing',
        context,
        learnFromUsage: true
      });
    }

    if (input.toLowerCase().includes('build') || input.toLowerCase().includes('compile')) {
      suggestions.push({
        id: 'run-build',
        type: 'command',
        title: 'Build Project',
        description: 'Build/compile the project',
        command: 'build',
        confidence: 0.9,
        priority: 'high',
        category: 'build',
        context,
        learnFromUsage: true
      });
    }

    return suggestions;
  }

  private async generateAISuggestions(input: string, context: any): Promise<Suggestion[]> {
    if (!input || input.length < 3) return [];

    try {
      const provider = getProvider(context.provider);
      
      const prompt = `Based on this partial user input and context, suggest the most likely 3 commands or tasks they want to execute:

Input: "${input}"
Project Type: ${context.projectInfo.type}
Framework: ${context.projectInfo.framework || 'none'}
Recent Commands: ${this.commandHistory.slice(-5).join(', ')}

Provide suggestions in this JSON format:
[
  {
    "title": "Command Title",
    "description": "Brief description",
    "command": "actual command or task",
    "confidence": 0.8,
    "category": "development|testing|git|deployment|setup"
  }
]`;

      const response = await provider.chat([
        { role: 'user', content: prompt }
      ], { 
        model: context.model,
        temperature: 0.3,
        maxTokens: 300
      });

      const suggestions = this.parseAISuggestionResponse(response);
      return suggestions.map((s, i) => ({
        id: `ai-${i}`,
        type: 'task' as const,
        ...s,
        priority: 'medium' as const,
        context,
        learnFromUsage: true
      }));

    } catch (error) {
      log.debug('AI suggestion generation failed:', error);
      return [];
    }
  }

  private async generateWorkflowSuggestions(context: any): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const activeDiffs = enhancedDiffManager.getActiveDiffs();

    // Diff-related suggestions
    if (activeDiffs.length > 0) {
      suggestions.push({
        id: 'apply-diffs',
        type: 'workflow',
        title: 'Apply Pending Changes',
        description: `Apply ${activeDiffs.length} pending diff(s)`,
        confidence: 0.9,
        priority: 'high',
        category: 'workflow',
        context,
        learnFromUsage: false
      });
    }

    // Git workflow suggestions
    if (this.hasUncommittedChanges(context)) {
      suggestions.push({
        id: 'commit-changes',
        type: 'workflow',
        title: 'Commit Changes',
        description: 'Commit your current changes',
        command: 'git add -A && git commit -m "Update"',
        confidence: 0.8,
        priority: 'medium',
        category: 'git',
        context,
        learnFromUsage: true
      });
    }

    // Testing workflow
    if (this.shouldRunTests(context)) {
      suggestions.push({
        id: 'run-tests-workflow',
        type: 'workflow',
        title: 'Run Test Suite',
        description: 'Execute tests after changes',
        command: 'test',
        confidence: 0.7,
        priority: 'medium',
        category: 'testing',
        context,
        learnFromUsage: true
      });
    }

    return suggestions;
  }

  private async generateErrorBasedSuggestions(context: any): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const errorStats = intelligentErrorRecovery.getRecoveryStats();

    // Suggest fixes for common errors
    if (errorStats.topErrorCategories.length > 0) {
      const topCategory = errorStats.topErrorCategories[0];
      
      suggestions.push({
        id: 'fix-common-error',
        type: 'fix',
        title: `Fix Common ${topCategory.category} Issues`,
        description: `Address frequently occurring ${topCategory.category} problems`,
        confidence: 0.6,
        priority: 'medium',
        category: 'maintenance',
        context,
        learnFromUsage: true
      });
    }

    return suggestions;
  }

  private generateNextSteps(analysis: ContextAnalysis, projectInfo: any): Promise<string[]> {
    const steps: string[] = [];

    // Based on project type
    if (projectInfo.type === 'javascript' && !projectInfo.hasTests) {
      steps.push('Add test setup (Jest, Vitest, etc.)');
    }

    if (projectInfo.type === 'python' && !projectInfo.hasRequirements) {
      steps.push('Create requirements.txt file');
    }

    // Based on recent patterns
    if (analysis.recentCommands.some(cmd => cmd.includes('install'))) {
      steps.push('Run tests to verify installation');
    }

    if (analysis.recentCommands.some(cmd => cmd.includes('test'))) {
      steps.push('Review test results and fix failures');
    }

    return Promise.resolve(steps);
  }

  private getCommandSuggestions(prefix: string): AutoComplete['suggestions'] {
    const commands = [
      { text: 'test', description: 'Run project tests', type: 'command' as const, score: 0.9 },
      { text: 'build', description: 'Build project', type: 'command' as const, score: 0.9 },
      { text: 'lint', description: 'Run code linter', type: 'command' as const, score: 0.8 },
      { text: 'help', description: 'Show help information', type: 'command' as const, score: 0.7 },
      { text: 'merge', description: 'Merge current branch', type: 'command' as const, score: 0.8 },
      { text: 'rollback', description: 'Rollback changes', type: 'command' as const, score: 0.7 },
      { text: 'log', description: 'Show session log', type: 'command' as const, score: 0.6 }
    ];

    return commands
      .filter(cmd => cmd.text.startsWith(prefix.toLowerCase()))
      .map(cmd => ({
        ...cmd,
        score: cmd.score * (1 - (prefix.length / cmd.text.length) * 0.1)
      }));
  }

  private getSlashCommandSuggestions(prefix: string): AutoComplete['suggestions'] {
    const slashCommands = [
      { text: '/provider', description: 'Switch AI provider', type: 'command' as const, score: 0.9 },
      { text: '/model', description: 'Switch AI model', type: 'command' as const, score: 0.9 },
      { text: '/keys', description: 'Show API key status', type: 'command' as const, score: 0.8 },
      { text: '/health', description: 'Check provider health', type: 'command' as const, score: 0.8 },
      { text: '/whoami', description: 'Show session info', type: 'command' as const, score: 0.7 },
      { text: '/budget', description: 'Show usage statistics', type: 'command' as const, score: 0.7 },
      { text: '/sessions', description: 'List recent sessions', type: 'command' as const, score: 0.6 },
      { text: '/theme', description: 'Change terminal theme', type: 'command' as const, score: 0.6 },
      { text: '/workspace', description: 'Show workspace info', type: 'command' as const, score: 0.6 },
      { text: '/hooks', description: 'Show active hooks', type: 'command' as const, score: 0.5 },
      { text: '/security', description: 'Show security stats', type: 'command' as const, score: 0.5 },
      { text: '/diffs', description: 'Show diff management', type: 'command' as const, score: 0.5 },
      { text: '/intelligence', description: 'Show intelligence stats', type: 'command' as const, score: 0.5 },
      { text: '/performance', description: 'Show performance monitoring', type: 'command' as const, score: 0.5 },
      { text: '/plugins', description: 'Show plugin system', type: 'command' as const, score: 0.5 },
      { text: '/suggestions', description: 'Show smart suggestions', type: 'command' as const, score: 0.5 }
    ];

    const cleanPrefix = prefix.startsWith('/') ? prefix.substring(1) : prefix;
    
    return slashCommands
      .filter(cmd => cmd.text.substring(1).startsWith(cleanPrefix.toLowerCase()))
      .map(cmd => ({
        ...cmd,
        score: cmd.score * (1 - (cleanPrefix.length / (cmd.text.length - 1)) * 0.1)
      }));
  }

  private async getFilePathSuggestions(
    prefix: string, 
    repoPath: string
  ): Promise<AutoComplete['suggestions']> {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      
      const dir = path.dirname(prefix) || '.';
      const baseName = path.basename(prefix);
      const fullDir = path.resolve(repoPath, dir);
      
      const entries = await fs.readdir(fullDir, { withFileTypes: true });
      
      return entries
        .filter(entry => entry.name.startsWith(baseName))
        .map(entry => ({
          text: path.join(dir, entry.name),
          description: entry.isDirectory() ? 'Directory' : 'File',
          type: 'path' as const,
          score: entry.name.toLowerCase().startsWith(baseName.toLowerCase()) ? 0.9 : 0.6
        }))
        .slice(0, 10);
        
    } catch (error) {
      return [];
    }
  }

  private getProviderModelSuggestions(
    prefix: string, 
    previousWords: string[]
  ): AutoComplete['suggestions'] {
    if (previousWords.includes('/provider')) {
      const providers = [
        { text: 'openai', description: 'OpenAI GPT models', score: 0.9 },
        { text: 'anthropic', description: 'Anthropic Claude models', score: 0.9 },
        { text: 'google', description: 'Google Gemini models', score: 0.8 },
        { text: 'xai', description: 'xAI Grok models', score: 0.8 },
        { text: 'mistral', description: 'Mistral AI models', score: 0.7 },
        { text: 'cohere', description: 'Cohere models', score: 0.7 },
        { text: 'ollama', description: 'Local Ollama models', score: 0.6 }
      ];

      return providers
        .filter(p => p.text.startsWith(prefix.toLowerCase()))
        .map(p => ({ ...p, type: 'value' as const }));
    }

    if (previousWords.includes('/model')) {
      const models = [
        { text: 'gpt-4o', description: 'Latest GPT-4 Omni model', score: 0.9 },
        { text: 'gpt-4o-mini', description: 'GPT-4 Omni mini model', score: 0.9 },
        { text: 'claude-3-5-sonnet', description: 'Claude 3.5 Sonnet', score: 0.9 },
        { text: 'claude-3-opus', description: 'Claude 3 Opus', score: 0.8 },
        { text: 'gemini-1.5-pro', description: 'Gemini 1.5 Pro', score: 0.8 },
        { text: 'grok-beta', description: 'Grok Beta', score: 0.7 }
      ];

      return models
        .filter(m => m.text.startsWith(prefix.toLowerCase()))
        .map(m => ({ ...m, type: 'value' as const }));
    }

    return [];
  }

  private getGitSuggestions(
    prefix: string, 
    previousWords: string[]
  ): AutoComplete['suggestions'] {
    const gitCommands = [
      { text: 'status', description: 'Show working tree status', score: 0.9 },
      { text: 'add', description: 'Add file contents to index', score: 0.9 },
      { text: 'commit', description: 'Record changes to repository', score: 0.9 },
      { text: 'push', description: 'Update remote refs', score: 0.8 },
      { text: 'pull', description: 'Fetch and integrate changes', score: 0.8 },
      { text: 'branch', description: 'List, create, or delete branches', score: 0.7 },
      { text: 'checkout', description: 'Switch branches or restore files', score: 0.7 },
      { text: 'merge', description: 'Join development histories', score: 0.6 },
      { text: 'diff', description: 'Show changes between commits', score: 0.6 },
      { text: 'log', description: 'Show commit logs', score: 0.5 }
    ];

    if (previousWords.length === 1 && previousWords[0] === 'git') {
      return gitCommands
        .filter(cmd => cmd.text.startsWith(prefix.toLowerCase()))
        .map(cmd => ({ ...cmd, type: 'command' as const }));
    }

    return [];
  }

  private findCommandPatterns(history: string[]): string[] {
    const patterns: Map<string, number> = new Map();
    
    history.forEach(cmd => {
      const pattern = this.extractCommandPattern(cmd);
      patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
    });
    
    return Array.from(patterns.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }

  private extractCommandPattern(command: string): string {
    // Simplify command to extract pattern
    return command
      .replace(/["'][^"']*["']/g, 'STRING')
      .replace(/\b\d+\b/g, 'NUMBER')
      .replace(/\b[a-f0-9]{7,}\b/g, 'HASH')
      .toLowerCase();
  }

  private findSimilarCommands(input: string): string[] {
    const inputPattern = this.extractCommandPattern(input);
    const similarities: Array<{ command: string; score: number }> = [];
    
    this.commandHistory.forEach(cmd => {
      const cmdPattern = this.extractCommandPattern(cmd);
      const score = this.calculateSimilarity(inputPattern, cmdPattern);
      
      if (score > 0.3) {
        similarities.push({ command: cmd, score });
      }
    });
    
    return similarities
      .sort((a, b) => b.score - a.score)
      .map(s => s.command);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private learnSuccessfulPattern(command: string, context: any): void {
    const pattern = this.extractCommandPattern(command);
    const suggestionId = `learned-${pattern}`;
    
    const suggestion: Suggestion = {
      id: suggestionId,
      type: 'command',
      title: `Learned: ${command}`,
      description: 'Successfully used pattern',
      command,
      confidence: 0.8,
      priority: 'medium',
      category: 'learned',
      context,
      learnFromUsage: true
    };
    
    this.learnedSuggestions.set(suggestionId, suggestion);
  }

  private parseAISuggestionResponse(response: any): any[] {
    try {
      const content = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      log.debug('Failed to parse AI suggestion response:', error);
    }
    
    return [];
  }

  private isFilePath(text: string): boolean {
    return text.includes('/') || text.includes('\\') || text.includes('.');
  }

  private hasUncommittedChanges(context: any): boolean {
    // Would check git status
    return false;
  }

  private shouldRunTests(context: any): boolean {
    return context.projectInfo.hasTests && 
           this.commandHistory.some(cmd => cmd.includes('install') || cmd.includes('update'));
  }

  /**
   * Get suggestion statistics
   */
  getSuggestionStats(): {
    totalSuggestions: number;
    usagePatterns: Record<string, number>;
    topCategories: Array<{ category: string; count: number }>;
    learnedPatterns: number;
    accuracy: number;
  } {
    const categories: Record<string, number> = {};
    Array.from(this.usagePatterns.keys()).forEach(pattern => {
      const category = pattern.split(' ')[0];
      categories[category] = (categories[category] || 0) + 1;
    });

    const topCategories = Object.entries(categories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalSuggestions: this.recentSuggestions.length,
      usagePatterns: Object.fromEntries(this.usagePatterns),
      topCategories,
      learnedPatterns: this.learnedSuggestions.size,
      accuracy: 0.75 // Would calculate from actual feedback
    };
  }
}

// Export singleton instance
export const smartSuggestionEngine = new SmartSuggestionEngine();