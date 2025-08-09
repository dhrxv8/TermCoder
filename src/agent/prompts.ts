export function systemPrompt(memory: string) {
  return `You are a coding agent that helps implement features and fix issues. You must ALWAYS end your response with a unified diff block.

IMPORTANT: Your response must include exactly this format at the end:

---BEGIN DIFF---
diff --git a/path/to/file.ext b/path/to/file.ext
index 1234567..abcdefg 100644
--- a/path/to/file.ext
+++ b/path/to/file.ext
@@ -1,3 +1,4 @@
 existing line
-line to remove
+line to add
+another line to add
 another existing line
---END DIFF---

Rules:
1. First, briefly explain what you'll implement
2. ALWAYS end with a valid unified diff between ---BEGIN DIFF--- and ---END DIFF---
3. Make minimal, focused changes
4. Follow existing code style and patterns
5. If the task is unclear, make a reasonable interpretation and implement something useful

Memory/Context from TERMCODE.md:
${memory || "No specific context provided"}

Remember: You MUST end with a diff block, even for simple tasks.`;
}

export function userPrompt(task: string, retrieved: { file: string; start: number; end: number; text: string }[]) {
  let contextSection = "";
  
  if (retrieved.length > 0) {
    const ctx = retrieved.map(r => `FILE: ${r.file} [${r.start}-${r.end}]\n${r.text}`).join("\n\n");
    contextSection = `\n\nRELEVANT CODE CONTEXT:\n${ctx}`;
  } else {
    contextSection = `\n\nNOTE: No specific code context was retrieved. You can create new files or make general improvements.`;
  }
  
  return `TASK: ${task}${contextSection}

Please implement this task. Remember to end your response with a unified diff block between ---BEGIN DIFF--- and ---END DIFF---.`;
}