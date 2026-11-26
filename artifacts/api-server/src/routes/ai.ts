import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import {
  openai,
  createDevaiOllamaCompletion,
  createDevaiOllamaStream,
  oraModel,
  isDevaiOllamaEnabled,
  type DevAiChatMessage,
} from "@workspace/integrations-openai-ai-server";
import { eq, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getTopHlMarkets } from "../lib/hyperliquid.js";
import { aiChatRateLimit } from "../middleware/aiChatRateLimit.js";
import { BoundedMap } from "../lib/boundedMap.js";
import {
  getApiOllamaStatus as getDevaiOllamaStatus,
  getLocalOllamaProviderHealth,
} from "../lib/ollamaRuntime.js";
import { buildOraSystemPrompt } from "../lib/oraPrompt.js";

const router = Router();

/* ── Provider selection ──────────────────────────────────────────────────────
 * Orah AI runs on the hosted OpenAI integration when one is provisioned.  On a
 * VM that only has a local Ollama model, these endpoints use its native chat
 * API (DEVAI_OLLAMA_ENABLED / ORA_AI_MODEL) so request-level memory settings
 * are honored. Hosted requests continue through the OpenAI client.
 */
const oraLocalModelEnabled = (): boolean => isDevaiOllamaEnabled();
// Local models need longer budgets: a 1.5B model on CPU generates tokens far
// slower than a hosted provider, so 15 s would abort almost every completion.
const aiTimeoutMs = (): number => (oraLocalModelEnabled() ? 90_000 : 15_000);
// ORA_AI_MODEL lets the trading assistant use a chat-tuned local model (e.g.
// llama3.2:3b) while DevAI keeps its code-tuned DEVAI_MODEL.
const aiModel = (): string => oraLocalModelEnabled()
  ? oraModel
  : (process.env.AI_INTEGRATIONS_OPENAI_MODEL || "gpt-4o-mini");
// Local models also need an explicit "JSON only, quote every string" instruction
// on top of the route's prompt, otherwise they emit unquoted prose values.
const aiJsonMessages = (system: string, user: string): DevAiChatMessage[] => oraLocalModelEnabled()
  ? [
      { role: "system" as const, content: `${system}\n\nYou are a JSON API: reply with one valid JSON object only, no prose, and quote every string value.` },
      { role: "user" as const, content: user },
    ]
  : [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];

async function createAiChatCompletion(
  messages: DevAiChatMessage[],
  maxTokens: number,
  signal: AbortSignal,
  jsonMode = false,
  formatSchema?: Record<string, unknown>,
) {
  if (oraLocalModelEnabled()) {
    return createDevaiOllamaCompletion(
      messages,
      maxTokens,
      aiModel(),
      signal,
      jsonMode,
      jsonMode ? 0 : undefined,
      formatSchema,
    );
  }
  return openai.chat.completions.create({
    model: aiModel(),
    max_completion_tokens: maxTokens,
    messages,
  }, { signal });
}

// ── Safety middleware: hard deadline on every AI route (120 s when a local
// model is serving, 25 s for the hosted provider) ────────────────────────────
// If a handler hangs (e.g. SSE stream never closes, OpenAI call stalls without
// triggering AbortSignal), this ensures the response is always eventually sent.
router.use((_req: Request, res: Response, next: NextFunction) => {
  const deadline = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: "AI service timeout — please retry" });
    }
  }, oraLocalModelEnabled() ? 120_000 : 25_000);
  res.on("finish", () => clearTimeout(deadline));
  res.on("close",  () => clearTimeout(deadline));
  next();
});

