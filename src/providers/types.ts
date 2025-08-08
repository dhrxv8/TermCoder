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

export interface HealthStatus {
  status: "healthy" | "degraded" | "error";
  latency?: number;
  error?: string;
  models?: string[];
}

export interface Provider {
  id: string;
  name: string;
  maxContext: number;
  supportsTools: boolean;
  
  // Core methods
  chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number; 
    maxTokens?: number;
  }): Promise<string>;
  
  embed(texts: string[], opts: { 
    model: string; 
  }): Promise<number[][]>;
  
  listModels(): Promise<ModelInfo[]>;
  
  // Health check
  healthCheck(): Promise<HealthStatus>;
  
  // Cost estimation
  estimateCost?(tokens: number, model: string, type: "chat" | "embed"): number;
}

export type ProviderId = "openai" | "anthropic" | "xai" | "google" | "mistral" | "cohere" | "ollama";