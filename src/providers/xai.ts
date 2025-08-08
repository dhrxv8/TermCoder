import { Provider, ChatMsg, ModelInfo, HealthStatus } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class XAIProvider implements Provider {
  id = "xai" as const;
  name = "xAI";
  supportsTools = true;
  maxContext = 131072;
  requiresKey = true;

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = await KeyStore.getProviderKey("xai");
    if (!apiKey) {
      throw new Error("xAI API key not found. Run 'termcode /keys' to add it.");
    }

    // xAI uses OpenAI-compatible API
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: opts.model,
        messages: messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4000
      })
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    throw new Error("xAI doesn't provide embedding models. Use OpenAI or another provider for embeddings.");
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "grok-beta", type: "chat", context: 131072, costPer1kTokens: 0.005 },
      { id: "grok-vision-beta", type: "chat", context: 8192, costPer1kTokens: 0.01 }
    ];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const apiKey = await KeyStore.getProviderKey("xai");
      if (!apiKey) {
        return { 
          status: "error", 
          error: "No API key configured" 
        };
      }
      
      // Return healthy with main models
      const models = ["grok-beta", "grok-vision-beta"];
      return { 
        status: "healthy", 
        models 
      };
    } catch (error: any) {
      return { 
        status: "error", 
        error: error.message 
      };
    }
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const models = {
      "grok-beta": 0.005,
      "grok-vision-beta": 0.01
    };

    const costPer1k = models[model as keyof typeof models] || 0.005;
    return (tokens / 1000) * costPer1k;
  }
}

export const xaiProvider = new XAIProvider();