// Readiness describes this runtime only; never infer that a configured model
// has been installed, or that a hosted key has successfully served a request.
router.get("/ai/status", async (_req, res) => {
  if (oraLocalModelEnabled()) {
    const { availableModels: _models, ...status } = await getDevaiOllamaStatus(oraModel);
    res.json(status);
    return;
  }
  const configured = Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
  res.json({
    provider: "openai", model: aiModel(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    ready: configured && aiProviderState === "healthy" && isAiAvailable(),
    code: !configured ? "AI_PROVIDER_NOT_CONFIGURED" : aiProviderState === "starting" ? "UNVERIFIED" : isAiAvailable() ? "READY" : "AI_PROVIDER_UNAVAILABLE",
    error: !configured ? "OpenAI integration is not configured on this API runtime."
      : aiProviderState === "starting" ? "Provider is configured; a successful response has not been verified yet."
        : isAiAvailable() ? null : unavailableAiResponse().error,
  });
});

router.use(async (req, res, next) => {
  const inference = /^\/ai\/(?:market-analysis|insights|trade-signal|portfolio-analysis|news-sentiment)$/.test(req.path);
  if (inference && oraLocalModelEnabled()) {
    const status = await getDevaiOllamaStatus(oraModel);
    if (!status.ready) {
      tripCircuitBreaker(new Error(status.error ?? "Local OraAI model is not ready."));
      res.status(503).json({ error: status.error, code: status.code, model: oraModel, provider: status.provider, available: false });
      return;
    }
  }
  next();
});

const SYSTEM_PROMPT = buildOraSystemPrompt();

// ── Circuit breaker — trips on auth errors AND repeated timeouts ───────────────

let aiUnavailable = false;
let aiUnavailableUntil = 0;
let aiUnavailableCode: "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_UNAVAILABLE" | null = null;
let consecutiveTimeouts = 0;
let aiProviderState: "starting" | "healthy" | "degraded" =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.DEVAI_OLLAMA_ENABLED === "true"
    ? "starting"
    : "degraded";
let aiProviderLastRunAt: Date | null = null;
let aiProviderLastSuccessAt: Date | null = null;
let aiProviderConsecutiveFails = 0;
const AI_AUTH_BACKOFF_MS    = 5 * 60 * 1000;  // 5 min for auth errors
const AI_TIMEOUT_BACKOFF_MS = 2 * 60 * 1000;  // 2 min after 3 consecutive timeouts
const AI_CONFIG_BACKOFF_MS  = 10 * 60 * 1000; // avoid retrying known provider misconfiguration
const AI_TIMEOUT_THRESHOLD  = 3;               // timeouts before backing off

function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? (err as any)?.status ?? "");
  return msg.includes("401") || msg.includes("403") || msg.includes("restricted") || msg.includes("Unauthorized");
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as any)?.name ?? "";
  const msg  = String((err as any)?.message ?? "");
  return name === "AbortError" || msg.includes("aborted") || msg.includes("This operation was aborted");
}

function isProviderConfigurationError(err: unknown): boolean {
  const status = Number((err as any)?.status ?? (err as any)?.statusCode ?? 0);
  const message = String((err as any)?.message ?? "").toLowerCase();
  return status === 404 || message.includes("not configured") || message.includes("integration is not configured");
}

