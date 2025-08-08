import OpenAI from "openai";
import { Provider, ChatMsg, ModelInfo, HealthStatus } from "./types.js";
import { getProviderKey } from "../onboarding.js";

export const openaiProvider: Provider = {
  id: "openai",
  name: "OpenAI",
  maxContext: 128000,
  supportsTools: true,
  
  async chat(messages: ChatMsg[], { model, temperature = 0.2, maxTokens }): Promise<string> {
    const key = await getProviderKey("openai");
    if (!key) {
      throw new Error("OpenAI key not set. Run /keys or restart to configure.");
    }
    
    const client = new OpenAI({ apiKey: key });
    const res = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    });
    
    return res.choices[0]?.message?.content || "";
  },
  
  async embed(texts: string[], { model }): Promise<number[][]> {
    const key = await getProviderKey("openai");
    if (!key) {
      throw new Error("OpenAI key not set. Run /keys or restart to configure.");
    }
    
    const client = new OpenAI({ apiKey: key });
    const res = await client.embeddings.create({
      model,
      input: texts,
      encoding_format: "float"
    });
    
    return res.data.map(d => d.embedding);
  },
  
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
  },
  
  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    
    try {
      const key = await getProviderKey("openai");
      if (!key) {
        return { 
          status: "error", 
          error: "No API key configured" 
        };
      }
      
      const client = new OpenAI({ apiKey: key });
      
      // Simple test request to check API availability
      await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        temperature: 0
      });
      
      const latency = Date.now() - start;
      const models = (await this.listModels()).filter(m => m.type === "chat").map(m => m.id);
      
      return {
        status: "healthy",
        latency,
        models
      };
      
    } catch (error: any) {
      const latency = Date.now() - start;
      let status: "degraded" | "error" = "error";
      
      // Distinguish between rate limits (degraded) vs auth errors (error)
      if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        status = "degraded";
      }
      
      return {
        status,
        latency,
        error: error.message || "Unknown error"
      };
    }
  },
  
  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const costs: Record<string, number> = {
      "gpt-4o": 0.005,
      "gpt-4o-mini": 0.00015,
      "gpt-4-turbo": 0.01,
      "gpt-4": 0.03,
      "gpt-3.5-turbo": 0.001,
      "text-embedding-3-large": 0.00013,
      "text-embedding-3-small": 0.00002,
      "text-embedding-ada-002": 0.0001
    };
    
    const costPer1k = costs[model] || (type === "chat" ? 0.01 : 0.0001);
    return (tokens / 1000) * costPer1k;
  }
};