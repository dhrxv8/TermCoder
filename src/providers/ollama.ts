import { Provider, ChatMsg, ModelInfo, HealthStatus } from "./types.js";

export const ollamaProvider: Provider = {
  id: "ollama",
  name: "Ollama (Local)",
  maxContext: 128000,
  supportsTools: true,
  
  async chat(messages: ChatMsg[], { model, temperature = 0.2 }): Promise<string> {
    const baseUrl = "http://localhost:11434";
    
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.message?.content || "";
    } catch (error) {
      throw new Error("Ollama not running. Start with: ollama serve");
    }
  },
  
  async embed(texts: string[], { model }): Promise<number[][]> {
    const baseUrl = "http://localhost:11434";
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      try {
        const response = await fetch(`${baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: text })
        });
        
        if (!response.ok) {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        embeddings.push(data.embedding);
      } catch (error) {
        throw new Error(`Ollama embedding failed: ${error}`);
      }
    }
    
    return embeddings;
  },
  
  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "llama3.1:8b", type: "chat", context: 128000, costPer1kTokens: 0 },
      { id: "llama3.1:70b", type: "chat", context: 128000, costPer1kTokens: 0 },
      { id: "codellama:7b", type: "chat", context: 16000, costPer1kTokens: 0 },
      { id: "mxbai-embed-large", type: "embed", context: 512, costPer1kTokens: 0 }
    ];
  },
  
  async healthCheck(): Promise<HealthStatus> {
    // Ollama runs locally and doesn't need API keys
    // Return healthy with main chat models
    const models = ["llama3.1:8b", "llama3.1:70b", "codellama:7b"];
    return { 
      status: "healthy", 
      models 
    };
  },
  
  estimateCost(): number {
    return 0; // Local models are free
  }
};