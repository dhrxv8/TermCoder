export type UIMode = 'easy' | 'pro';
export type ActivePane = 'sidebar' | 'diff' | 'prompt';

export interface AppState {
  mode: UIMode;
  activePane: ActivePane;
  showCommandPalette: boolean;
  provider: string;
  model: string;
  status: string;
  branch: string;
  output: string[];
  currentTask: string;
  currentDiff: string | null;
  streaming: boolean;
  config: any;
  session: any;
  projectInfo: any;
}

export interface TaskHistoryItem {
  id: string;
  task: string;
  timestamp: Date;
  files: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface CommandPaletteItem {
  id: string;
  title: string;
  description: string;
  category: 'provider' | 'model' | 'action' | 'git' | 'test';
  action: () => void;
}