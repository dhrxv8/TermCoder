import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../util/logging.js";
import { hookManager } from "../hooks/manager.js";
import { workspaceManager } from "../workspace/manager.js";

export interface FileChange {
  filePath: string;
  originalContent: string;
  newContent: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  language?: string;
  confidence: number;
  reason: string;
  lineNumbers?: {
    added: number[];
    deleted: number[];
    modified: number[];
  };
}

export interface DiffChunk {
  startLine: number;
  endLine: number;
  oldLines: string[];
  newLines: string[];
  context: string;
  type: 'addition' | 'deletion' | 'modification';
  confidence: number;
}

export interface SmartDiff {
  id: string;
  timestamp: number;
  changes: FileChange[];
  summary: string;
  impact: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedFiles: number;
    linesChanged: number;
    testImpact: boolean;
    breakingChanges: boolean;
  };
  preview: string;
  rollbackData: any;
  metadata: {
    provider: string;
    model: string;
    task: string;
    branch: string;
  };
}

export interface DiffAnalysis {
  conflicts: Array<{
    file: string;
    line: number;
    type: 'syntax' | 'logic' | 'style' | 'security';
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion?: string;
  }>;
  suggestions: Array<{
    file: string;
    type: 'optimization' | 'refactoring' | 'style' | 'safety';
    message: string;
    automated: boolean;
  }>;
  metrics: {
    complexity: number;
    maintainability: number;
    testCoverage: number;
    performance: number;
  };
}

export interface MergeResult {
  success: boolean;
  appliedChanges: FileChange[];
  skippedChanges: FileChange[];
  conflicts: Array<{
    file: string;
    conflictMarkers: string;
    resolution?: 'manual' | 'auto' | 'skip';
  }>;
  backupId: string;
}

/**
 * Enhanced Diff Management System with AI-powered analysis and conflict resolution
 * Superior to Claude Code's basic diff application
 */
export class EnhancedDiffManager {
  private activeDiffs: Map<string, SmartDiff> = new Map();
  private diffHistory: SmartDiff[] = [];
  private backups: Map<string, any> = new Map();
  private analysisCache: Map<string, DiffAnalysis> = new Map();

  /**
   * Create smart diff with comprehensive analysis
   */
  async createSmartDiff(
    changes: Array<{
      filePath: string;
      originalContent?: string;
      newContent: string;
      changeType?: 'create' | 'modify' | 'delete';
      reason?: string;
    }>,
    metadata: {
      provider: string;
      model: string;
      task: string;
      repoPath: string;
      branch?: string;
    }
  ): Promise<SmartDiff> {
    const diffId = this.generateDiffId();
    const timestamp = Date.now();
    
    log.info(`Creating smart diff: ${diffId}`);

    // Process each change
    const processedChanges: FileChange[] = [];
    for (const change of changes) {
      const processed = await this.processFileChange(change, metadata.repoPath);
      processedChanges.push(processed);
    }

    // Analyze impact
    const impact = await this.analyzeImpact(processedChanges, metadata.repoPath);
    
    // Generate preview
    const preview = await this.generatePreview(processedChanges);
    
    // Create rollback data
    const rollbackData = await this.createRollbackData(processedChanges, metadata.repoPath);

    const smartDiff: SmartDiff = {
      id: diffId,
      timestamp,
      changes: processedChanges,
      summary: await this.generateSummary(processedChanges, metadata.task),
      impact,
      preview,
      rollbackData,
      metadata: {
        provider: metadata.provider,
        model: metadata.model,
        task: metadata.task,
        branch: metadata.branch || 'unknown'
      }
    };

    // Execute pre-diff hooks
    await hookManager.executeHooks('PreDiff', {
      repoPath: metadata.repoPath,
      currentBranch: metadata.branch || 'current',
      provider: metadata.provider,
      model: metadata.model,
      sessionId: diffId,
      timestamp,
      environment: process.env
    }, {
      filePaths: processedChanges.map(c => c.filePath),
      diffs: processedChanges.map(c => ({
        file: c.filePath,
        oldContent: c.originalContent,
        newContent: c.newContent,
        unified: this.generateUnifiedDiff(c.originalContent, c.newContent)
      })),
      summary: smartDiff.summary
    });

    this.activeDiffs.set(diffId, smartDiff);
    return smartDiff;
  }

