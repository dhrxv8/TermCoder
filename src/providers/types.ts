export type ChatMsg = { 
  role: "system" | "user" | "assistant"; 
  content: string;
};

export interface ModelInfo {
  id: string;
  type: "chat" | "embed";
  context: number;
  costPer1kTokens?: number;
}

export interface Provider {
  id: "openai" | "anthropic" | "xai" | "google" | "mistral" | "cohere" | "ollama";
  name: string;
  supportsTools: boolean;
  maxContext: number;
  requiresKey: boolean;

  // Chat completion
  chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;

  // Embeddings
  embed(texts: string[], opts: { model: string }): Promise<number[][]>;

  // Model list (for picker)
  listModels(): Promise<ModelInfo[]>;

  // Cost estimation
  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number;
}

export interface ProviderConfig {
  chat: string;
  embed?: string;
}

export interface TermCodeConfig {
  defaultProvider: ProviderId;
  models: Record<string, ProviderConfig>;
  tools: {
    shell: boolean;
    git: boolean;
    tests: "auto" | "on" | "off";
    browser: boolean;
  };
  routing: {
    fallback: ProviderId[];
    budgetUSDMonthly: number;
  };
  browser?: {
    allowedDomains: string[];
    headless: boolean;
  };
}

export type ProviderId = "openai" | "anthropic" | "xai" | "google" | "mistral" | "cohere" | "ollama";

export const PROVIDERS: ProviderId[] = ["openai", "anthropic", "xai", "google", "mistral", "cohere", "ollama"];