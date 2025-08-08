import { Provider, ProviderId } from "./types.js";
import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import { xaiProvider } from "./xai.js";
import { googleProvider } from "./google.js";
import { mistralProvider } from "./mistral.js";
import { cohereProvider } from "./cohere.js";
import { ollamaProvider } from "./ollama.js";

export const registry: Record<ProviderId, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  xai: xaiProvider,
  google: googleProvider,
  mistral: mistralProvider,
  cohere: cohereProvider,
  ollama: ollamaProvider,
};

export function getProvider(id: ProviderId): Provider {
  const provider = registry[id];
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

export function listAvailableProviders(): Provider[] {
  return Object.values(registry);
}

// Re-export types and providers for convenience
export * from "./types.js";
export { 
  openaiProvider,
  anthropicProvider, 
  xaiProvider,
  googleProvider,
  mistralProvider,
  cohereProvider,
  ollamaProvider
};