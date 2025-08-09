export interface MacroStep {
  type: "command" | "task" | "shell" | "git" | "wait";
  action: string;
  args?: string[];
  timeout?: number;
  description?: string;
}

export interface MacroDefinition {
  name: string;
  description: string;
  steps: MacroStep[];
  tags: string[];
  scope: "global" | "project";
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  author?: string;
}

export interface MacroExecution {
  macroName: string;
  startTime: string;
  endTime?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentStep: number;
  totalSteps: number;
  error?: string;
  results: Array<{
    step: number;
    status: "pending" | "running" | "completed" | "failed";
    output?: string;
    error?: string;
    duration?: number;
  }>;
}

export interface MacroConfig {
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  enableRecording: boolean;
  autoSave: boolean;
}