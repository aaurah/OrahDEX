import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";

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
export const devaiOllamaRemote = process.env.DEVAI_OLLAMA_REMOTE === "true";

export function validateDevaiOllamaConfig(
  baseUrl: string,
  remote: boolean,
  accessClientId: string | undefined,
  accessClientSecret: string | undefined,
): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("DEVAI_OLLAMA_BASE_URL must be a valid URL.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(hostname) || hostname.endsWith(".localhost");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("DEVAI_OLLAMA_BASE_URL cannot contain credentials, a query, or a fragment.");
  }

  if (remote) {
    if (
      url.protocol !== "https:"
      || localHost
      || isIP(hostname)
      || (url.port && url.port !== "443")
      || url.pathname.replace(/\/+$/, "") !== "/v1"
    ) {
      throw new Error("Remote Ollama must use an HTTPS hostname on port 443 with the /v1 path.");
    }
    if (!accessClientId?.trim() || !accessClientSecret?.trim()) {
      throw new Error("Remote Ollama requires Cloudflare Access service-token credentials.");
    }
    return url;
  }

  if (
    url.protocol !== "http:"
    || !localHost
    || (url.port && url.port !== "11434")
    || url.pathname.replace(/\/+$/, "") !== "/v1"
  ) {
    throw new Error("Local DEVAI_OLLAMA_BASE_URL must point to loopback Ollama on port 11434 with the /v1 path.");
  }
  return url;
}

const accessClientId = process.env.CF_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
validateDevaiOllamaConfig(devaiOllamaBaseUrl, devaiOllamaRemote, accessClientId, accessClientSecret);

export function devaiOllamaAccessHeaders(): Record<string, string> {
  if (!devaiOllamaRemote) return {};
  return {
    "CF-Access-Client-Id": accessClientId!.trim(),
    "CF-Access-Client-Secret": accessClientSecret!.trim(),
  };
}

export const devaiOllamaServerUrl = devaiOllamaBaseUrl.replace(/\/v1$/, "");

export const devaiOpenAI = new OpenAI({
  apiKey: "ollama-local",
  baseURL: devaiOllamaBaseUrl,
  defaultHeaders: devaiOllamaAccessHeaders(),
  timeout: 120_000,
  maxRetries: 0,
});

export interface DevAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const isDevaiOllamaEnabled = () => process.env.DEVAI_OLLAMA_ENABLED === "true";

export const isUnsafeOllamaMemoryOverrideEnabled = () =>
  process.env.DEVAI_OLLAMA_UNSAFE_MEMORY_OVERRIDE === "true";

