import { Provider, ChatMsg, ModelInfo } from "./types.js";

export class OllamaProvider implements Provider {
  id = "ollama" as const;
  name = "Ollama (Local)";
  supportsTools = true;
  maxContext = 128000;
  requiresKey = false;
  
  private baseUrl = "http://localhost:11434";

  async chat(messages: ChatMsg[], opts: { 
    model: string; 
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: opts.model,
          messages: messages,
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.7,
            num_predict: opts.maxTokens ?? 4000
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.message?.content || "";
    } catch (error) {
      throw new Error(`Ollama not running. Start it with: ollama serve`);
    }
  }

  async embed(texts: string[], opts: { model: string }): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: opts.model,
            prompt: text
          })
        });

        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }

        const data = await response.json();
        embeddings.push(data.embedding);
      } catch (error) {
        throw new Error(`Ollama not running or embedding model not available. Run: ollama pull ${opts.model}`);
      }
    }

    return embeddings;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error("Ollama not running");
      }

      const data = await response.json();
      const models: ModelInfo[] = [];

      for (const model of data.models || []) {
        // Determine if it's a chat or embedding model
        const isEmbedding = model.name.includes("embed") || model.name.includes("nomic");
        models.push({
          id: model.name,
          type: isEmbedding ? "embed" : "chat",
          context: 128000, // Default context window
          costPer1kTokens: 0 // Local models are free
        });
      }

      // Add some common models if none are installed
      if (models.length === 0) {
        models.push(
          { id: "llama3.1:8b", type: "chat", context: 128000, costPer1kTokens: 0 },
          { id: "llama3.1:70b", type: "chat", context: 128000, costPer1kTokens: 0 },
          { id: "codellama:7b", type: "chat", context: 16000, costPer1kTokens: 0 },
          { id: "mxbai-embed-large", type: "embed", context: 512, costPer1kTokens: 0 },
          { id: "nomic-embed-text", type: "embed", context: 8192, costPer1kTokens: 0 }
        );
      }

      return models;
    } catch (error) {
      // Return default models if Ollama is not running
      return [
        { id: "llama3.1:8b", type: "chat", context: 128000, costPer1kTokens: 0 },
        { id: "llama3.1:70b", type: "chat", context: 128000, costPer1kTokens: 0 },
        { id: "codellama:7b", type: "chat", context: 16000, costPer1kTokens: 0 },
        { id: "mxbai-embed-large", type: "embed", context: 512, costPer1kTokens: 0 },
        { id: "nomic-embed-text", type: "embed", context: 8192, costPer1kTokens: 0 }
      ];
    }
  }

  estimateCost(tokens: number, model: string, type: "chat" | "embed"): number {
    return 0; // Local models are free
  }
}

export const ollamaProvider = new OllamaProvider();