import { GoogleGenerativeAI } from "@google/generative-ai";
import { Provider, ChatMsg, ModelInfo, HealthStatus } from "./types.js";
import { KeyStore } from "../state/keystore.js";

export class GoogleProvider implements Provider {
  id = "google" as const;
  name = "Google";
  supportsTools = true;
  maxContext = 2000000;
  requiresKey = true;
  
  private client: GoogleGenerativeAI | null = null;

  private async getClient(): Promise<GoogleGenerativeAI> {
    if (!this.client) {
      const apiKey = await KeyStore.getProviderKey("google");
      if (!apiKey) {
        throw new Error("Google API key not found. Run 'termcode /keys' to add it.");
      }
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const client = await this.getClient();
    const model = client.getGenerativeModel({ model: opts.model });
    
    // Convert messages to Google format
    const systemMessage = messages.find(m => m.role === "system")?.content;
    const conversationMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    const chat = model.startChat({
      history: conversationMessages.slice(0, -1),
      systemInstruction: systemMessage,
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxTokens ?? 4000
      }
    });

    const lastMessage = conversationMessages[conversationMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    
    return result.response.text();
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    const client = await this.getClient();
    const model = client.getGenerativeModel({ model: opts.model });
    
    const embeddings: number[][] = [];
    for (const text of texts) {
      const result = await model.embedContent(text);
      embeddings.push(result.embedding.values);
    }
    
    return embeddings;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      // Chat models
      { id: "gemini-1.5-pro", type: "chat", context: 2000000, costPer1kTokens: 0.00125 },
      { id: "gemini-1.5-flash", type: "chat", context: 1000000, costPer1kTokens: 0.000075 },
      { id: "gemini-1.0-pro", type: "chat", context: 30720, costPer1kTokens: 0.0005 },
      
      // Embedding models
      { id: "text-embedding-004", type: "embed", context: 2048, costPer1kTokens: 0.00001 },
      { id: "embedding-001", type: "embed", context: 2048, costPer1kTokens: 0.00001 }
    ];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const apiKey = await KeyStore.getProviderKey("google");
      if (!apiKey) {
        return { 
          status: "error", 
          error: "No API key configured" 
        };
      }
      
      // Return healthy with main chat models
      const models = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"];
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
      "gemini-1.5-pro": 0.00125,
      "gemini-1.5-flash": 0.000075,
      "gemini-1.0-pro": 0.0005,
      "text-embedding-004": 0.00001,
      "embedding-001": 0.00001
    };

    const costPer1k = models[model as keyof typeof models] || 0.001; // Default fallback
    return (tokens / 1000) * costPer1k;
  }
}

export const googleProvider = new GoogleProvider();