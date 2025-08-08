import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { TermCodeConfig, ProviderId, PROVIDERS } from "../providers/types.js";

const ConfigSchema = z.object({
  defaultProvider: z.enum(PROVIDERS as any),
  models: z.record(z.object({
    chat: z.string(),
    embed: z.string().optional()
  })),
  tools: z.object({
    shell: z.boolean(),
    git: z.boolean(),
    tests: z.enum(["auto", "on", "off"]),
    browser: z.boolean()
  }),
  routing: z.object({
    fallback: z.array(z.enum(PROVIDERS as any)),
    budgetUSDMonthly: z.number()
  }),
  browser: z.object({
    allowedDomains: z.array(z.string()),
    headless: z.boolean()
  }).optional()
});

const CONFIG_DIR = path.join(os.homedir(), ".termcode");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<TermCodeConfig | null> {
  try {
    await ensureConfigDir();
    const content = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(content);
    return ConfigSchema.parse(parsed) as TermCodeConfig;
  } catch (error) {
    return null;
  }
}

export async function saveConfig(config: TermCodeConfig): Promise<void> {
  await ensureConfigDir();
  
  // Validate config before saving
  ConfigSchema.parse(config);
  
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function configExists(): Promise<boolean> {
  try {
    await fs.access(CONFIG_PATH);
    return true;
  } catch {
    return false;
  }
}

export function getDefaultConfig(defaultProvider: ProviderId): TermCodeConfig {
  const models: Record<string, { chat: string; embed?: string }> = {
    openai: { chat: "gpt-4o-mini", embed: "text-embedding-3-small" },
    anthropic: { chat: "claude-3-5-sonnet-20241022", embed: "text-embedding-3-small" },
    xai: { chat: "grok-beta" },
    google: { chat: "gemini-1.5-pro", embed: "text-embedding-004" },
    mistral: { chat: "mistral-large-latest", embed: "mistral-embed" },
    cohere: { chat: "command-r-plus", embed: "embed-english-v3.0" },
    ollama: { chat: "llama3.1:8b", embed: "mxbai-embed-large" }
  };

  return {
    defaultProvider,
    models,
    tools: {
      shell: true,
      git: true,
      tests: "auto",
      browser: false
    },
    routing: {
      fallback: [defaultProvider],
      budgetUSDMonthly: 20
    },
    browser: {
      allowedDomains: ["localhost", "*.docs.*", "github.com", "stackoverflow.com"],
      headless: true
    }
  };
}