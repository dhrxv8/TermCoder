export function systemPrompt(memory: string) {
  return `You are a cautious coding agent. Always propose a plan, identify exact files to change, and output ONLY unified diffs inside \n\n\n---BEGIN DIFF---\n<diff>\n---END DIFF---\n\n\n. Use minimal changes and add unit tests. Follow repo conventions in the Memory file. Ask for clarification if requirements are ambiguous.`;
}

export function userPrompt(task: string, retrieved: { file: string; start: number; end: number; text: string }[]) {
  const ctx = retrieved.map(r => `FILE: ${r.file} [${r.start}-${r.end}]\n${r.text}`).join("\n\n");
  return `TASK: ${task}\n\nCONTEXT:\n${ctx}`;
}