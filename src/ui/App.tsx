#!/usr/bin/env node
import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, useInput, useApp } from 'ink';
import { useStdoutDimensions } from 'ink-use-stdout-dimensions';

import { StatusBar } from './panes/StatusBar.js';
import { Sidebar } from './panes/Sidebar.js';
import { DiffOutput } from './panes/DiffOutput.js';
import { PromptInput } from './panes/PromptInput.js';
import { CommandPalette } from './panes/CommandPalette.js';
import { AppState, UIMode, ActivePane } from './types.js';
import { useAppState } from './hooks/useAppState.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';

interface AppProps {
  repo: string;
  provider: string;
  model: string;
  config: any;
  session: any;
  projectInfo: any;
}

export const App: React.FC<AppProps> = ({ 
  repo, 
  provider, 
  model, 
  config, 
  session, 
  projectInfo 
}) => {
  const { exit } = useApp();
  const [width, height] = useStdoutDimensions();
  
  const {
    appState,
    setMode,
    setActivePane,
    showCommandPalette,
    setShowCommandPalette,
    addOutputLine,
    setCurrentTask,
    updateStatus
  } = useAppState({
    repo,
    provider,
    model,
    config,
    session,
    projectInfo
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleMode: () => setMode(appState.mode === 'easy' ? 'pro' : 'easy'),
    onShowCommandPalette: () => setShowCommandPalette(true),
    onFocusPrompt: () => setActivePane('prompt'),
    onRunTests: () => handleRunTests(),
    onRollback: () => handleRollback(),
    onCreatePR: () => handleCreatePR(),
    onMerge: () => handleMerge(),
    onExit: exit
  });

  // Handle cycling between panes with Tab
  useInput((input, key) => {
    if (key.tab && !appState.showCommandPalette) {
      const panes: ActivePane[] = ['sidebar', 'diff', 'prompt'];
      const currentIndex = panes.indexOf(appState.activePane);
      const nextIndex = (currentIndex + 1) % panes.length;
      setActivePane(panes[nextIndex]);
    }
  });

  const handleRunTests = useCallback(async () => {
    updateStatus('Running tests...');
    addOutputLine('🧪 Starting test run...');
    // Implementation would call the test runner
  }, [addOutputLine, updateStatus]);

  const handleRollback = useCallback(async () => {
    updateStatus('Rolling back changes...');
    addOutputLine('⏪ Rolling back all changes...');
    // Implementation would call git rollback
  }, [addOutputLine, updateStatus]);

  const handleCreatePR = useCallback(async () => {
    updateStatus('Creating pull request...');
    addOutputLine('🔄 Creating pull request...');
    // Implementation would create PR
  }, [addOutputLine, updateStatus]);

  const handleMerge = useCallback(async () => {
    updateStatus('Merging changes...');
    addOutputLine('🔀 Merging changes to main...');
    // Implementation would merge branch
  }, [addOutputLine, updateStatus]);

  const handleTaskSubmit = useCallback(async (task: string) => {
    setCurrentTask(task);
    updateStatus(`Processing: ${task.substring(0, 30)}...`);
    addOutputLine(`📝 Task: ${task}`);
    // Implementation would call the AI agent
  }, [addOutputLine, setCurrentTask, updateStatus]);

  // Calculate layout dimensions
  const statusHeight = 3;
  const promptHeight = 3;
  const contentHeight = height - statusHeight - promptHeight;
  const sidebarWidth = Math.floor(width * 0.25);
  const diffWidth = width - sidebarWidth;

  return (
    <Box flexDirection="column" width={width} height={height}>
      {/* Status Bar */}
      <StatusBar 
        height={statusHeight}
        mode={appState.mode}
        provider={appState.provider}
        model={appState.model}
        status={appState.status}
        branch={appState.branch}
        project={appState.projectInfo?.type}
      />

      {/* Main Content Area */}
      <Box flexDirection="row" height={contentHeight}>
        {/* Sidebar */}
        <Sidebar
          width={sidebarWidth}
          height={contentHeight}
          active={appState.activePane === 'sidebar'}
          mode={appState.mode}
          session={appState.session}
          onTaskSubmit={handleTaskSubmit}
          onRunTests={handleRunTests}
          onRollback={handleRollback}
          onCreatePR={handleCreatePR}
          onMerge={handleMerge}
        />

        {/* Diff/Output Pane */}
        <DiffOutput
          width={diffWidth}
          height={contentHeight}
          active={appState.activePane === 'diff'}
          output={appState.output}
          currentDiff={appState.currentDiff}
          streaming={appState.streaming}
        />
      </Box>

      {/* Prompt Input */}
      <PromptInput
        height={promptHeight}
        active={appState.activePane === 'prompt'}
        mode={appState.mode}
        onSubmit={handleTaskSubmit}
      />

      {/* Command Palette Modal */}
      {appState.showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onExecute={(command) => {
            setShowCommandPalette(false);
            // Handle command execution
          }}
          providers={Object.keys(config.models)}
          currentProvider={appState.provider}
          currentModel={appState.model}
        />
      )}
    </Box>
  );
};

// CLI entry point for TUI mode
export function startTUI(props: AppProps) {
  render(<App {...props} />);
}