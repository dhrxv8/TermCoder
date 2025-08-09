import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { MacroDefinition, MacroConfig } from "./types.js";
import { log } from "../util/logging.js";

const globalMacrosPath = path.join(os.homedir(), ".termcode", "macros.json");
const globalConfigPath = path.join(os.homedir(), ".termcode", "macro-config.json");

export interface MacroStorage {
  macros: MacroDefinition[];
  lastUpdated: string;
}

const defaultConfig: MacroConfig = {
  maxConcurrentExecutions: 3,
  defaultTimeout: 300000, // 5 minutes
  enableRecording: true,
  autoSave: true
};

// Ensure macro directory exists
async function ensureMacroDir(): Promise<void> {
  const dir = path.dirname(globalMacrosPath);
  await fs.mkdir(dir, { recursive: true });
}

// Load global macros
export async function loadGlobalMacros(): Promise<MacroStorage> {
  try {
    await ensureMacroDir();
    const content = await fs.readFile(globalMacrosPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    // Return empty storage if file doesn't exist
    return {
      macros: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

// Save global macros
export async function saveGlobalMacros(storage: MacroStorage): Promise<void> {
  try {
    await ensureMacroDir();
    storage.lastUpdated = new Date().toISOString();
    await fs.writeFile(globalMacrosPath, JSON.stringify(storage, null, 2), "utf8");
  } catch (error) {
    log.error("Failed to save macros:", error);
    throw error;
  }
}

// Load project-specific macros
export async function loadProjectMacros(projectPath: string): Promise<MacroStorage> {
  try {
    const macroPath = path.join(projectPath, ".termcode-macros.json");
    const content = await fs.readFile(macroPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return {
      macros: [],
      lastUpdated: new Date().toISOString()
    };
  }
}

// Save project-specific macros
export async function saveProjectMacros(projectPath: string, storage: MacroStorage): Promise<void> {
  try {
    const macroPath = path.join(projectPath, ".termcode-macros.json");
    storage.lastUpdated = new Date().toISOString();
    await fs.writeFile(macroPath, JSON.stringify(storage, null, 2), "utf8");
  } catch (error) {
    log.error("Failed to save project macros:", error);
    throw error;
  }
}

// Load all macros (global + project)
export async function loadAllMacros(projectPath?: string): Promise<MacroDefinition[]> {
  const globalStorage = await loadGlobalMacros();
  let allMacros = [...globalStorage.macros];

  if (projectPath) {
    const projectStorage = await loadProjectMacros(projectPath);
    allMacros.push(...projectStorage.macros);
  }

  return allMacros;
}

// Add macro
export async function addMacro(macro: MacroDefinition, projectPath?: string): Promise<void> {
  if (macro.scope === "global" || !projectPath) {
    const storage = await loadGlobalMacros();
    
    // Check for existing macro with same name
    const existingIndex = storage.macros.findIndex(m => m.name === macro.name);
    if (existingIndex >= 0) {
      storage.macros[existingIndex] = macro;
    } else {
      storage.macros.push(macro);
    }
    
    await saveGlobalMacros(storage);
  } else {
    const storage = await loadProjectMacros(projectPath);
    
    const existingIndex = storage.macros.findIndex(m => m.name === macro.name);
    if (existingIndex >= 0) {
      storage.macros[existingIndex] = macro;
    } else {
      storage.macros.push(macro);
    }
    
    await saveProjectMacros(projectPath, storage);
  }
}

// Remove macro
export async function removeMacro(name: string, projectPath?: string): Promise<boolean> {
  // Try global first
  const globalStorage = await loadGlobalMacros();
  const globalIndex = globalStorage.macros.findIndex(m => m.name === name);
  
  if (globalIndex >= 0) {
    globalStorage.macros.splice(globalIndex, 1);
    await saveGlobalMacros(globalStorage);
    return true;
  }

  // Try project if path provided
  if (projectPath) {
    const projectStorage = await loadProjectMacros(projectPath);
    const projectIndex = projectStorage.macros.findIndex(m => m.name === name);
    
    if (projectIndex >= 0) {
      projectStorage.macros.splice(projectIndex, 1);
      await saveProjectMacros(projectPath, projectStorage);
      return true;
    }
  }

  return false;
}

// Get macro by name
export async function getMacro(name: string, projectPath?: string): Promise<MacroDefinition | null> {
  const allMacros = await loadAllMacros(projectPath);
  return allMacros.find(m => m.name === name) || null;
}

// Update macro usage count
export async function incrementMacroUsage(name: string, projectPath?: string): Promise<void> {
  const macro = await getMacro(name, projectPath);
  if (macro) {
    macro.usageCount++;
    macro.updatedAt = new Date().toISOString();
    await addMacro(macro, projectPath);
  }
}

// Load macro config
export async function loadMacroConfig(): Promise<MacroConfig> {
  try {
    await ensureMacroDir();
    const content = await fs.readFile(globalConfigPath, "utf8");
    return { ...defaultConfig, ...JSON.parse(content) };
  } catch (error) {
    return defaultConfig;
  }
}

// Save macro config
export async function saveMacroConfig(config: MacroConfig): Promise<void> {
  try {
    await ensureMacroDir();
    await fs.writeFile(globalConfigPath, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    log.error("Failed to save macro config:", error);
  }
}