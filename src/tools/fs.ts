import { promises as fs } from "node:fs";
import path from "node:path";
import { ToolResult } from "../util/types.js";

export async function readFileSafe(root: string, rel: string): Promise<ToolResult<string>> {
  try {
    const full = path.resolve(root, rel);
    const data = await fs.readFile(full, "utf8");
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function writeFileSafe(root: string, rel: string, content: string): Promise<ToolResult<void>> {
  try {
    const full = path.resolve(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
    return { ok: true, data: undefined };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}