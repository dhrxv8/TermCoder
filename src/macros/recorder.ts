import { MacroStep, MacroDefinition } from "./types.js";
import { addMacro } from "./storage.js";
import { log } from "../util/logging.js";

export interface RecordingSession {
  name: string;
  description: string;
  steps: MacroStep[];
  startTime: string;
  isRecording: boolean;
  scope: "global" | "project";
}

// Active recording sessions per project
const activeRecordings = new Map<string, RecordingSession>();

// Start recording a macro
export async function startRecording(
  name: string,
  description: string,
  projectPath: string,
  scope: "global" | "project" = "project"
): Promise<void> {
  if (activeRecordings.has(projectPath)) {
    throw new Error("Already recording a macro for this project");
  }

  const session: RecordingSession = {
    name,
    description,
    steps: [],
    startTime: new Date().toISOString(),
    isRecording: true,
    scope
  };

  activeRecordings.set(projectPath, session);
  log.info(`🔴 Recording macro: ${name}`);
}

// Stop recording and save macro
export async function stopRecording(projectPath: string): Promise<MacroDefinition | null> {
  const session = activeRecordings.get(projectPath);
  if (!session || !session.isRecording) {
    return null;
  }

  session.isRecording = false;
  activeRecordings.delete(projectPath);

  if (session.steps.length === 0) {
    log.warn("No steps recorded, macro not saved");
    return null;
  }

  const macro: MacroDefinition = {
    name: session.name,
    description: session.description,
    steps: session.steps,
    tags: ["recorded"],
    scope: session.scope,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0
  };

  await addMacro(macro, session.scope === "project" ? projectPath : undefined);
  
  log.success(`⏹️ Macro saved: ${macro.name} (${macro.steps.length} steps)`);
  return macro;
}

// Cancel recording
export async function cancelRecording(projectPath: string): Promise<boolean> {
  const session = activeRecordings.get(projectPath);
  if (!session) return false;

  activeRecordings.delete(projectPath);
  log.info("🛑 Recording cancelled");
  return true;
}

// Add step to current recording
export async function recordStep(
  projectPath: string,
  type: MacroStep["type"],
  action: string,
  args?: string[],
  description?: string
): Promise<void> {
  const session = activeRecordings.get(projectPath);
  if (!session || !session.isRecording) {
    return; // Silently ignore if not recording
  }

  const step: MacroStep = {
    type,
    action,
    args,
    description: description || action
  };

  session.steps.push(step);
  log.raw(`  📝 Recorded: ${type} ${action}`);
}

// Check if recording is active
export function isRecording(projectPath: string): boolean {
  const session = activeRecordings.get(projectPath);
  return session?.isRecording || false;
}

// Get current recording session
export function getRecordingSession(projectPath: string): RecordingSession | null {
  return activeRecordings.get(projectPath) || null;
}

// Pause recording
export function pauseRecording(projectPath: string): boolean {
  const session = activeRecordings.get(projectPath);
  if (!session) return false;

  session.isRecording = false;
  log.info("⏸️ Recording paused");
  return true;
}

// Resume recording
export function resumeRecording(projectPath: string): boolean {
  const session = activeRecordings.get(projectPath);
  if (!session) return false;

  session.isRecording = true;
  log.info("▶️ Recording resumed");
  return true;
}

// Auto-detect command type from input
export function detectCommandType(input: string): { type: MacroStep["type"]; action: string; args?: string[] } {
  // Git commands
  if (input.startsWith("git ")) {
    return {
      type: "git",
      action: input.substring(4),
      args: input.substring(4).split(" ")
    };
  }

  // Shell commands (common patterns)
  if (input.match(/^(npm|yarn|pnpm|pip|cargo|go|make|docker|kubectl|helm)/)) {
    return {
      type: "shell",
      action: input,
      args: input.split(" ")
    };
  }

  // TermCode commands (starting with /)
  if (input.startsWith("/")) {
    return {
      type: "command",
      action: input.substring(1)
    };
  }

  // Built-in commands
  if (["test", "lint", "build", "rollback"].includes(input)) {
    return {
      type: "command",
      action: input
    };
  }

  // Default to task (AI task)
  return {
    type: "task",
    action: input
  };
}