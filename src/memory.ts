import { promises as fs } from "node:fs";

export async function ensureMemory(repo: string) {
  try { await fs.access(`${repo}/TERMCODE.md`); return; } catch {}
  const boiler = `# TermCode Memory\n\n## Project Goals\n- (add goals here)\n\n## Style & Conventions\n- (eslint/prettier/ruff versions, naming, patterns)\n\n## Domain Knowledge\n- (business rules, API contracts, data models)\n`;
  await fs.writeFile(`${repo}/TERMCODE.md`, boiler, "utf8");
}