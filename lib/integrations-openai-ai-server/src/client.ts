import OpenAI from "openai";
import { readFile } from "node:fs/promises";

if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  console.warn(
    "[OrahDEX] AI_INTEGRATIONS_OPENAI_BASE_URL / AI_INTEGRATIONS_OPENAI_API_KEY not set — " +
    "AI features will be unavailable until the OpenAI integration is provisioned."
  );
}

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "not-configured",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "http://localhost:11434/v1",
});

// Local OrahDEX chats use a separate, loopback-only Ollama client so they do
// not depend on the optional Replit AI Integration or a hosted model key.
export const devaiModel = (process.env.DEVAI_MODEL || "qwen2.5-coder:1.5b").trim() || "qwen2.5-coder:1.5b";
// Ora AI (the trading assistant) can use a chat-tuned tag while DevAI keeps its
// code-tuned model; both run on the same local Ollama service.
export const oraModel = (process.env.ORA_AI_MODEL || devaiModel).trim() || devaiModel;
export const devaiOllamaBaseUrl = (process.env.DEVAI_OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
const devaiUrl = new URL(devaiOllamaBaseUrl);
if (
  devaiUrl.protocol !== "http:"
  || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(devaiUrl.hostname)
  || (devaiUrl.port && devaiUrl.port !== "11434")
  || devaiUrl.username
  || devaiUrl.password
) {
  throw new Error("DEVAI_OLLAMA_BASE_URL must point to a local loopback Ollama service.");
}

export const devaiOllamaServerUrl = devaiOllamaBaseUrl.replace(/\/v1$/, "");

export const devaiOpenAI = new OpenAI({
  apiKey: "ollama-local",
  baseURL: devaiOllamaBaseUrl,
  timeout: 120_000,
  maxRetries: 0,
});

export interface DevAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const isDevaiOllamaEnabled = () => process.env.DEVAI_OLLAMA_ENABLED === "true";

export const minimumOllamaHeadroomBytes = () =>
  (process.env.NODE_ENV === "development" ? 3.5 : 6) * 1024 ** 3;

export async function getOllamaMemory() {
  let cgroupMemory: { availableBytes: number; limitBytes: number } | null = null;
  try {
    const [limit, current] = await Promise.all([
      readFile("/sys/fs/cgroup/memory.max", "utf8"),
      readFile("/sys/fs/cgroup/memory.current", "utf8"),
    ]);
    if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
      cgroupMemory = { availableBytes: Math.max(0, Number(limit) - Number(current)), limitBytes: Number(limit) };
    }
  } catch { /* non-cgroup Linux runtime */ }
  try {
    const info = await readFile("/proc/meminfo", "utf8");
    const availableBytes = Number(info.match(/^MemAvailable:\s+(\d+)/m)?.[1]) * 1024;
    const limitBytes = Number(info.match(/^MemTotal:\s+(\d+)/m)?.[1]) * 1024;
    if (Number.isFinite(availableBytes) && Number.isFinite(limitBytes)) return {
      availableBytes: Math.min(availableBytes, cgroupMemory?.availableBytes ?? Infinity),
      limitBytes: Math.min(limitBytes, cgroupMemory?.limitBytes ?? Infinity),
    };
  } catch { /* report unavailable instead of assuming sufficient memory */ }
  return cgroupMemory;
}

// Ollama's omitted tag means :latest, never "whichever variant is installed".
export const exactOllamaTag = (model: string) =>
  model.slice(model.lastIndexOf("/") + 1).includes(":") ? model : `${model}:latest`;

export async function getDevaiOllamaStatus(model: string = devaiModel) {
  const enabled = isDevaiOllamaEnabled();
  const memory = await getOllamaMemory();
  const minimumModelHeadroomBytes = minimumOllamaHeadroomBytes();
  const base = {
    enabled, model, provider: "local_ollama" as const,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    memory, minimumModelHeadroomBytes,
  };
  try {
    const response = await fetch(`${devaiOllamaServerUrl}/api/tags`, {
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) {
      return { ...base, reachable: false, modelAvailable: false, ready: false, availableModels: [] as string[], code: "OLLAMA_UNREACHABLE", error: "Ollama returned an error. Check the model service on this API VM." };
    }
    const data = await response.json() as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((item) => item.name ?? "").filter(Boolean);
    const modelAvailable = models.some((name) => exactOllamaTag(name) === exactOllamaTag(model));
    const enoughMemory = memory !== null && memory.availableBytes >= minimumModelHeadroomBytes;
    const code = !enabled ? "OLLAMA_DISABLED" : !modelAvailable ? "OLLAMA_MODEL_MISSING"
      : !enoughMemory ? "OLLAMA_INSUFFICIENT_MEMORY" : "READY";
    const error = !enabled
      ? "Local Ollama is disabled on this API runtime. Enable it only after checking VM capacity."
      : !modelAvailable
        ? `Model ${model} is not installed on this API runtime. Open Admin → DevAI to install the selected tag or configure an installed tag.`
        : !enoughMemory
          ? `Local inference is blocked to protect the API: ${(minimumModelHeadroomBytes / 1024 ** 3).toFixed(1)} GiB free memory is required.`
          : null;
    return {
      ...base,
      reachable: true,
      modelAvailable,
      availableModels: models,
      ready: code === "READY", code, error,
    };
  } catch {
    const insufficientMemory = !memory || memory.availableBytes < minimumModelHeadroomBytes;
    return {
      ...base,
      reachable: false,
      modelAvailable: false,
      ready: false, availableModels: [] as string[],
      code: !enabled ? "OLLAMA_DISABLED" : insufficientMemory ? "OLLAMA_INSUFFICIENT_MEMORY" : "OLLAMA_UNREACHABLE",
      error: !enabled ? "Local Ollama chat is disabled on this API runtime."
        : insufficientMemory
          ? `Ollama is stopped and VM memory is too low to start it safely. At least ${(minimumModelHeadroomBytes / 1024 ** 3).toFixed(1)} GiB free is required; increase runtime capacity or free memory first.`
          : "Ollama is not reachable on this API VM. Start its loopback service after checking memory capacity.",
    };
  }
}

export async function createDevaiOllamaStream(
  messages: DevAiChatMessage[],
  maxTokens = 2048,
  model: string = devaiModel,
  signal?: AbortSignal,
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const status = await getDevaiOllamaStatus(model);
  if (!status.ready) throw new Error(status.error ?? "Local model is not ready.");

  // Context/keep-alive are native Ollama options. The OpenAI-compatible route
  // may ignore them, leaving a much larger server-default context allocated.
  const response = await fetch(`${devaiOllamaServerUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages, stream: true, keep_alive: "30s",
      options: { num_ctx: 2048, num_predict: Math.min(maxTokens, 1024) },
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error?.slice(0, 500) || `Ollama request failed (${response.status}).`);
  }
  return (async function* () {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let hasContent = false;
    try {
      while (true) {
        const part = await reader.read();
        pending += decoder.decode(part.value, { stream: !part.done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (part.done && pending.trim()) { lines.push(pending); pending = ""; }
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { error?: string; message?: { content?: string }; done?: boolean };
          if (event.error) throw new Error(event.error);
          if (event.message?.content) {
            hasContent = true;
            yield { choices: [{ delta: { content: event.message.content } }] } as OpenAI.Chat.Completions.ChatCompletionChunk;
          }
          if (event.done) {
            if (!hasContent) throw new Error("Ollama returned an empty response. Try a shorter prompt.");
            return;
          }
        }
        if (part.done) throw new Error("Ollama stream ended before completion. Please retry.");
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  })();
}
