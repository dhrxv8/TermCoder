import { Provider, ChatMsg, ModelInfo } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class MistralProvider implements Provider {
  id = "mistral" as const;
  name = "Mistral AI";
  supportsTools = true;
  maxContext = 128000;
  requiresKey = true;

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = await KeyStore.getProviderKey("mistral");
    if (!apiKey) {
      throw new Error("Mistral API key not found. Run 'termcode /keys' to add it.");
    }

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    const apiKey = await KeyStore.getProviderKey("mistral");
    if (!apiKey) {
      throw new Error("Mistral API key not found. Run 'termcode /keys' to add it.");
    }

    const response = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: opts.model,
        input: texts,
        encoding_format: "float"
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data.map((d: any) => d.embedding);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      // Chat models
      { id: "mistral-large-latest", type: "chat", context: 128000, costPer1kTokens: 0.008 },
      { id: "mistral-medium-latest", type: "chat", context: 32000, costPer1kTokens: 0.0027 },
      { id: "mistral-small-latest", type: "chat", context: 32000, costPer1kTokens: 0.001 },
      { id: "codestral-latest", type: "chat", context: 32000, costPer1kTokens: 0.001 },
      
      // Embedding models
      { id: "mistral-embed", type: "embed", context: 8192, costPer1kTokens: 0.0001 }
    ];
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const models = {
      "mistral-large-latest": 0.008,
      "mistral-medium-latest": 0.0027,
      "mistral-small-latest": 0.001,
      "codestral-latest": 0.001,
      "mistral-embed": 0.0001
    };

    const costPer1k = models[model as keyof typeof models] || 0.004;
    return (tokens / 1000) * costPer1k;
  }
}

export const mistralProvider = new MistralProvider();