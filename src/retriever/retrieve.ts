import { promises as fs } from "node:fs";
import path from "node:path";
import { RetrievalChunk } from "../util/types.js";

function dot(a: number[], b: number[]) {
  let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export async function retrieve(repo: string, queryEmbedding: number[], k = 12): Promise<RetrievalChunk[]> {
  const p = path.resolve(repo, ".termcode-index.json");
  const indexData = JSON.parse(await fs.readFile(p, "utf8"));
  
  // Handle both old format (array) and new format (object with chunks)
  const chunks = Array.isArray(indexData) ? indexData : indexData.chunks || [];
  
  // Filter chunks that have embeddings and calculate scores
  const chunksWithScores = chunks
    .filter((c: any) => c.embedding && Array.isArray(c.embedding))
    .map((c: any) => ({
      ...c,
      score: dot(c.embedding, queryEmbedding)
    }));
  
  chunksWithScores.sort((a: any, b: any) => b.score - a.score);
  return chunksWithScores.slice(0, k);
}