import Anthropic from "@anthropic-ai/sdk";
import { Provider, ChatMsg, ModelInfo } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class AnthropicProvider implements Provider {
  id = "anthropic" as const;
  name = "Anthropic";
  supportsTools = true;
  maxContext = 200000;
  requiresKey = true;
  
  private client: Anthropic | null = null;

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const apiKey = await KeyStore.getProviderKey("anthropic");
      if (!apiKey) {
        throw new Error("Anthropic API key not found. Run 'termcode /keys' to add it.");
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const client = await this.getClient();
    
    // Convert messages to Anthropic format
    const systemMessage = messages.find(m => m.role === "system")?.content;
    const conversationMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    const response = await client.messages.create({
      model: opts.model,
      messages: conversationMessages,
      system: systemMessage,
      max_tokens: opts.maxTokens ?? 4000,
      temperature: opts.temperature ?? 0.7
    });

    return response.content[0]?.type === "text" ? response.content[0].text : "";
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    // Anthropic doesn't provide embeddings, fallback to OpenAI for now
    // In a real implementation, you might use a different service or throw an error
    throw new Error("Anthropic doesn't provide embedding models. Use OpenAI or another provider for embeddings.");
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      // Chat models
      { id: "claude-3-5-sonnet-20241022", type: "chat", context: 200000, costPer1kTokens: 0.003 },
      { id: "claude-3-5-haiku-20241022", type: "chat", context: 200000, costPer1kTokens: 0.00025 },
      { id: "claude-3-opus-20240229", type: "chat", context: 200000, costPer1kTokens: 0.015 },
      { id: "claude-3-sonnet-20240229", type: "chat", context: 200000, costPer1kTokens: 0.003 },
      { id: "claude-3-haiku-20240307", type: "chat", context: 200000, costPer1kTokens: 0.00025 }
    ];
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const models = {
      "claude-3-5-sonnet-20241022": 0.003,
      "claude-3-5-haiku-20241022": 0.00025,
      "claude-3-opus-20240229": 0.015,
      "claude-3-sonnet-20240229": 0.003,
      "claude-3-haiku-20240307": 0.00025
    };

    const costPer1k = models[model as keyof typeof models] || 0.003; // Default fallback
    return (tokens / 1000) * costPer1k;
  }
}

export const anthropicProvider = new AnthropicProvider();