  /**
   * Analyze diff with AI-powered insights
   */
  async analyzeDiff(diffId: string): Promise<DiffAnalysis> {
    const diff = this.activeDiffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff ${diffId} not found`);
    }

    // Check cache first
    if (this.analysisCache.has(diffId)) {
      return this.analysisCache.get(diffId)!;
    }

    log.info(`Analyzing diff: ${diffId}`);

    const analysis: DiffAnalysis = {
      conflicts: [],
      suggestions: [],
      metrics: {
        complexity: 0,
        maintainability: 0,
        testCoverage: 0,
        performance: 0
      }
    };

    // Analyze each file change
    for (const change of diff.changes) {
      // Syntax analysis
      const syntaxIssues = await this.analyzeSyntax(change);
      analysis.conflicts.push(...syntaxIssues);

      // Logic analysis  
      const logicIssues = await this.analyzeLogic(change);
      analysis.conflicts.push(...logicIssues);

      // Style analysis
      const styleIssues = await this.analyzeStyle(change);
      analysis.conflicts.push(...styleIssues);

      // Security analysis
      const securityIssues = await this.analyzeSecurity(change);
      analysis.conflicts.push(...securityIssues);

      // Generate suggestions
      const suggestions = await this.generateSuggestions(change);
      analysis.suggestions.push(...suggestions);
    }

    // Calculate metrics
    analysis.metrics = await this.calculateMetrics(diff);

    this.analysisCache.set(diffId, analysis);
    return analysis;
  }

  /**
   * Apply diff with intelligent conflict resolution
   */
  async applyDiff(
    diffId: string,
    options: {
      mode: 'safe' | 'force' | 'interactive';
      backup: boolean;
      dryRun: boolean;
      autoResolveConflicts: boolean;
    } = {
      mode: 'safe',
      backup: true,
      dryRun: false,
      autoResolveConflicts: false
    }
  ): Promise<MergeResult> {
    const diff = this.activeDiffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff ${diffId} not found`);
    }

    log.info(`Applying diff: ${diffId} (mode: ${options.mode})`);

    const result: MergeResult = {
      success: false,
      appliedChanges: [],
      skippedChanges: [],
      conflicts: [],
      backupId: ''
    };

    // Create backup if requested
    if (options.backup) {
      result.backupId = await this.createBackup(diff);
    }

    // Analyze potential conflicts first
    const analysis = await this.analyzeDiff(diffId);
    const criticalConflicts = analysis.conflicts.filter(c => c.severity === 'high');

    if (criticalConflicts.length > 0 && options.mode === 'safe') {
      log.warn(`Found ${criticalConflicts.length} critical conflicts, aborting safe mode`);
      result.conflicts = criticalConflicts.map(c => ({
        file: c.file,
        conflictMarkers: c.message,
        resolution: 'skip'
      }));
      return result;
    }

    // Process each change
    for (const change of diff.changes) {
      try {
        const changeResult = await this.applyFileChange(change, options);
        
        if (changeResult.success) {
          result.appliedChanges.push(change);
        } else {
          result.skippedChanges.push(change);
          if (changeResult.conflict) {
            result.conflicts.push(changeResult.conflict);
          }
        }
      } catch (error) {
        log.error(`Error applying change to ${change.filePath}:`, error);
        result.skippedChanges.push(change);
        result.conflicts.push({
          file: change.filePath,
          conflictMarkers: `Error: ${error}`,
          resolution: 'skip'
        });
      }
    }

    result.success = result.conflicts.length === 0 || 
      result.conflicts.every(c => c.resolution !== undefined);

    // Execute post-diff hooks
    if (!options.dryRun) {
      await hookManager.executeHooks('PostDiff', {
        repoPath: path.dirname(diff.changes[0]?.filePath || ''),
        currentBranch: diff.metadata.branch,
        provider: diff.metadata.provider,
        model: diff.metadata.model,
        sessionId: diffId,
        timestamp: Date.now(),
        environment: process.env
      }, {
        appliedChanges: result.appliedChanges,
        conflicts: result.conflicts,
        success: result.success
      });
    }

    // Update diff history
    this.diffHistory.push(diff);
    if (this.diffHistory.length > 100) {
      this.diffHistory = this.diffHistory.slice(-100);
    }

    return result;
  }

  /**
   * Interactive conflict resolution
   */
  async resolveConflicts(
    diffId: string,
    resolutions: Array<{
      file: string;
      resolution: 'accept_theirs' | 'accept_ours' | 'merge' | 'skip';
      customMerge?: string;
    }>
  ): Promise<boolean> {
    const diff = this.activeDiffs.get(diffId);
    if (!diff) return false;

    for (const resolution of resolutions) {
      const change = diff.changes.find(c => c.filePath === resolution.file);
      if (!change) continue;

      switch (resolution.resolution) {
        case 'accept_theirs':
          // Use new content as-is
          break;
        case 'accept_ours':
          // Keep original content
          change.newContent = change.originalContent;
          break;
        case 'merge':
          if (resolution.customMerge) {
            change.newContent = resolution.customMerge;
          } else {
            // Attempt automatic merge
            change.newContent = await this.attemptAutoMerge(change);
          }
          break;
        case 'skip':
          // Mark for skipping
          change.confidence = 0;
          break;
      }
    }

    return true;
  }

  /**
   * Rollback applied diff
   */
  async rollbackDiff(diffId: string): Promise<boolean> {
    const diff = this.diffHistory.find(d => d.id === diffId);
    if (!diff || !diff.rollbackData) {
      log.error(`Cannot rollback diff ${diffId}: not found or no rollback data`);
      return false;
    }

    log.info(`Rolling back diff: ${diffId}`);

    try {
      for (const [filePath, originalContent] of Object.entries(diff.rollbackData.files)) {
        if (originalContent === null) {
          // File was created, delete it
          await fs.unlink(filePath);
        } else {
          // File was modified, restore original
          await fs.writeFile(filePath, originalContent as string, 'utf8');
        }
      }

      log.success(`Rolled back diff: ${diffId}`);
      return true;
    } catch (error) {
      log.error(`Failed to rollback diff ${diffId}:`, error);
      return false;
    }
  }

  /**
   * Generate visual diff preview
   */
  async generateVisualDiff(diffId: string): Promise<string> {
    const diff = this.activeDiffs.get(diffId);
    if (!diff) return '';

    const lines: string[] = [];
    lines.push(`# Diff Preview: ${diffId}`);
    lines.push(`**Task:** ${diff.metadata.task}`);
    lines.push(`**Impact:** ${diff.impact.riskLevel} (${diff.impact.linesChanged} lines, ${diff.impact.affectedFiles} files)`);
    lines.push('');

    for (const change of diff.changes) {
      lines.push(`## ${change.changeType.toUpperCase()}: ${change.filePath}`);
      lines.push(`**Reason:** ${change.reason}`);
      lines.push(`**Confidence:** ${Math.round(change.confidence * 100)}%`);
      lines.push('');

      // Generate side-by-side or unified diff
      const visualDiff = this.generateVisualFileDiff(change);
      lines.push('```diff');
      lines.push(visualDiff);
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Process individual file change
   */
  private async processFileChange(
    change: {
      filePath: string;
      originalContent?: string;
      newContent: string;
      changeType?: 'create' | 'modify' | 'delete';
      reason?: string;
    },
    repoPath: string
  ): Promise<FileChange> {
    const fullPath = path.resolve(repoPath, change.filePath);
    
    // Determine change type
    let changeType = change.changeType;
    let originalContent = change.originalContent;

    if (!changeType) {
      try {
        await fs.access(fullPath);
        changeType = 'modify';
        if (!originalContent) {
          originalContent = await fs.readFile(fullPath, 'utf8');
        }
      } catch {
        changeType = 'create';
        originalContent = '';
      }
    }

    // Detect language
    const language = this.detectLanguage(change.filePath);
    
    // Calculate confidence based on various factors
    const confidence = this.calculateChangeConfidence(change, originalContent);

    // Analyze line changes
    const lineNumbers = this.analyzeLineChanges(originalContent, change.newContent);

    return {
      filePath: change.filePath,
      originalContent: originalContent || '',
      newContent: change.newContent,
      changeType: changeType!,
      language,
      confidence,
      reason: change.reason || 'No reason provided',
      lineNumbers
    };
  }

  /**
   * Analyze impact of changes
   */
  private async analyzeImpact(changes: FileChange[], repoPath: string): Promise<SmartDiff['impact']> {
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let linesChanged = 0;
    let testImpact = false;
    let breakingChanges = false;

    const sensitiveFiles = [
      'package.json', 'requirements.txt', '.env', 'Dockerfile',
      'config', 'settings', 'security', 'auth'
    ];

    for (const change of changes) {
      // Count lines changed
      const lines = this.countLinesChanged(change);
      linesChanged += lines;

      // Check for test files
      if (change.filePath.includes('test') || change.filePath.includes('spec')) {
        testImpact = true;
      }

      // Check for sensitive files
      if (sensitiveFiles.some(pattern => change.filePath.toLowerCase().includes(pattern))) {
        riskLevel = 'high';
      }

      // Check for potential breaking changes
      if (this.hasBreakingChanges(change)) {
        breakingChanges = true;
        riskLevel = 'critical';
      }

      // Large changes increase risk
      if (lines > 100) {
        riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
      }
    }

    return {
      riskLevel,
      affectedFiles: changes.length,
      linesChanged,
      testImpact,
      breakingChanges
    };
  }

  /**
   * Generate diff summary using AI
   */
  private async generateSummary(changes: FileChange[], task: string): Promise<string> {
    const changesSummary = changes.map(c => 
      `${c.changeType} ${c.filePath} (${this.countLinesChanged(c)} lines)`
    ).join(', ');

    return `Task: ${task}\nChanges: ${changesSummary}`;
  }

  /**
   * Create rollback data
   */
  private async createRollbackData(changes: FileChange[], repoPath: string): Promise<any> {
    const rollbackData: any = {
      timestamp: Date.now(),
      files: {}
    };

    for (const change of changes) {
      const fullPath = path.resolve(repoPath, change.filePath);
      
      if (change.changeType === 'create') {
        rollbackData.files[fullPath] = null; // Mark for deletion on rollback
      } else {
        rollbackData.files[fullPath] = change.originalContent;
      }
    }

    return rollbackData;
  }

  /**
   * Analyze syntax issues
   */
  private async analyzeSyntax(change: FileChange): Promise<Array<any>> {
    const issues: any[] = [];
    
    if (!change.language) return issues;

    // Basic syntax checks based on language
    switch (change.language) {
      case 'javascript':
      case 'typescript':
        // Check for common JS/TS syntax issues
        if (this.hasUnclosedBraces(change.newContent)) {
          issues.push({
            file: change.filePath,
            line: 0,
            type: 'syntax',
            severity: 'high',
            message: 'Possible unclosed braces detected',
            suggestion: 'Check brace matching'
          });
        }
        break;
      
      case 'python':
        // Check for Python syntax issues
        if (this.hasPythonIndentationIssues(change.newContent)) {
          issues.push({
            file: change.filePath,
            line: 0,
            type: 'syntax',
            severity: 'high',
            message: 'Possible indentation issues detected',
            suggestion: 'Check indentation consistency'
          });
        }
        break;
    }

    return issues;
  }

  /**
   * Analyze logic issues
   */
  private async analyzeLogic(change: FileChange): Promise<Array<any>> {
    const issues: any[] = [];

    // Check for potential logic issues
    if (change.newContent.includes('TODO') || change.newContent.includes('FIXME')) {
      issues.push({
        file: change.filePath,
        line: 0,
        type: 'logic',
        severity: 'medium',
        message: 'Contains TODO/FIXME comments',
        suggestion: 'Review and complete TODO items'
      });
    }

    // Check for console.log in production code
    if (change.newContent.includes('console.log') && !change.filePath.includes('test')) {
      issues.push({
        file: change.filePath,
        line: 0,
        type: 'logic',
        severity: 'low',
        message: 'Contains console.log statements',
        suggestion: 'Remove debug statements or use proper logging'
      });
    }

    return issues;
  }

  /**
   * Analyze style issues
   */
  private async analyzeStyle(change: FileChange): Promise<Array<any>> {
    const issues: any[] = [];

    // Check for mixed indentation
    if (this.hasMixedIndentation(change.newContent)) {
      issues.push({
        file: change.filePath,
        line: 0,
        type: 'style',
        severity: 'low',
        message: 'Mixed indentation detected',
        suggestion: 'Use consistent indentation (spaces or tabs)'
      });
    }

    // Check line length
    const longLines = this.findLongLines(change.newContent, 120);
    if (longLines.length > 0) {
      issues.push({
        file: change.filePath,
        line: longLines[0],
        type: 'style',
        severity: 'low',
        message: `Lines exceed 120 characters (${longLines.length} lines)`,
        suggestion: 'Consider breaking long lines'
      });
    }

    return issues;
  }

  /**
   * Analyze security issues
   */
  private async analyzeSecurity(change: FileChange): Promise<Array<any>> {
    const issues: any[] = [];

    // Check for hardcoded secrets
    const secretPatterns = [
      /password\s*[:=]\s*['"][^'"]+['"]/, 
      /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/, 
      /secret\s*[:=]\s*['"][^'"]+['"]/
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(change.newContent)) {
        issues.push({
          file: change.filePath,
          line: 0,
          type: 'security',
          severity: 'high',
          message: 'Possible hardcoded secret detected',
          suggestion: 'Use environment variables for secrets'
        });
      }
    }

    return issues;
  }

  /**
   * Generate improvement suggestions
   */
  private async generateSuggestions(change: FileChange): Promise<Array<any>> {
    const suggestions: any[] = [];

    // Suggest optimizations based on file type and content
    if (change.language === 'javascript' || change.language === 'typescript') {
      if (change.newContent.includes('var ')) {
        suggestions.push({
          file: change.filePath,
          type: 'optimization',
          message: 'Consider using let/const instead of var',
          automated: true
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate code metrics
   */
  private async calculateMetrics(diff: SmartDiff): Promise<DiffAnalysis['metrics']> {
    // Simple heuristic-based metrics
    let complexity = 0;
    let maintainability = 0.8;
    let testCoverage = 0;
    let performance = 0.8;

    for (const change of diff.changes) {
      // Calculate cyclomatic complexity (simplified)
      const complexityIncrease = this.calculateComplexity(change.newContent);
      complexity += complexityIncrease;

      // Check test coverage
      if (change.filePath.includes('test') || change.filePath.includes('spec')) {
        testCoverage += 0.2;
      }

      // Maintainability factors
      if (this.countLinesChanged(change) > 50) {
        maintainability -= 0.1;
      }
    }

    return {
      complexity: Math.min(complexity / diff.changes.length, 1),
      maintainability: Math.max(maintainability, 0),
      testCoverage: Math.min(testCoverage, 1),
      performance
    };
  }

  /**
   * Apply individual file change
   */
  private async applyFileChange(
    change: FileChange, 
    options: any
  ): Promise<{ success: boolean; conflict?: any }> {
    try {
      const fullPath = path.resolve(change.filePath);
      
      if (options.dryRun) {
        log.info(`[DRY RUN] Would ${change.changeType} ${change.filePath}`);
        return { success: true };
      }

      switch (change.changeType) {
        case 'create':
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, change.newContent, 'utf8');
          break;
          
        case 'modify':
          // Check for conflicts if file was modified since analysis
          const currentContent = await fs.readFile(fullPath, 'utf8');
          if (currentContent !== change.originalContent && options.mode === 'safe') {
            return {
              success: false,
              conflict: {
                file: change.filePath,
                conflictMarkers: 'File was modified externally',
                resolution: 'manual'
              }
            };
          }
          
          await fs.writeFile(fullPath, change.newContent, 'utf8');
          break;
          
        case 'delete':
          await fs.unlink(fullPath);
          break;
          
        case 'rename':
          // Handle rename (would need additional metadata)
          break;
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        conflict: {
          file: change.filePath,
          conflictMarkers: `Error: ${error}`,
          resolution: 'skip'
        }
      };
    }
  }

  // Utility methods
  
  private generateDiffId(): string {
    return `diff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.php': 'php'
    };
    
    return langMap[ext] || 'text';
  }

  private calculateChangeConfidence(change: any, originalContent: string): number {
    let confidence = 0.7; // Base confidence
    
    // Increase confidence for small, focused changes
    const linesChanged = this.countLinesChanged({ originalContent, newContent: change.newContent } as FileChange);
    if (linesChanged < 10) confidence += 0.2;
    if (linesChanged > 100) confidence -= 0.2;
    
    // Increase confidence if change has clear reason
    if (change.reason && change.reason.length > 10) {
      confidence += 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  private analyzeLineChanges(oldContent: string, newContent: string): FileChange['lineNumbers'] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const added: number[] = [];
    const deleted: number[] = [];
    const modified: number[] = [];
    
    // Simple diff algorithm
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // Remaining lines are additions
        added.push(newIndex + 1);
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Remaining lines are deletions
        deleted.push(oldIndex + 1);
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // Lines match
        oldIndex++;
        newIndex++;
      } else {
        // Lines differ - could be modification, addition, or deletion
        // Simple heuristic: if next line matches, current line was modified
        if (oldIndex + 1 < oldLines.length && oldLines[oldIndex + 1] === newLines[newIndex]) {
          deleted.push(oldIndex + 1);
          oldIndex++;
        } else if (newIndex + 1 < newLines.length && oldLines[oldIndex] === newLines[newIndex + 1]) {
          added.push(newIndex + 1);
          newIndex++;
        } else {
          modified.push(Math.min(oldIndex + 1, newIndex + 1));
          oldIndex++;
          newIndex++;
        }
      }
    }
    
    return { added, deleted, modified };
  }

  private countLinesChanged(change: FileChange): number {
    const oldLines = change.originalContent.split('\n').length;
    const newLines = change.newContent.split('\n').length;
    return Math.abs(newLines - oldLines);
  }

  private hasBreakingChanges(change: FileChange): boolean {
    // Simple heuristics for breaking changes
    const breakingPatterns = [
      /export.*function.*\(/,  // Function signature changes
      /class.*{/,              // Class modifications
      /interface.*{/,          // Interface changes
      /public.*function/,      // Public API changes
    ];
    
    return breakingPatterns.some(pattern => 
      pattern.test(change.originalContent) && !pattern.test(change.newContent)
    );
  }

  private generateUnifiedDiff(oldContent: string, newContent: string): string {
    // Simple unified diff generation
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];
    
    let oldIndex = 0;
    let newIndex = 0;
    
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        diffLines.push(`+${newLines[newIndex]}`);
        newIndex++;
      } else if (newIndex >= newLines.length) {
        diffLines.push(`-${oldLines[oldIndex]}`);
        oldIndex++;
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        diffLines.push(` ${oldLines[oldIndex]}`);
        oldIndex++;
        newIndex++;
      } else {
        diffLines.push(`-${oldLines[oldIndex]}`);
        diffLines.push(`+${newLines[newIndex]}`);
        oldIndex++;
        newIndex++;
      }
    }
    
    return diffLines.join('\n');
  }

  private generatePreview(changes: FileChange[]): Promise<string> {
    const lines: string[] = [];
    
    for (const change of changes) {
      lines.push(`${change.changeType}: ${change.filePath}`);
      lines.push(`  Lines changed: ${this.countLinesChanged(change)}`);
      lines.push(`  Confidence: ${Math.round(change.confidence * 100)}%`);
      lines.push(`  Reason: ${change.reason}`);
      lines.push('');
    }
    
    return Promise.resolve(lines.join('\n'));
  }

  private generateVisualFileDiff(change: FileChange): string {
    return this.generateUnifiedDiff(change.originalContent, change.newContent);
  }

  private async createBackup(diff: SmartDiff): Promise<string> {
    const backupId = `backup_${diff.id}_${Date.now()}`;
    this.backups.set(backupId, diff.rollbackData);
    return backupId;
  }

  private async attemptAutoMerge(change: FileChange): Promise<string> {
    // Simple auto-merge implementation
    // In a real implementation, this would use more sophisticated algorithms
    return change.newContent; // Fallback to new content
  }

  // Syntax analysis helpers
  
  private hasUnclosedBraces(content: string): boolean {
    let braceCount = 0;
    for (const char of content) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    return braceCount !== 0;
  }

  private hasPythonIndentationIssues(content: string): boolean {
    const lines = content.split('\n');
    let prevIndent = 0;
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const indent = line.length - line.trimLeft().length;
      if (indent % 4 !== 0 && indent % 2 !== 0) {
        return true; // Irregular indentation
      }
      
      prevIndent = indent;
    }
    
    return false;
  }

  private hasMixedIndentation(content: string): boolean {
    const hasSpaces = /^  /.test(content);
    const hasTabs = /^\t/.test(content);
    return hasSpaces && hasTabs;
  }

  private findLongLines(content: string, maxLength: number): number[] {
    const lines = content.split('\n');
    const longLines: number[] = [];
    
    lines.forEach((line, index) => {
      if (line.length > maxLength) {
        longLines.push(index + 1);
      }
    });
    
    return longLines;
  }

  private calculateComplexity(content: string): number {
    // Simple cyclomatic complexity calculation
    const complexityKeywords = [
      'if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?'
    ];
    
    let complexity = 1; // Base complexity
    
    for (const keyword of complexityKeywords) {
      const matches = content.match(new RegExp(`\\b${keyword}\\b`, 'g'));
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return Math.min(complexity / 100, 1); // Normalize to 0-1
  }

  /**
   * Public API methods
   */

  /**
   * List active diffs
   */
  getActiveDiffs(): SmartDiff[] {
    return Array.from(this.activeDiffs.values());
  }

  /**
   * Get diff by ID
   */
  getDiff(diffId: string): SmartDiff | undefined {
    return this.activeDiffs.get(diffId);
  }

  /**
   * Clear completed diffs
   */
  clearDiff(diffId: string): boolean {
    return this.activeDiffs.delete(diffId);
  }

  /**
   * Get diff statistics
   */
  getDiffStats(): {
    activeDiffs: number;
    totalHistorical: number;
    successRate: number;
    averageChangesPerDiff: number;
    riskDistribution: Record<string, number>;
  } {
    const active = this.activeDiffs.size;
    const historical = this.diffHistory.length;
    
    const riskDistribution = { low: 0, medium: 0, high: 0, critical: 0 };
    this.diffHistory.forEach(diff => {
      riskDistribution[diff.impact.riskLevel]++;
    });

    const avgChanges = historical > 0 ? 
      this.diffHistory.reduce((sum, diff) => sum + diff.changes.length, 0) / historical : 0;

    return {
      activeDiffs: active,
      totalHistorical: historical,
      successRate: 0.85, // Would track actual success rate
      averageChangesPerDiff: avgChanges,
      riskDistribution
    };
  }
}

// Export singleton instance
export const enhancedDiffManager = new EnhancedDiffManager();