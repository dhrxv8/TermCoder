import { promises as fs } from "node:fs";
import path from "node:path";
import { RetrievalChunk } from "../util/types.js";

function dot(a: number[], b: number[]) {
  let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

export async function retrieve(repo: string, queryEmbedding: number[], k = 12): Promise<RetrievalChunk[]> {
  const p = path.resolve(repo, ".termcode-index.json");
  const raw = JSON.parse(await fs.readFile(p, "utf8"));
  for (const c of raw) c.score = dot(c.embedding, queryEmbedding);
  raw.sort((a: any, b: any) => b.score - a.score);
  return raw.slice(0, k);
}