import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  devaiModel,
  devaiOllamaAccessHeaders,
  devaiOllamaRemote,
  devaiOllamaServerUrl,
  getDevaiOllamaStatus as inspectOllama,
  getOllamaMemory,
  isDevaiOllamaEnabled,
  minimumOllamaHeadroomBytes,
  oraModel,
  exactOllamaTag,
} from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger.js";

const OLLAMA_HOST = "127.0.0.1:11434";
const OLLAMA_STARTUP_TIMEOUT_MS = 20_000;
const OLLAMA_PULL_TIMEOUT_MS = 20 * 60 * 1000;
const OLLAMA_MODEL_DISK_RESERVE_BYTES = 4 * 1024 ** 3;
const OLLAMA_RETRY_DELAY_MS = 60_000;
const OLLAMA_MEMORY_RETRY_DELAY_MS = 15_000;
const requiredModels = [...new Set([devaiModel, oraModel])];

let starting: Promise<boolean> | null = null;
let provisioning: Promise<void> | null = null;
let ollamaProcess: ChildProcess | null = null;
let nextAttemptAt = 0;
let nextProvisionAttemptAt = 0;
let provisionRetryDelayMs = OLLAMA_RETRY_DELAY_MS;
const modelReadiness = new Map<string, boolean>();
let providerHealth: "starting" | "healthy" | "degraded" =
  isDevaiOllamaEnabled() ? "starting" : "degraded";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function recordModelReadiness(model: string, ready: boolean): void {
  modelReadiness.set(exactOllamaTag(model), ready);
  if (requiredModels.every(tag => modelReadiness.get(exactOllamaTag(tag)) === true)) {
    providerHealth = "healthy";
  } else if ([...modelReadiness.values()].some(value => !value)) {
    providerHealth = "degraded";
  }
}

async function refreshProviderReadiness(): Promise<void> {
  const statuses = await Promise.all(requiredModels.map(async model => ({
    model,
    status: await inspectOllama(model),
  })));
  for (const { model, status } of statuses) recordModelReadiness(model, status.ready);
}

export function getLocalOllamaProviderHealth(): "starting" | "healthy" | "degraded" | null {
  return isDevaiOllamaEnabled() ? providerHealth : null;
}

async function getInstalledModels(): Promise<Set<string> | null> {
  try {
    const response = await fetch(`${devaiOllamaServerUrl}/api/tags`, {
      headers: devaiOllamaAccessHeaders(),
      signal: AbortSignal.timeout(devaiOllamaRemote ? 5000 : 1800),
    });
    if (!response.ok) return null;
    const data = await response.json() as { models?: Array<{ name?: string }> };
    return new Set((data.models ?? []).map(item => item.name).filter((name): name is string => Boolean(name)).map(exactOllamaTag));
  } catch {
    return null;
  }
}

async function waitForOllama(): Promise<boolean> {
  const deadline = Date.now() + OLLAMA_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await getInstalledModels()) return true;
    await wait(500);
  }
  return false;
}

