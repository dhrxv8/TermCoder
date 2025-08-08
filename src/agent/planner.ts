import { systemPrompt, userPrompt } from "./prompts.js";
import { retrieve } from "../retriever/retrieve.js";
import { buildIndex } from "../retriever/indexer.js";
import { applyUnifiedDiff } from "./diff.js";
import { commitAll } from "../tools/git.js";
import { logSession } from "../util/sessionLog.js";
import { log } from "../util/logging.js";
import { getProvider, ProviderId } from "../providers/index.js";
import { loadConfig } from "../state/config.js";

export async function runTask(repo: string, task: string, dry = false, model?: string, branchName?: string, providerId?: string) {
  // 1) Ensure index exists (very naive check)
  try { await buildIndex(repo); } catch (e) { log.warn("index build failed:", e); }

  // 2) Load config and get providers
  const config = await loadConfig();
  if (!config) {
    log.error("No configuration found. Please run onboarding.");
    return;
  }
  
  const currentProvider = providerId || config.defaultProvider;
  const provider = getProvider(currentProvider);
  const chatModel = model || config.models[currentProvider]?.chat;
  
  if (!chatModel) {
    log.error(`No chat model configured for provider ${currentProvider}`);
    return;
  }
  
  // 3) Make a query embedding and retrieve
  let chunks: any[] = [];
  try {
    // Try to get embeddings for better context retrieval
    const embedModel = config.models[currentProvider]?.embed || config.models.openai?.embed || "text-embedding-3-small";
    let embedProvider = provider;
    
    // Fallback to OpenAI for embeddings if current provider doesn't support them
    if (currentProvider !== "openai" && !config.models[currentProvider]?.embed && config.models.openai) {
      embedProvider = getProvider("openai");
    }
    
    const qEmb = await embedProvider.embed([task], { model: embedModel });
    chunks = await retrieve(repo, qEmb[0], 10);
  } catch (e) {
    log.warn("Embedding/retrieval failed, proceeding without context:", e);
  }

  // 4) Get memory file if present
  let memory = "";
  try { memory = (await import("node:fs/promises")).readFile(`${repo}/TERMCODE.md`, "utf8").then(String) as any; } catch {}

  // 5) Ask model for a plan + diff
  const sys = systemPrompt(String(memory || ""));
  const usr = userPrompt(task, chunks);
  
  const messages = [
    { role: "system" as const, content: sys },
    { role: "user" as const, content: usr }
  ];
  
  const out = await provider.chat(messages, {
    model: chatModel,
    temperature: 0.2
  });

  // 5) Extract unified diff
  const m = out.match(/---BEGIN DIFF---\n([\s\S]*?)\n---END DIFF---/);
  if (!m) {
    log.error("No diff block returned by model. Output:\n", out);
    return;
  }
  const diff = m[1];
  if (dry) {
    console.log("\n===== PROPOSED DIFF (dry-run) =====\n" + diff);
    return;
  }

  // 6) Apply diff
  const { applied, rejected } = await applyUnifiedDiff(repo, diff);
  log.info("Applied:", applied);
  if (rejected.length) log.warn("Rejected:", rejected);

  // 7) Commit changes
  if (!dry && applied.length > 0) {
    const commit = commitAll(repo, `termcode: ${task}`);
    if (!commit.ok) log.warn("Commit failed:", (commit as any).error);
    else log.info("Changes committed");
  }

  // 8) Log session
  if (branchName) {
    await logSession(repo, {
      timestamp: new Date().toISOString(),
      branchName,
      task,
      diff,
      applied,
      rejected,
      model: chatModel
    });
  }

  return { applied, rejected };
}