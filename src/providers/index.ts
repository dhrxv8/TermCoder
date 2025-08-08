import { Provider, ProviderId } from "./types.js";
import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import { ollamaProvider } from "./ollama.js";
import { xaiProvider } from "./xai.js";
import { googleProvider } from "./google.js";
import { mistralProvider } from "./mistral.js";
import { cohereProvider } from "./cohere.js";

// Complete multi-provider registry
export const registry: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  xai: xaiProvider,
  google: googleProvider,
  mistral: mistralProvider,
  cohere: cohereProvider,
  ollama: ollamaProvider
};

export function getProvider(id: string): Provider {
  const provider = registry[id];
  if (!provider) {
    throw new Error(`Provider '${id}' not found. Available: ${Object.keys(registry).join(", ")}`);
  }
  return provider;
}

export function listProviders(): Provider[] {
  return Object.values(registry);
}

// Re-export types
export * from "./types.js";