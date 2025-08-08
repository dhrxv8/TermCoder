import Anthropic from "@anthropic-ai/sdk";
import { Provider, ChatMsg, ModelInfo } from "./types.js";
import { getProviderKey } from "../onboarding.js";

export const anthropicProvider: Provider = {
  id: "anthropic",
  name: "Anthropic",
  maxContext: 200000,
  supportsTools: true,
  
  async chat(messages: ChatMsg[], { model, temperature = 0.2, maxTokens }): Promise<string> {
    const key = await getProviderKey("anthropic");
    if (!key) {
      throw new Error("Anthropic key not set. Run /keys or restart to configure.");
    }
    
    const client = new Anthropic({ apiKey: key });
    
    // Separate system message from conversation
    const systemMessage = messages.find(m => m.role === "system")?.content;
    const conversationMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));
    
    const response = await client.messages.create({
      model,
      messages: conversationMessages,
      system: systemMessage,
      max_tokens: maxTokens || 4000,
      temperature
    });
    
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  },
  
  async embed(texts: string[], { model }): Promise<number[][]> {
    // Anthropic doesn't provide embeddings - fallback to OpenAI
    throw new Error("Anthropic doesn't provide embeddings. Use OpenAI or another provider for embeddings.");
  },
  
  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "claude-3-5-sonnet-20241022", type: "chat", context: 200000, costPer1kTokens: 0.003 },
      { id: "claude-3-5-haiku-20241022", type: "chat", context: 200000, costPer1kTokens: 0.00025 },
      { id: "claude-3-opus-20240229", type: "chat", context: 200000, costPer1kTokens: 0.015 }
    ];
  },
  
  estimateCost(tokens: number, model: string): number {
    const costs: Record<string, number> = {
      "claude-3-5-sonnet-20241022": 0.003,
      "claude-3-5-haiku-20241022": 0.00025,
      "claude-3-opus-20240229": 0.015
    };
    return (tokens / 1000) * (costs[model] || 0.003);
  }
};