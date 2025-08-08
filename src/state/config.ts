import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const cfgDir = path.join(os.homedir(), ".termcode");
const cfgPath = path.join(cfgDir, "config.json");

export const ConfigSchema = z.object({
  defaultProvider: z.string(),
  models: z.record(z.string(), z.object({ 
    chat: z.string().optional(), 
    embed: z.string().optional() 
  })),
  tools: z.object({ 
    shell: z.boolean(), 
    git: z.boolean(), 
    tests: z.union([z.literal("auto"), z.boolean()]), 
    browser: z.boolean() 
  }),
  routing: z.object({ 
    fallback: z.array(z.string()), 
    budgetUSDMonthly: z.number() 
  })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<AppConfig | null> {
  try {
    await ensureConfigDir();
    const raw = await fs.readFile(cfgPath, "utf8");
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
}

export function configPath(): string {
  return cfgPath;
}

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(cfgDir, { recursive: true });
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(cfgPath);
    return true;
  } catch {
    return false;
  }
}