export const minimumOllamaHeadroomBytes = () =>
  isUnsafeOllamaMemoryOverrideEnabled()
    ? 0.5 * 1024 ** 3
    : (process.env.NODE_ENV === "development" ? 3.5 : 6) * 1024 ** 3;

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
  const remote = devaiOllamaRemote;
  const unsafeMemoryOverride = isUnsafeOllamaMemoryOverrideEnabled();
  const memory = remote ? null : await getOllamaMemory();
  const minimumModelHeadroomBytes = remote ? 0 : minimumOllamaHeadroomBytes();
  const base = {
    enabled, model, provider: remote ? "remote_ollama" as const : "local_ollama" as const,
    remote,
    unsafeMemoryOverride,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    memory, minimumModelHeadroomBytes,
  };
  try {
    const response = await fetch(`${devaiOllamaServerUrl}/api/tags`, {
      headers: devaiOllamaAccessHeaders(),
      signal: AbortSignal.timeout(remote ? 5000 : 1800),
    });
    if (!response.ok) {
      const accessRejected = remote && (response.status === 401 || response.status === 403);
      return {
        ...base,
        reachable: false,
        modelAvailable: false,
        ready: false,
        availableModels: [] as string[],
        code: accessRejected ? "OLLAMA_REMOTE_AUTH_FAILED" : "OLLAMA_UNREACHABLE",
        error: accessRejected
          ? "Cloudflare Access rejected the model request. Check the Access Service Auth policy and Replit service-token secrets."
          : remote
            ? "The protected remote Ollama host returned an error."
            : "Ollama returned an error. Check the model service on this API VM.",
      };
    }
    const data = await response.json() as { models?: Array<{ name?: string; size?: number }> };
    const models = (data.models ?? []).map((item) => item.name ?? "").filter(Boolean);
    const selected = data.models?.find(item => item.name && exactOllamaTag(item.name) === exactOllamaTag(model));
    const modelAvailable = Boolean(selected);
    const reserveBytes = (process.env.NODE_ENV === "production" ? 2 : 1) * 1024 ** 3;
    const modelSize = Number(selected?.size);
    // Keep startup/download admission separate from inference: do not demand a
    // second full model allocation when the exact selected runner is resident.
    const estimatedModelBytes = Number.isFinite(modelSize) && modelSize > 0
      ? Math.ceil(modelSize * 1.5 + 0.5 * 1024 ** 3)
      : minimumModelHeadroomBytes - reserveBytes;
    let residentModelBytes = 0;
    if (modelAvailable && !remote) {
      try {
        const ps = await fetch(`${devaiOllamaServerUrl}/api/ps`, {
          headers: devaiOllamaAccessHeaders(),
          signal: AbortSignal.timeout(1800),
        });
        if (ps.ok) {
          const loaded = await ps.json() as { models?: Array<{ name?: string; size?: number; size_vram?: number }> };
          const resident = loaded.models?.find(item => item.name && exactOllamaTag(item.name) === exactOllamaTag(model));
          // GPU allocations do not replenish host-memory headroom. Never give
          // credit for another model, missing metrics, or an unbounded value.
          const cpuBytes = Number(resident?.size) - Number(resident?.size_vram ?? 0);
          if (Number.isFinite(cpuBytes) && cpuBytes > 0) residentModelBytes = Math.min(cpuBytes, estimatedModelBytes);
        }
      } catch { /* Treat an unverifiable runner as a cold load. */ }
    }
    const requiredInferenceHeadroomBytes = reserveBytes + Math.max(0, estimatedModelBytes - residentModelBytes);
    const enoughMemory = remote || (memory !== null && memory.availableBytes >= (
      unsafeMemoryOverride ? minimumModelHeadroomBytes : requiredInferenceHeadroomBytes
    ));
    const code = !enabled ? "OLLAMA_DISABLED" : !modelAvailable ? "OLLAMA_MODEL_MISSING"
      : !enoughMemory ? "OLLAMA_INSUFFICIENT_MEMORY" : "READY";
    const error = !enabled
      ? "Local Ollama is disabled on this API runtime. Enable it only after checking VM capacity."
      : !modelAvailable
        ? remote
          ? `Model ${model} is not installed on the remote Ollama host. Install it on the Termux host, then retry.`
          : `Model ${model} is not installed on this API runtime yet. Automatic setup will retrieve it only after VM memory and disk checks pass.`
        : !enoughMemory
          ? unsafeMemoryOverride
            ? `Even with the unsafe override, at least ${(minimumModelHeadroomBytes / 1024 ** 3).toFixed(1)} GiB free memory is required.`
            : `Local inference is blocked to protect the API: ${(requiredInferenceHeadroomBytes / 1024 ** 3).toFixed(1)} GiB free memory is required for ${model}, including API headroom.`
          : null;
    return {
      ...base,
      reachable: true,
      modelAvailable,
      requiredInferenceHeadroomBytes: remote ? null : requiredInferenceHeadroomBytes,
      residentModelBytes: remote ? null : residentModelBytes,
      availableModels: models,
      ready: code === "READY", code, error,
    };
  } catch {
    const insufficientMemory = !remote && (!memory || memory.availableBytes < minimumModelHeadroomBytes);
    return {
      ...base,
      reachable: false,
      modelAvailable: false,
      ready: false, availableModels: [] as string[],
      code: !enabled ? "OLLAMA_DISABLED" : insufficientMemory ? "OLLAMA_INSUFFICIENT_MEMORY" : "OLLAMA_UNREACHABLE",
      error: !enabled ? "Local Ollama chat is disabled on this API runtime."
        : insufficientMemory
          ? `Ollama is stopped and VM memory is too low to start it safely. At least ${(minimumModelHeadroomBytes / 1024 ** 3).toFixed(1)} GiB free is required; increase runtime capacity or free memory first.`
          : remote
            ? "The protected remote Ollama host is unreachable. Check the Cloudflare Tunnel, Access policy, and service-token settings."
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
    headers: { "Content-Type": "application/json", ...devaiOllamaAccessHeaders() },
    body: JSON.stringify({
      model, messages, stream: true, keep_alive: "30m",
      // num_batch 1024 measured ~6% faster prompt evaluation than the 512
      // default on this CPU-only host; the larger batch costs no extra memory
      // for these small models.
      options: { num_ctx: 2048, num_predict: Math.min(maxTokens, 1024), num_batch: 1024 },
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
