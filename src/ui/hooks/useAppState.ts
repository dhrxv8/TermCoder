import { useState, useCallback } from 'react';
import { AppState, UIMode, ActivePane } from '../types.js';

interface UseAppStateProps {
  repo: string;
  provider: string;
  model: string;
  config: any;
  session: any;
  projectInfo: any;
}

export function useAppState(props: UseAppStateProps) {
  const [appState, setAppState] = useState<AppState>({
    mode: 'easy',
    activePane: 'prompt',
    showCommandPalette: false,
    provider: props.provider,
    model: props.model,
    status: 'Ready',
    branch: props.session?.branchName || 'main',
    output: [],
    currentTask: '',
    currentDiff: null,
    streaming: false,
    config: props.config,
    session: props.session,
    projectInfo: props.projectInfo,
  });

  const setMode = useCallback((mode: UIMode) => {
    setAppState(prev => ({ ...prev, mode }));
  }, []);

  const setActivePane = useCallback((pane: ActivePane) => {
    setAppState(prev => ({ ...prev, activePane: pane }));
  }, []);

  const setShowCommandPalette = useCallback((show: boolean) => {
    setAppState(prev => ({ ...prev, showCommandPalette: show }));
  }, []);

  const addOutputLine = useCallback((line: string) => {
    setAppState(prev => ({ 
      ...prev, 
      output: [...prev.output, line]
    }));
  }, []);

  const setCurrentTask = useCallback((task: string) => {
    setAppState(prev => ({ ...prev, currentTask: task }));
  }, []);

  const updateStatus = useCallback((status: string) => {
    setAppState(prev => ({ ...prev, status }));
  }, []);

  const setStreaming = useCallback((streaming: boolean) => {
    setAppState(prev => ({ ...prev, streaming }));
  }, []);

  const setCurrentDiff = useCallback((diff: string | null) => {
    setAppState(prev => ({ ...prev, currentDiff: diff }));
  }, []);

  return {
    appState,
    setMode,
    setActivePane,
    showCommandPalette: appState.showCommandPalette,
    setShowCommandPalette,
    addOutputLine,
    setCurrentTask,
    updateStatus,
    setStreaming,
    setCurrentDiff,
  };
}