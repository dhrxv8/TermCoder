import { Provider, ChatMsg, ModelInfo } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class CohereProvider implements Provider {
  id = "cohere" as const;
  name = "Cohere";
  supportsTools = true;
  maxContext = 128000;
  requiresKey = true;

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const apiKey = await KeyStore.getProviderKey("cohere");
    if (!apiKey) {
      throw new Error("Cohere API key not found. Run 'termcode /keys' to add it.");
    }

    // Convert messages to Cohere chat format
    const chatHistory = messages.slice(0, -1).map(m => ({
      role: m.role === "system" ? "SYSTEM" : m.role === "user" ? "USER" : "CHATBOT",
      message: m.content
    }));

    const lastMessage = messages[messages.length - 1];

    const response = await fetch("https://api.cohere.ai/v1/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: opts.model,
        message: lastMessage.content,
        chat_history: chatHistory,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4000
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || "";
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    const apiKey = await KeyStore.getProviderKey("cohere");
    if (!apiKey) {
      throw new Error("Cohere API key not found. Run 'termcode /keys' to add it.");
    }

    const response = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: opts.model,
        texts: texts,
        input_type: "search_document"
      })
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      // Chat models
      { id: "command-r-plus", type: "chat", context: 128000, costPer1kTokens: 0.003 },
      { id: "command-r", type: "chat", context: 128000, costPer1kTokens: 0.0005 },
      { id: "command", type: "chat", context: 4096, costPer1kTokens: 0.001 },
      
      // Embedding models
      { id: "embed-english-v3.0", type: "embed", context: 512, costPer1kTokens: 0.0001 },
      { id: "embed-multilingual-v3.0", type: "embed", context: 512, costPer1kTokens: 0.0001 }
    ];
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    const models = {
      "command-r-plus": 0.003,
      "command-r": 0.0005,
      "command": 0.001,
      "embed-english-v3.0": 0.0001,
      "embed-multilingual-v3.0": 0.0001
    };

    const costPer1k = models[model as keyof typeof models] || 0.002;
    return (tokens / 1000) * costPer1k;
  }
}

export const cohereProvider = new CohereProvider();