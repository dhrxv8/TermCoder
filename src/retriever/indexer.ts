import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RetrievalChunk } from "../util/types.js";
import { getProvider } from "../providers/index.js";
import { loadConfig } from "../state/config.js";

export async function buildIndex(repo: string, outPath = ".termcode-index.json") {
  const config = await loadConfig();
  if (!config) {
    throw new Error("No configuration found. Please run onboarding first.");
  }
  
  // Find a provider that supports embeddings
  let embedProvider;
  let embedModel;
  
  // Try current provider first
  try {
    embedProvider = getProvider(config.defaultProvider);
    embedModel = config.models[config.defaultProvider]?.embed;
    if (!embedModel) throw new Error("No embed model");
    // Test if provider supports embeddings
    await embedProvider.embed(["test"], { model: embedModel });
  } catch (e) {
    // Fallback to OpenAI
    try {
      embedProvider = getProvider("openai");
      embedModel = config.models.openai?.embed || "text-embedding-3-small";
    } catch (e2) {
      throw new Error("No embedding provider available. Please configure OpenAI or another provider that supports embeddings.");
    }
  }

  const files = await fg(["**/*"], { cwd: repo, dot: false, ignore: ["node_modules/**", ".git/**", "dist/**"] });
  const chunks: RetrievalChunk[] = [];
  
  for (const f of files) {
    const full = path.resolve(repo, f);
    let text = "";
    try { text = await fs.readFile(full, "utf8"); } catch { continue; }
    const lines = text.split("\n");
    
    for (let i = 0; i < lines.length; i += 200) {
      const slice = lines.slice(i, i + 200).join("\n");
      try {
        const embeddings = await embedProvider.embed([slice], { model: embedModel });
        (chunks as any).push({ 
          file: f, 
          start: i + 1, 
          end: Math.min(i + 200, lines.length), 
          text: slice, 
          embedding: embeddings[0] 
        });
      } catch (e) {
        console.warn(`Failed to embed chunk from ${f}:${i + 1}, skipping`);
      }
    }
  }
  
  await fs.writeFile(path.resolve(repo, outPath), JSON.stringify(chunks), "utf8");
}