function isAiAvailable(): boolean {
  if (!oraLocalModelEnabled() && !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return false;
  if (aiUnavailable && Date.now() < aiUnavailableUntil) return false;
  if (Date.now() >= aiUnavailableUntil) {
    aiUnavailable = false;
    aiUnavailableCode = null;
    consecutiveTimeouts = 0;
  }
  return true;
}

export function recordAiSuccess(): void {
  const now = new Date();
  consecutiveTimeouts = 0;
  aiProviderState = "healthy";
  aiProviderLastRunAt = now;
  aiProviderLastSuccessAt = now;
  aiProviderConsecutiveFails = 0;
}

export function tripCircuitBreaker(err: unknown) {
  aiProviderState = "degraded";
  aiProviderLastRunAt = new Date();
  aiProviderConsecutiveFails++;
  if (isProviderConfigurationError(err)) {
    aiUnavailable = true;
    aiUnavailableUntil = Date.now() + AI_CONFIG_BACKOFF_MS;
    aiUnavailableCode = "AI_PROVIDER_NOT_CONFIGURED";
    consecutiveTimeouts = 0;
    logger.warn({ status: (err as any)?.status }, "AI provider is not configured — backing off 10 min");
  } else if (isAuthError(err)) {
    aiUnavailable      = true;
    aiUnavailableUntil = Date.now() + AI_AUTH_BACKOFF_MS;
    aiUnavailableCode = "AI_PROVIDER_UNAVAILABLE";
    consecutiveTimeouts = 0;
    logger.warn("AI provider unavailable (auth error) — backing off 5 min");
  } else if (isAbortError(err)) {
    consecutiveTimeouts++;
    if (consecutiveTimeouts >= AI_TIMEOUT_THRESHOLD) {
      aiUnavailable      = true;
      aiUnavailableUntil = Date.now() + AI_TIMEOUT_BACKOFF_MS;
      aiUnavailableCode = "AI_PROVIDER_UNAVAILABLE";
      logger.warn({ consecutiveTimeouts }, "AI provider repeatedly timing out — backing off 2 min");
    }
  } else {
    consecutiveTimeouts = 0;
  }
}

export function getAiProviderHealth() {
  const configured = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || isDevaiOllamaEnabled();
  // An unconfigured provider is not a monitored component — reporting it as
  // "degraded" dragged the whole platform status (and the public status page)
  // down on deployments that simply do not use the AI features.
  if (!configured) return null;
  const circuitOpen = aiUnavailable && Date.now() < aiUnavailableUntil;
  // A configured provider that simply has not served a request yet has no
  // failures to report.  Keeping it at "starting" made /api/health return
  // "unknown" indefinitely on quiet deployments, so the public status page
  // never left "Checks Starting" until the first AI call happened.
  const localState = getLocalOllamaProviderHealth();
  const state = circuitOpen || aiProviderState === "degraded" || localState === "degraded"
    ? "degraded"
    : localState === "starting"
      ? "starting"
      : aiProviderState === "starting"
        ? "healthy"
        : aiProviderState;
  return {
    name: "ai-provider",
    status: state,
    lastRunAt: aiProviderLastRunAt?.toISOString() ?? null,
    lastSuccessAt: aiProviderLastSuccessAt?.toISOString() ?? null,
    consecutiveFails: aiProviderConsecutiveFails,
    avgDurationMs: 0,
    staleSinceMs: aiProviderLastRunAt ? Date.now() - aiProviderLastRunAt.getTime() : null,
  } as const;
}

// ── Fallback content ──────────────────────────────────────────────────────────

function fallbackAnalysis(symbol: string): string {
  return `**${symbol}** market analysis is temporarily unavailable. Check the Markets tab for live price data and order book depth.`;
}

function fallbackSignal(symbol: string): { signal: string; sentiment: string } {
  return {
    signal: `Live AI signals for ${symbol} are temporarily unavailable. Monitor the order book and recent trades for directional cues.`,
    sentiment: "neutral",
  };
}

const FALLBACK_CHAT = "I'm temporarily unavailable — the AI provider is offline. Please try again in a few minutes. In the meantime, check the Markets tab for live prices and the order book for directional signals.";

// ── Cache for market analysis (5 min TTL) ────────────────────────────────────

interface CacheEntry { content: string; ts: number }
const analysisCache = new BoundedMap<string, CacheEntry>(256);
const CACHE_TTL = 5 * 60 * 1000;

function readFreshCache<T extends { ts: number }>(
  cache: Map<string, T>,
  key: string,
  ttlMs: number,
): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts >= ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function normalizeAiSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(symbol) ? symbol : null;
}

function unavailableAiResponse(): { error: string; code: string; available: false } {
  const configured = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || oraLocalModelEnabled();
  return {
    error: configured
      ? "The AI provider is unavailable or not configured correctly."
      : "No AI provider is configured on this server.",
    code: configured ? aiUnavailableCode ?? "AI_PROVIDER_UNAVAILABLE" : "AI_PROVIDER_NOT_CONFIGURED",
    available: false,
  };
}

// ── POST /ai/conversations — create a new conversation ───────────────────────