async function getModelDiskAvailableBytes(): Promise<number | null> {
  const modelsDir = process.env.OLLAMA_MODELS || path.join(os.homedir(), ".ollama", "models");
  try {
    await mkdir(modelsDir, { recursive: true });
    const stats = await statfs(modelsDir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

async function ensureModelsInstalled(): Promise<void> {
  if (devaiOllamaRemote) return;
  if (provisioning || Date.now() < nextProvisionAttemptAt) return provisioning ?? undefined;
  provisioning = (async () => {
    provisionRetryDelayMs = OLLAMA_RETRY_DELAY_MS;
    for (const model of requiredModels) {
      const installed = await getInstalledModels();
      if (!installed) throw new Error("Ollama became unreachable while checking installed models.");
      if (installed.has(exactOllamaTag(model))) continue;

      const memory = await getOllamaMemory();
      if (!memory || memory.availableBytes < minimumOllamaHeadroomBytes()) {
        provisionRetryDelayMs = OLLAMA_MEMORY_RETRY_DELAY_MS;
        logger.warn(
          { model, availableGiB: memory ? Number((memory.availableBytes / 1024 ** 3).toFixed(1)) : null },
          "Ollama model download paused because safe VM memory headroom is unavailable",
        );
        return;
      }

      const diskAvailable = await getModelDiskAvailableBytes();
      if (diskAvailable === null || diskAvailable < OLLAMA_MODEL_DISK_RESERVE_BYTES) {
        logger.warn(
          { model, availableGiB: diskAvailable === null ? null : Number((diskAvailable / 1024 ** 3).toFixed(1)) },
          "Ollama model download paused because safe VM disk space is unavailable",
        );
        return;
      }

      logger.info({ model }, "Ollama is downloading the configured local model");
      const response = await fetch(`${devaiOllamaServerUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model, stream: false }),
        signal: AbortSignal.timeout(OLLAMA_PULL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Ollama model download failed with HTTP ${response.status}.`);
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (result.error) throw new Error("Ollama reported a model download error.");

      const afterPull = await getInstalledModels();
      if (!afterPull?.has(exactOllamaTag(model))) {
        throw new Error("Ollama completed a model download without registering the requested tag.");
      }
      logger.info({ model }, "Ollama local model is installed");
    }
    await refreshProviderReadiness();
  })()
    .catch(error => {
      providerHealth = "degraded";
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Ollama model provisioning failed; it will retry later");
    })
    .finally(() => {
      nextProvisionAttemptAt = Date.now() + provisionRetryDelayMs;
      provisionRetryDelayMs = OLLAMA_RETRY_DELAY_MS;
      provisioning = null;
    });
  return provisioning;
}

async function recoverOllama(): Promise<boolean> {
  if (devaiOllamaRemote) return false;
  if (starting) return starting;
  if (!isDevaiOllamaEnabled() || Date.now() < nextAttemptAt) return false;
  starting = (async () => {
    const memory = await getOllamaMemory();
    if (!memory || memory.availableBytes < minimumOllamaHeadroomBytes()) {
      nextAttemptAt = Date.now() + OLLAMA_MEMORY_RETRY_DELAY_MS;
      logger.warn(
        { availableGiB: memory ? Number((memory.availableBytes / 1024 ** 3).toFixed(1)) : null },
        "Ollama startup deferred because safe VM memory headroom is unavailable",
      );
      return false;
    }
    if (await getInstalledModels()) return true;

    nextAttemptAt = Date.now() + 60_000;
    ollamaProcess = spawn("ollama", ["serve"], {
      stdio: "inherit",
      env: {
        ...process.env,
        OLLAMA_HOST,
        OLLAMA_MODELS: process.env.OLLAMA_MODELS || path.join(os.homedir(), ".ollama", "models"),
        OLLAMA_NUM_PARALLEL: "1",
        OLLAMA_MAX_LOADED_MODELS: "1",
        OLLAMA_KEEP_ALIVE: "30m",
        OLLAMA_CONTEXT_LENGTH: "2048",
        OLLAMA_FLASH_ATTENTION: "1",
      },
    });
    const child = ollamaProcess;
    const onExit = () => { child.kill("SIGTERM"); };
    process.once("exit", onExit);
    child.on("error", error => {
      process.removeListener("exit", onExit);
      ollamaProcess = null;
      logger.warn({ error: error.message }, "Local Ollama could not start");
    });
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      process.removeListener("exit", onExit);
      ollamaProcess = null;
      logger.info({ code, signal }, "Local Ollama stopped");
    });
    return waitForOllama();
  })().finally(() => { starting = null; });
  return starting;
}

/** Re-check on demand after transient startup pressure, without restarting the API. */
export async function getApiOllamaStatus(model?: string) {
  const status = await inspectOllama(model);
  recordModelReadiness(model ?? devaiModel, status.ready);
  if (devaiOllamaRemote) return status;
  const enoughStartupMemory = status.memory
    && status.memory.availableBytes >= status.minimumModelHeadroomBytes;
  if (status.enabled && enoughStartupMemory) {
    if (status.reachable) {
      void ensureModelsInstalled();
    } else {
      void recoverOllama()
        .then(reachable => {
          if (reachable) void ensureModelsInstalled();
        })
        .catch(error => logger.warn({ error: String(error) }, "Local Ollama startup failed"));
    }
  }
  return status;
}

// Start local models in either the dev VM or the published VM.  We serve the
// API immediately and provision weights in the background; readiness stays
// false until Ollama reports the exact configured model tags as installed.
if (isDevaiOllamaEnabled()) {
  const bootCheck = (attempt: number) => {
    const timer = setTimeout(async () => {
      try {
        const status = await getApiOllamaStatus();
        if (!status.ready && attempt < 4) bootCheck(attempt + 1);
      } catch (error) {
        logger.warn({ error: String(error) }, "Local Ollama startup check failed");
        if (attempt < 4) bootCheck(attempt + 1);
      }
    }, attempt === 0 ? 5_000 : 15_000);
    timer.unref();
  };
  bootCheck(0);
}

process.once("exit", () => { ollamaProcess?.kill("SIGTERM"); });
