import { Provider, ProviderId } from "./types.js";
import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import { ollamaProvider } from "./ollama.js";

// Start with core providers - others can be added later
export const registry: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider
  // TODO: Add xai, google, mistral, cohere providers
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