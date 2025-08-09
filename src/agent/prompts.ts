export function systemPrompt(memory: string) {
  return `You are a cautious coding agent. Always propose a plan, identify exact files to change, and output ONLY unified diffs inside \n\n\n---BEGIN DIFF---\n<diff>\n---END DIFF---\n\n\n. Use minimal changes and add unit tests. Follow repo conventions in the Memory file. Ask for clarification if requirements are ambiguous.`;
}

export function userPrompt(task: string, retrieved: { file: string; start: number; end: number; text: string }[]) {
  const ctx = retrieved.map(r => `FILE: ${r.file} [${r.start}-${r.end}]\n${r.text}`).join("\n\n");
  return `TASK: ${task}\n\nCONTEXT:\n${ctx}`;
}

// Test failure explanation prompt
export function testFailurePrompt(
  testOutput: string, 
  failingTests: string[], 
  projectContext: string = ""
): string {
  return `Given this failing test output, identify the root cause and provide a minimal fix strategy.

**Test Output:**
\`\`\`
${testOutput}
\`\`\`

**Failing Tests:**
${failingTests.map(test => `- ${test}`).join('\n')}

**Project Context:**
${projectContext}

Please provide:
1. **Root Cause**: What is the underlying issue causing the test failures?
2. **Fix Strategy**: What minimal changes are needed to fix this?
3. **Files to Check**: Which files likely need modification?
4. **Risk Assessment**: Any potential side effects of the fix?

Keep the response concise and actionable. Focus on the most likely cause and straightforward solution.`;
}

// Human-readable change summary prompt
export function humanSummaryPrompt(diff: string, files: string[]): string {
  return `Summarize the proposed changes in plain language for a non-technical audience.

**Files Changed:**
${files.map(f => `- ${f}`).join('\n')}

**Diff:**
\`\`\`diff
${diff}
\`\`\`

Provide a brief, clear explanation of:
1. What functionality is being added, removed, or modified
2. Why these changes matter to the user experience
3. Any potential impacts users should be aware of

Use simple language and avoid technical jargon. Aim for 2-3 sentences maximum.`;
}

// Commit message generator prompt
export function commitPrompt(diff: string, files: string[]): string {
  return `Create a concise conventional commit message for these changes.

**Files Changed:**
${files.map(f => `- ${f}`).join('\n')}

**Diff:**
\`\`\`diff
${diff}
\`\`\`

Generate a commit message following this format:
- Title: <type>(<scope>): <description> (≤50 chars)
- Body: Brief explanation if needed (≤72 chars per line)

Types: feat, fix, docs, style, refactor, test, chore
Be specific and actionable. Focus on the "why" not just the "what".`;
}