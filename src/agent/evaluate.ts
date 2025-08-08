export function evaluateStep(stdout: string, stderr: string) {
  // TODO: basic heuristics for success/failure
  return { success: stderr.length === 0 };
}