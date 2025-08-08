import OpenAI from "openai";
import { Provider, ChatMsg, ModelInfo } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class OpenAIProvider implements Provider {
  id = "openai" as const;
  name = "OpenAI";
  supportsTools = true;
  maxContext = 128000;
  requiresKey = true;
  
  private client: OpenAI | null = null;

  private async getClient(): Promise<OpenAI> {
    if (!this.client) {
      const apiKey = await KeyStore.getProviderKey("openai");
      if (!apiKey) {
        throw new Error("OpenAI API key not found. Run 'termcode /keys' to add it.");
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const client = await this.getClient();
    
    const response = await client.chat.completions.create({
      model: opts.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4000
    });

    return response.choices[0]?.message?.content || "";
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    const client = await this.getClient();
    
    const response = await client.embeddings.create({
      model: opts.model,
      input: texts,
      encoding_format: "float"
    });

    return response.data.map(d => d.embedding);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      // Chat models
      { id: "gpt-4o", type: "chat", context: 128000, costPer1kTokens: 0.005 },
      { id: "gpt-4o-mini", type: "chat", context: 128000, costPer1kTokens: 0.00015 },
      { id: "gpt-4-turbo", type: "chat", context: 128000, costPer1kTokens: 0.01 },
      { id: "gpt-4", type: "chat", context: 8192, costPer1kTokens: 0.03 },
      { id: "gpt-3.5-turbo", type: "chat", context: 16384, costPer1kTokens: 0.001 },
      
      // Embedding models  
      { id: "text-embedding-3-large", type: "embed", context: 8192, costPer1kTokens: 0.00013 },
      { id: "text-embedding-3-small", type: "embed", context: 8192, costPer1kTokens: 0.00002 },
      { id: "text-embedding-ada-002", type: "embed", context: 8192, costPer1kTokens: 0.0001 }
    ];
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const models = {
      // Chat models (per 1k tokens)
      "gpt-4o": 0.005,
      "gpt-4o-mini": 0.00015,
      "gpt-4-turbo": 0.01,
      "gpt-4": 0.03,
      "gpt-3.5-turbo": 0.001,
      
      // Embedding models (per 1k tokens)
      "text-embedding-3-large": 0.00013,
      "text-embedding-3-small": 0.00002,
      "text-embedding-ada-002": 0.0001
    };

    const costPer1k = models[model as keyof typeof models] || 0.01; // Default fallback
    return (tokens / 1000) * costPer1k;
  }
}

export const openaiProvider = new OpenAIProvider();