router.post("/ai/conversations", async (_req, res) => {
  try {
    const [conv] = await db.insert(conversations).values({ title: "New Chat" }).returning();
    res.json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ── GET /ai/conversations/:id — get conversation + messages ──────────────────

router.get("/ai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid conversation id" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt)).limit(500);
    res.json({ ...conv, messages: msgs });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /ai/conversations/:id/messages — send message with SSE streaming ────

router.post("/ai/conversations/:id/messages", aiChatRateLimit, async (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] ?? "" : rawId ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid conversation id" }); return; }

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "Content is required" }); return; }
  if (content.length > 12_000) { res.status(413).json({ error: "Content must be 12000 characters or fewer." }); return; }

  const useLocalOllama = isDevaiOllamaEnabled();
  if (useLocalOllama) {
    const status = await getDevaiOllamaStatus(aiModel());
    if (!status.ready) {
      res.status(503).json({ error: status.error, code: status.code, provider: status.provider, model: oraModel });
      return;
    }
  } else if (!isAiAvailable()) {
    res.status(503).json(unavailableAiResponse());
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Save user message first (always)
  try {
    await db.insert(messages).values({ conversationId: id, role: "user", content });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to save user message");
    res.write(`data: ${JSON.stringify({ error: "Failed to save message" })}\n\n`);
    res.end();
    return;
  }

  if (!useLocalOllama && !isAiAvailable()) {
    res.write(`data: ${JSON.stringify({ content: FALLBACK_CHAT })}\n\n`);
    try {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: FALLBACK_CHAT });
    } catch { /* non-fatal */ }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    return;
  }

  try {
    const history = await db.select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.createdAt)).limit(20);
    const last20 = history.reverse();

    const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...last20.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    let fullResponse = "";

    const streamResult: unknown = useLocalOllama
      ? await createDevaiOllamaStream(chatMessages, 2048, aiModel())
      : await openai.chat.completions.create({
          model: aiModel(),
          max_completion_tokens: 8192,
          messages: chatMessages,
          stream: true,
        }, { signal: AbortSignal.timeout(25_000) });
    const streamCandidate = streamResult as { [Symbol.asyncIterator]?: unknown } | null;
    if (!streamCandidate || typeof streamCandidate[Symbol.asyncIterator] !== "function") {
      throw new Error("AI provider did not return a streaming response.");
    }
    const stream = streamResult as AsyncIterable<{
      choices: Array<{ delta?: { content?: string | null } }>;
    }>;

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      }
    }

    if (!useLocalOllama) recordAiSuccess();
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (conv?.title === "New Chat") {
      const title = content.slice(0, 60).trim();
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    if (!useLocalOllama) tripCircuitBreaker(err);
    logger.error({ err: err?.message }, "AI chat error");
    const fallback = useLocalOllama
      ? "Ollama could not complete this chat. Check Admin → DevAI for model status, then try again."
      : FALLBACK_CHAT;
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    try {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: fallback });
    } catch { /* non-fatal */ }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

// ── GET /ai/market-analysis?symbol=BTC — cached AI analysis for a coin ───────

router.get("/ai/market-analysis", async (req, res) => {
  const symbol = normalizeAiSymbol(req.query.symbol);
  if (!symbol) { res.status(400).json({ error: "A valid symbol is required (maximum 40 characters)." }); return; }

  const cached = readFreshCache(analysisCache, symbol, CACHE_TTL);
  if (cached) {
    res.json({ symbol, analysis: cached.content, cached: true, available: true });
    return;
  }

  if (!isAiAvailable()) {
    res.status(503).json({ symbol, analysis: fallbackAnalysis(symbol), cached: false, ...unavailableAiResponse() });
    return;
  }

  try {
    const prompt = `Give a concise 3-paragraph market analysis for ${symbol} as of early 2026. Cover:
1. What the asset is, its core use case, and its position in the market
2. Key recent developments, catalysts, or risks
3. How it might perform on a DEX like OrahDEX that settles on BSV blockchain

Keep it under 200 words. Use plain markdown. No financial advice disclaimer needed — just direct analysis.`;

    const response = await createAiChatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      512,
      AbortSignal.timeout(aiTimeoutMs()),
    );

    const content = response.choices[0]?.message?.content || fallbackAnalysis(symbol);
    analysisCache.set(symbol, { content, ts: Date.now() });
    recordAiSuccess();
    if (!res.headersSent) res.json({ symbol, analysis: content, cached: false, available: true });
  } catch (err: any) {
    tripCircuitBreaker(err);
    if (isAbortError(err)) {
      logger.warn({ symbol }, "AI market analysis timeout — serving fallback");
    } else {
      logger.error({ err: err?.message }, "AI market analysis error");
    }
    if (!res.headersSent) {
      res.status(503).json({ symbol, analysis: fallbackAnalysis(symbol), cached: false, ...unavailableAiResponse() });
    }
  }
});

