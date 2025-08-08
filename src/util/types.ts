export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface RetrievalChunk {
  file: string;
  start: number; // 1-based line
  end: number;   // inclusive
  text: string;
  score?: number; // similarity score
  embedding?: number[]; // vector embedding
}

export interface PlanStep {
  id: string;
  title: string;
  rationale: string;
  files?: string[];
  commands?: string[];
}

export interface AgentConfig {
  repo: string;
  dryRun: boolean;
  allowCommands: string[];
  model: string;
  embedModel: string;
}