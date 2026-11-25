import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  getDevaiOllamaStatus as inspectOllama,
  getOllamaMemory,
  isDevaiOllamaEnabled,
  minimumOllamaHeadroomBytes,
} from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger.js";

let starting: Promise<void> | null = null;
let nextAttemptAt = 0;

async function recoverOllama() {
  if (starting) return starting;
  if (process.env.NODE_ENV !== "development" || !isDevaiOllamaEnabled() || Date.now() < nextAttemptAt) return;
  starting = (async () => {
    const memory = await getOllamaMemory();
    if (!memory || memory.availableBytes < minimumOllamaHeadroomBytes()) return;
    nextAttemptAt = Date.now() + 60_000;
    const child = spawn("ollama", ["serve"], {
      stdio: "inherit",
      env: {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_MODELS: process.env.OLLAMA_MODELS || path.join(os.homedir(), ".ollama", "models"),
        OLLAMA_NUM_PARALLEL: "1",
        OLLAMA_MAX_LOADED_MODELS: "1",
        OLLAMA_KEEP_ALIVE: "30s",
        OLLAMA_CONTEXT_LENGTH: "8192",
      },
    });
    const onExit = () => { child.kill("SIGTERM"); };
    process.once("exit", onExit);
    child.on("error", error => {
      process.removeListener("exit", onExit);
      logger.warn({ error: error.message }, "Local Ollama could not start");
    });
    child.on("exit", (code, signal) => {
      process.removeListener("exit", onExit);
      logger.info({ code, signal }, "Local Ollama stopped");
    });
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      if ((await inspectOllama()).reachable) return;
    }
  })().finally(() => { starting = null; });
  return starting;
}

/** Re-check on demand after transient startup pressure, without restarting the API. */
export async function getApiOllamaStatus(model?: string) {
  let status = await inspectOllama(model);
  if (status.enabled && !status.reachable && status.memory
    && status.memory.availableBytes >= status.minimumModelHeadroomBytes) {
    await recoverOllama();
    status = await inspectOllama(model);
  }
  return status;
}

// Bounded boot retries remain useful, but requests can recover later too.
if (process.env.NODE_ENV === "development" && isDevaiOllamaEnabled()) {
  const bootAttempt = (attempt: number) => {
    const timer = setTimeout(async () => {
      try {
        const status = await getApiOllamaStatus();
        if (!status.reachable && attempt < 4) bootAttempt(attempt + 1);
      } catch (error) {
        logger.warn({ error: String(error) }, "Local Ollama startup check failed");
        if (attempt < 4) bootAttempt(attempt + 1);
      }
    }, attempt === 0 ? 5_000 : 15_000);
    timer.unref();
  };
  bootAttempt(0);
}
