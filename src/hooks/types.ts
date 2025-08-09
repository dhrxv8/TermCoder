import { z } from "zod";

export interface HookContext {
  repoPath: string;
  currentBranch: string;
  provider: string;
  model: string;
  sessionId: string;
  userId?: string;
  timestamp: number;
  environment: Record<string, string>;
}

export interface ToolUseContext extends HookContext {
  toolName: string;
  toolInput: any;
  originalCommand?: string[];
}

export interface DiffContext extends HookContext {
  filePaths: string[];
  diffs: Array<{
    file: string;
    oldContent: string;
    newContent: string;
    unified: string;
  }>;
  summary: string;
}

export interface CommitContext extends HookContext {
  message: string;
  files: string[];
  stats: {
    additions: number;
    deletions: number;
    files: number;
  };
}

export interface HookResult {
  success: boolean;
  data?: any;
  error?: string;
  suggestions?: string[];
  transformedInput?: any;
  metadata?: Record<string, any>;
}

export interface Hook {
  id: string;
  name: string;
  description: string;
  type: HookType;
  matcher: HookMatcher;
  handler: HookHandler;
  priority: number;
  enabled: boolean;
  timeout: number;
  retries: number;
  conditions?: HookCondition[];
  metadata?: Record<string, any>;
}

export type HookType = 
  | 'PreToolUse'
  | 'PostToolUse' 
  | 'PreDiff'
  | 'PostDiff'
  | 'PreCommit'
  | 'PostCommit'
  | 'PreTask'
  | 'PostTask'
  | 'OnError'
  | 'OnSuccess';

export interface HookMatcher {
  toolNames?: string[];
  patterns?: RegExp[];
  conditions?: Array<{
    path: string;
    operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt';
    value: any;
  }>;
  fileTypes?: string[];
  providers?: string[];
  models?: string[];
}

export interface HookCondition {
  type: 'file_exists' | 'command_available' | 'env_var' | 'git_status' | 'custom';
  condition: string;
  negate?: boolean;
}

export interface HookHandler {
  type: 'javascript' | 'python' | 'shell' | 'builtin';
  script?: string;
  file?: string;
  function?: string;
  builtin?: BuiltinHook;
}

export type BuiltinHook =
  | 'command_validator'
  | 'security_scanner'
  | 'diff_optimizer'
  | 'commit_enhancer'
  | 'error_analyzer'
  | 'performance_monitor';

export interface HookExecutionResult {
  hookId: string;
  success: boolean;
  executionTime: number;
  result: HookResult;
  error?: Error;
  warnings?: string[];
}

export interface HookConfig {
  enabled: boolean;
  hooks: Hook[];
  globalTimeout: number;
  maxConcurrency: number;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffTime: number;
  };
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    logFile?: string;
  };
}

// Zod schemas for validation
export const HookSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['PreToolUse', 'PostToolUse', 'PreDiff', 'PostDiff', 'PreCommit', 'PostCommit', 'PreTask', 'PostTask', 'OnError', 'OnSuccess']),
  matcher: z.object({
    toolNames: z.array(z.string()).optional(),
    patterns: z.array(z.any()).optional(),
    conditions: z.array(z.object({
      path: z.string(),
      operator: z.enum(['equals', 'contains', 'matches', 'gt', 'lt']),
      value: z.any()
    })).optional(),
    fileTypes: z.array(z.string()).optional(),
    providers: z.array(z.string()).optional(),
    models: z.array(z.string()).optional()
  }),
  handler: z.object({
    type: z.enum(['javascript', 'python', 'shell', 'builtin']),
    script: z.string().optional(),
    file: z.string().optional(),
    function: z.string().optional(),
    builtin: z.enum(['command_validator', 'security_scanner', 'diff_optimizer', 'commit_enhancer', 'error_analyzer', 'performance_monitor']).optional()
  }),
  priority: z.number().default(100),
  enabled: z.boolean().default(true),
  timeout: z.number().default(30000),
  retries: z.number().default(0),
  conditions: z.array(z.object({
    type: z.enum(['file_exists', 'command_available', 'env_var', 'git_status', 'custom']),
    condition: z.string(),
    negate: z.boolean().optional()
  })).optional(),
  metadata: z.record(z.any()).optional()
});

export const HookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  hooks: z.array(HookSchema),
  globalTimeout: z.number().default(300000),
  maxConcurrency: z.number().default(5),
  retryPolicy: z.object({
    maxRetries: z.number().default(3),
    backoffMultiplier: z.number().default(2),
    maxBackoffTime: z.number().default(30000)
  }),
  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    logFile: z.string().optional()
  })
});