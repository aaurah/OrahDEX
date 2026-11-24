import OpenAI from "openai";

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
});

export interface DevAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const isDevaiOllamaEnabled = () => process.env.DEVAI_OLLAMA_ENABLED === "true";

export async function getDevaiOllamaStatus(model: string = devaiModel) {
  const enabled = isDevaiOllamaEnabled();
  try {
    const response = await fetch(`${devaiOllamaServerUrl}/api/tags`, {
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) {
      return { enabled, reachable: false, modelAvailable: false, error: "Local Ollama returned an error." };
    }
    const data = await response.json() as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((item) => item.name ?? "").filter(Boolean);
    const modelAvailable = models.some((name) => name === model || name.startsWith(`${model}:`));
    return {
      enabled,
      reachable: true,
      modelAvailable,
      error: !enabled
        ? "Local Ollama chat is disabled. Enable it only when the VM has enough free memory."
        : modelAvailable
          ? null
          : `Model ${model} is not installed in local Ollama.`,
    };
  } catch {
    return {
      enabled,
      reachable: false,
      modelAvailable: false,
      error: enabled ? "Local Ollama is not reachable on this VM." : "Local Ollama chat is disabled.",
    };
  }
}

export async function createDevaiOllamaStream(
  messages: DevAiChatMessage[],
  maxTokens = 2048,
  model: string = devaiModel,
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const status = await getDevaiOllamaStatus(model);
  if (!status.enabled) throw new Error("Local Ollama chat is disabled.");
  if (!status.reachable) throw new Error("Local Ollama is not reachable on this VM.");
  if (!status.modelAvailable) throw new Error(`Model ${model} is not installed in local Ollama.`);

  const result: unknown = await devaiOpenAI.chat.completions.create({
    model,
    max_tokens: Math.min(maxTokens, 1024),
    messages,
    options: { num_ctx: 2048 },
    stream: true,
  } as any, { signal: AbortSignal.timeout(120_000) });
  const candidate = result as { [Symbol.asyncIterator]?: unknown } | null;
  if (!candidate || typeof candidate[Symbol.asyncIterator] !== "function") {
    throw new Error("Local Ollama did not return a streaming response.");
  }
  return result as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
}
