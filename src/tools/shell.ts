import { spawn } from "node:child_process";
import { CFG } from "../config.js";
import { ToolResult } from "../util/types.js";

export async function runShell(cmd: string[], cwd: string): Promise<ToolResult<{ code: number; stdout: string; stderr: string }>> {
  if (cmd.length === 0) return { ok: false, error: "Empty command" };
  const bin = cmd[0];
  if (!CFG.ALLOW_COMMANDS.includes(bin)) {
    return { ok: false, error: `Command not allowed: ${bin}` };
  }
  return new Promise((resolve) => {
    const child = spawn(bin, cmd.slice(1), { cwd, shell: false });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, error: `Timeout after ${CFG.SHELL_TIMEOUT_MS}ms` });
    }, CFG.SHELL_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: true, data: { code: code ?? -1, stdout, stderr } });
    });
  });
}