// ── GET /ai/insights — overall market insights (cached 10 min) ────────────────

const insightsCache: CacheEntry = { content: "", ts: 0 };
const INSIGHTS_TTL = 10 * 60 * 1000;

router.get("/ai/insights", async (_req, res) => {
  if (insightsCache.content && Date.now() - insightsCache.ts < INSIGHTS_TTL) {
    try {
      if (!res.headersSent) res.json({ insights: JSON.parse(insightsCache.content), cached: true, available: true });
    } catch {
      insightsCache.content = "";
      insightsCache.ts = 0;
    }
    if (insightsCache.content) return;
  }

  // Serve only previously generated data when stale; never label generic copy as live AI.
  if (!isAiAvailable()) {
    if (insightsCache.content) {
      try {
        res.json({ insights: JSON.parse(insightsCache.content), cached: true, stale: true, available: false });
      } catch {
        insightsCache.content = "";
        insightsCache.ts = 0;
        res.status(503).json({ insights: [], cached: false, ...unavailableAiResponse() });
      }
    } else {
      res.status(503).json({ insights: [], cached: false, ...unavailableAiResponse() });
    }
    return;
  }

  try {
    // Fetch live HL market context (non-blocking — falls back gracefully)
    const hlContext = await getTopHlMarkets(8).then(tops => {
      if (!tops.length) return "";
      const lines = tops.map(m =>
        `${m.coin}: mark=$${m.markPrice.toLocaleString()} funding=${(m.fundingRate * 100).toFixed(4)}% OI=$${(m.openInterest / 1e6).toFixed(1)}M`
      ).join(", ");
      return `\n\nLive Hyperliquid perp data (now): ${lines}`;
    }).catch(() => "");

    const response = await createAiChatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Give 3 brief, sharp market insights for crypto traders right now. Each insight should be 1-2 sentences. Format as a JSON array of strings. Focus on actionable trends across DeFi, L2s, and BSV ecosystem. Return only valid JSON, no markdown wrapping.${hlContext}`
        },
      ],
      512,
      AbortSignal.timeout(aiTimeoutMs()),
      true,
      {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3,
      },
    );

    const raw = response.choices[0]?.message?.content || "[]";
    let parsed: string[];
    try {
      const value = JSON.parse(raw.trim().replace(/^```json\n?/, "").replace(/\n?```$/, ""));
      parsed = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
        : [];
      if (!parsed.length) throw new Error("AI insights response was not an array of strings.");
    } catch {
      throw new Error("AI insights response did not match the required JSON array.");
    }

    const content = JSON.stringify(parsed);
    insightsCache.content = content;
    insightsCache.ts = Date.now();
    recordAiSuccess();
    if (!res.headersSent) res.json({ insights: parsed, cached: false, available: true });
  } catch (err: any) {
    tripCircuitBreaker(err);
    if (isAbortError(err)) {
      logger.warn({ timeouts: consecutiveTimeouts }, "AI insights timeout — serving stale/fallback");
    } else {
      logger.error({ err: err?.message }, "AI insights error");
    }
    if (res.headersSent) return;
    if (insightsCache.content) {
      try {
        res.json({ insights: JSON.parse(insightsCache.content), cached: true, stale: true, available: false });
      } catch {
        insightsCache.content = "";
        insightsCache.ts = 0;
        res.status(503).json({ insights: [], cached: false, ...unavailableAiResponse() });
      }
    } else {
      res.status(503).json({ insights: [], cached: false, ...unavailableAiResponse() });
    }
  }
});

// ── GET /ai/trade-signal?symbol=BTC&action=buy — quick trade signal (cached 5 min) ──

const signalCache = new BoundedMap<string, { signal: string; sentiment: string; ts: number }>(256);
const SIGNAL_CACHE_TTL = 5 * 60 * 1000;

router.get("/ai/trade-signal", async (req, res) => {
  const symbol = req.query.symbol === undefined ? "BTC" : normalizeAiSymbol(req.query.symbol);
  if (!symbol) { res.status(400).json({ error: "A valid symbol is required (maximum 40 characters)." }); return; }
  const action = typeof req.query.action === "string" ? req.query.action.toLowerCase().trim().slice(0, 32) : "";
  const cacheKey = `${symbol}:${action}`;

  const cached = readFreshCache(signalCache, cacheKey, SIGNAL_CACHE_TTL);
  if (cached) {
    res.json({ symbol, signal: cached.signal, sentiment: cached.sentiment, cached: true, available: true });
    return;
  }

  if (!isAiAvailable()) {
    const fb = fallbackSignal(symbol);
    if (!res.headersSent) res.status(503).json({ symbol, ...fb, cached: false, ...unavailableAiResponse() });
    return;
  }

  try {
    const prompt = action
      ? `Should I ${action} ${symbol} right now? Give a 2-sentence risk assessment with a bullish/bearish/neutral rating. Be direct.`
      : `Give a 1-sentence directional signal for ${symbol} as of March 2026: bullish, bearish, or neutral, and why. Be extremely concise.`;

    const response = await createAiChatCompletion(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      256,
      AbortSignal.timeout(aiTimeoutMs()),
    );

    const signal = response.choices[0]?.message?.content || fallbackSignal(symbol).signal;
    const sentiment = signal.toLowerCase().includes("bullish") ? "bullish"
      : signal.toLowerCase().includes("bearish") ? "bearish" : "neutral";

    signalCache.set(cacheKey, { signal, sentiment, ts: Date.now() });
    recordAiSuccess();
    if (!res.headersSent) res.json({ symbol, signal, sentiment, available: true });
  } catch (err: any) {
    tripCircuitBreaker(err);
    if (isAbortError(err)) {
      logger.warn({ symbol }, "AI trade signal timeout — serving fallback");
    } else {
      logger.error({ err: err?.message }, "AI trade signal error");
    }
    const fb = fallbackSignal(symbol);
    if (!res.headersSent) res.status(503).json({ symbol, ...fb, cached: false, ...unavailableAiResponse() });
  }
});

// ── GET /ai/portfolio-analysis — AI review of a user's holdings ──────────────
// holdings param: JSON array of {symbol, valueUSD, pct} objects
// Cached per unique portfolio fingerprint (5 min TTL)

const portfolioCache = new BoundedMap<string, CacheEntry>(128);
const PORTFOLIO_CACHE_TTL = 5 * 60 * 1000;

router.get("/ai/portfolio-analysis", async (req, res) => {
  const raw = (req.query.holdings as string) ?? "";
  if (!raw) { res.status(400).json({ error: "holdings is required" }); return; }
  if (raw.length > 12_000) {
    res.status(413).json({ error: "holdings payload is too large" });
    return;
  }

  let holdings: Array<{ symbol: string; valueUSD: number; pct: number }>;
  try { holdings = JSON.parse(raw); } catch {
    res.status(400).json({ error: "holdings must be valid JSON" }); return;
  }
  if (!Array.isArray(holdings) || holdings.length > 20 || holdings.some((holding) =>
    !holding ||
    typeof holding.symbol !== "string" ||
    !normalizeAiSymbol(holding.symbol) ||
    !Number.isFinite(holding.valueUSD) ||
    holding.valueUSD < 0 ||
    !Number.isFinite(holding.pct) ||
    holding.pct < 0 ||
    holding.pct > 100
  )) {
    res.status(400).json({ error: "holdings must contain at most 20 valid assets with finite non-negative values and percentages from 0 to 100" });
    return;
  }
  holdings = holdings.map((holding) => ({
    symbol: normalizeAiSymbol(holding.symbol)!,
    valueUSD: holding.valueUSD,
    pct: holding.pct,
  }));

  if (!holdings.length) {
    res.json({ score: 50, riskLevel: "medium", summary: "No holdings found to analyze.", bullets: [], sentiment: "neutral" });
    return;
  }

  const fingerprint = holdings.map(h => `${h.symbol}:${h.pct.toFixed(1)}`).sort().join(",");
  const cached = readFreshCache(portfolioCache, fingerprint, PORTFOLIO_CACHE_TTL);
  if (cached) {
    try { res.json({ ...JSON.parse(cached.content), cached: true }); return; } catch { /* fall through */ }
  }

  // Deterministic fallback scoring (no AI needed)
  const topConcentration = Math.max(...holdings.map(h => h.pct));
  const stableCount = holdings.filter(h => ["USDT","USDC","BUSD","DAI"].includes(h.symbol)).length;
  const score = Math.min(100, Math.max(20, Math.round(
    80 - (topConcentration > 60 ? 30 : topConcentration > 40 ? 15 : 0) +
    (holdings.length >= 5 ? 10 : holdings.length >= 3 ? 5 : 0) +
    (stableCount > 0 ? 10 : 0)
  )));
  const riskLevel = topConcentration > 60 ? "high" : topConcentration > 35 ? "medium" : "low";

  if (!isAiAvailable()) {
    res.json({
      score, riskLevel,
      summary: `Portfolio has ${holdings.length} assets. Top holding is ${holdings[0]?.symbol} at ${holdings[0]?.pct.toFixed(1)}%.`,
      bullets: [
        `**Concentration risk**: ${holdings[0]?.symbol} makes up ${holdings[0]?.pct.toFixed(1)}% of holdings.`,
        `**Diversification**: ${holdings.length} assets across your portfolio.`,
        stableCount > 0 ? `**Stability**: You hold ${stableCount} stablecoin(s) as a buffer.` : "**Stability**: No stablecoins detected — consider adding USDT for risk management.",
      ],
      sentiment: riskLevel === "low" ? "bullish" : riskLevel === "high" ? "bearish" : "neutral",
      cached: false,
      available: false,
      source: "computed_fallback",
    });
    return;
  }

  try {
    const holdingsList = holdings.slice(0, 10)
      .map(h => `${h.symbol}: ${h.pct.toFixed(1)}% ($${h.valueUSD.toFixed(0)})`)
      .join("\n");

    const prompt = `Analyze this crypto portfolio and provide a structured review:

Holdings:
${holdingsList}

Return ONLY a JSON object (no markdown, no backticks) with these exact fields:
{
  "score": <0-100 portfolio health score>,
  "riskLevel": <"low" | "medium" | "high">,
  "summary": <1-sentence overall assessment>,
  "bullets": [<3 concise actionable insights as markdown strings>],
  "sentiment": <"bullish" | "bearish" | "neutral">
}

Consider: diversification, concentration risk, exposure to volatile vs stable assets, sector balance.`;

    const response = await createAiChatCompletion(
      aiJsonMessages(SYSTEM_PROMPT, prompt),
      1024,
      AbortSignal.timeout(aiTimeoutMs()),
      true,
    );

    const raw2 = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw2.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed) throw new Error("No JSON in response");

    // Small local models sometimes return the right keys with the wrong types,
    // which used to leak straight into the response (e.g. bullets as a number).
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((b: unknown): b is string => typeof b === "string" && b.trim().length > 0)
      : [];
    if (bullets.length === 0) throw new Error("Model returned no usable bullets");

    const result = {
      score: Number.isFinite(Number(parsed.score))
        ? Math.max(0, Math.min(100, Math.round(Number(parsed.score))))
        : score,
      riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel) ? parsed.riskLevel : riskLevel,
      summary: typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary
        : `Portfolio spans ${holdings.length} assets.`,
      bullets,
      sentiment: ["bullish", "bearish", "neutral"].includes(parsed.sentiment) ? parsed.sentiment : "neutral",
    };

    portfolioCache.set(fingerprint, { content: JSON.stringify(result), ts: Date.now() });
    recordAiSuccess();
    res.json({ ...result, cached: false });
  } catch (err: any) {
    tripCircuitBreaker(err);
    logger.warn({ err: err?.message }, "AI portfolio analysis failed — serving computed fallback");
    res.json({
      score, riskLevel,
      summary: `Portfolio spans ${holdings.length} assets. ${riskLevel === "high" ? "High concentration risk detected." : "Moderate diversification."}`,
      bullets: [
        `**Top holding**: ${holdings[0]?.symbol} at ${holdings[0]?.pct.toFixed(1)}% — ${holdings[0]?.pct > 50 ? "consider trimming to reduce concentration risk" : "reasonable position size"}.`,
        `**Diversification**: ${holdings.length < 3 ? "Low — consider spreading across more assets" : holdings.length < 6 ? "Moderate — a few more assets would reduce risk" : "Good — well spread across multiple assets"}.`,
        stableCount > 0 ? `**Risk buffer**: ${stableCount} stablecoin(s) provide downside protection.` : "**Risk buffer**: Adding 10–20% stablecoins (USDT) can protect against drawdowns.",
      ],
      sentiment: riskLevel === "low" ? "bullish" : riskLevel === "high" ? "bearish" : "neutral",
      cached: false,
    });
  }
});

// ── GET /ai/news-sentiment?symbol=BTC — AI-generated news narratives + sentiment ──
// Generates 4 narrative "headlines" about a coin's current situation.
// Cached per symbol (15 min TTL — news narratives are slow to change)

const newsSentimentCache = new BoundedMap<string, CacheEntry>(256);
const NEWS_CACHE_TTL = 15 * 60 * 1000;

router.get("/ai/news-sentiment", async (req, res) => {
  const symbol = normalizeAiSymbol(req.query.symbol);
  if (!symbol) { res.status(400).json({ error: "A valid symbol is required (maximum 40 characters)." }); return; }

  const cached = readFreshCache(newsSentimentCache, symbol, NEWS_CACHE_TTL);
  if (cached) {
    try { res.json({ ...JSON.parse(cached.content), symbol, cached: true }); return; } catch { /* fall through */ }
  }

  if (!isAiAvailable()) {
    res.status(503).json({ symbol, sentiment: null, narratives: [], catalyst: null, risk: null, cached: false, ...unavailableAiResponse() });
    return;
  }

  try {
    const prompt = `Generate an AI-powered market narrative report for ${symbol} as of July 2026.

Return ONLY a JSON object (no markdown, no backticks):
{
  "sentiment": <"bullish" | "bearish" | "neutral">,
  "sentimentScore": <-100 to 100>,
  "narratives": [<4 concise "news headline" style sentences about current ${symbol} developments, market position, or ecosystem news>],
  "catalyst": <1 sentence — biggest positive catalyst right now, or null>,
  "risk": <1 sentence — biggest risk to watch, or null>
}

Be specific to ${symbol}'s actual situation. Focus on: ecosystem developments, institutional flows, technical levels, macro factors. Keep each narrative under 20 words.`;

    const response = await createAiChatCompletion(
      aiJsonMessages(SYSTEM_PROMPT, prompt),
      1024,
      AbortSignal.timeout(aiTimeoutMs()),
      true,
    );

    const raw2 = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw2.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed) throw new Error("No JSON in response");

    newsSentimentCache.set(symbol, { content: JSON.stringify(parsed), ts: Date.now() });
    recordAiSuccess();
    res.json({ ...parsed, symbol, cached: false, available: true });
  } catch (err: any) {
    tripCircuitBreaker(err);
    logger.warn({ err: err?.message, symbol }, "AI news sentiment unavailable");
    res.status(503).json({ symbol, sentiment: null, sentimentScore: null, narratives: [], catalyst: null, risk: null, cached: false, ...unavailableAiResponse() });
  }
});

// ── AI router error handler — catches anything that escapes a route's try/catch ─
// This is the last line of defence before Express's default error handler, which
// would send an HTML 500 page and could expose stack traces in production.
router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(
    { err: (err as any)?.message ?? String(err) },
    "[AI] Uncaught route error — error middleware caught it"
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "AI service temporarily unavailable" });
  }
});

export default router;
