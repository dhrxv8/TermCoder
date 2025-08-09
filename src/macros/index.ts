import { BUILTIN_MACROS } from "./executor.js";
import { loadGlobalMacros, saveGlobalMacros } from "./storage.js";
import { log } from "../util/logging.js";

// Initialize macro system and install built-in macros
export async function initializeMacros(): Promise<void> {
  try {
    const storage = await loadGlobalMacros();
    let needsSave = false;
    
    // Install built-in macros if they don't exist
    for (const builtin of BUILTIN_MACROS) {
      const exists = storage.macros.find(m => m.name === builtin.name);
      if (!exists) {
        storage.macros.push(builtin);
        needsSave = true;
      }
    }
    
    if (needsSave) {
      await saveGlobalMacros(storage);
      log.info(`Installed ${BUILTIN_MACROS.length} built-in macros`);
    }
  } catch (error) {
    log.warn("Failed to initialize macros:", error);
  }
}

// Hook for recording commands automatically
export async function recordCommandIfActive(
  projectPath: string,
  input: string
): Promise<void> {
  try {
    const { isRecording, recordStep, detectCommandType } = await import("./recorder.js");
    
    if (isRecording(projectPath)) {
      const { type, action, args } = detectCommandType(input);
      await recordStep(projectPath, type, action, args);
    }
  } catch (error) {
    // Silent fail to avoid breaking normal operations
  }
}

export * from "./types.js";
export * from "./storage.js";
export * from "./executor.js";
export * from "./recorder.js";