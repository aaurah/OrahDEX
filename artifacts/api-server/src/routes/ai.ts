import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getTopHlMarkets } from "../lib/hyperliquid.js";

const router = Router();

// ── Safety middleware: hard 25-second deadline on every AI route ──────────────
// If a handler hangs (e.g. SSE stream never closes, OpenAI call stalls without
// triggering AbortSignal), this ensures the response is always eventually sent.
router.use((_req: Request, res: Response, next: NextFunction) => {
  const deadline = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: "AI service timeout — please retry" });
    }
  }, 25_000);
  res.on("finish", () => clearTimeout(deadline));
  res.on("close",  () => clearTimeout(deadline));
  next();
});

const SYSTEM_PROMPT = `You are Ora — the AI Trading Intelligence of OrahDEX, a sovereign decentralized exchange where every coin is listed and every trade settles on BSV (Bitcoin SV) blockchain.

Your personality: You are calm, knowledgeable, and direct. You speak like an experienced market analyst and DeFi expert who also deeply understands Bitcoin SV's unique on-chain settlement model.

What you know about OrahDEX:
- BSV (Bitcoin SV) is the settlement layer for all trades
- Keeper Protocol tiers: Standard (30bps fee), Guardian (25bps), Elder (20bps), Archon (15bps)
- Markets include: BSV, BTC, ETH, SOL, all Layer 1/2s, DeFi, Gaming, Cosmos, AI/DePIN, Meme, RWA, BRC-20, Uniswap pools, PancakeSwap, Base, Zora
- P2P trading allows direct fiat-to-crypto with no KYC under thresholds
- Bridge supports cross-chain swaps settling via BSV
- Futures trading with up to 100x leverage

Your capabilities:
- Analyze markets and specific coins
- Explain trading mechanics and fees
- Suggest trading strategies based on user goals
- Explain DeFi protocols (Uniswap v3, PancakeSwap, Aave, etc.)
- Help users understand BSV on-chain settlement
- Answer questions about specific coins, pairs, and market trends
- Explain how BSV compares to other blockchains as a settlement layer

Guidelines:
- Be concise. No fluff.
- Use numbers and data when you can.
- When discussing prices, note that you have general knowledge up to your training cutoff, but live prices come from the markets page.
- Always suggest checking live prices on the Markets tab for real-time data.
- Never give financial advice — only market education and analysis.
- Format responses with markdown when helpful (bullet points, bold text).

Today is approximately March 2026. BSV settlement is the backbone of OrahDEX's sovereign identity.`;

// ── Circuit breaker — trips on auth errors AND repeated timeouts ───────────────

let aiUnavailable = false;
let aiUnavailableUntil = 0;
let consecutiveTimeouts = 0;
const AI_AUTH_BACKOFF_MS    = 5 * 60 * 1000;  // 5 min for auth errors
const AI_TIMEOUT_BACKOFF_MS = 2 * 60 * 1000;  // 2 min after 3 consecutive timeouts
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

function isAiAvailable(): boolean {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return false;
  if (aiUnavailable && Date.now() < aiUnavailableUntil) return false;
  if (Date.now() >= aiUnavailableUntil) { aiUnavailable = false; consecutiveTimeouts = 0; }
  return true;
}

function tripCircuitBreaker(err: unknown) {
  if (isAuthError(err)) {
    aiUnavailable      = true;
    aiUnavailableUntil = Date.now() + AI_AUTH_BACKOFF_MS;
    consecutiveTimeouts = 0;
    logger.warn("AI provider unavailable (auth error) — backing off 5 min");
  } else if (isAbortError(err)) {
    consecutiveTimeouts++;
    if (consecutiveTimeouts >= AI_TIMEOUT_THRESHOLD) {
      aiUnavailable      = true;
      aiUnavailableUntil = Date.now() + AI_TIMEOUT_BACKOFF_MS;
      logger.warn({ consecutiveTimeouts }, "AI provider repeatedly timing out — backing off 2 min");
    }
  } else {
    consecutiveTimeouts = 0;
  }
}

// ── Fallback content ──────────────────────────────────────────────────────────

const FALLBACK_INSIGHTS = [
  "Monitor BSV on-chain settlement volumes for early trend signals.",
  "DeFi TVL remains a leading indicator for altcoin rotations.",
  "Cross-chain bridge flows signal where liquidity is moving next.",
];

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
const analysisCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

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

router.post("/ai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid conversation id" }); return; }

  const content = (req.body?.content ?? "").trim();
  if (!content) { res.status(400).json({ error: "Content is required" }); return; }

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

  // If AI is unavailable, stream the fallback response
  if (!isAiAvailable()) {
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
      .orderBy(asc(messages.createdAt));
    const last20 = history.slice(-20);

    const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...last20.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) {
        fullResponse += token;
        res.write(`data: ${JSON.stringify({ content: token })}\n\n`);
      }
    }

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (conv?.title === "New Chat") {
      const title = content.slice(0, 60).trim();
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    tripCircuitBreaker(err);
    logger.error({ err: err?.message }, "AI chat error");
    // Stream fallback so the UI shows something, not a hanging spinner
    res.write(`data: ${JSON.stringify({ content: FALLBACK_CHAT })}\n\n`);
    try {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: FALLBACK_CHAT });
    } catch { /* non-fatal */ }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

// ── GET /ai/market-analysis?symbol=BTC — cached AI analysis for a coin ───────

router.get("/ai/market-analysis", async (req, res) => {
  const symbol = ((req.query.symbol as string) ?? "").toUpperCase().trim();
  if (!symbol) { res.status(400).json({ error: "symbol is required" }); return; }

  const cached = analysisCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.json({ symbol, analysis: cached.content, cached: true });
    return;
  }

  if (!isAiAvailable()) {
    res.json({ symbol, analysis: fallbackAnalysis(symbol), cached: false });
    return;
  }

  try {
    const prompt = `Give a concise 3-paragraph market analysis for ${symbol} as of early 2026. Cover:
1. What the asset is, its core use case, and its position in the market
2. Key recent developments, catalysts, or risks
3. How it might perform on a DEX like OrahDEX that settles on BSV blockchain

Keep it under 200 words. Use plain markdown. No financial advice disclaimer needed — just direct analysis.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }, { signal: AbortSignal.timeout(15_000) });

    const content = response.choices[0]?.message?.content || fallbackAnalysis(symbol);
    analysisCache.set(symbol, { content, ts: Date.now() });
    consecutiveTimeouts = 0;
    if (!res.headersSent) res.json({ symbol, analysis: content, cached: false });
  } catch (err: any) {
    tripCircuitBreaker(err);
    if (isAbortError(err)) {
      logger.warn({ symbol }, "AI market analysis timeout — serving fallback");
    } else {
      logger.error({ err: err?.message }, "AI market analysis error");
    }
    if (!res.headersSent) res.json({ symbol, analysis: fallbackAnalysis(symbol), cached: false });
  }
});

// ── GET /ai/insights — overall market insights (cached 10 min) ────────────────

const insightsCache: CacheEntry = { content: "", ts: 0 };
const INSIGHTS_TTL = 10 * 60 * 1000;

router.get("/ai/insights", async (_req, res) => {
  if (insightsCache.content && Date.now() - insightsCache.ts < INSIGHTS_TTL) {
    try {
      if (!res.headersSent) res.json({ insights: JSON.parse(insightsCache.content), cached: true });
    } catch {
      if (!res.headersSent) res.json({ insights: FALLBACK_INSIGHTS, cached: true });
    }
    return;
  }

  // Serve stale cache immediately if AI is unavailable — don't make the user wait
  if (!isAiAvailable()) {
    const stale = insightsCache.content ? JSON.parse(insightsCache.content) : FALLBACK_INSIGHTS;
    if (!res.headersSent) res.json({ insights: stale, cached: true });
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Give 3 brief, sharp market insights for crypto traders right now. Each insight should be 1-2 sentences. Format as a JSON array of strings. Focus on actionable trends across DeFi, L2s, and BSV ecosystem. Return only valid JSON, no markdown wrapping.${hlContext}`
        },
      ],
    }, { signal: AbortSignal.timeout(15_000) });  // 15s — insights are lightweight

    const raw = response.choices[0]?.message?.content || "[]";
    let parsed: string[];
    try {
      parsed = JSON.parse(raw.trim().replace(/^```json\n?/, "").replace(/\n?```$/, ""));
    } catch {
      parsed = [raw];
    }

    const content = JSON.stringify(parsed);
    insightsCache.content = content;
    insightsCache.ts = Date.now();
    consecutiveTimeouts = 0;  // success — reset timeout counter
    if (!res.headersSent) res.json({ insights: parsed, cached: false });
  } catch (err: any) {
    tripCircuitBreaker(err);
    // Serve stale cache on error — don't return empty hands to the client
    const stale = insightsCache.content ? JSON.parse(insightsCache.content) : FALLBACK_INSIGHTS;
    if (isAbortError(err)) {
      logger.warn({ timeouts: consecutiveTimeouts }, "AI insights timeout — serving stale/fallback");
    } else {
      logger.error({ err: err?.message }, "AI insights error");
    }
    if (!res.headersSent) res.json({ insights: stale, cached: true });
  }
});

// ── GET /ai/trade-signal?symbol=BTC&action=buy — quick trade signal (cached 5 min) ──

const signalCache = new Map<string, { signal: string; sentiment: string; ts: number }>();
const SIGNAL_CACHE_TTL = 5 * 60 * 1000;

router.get("/ai/trade-signal", async (req, res) => {
  const symbol = ((req.query.symbol as string) ?? "BTC").toUpperCase().trim();
  const action = ((req.query.action as string) ?? "").toLowerCase().trim();
  const cacheKey = `${symbol}:${action}`;

  const cached = signalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SIGNAL_CACHE_TTL) {
    res.json({ symbol, signal: cached.signal, sentiment: cached.sentiment, cached: true });
    return;
  }

  if (!isAiAvailable()) {
    const fb = fallbackSignal(symbol);
    if (!res.headersSent) res.json({ symbol, ...fb, cached: false });
    return;
  }

  try {
    const prompt = action
      ? `Should I ${action} ${symbol} right now? Give a 2-sentence risk assessment with a bullish/bearish/neutral rating. Be direct.`
      : `Give a 1-sentence directional signal for ${symbol} as of March 2026: bullish, bearish, or neutral, and why. Be extremely concise.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }, { signal: AbortSignal.timeout(15_000) });

    const signal = response.choices[0]?.message?.content || fallbackSignal(symbol).signal;
    const sentiment = signal.toLowerCase().includes("bullish") ? "bullish"
      : signal.toLowerCase().includes("bearish") ? "bearish" : "neutral";

    signalCache.set(cacheKey, { signal, sentiment, ts: Date.now() });
    consecutiveTimeouts = 0;
    if (!res.headersSent) res.json({ symbol, signal, sentiment });
  } catch (err: any) {
    tripCircuitBreaker(err);
    if (isAbortError(err)) {
      logger.warn({ symbol }, "AI trade signal timeout — serving fallback");
    } else {
      logger.error({ err: err?.message }, "AI trade signal error");
    }
    const fb = fallbackSignal(symbol);
    if (!res.headersSent) res.json({ symbol, ...fb, cached: false });
  }
});

// ── GET /ai/portfolio-analysis — AI review of a user's holdings ──────────────
// holdings param: JSON array of {symbol, valueUSD, pct} objects
// Cached per unique portfolio fingerprint (5 min TTL)

const portfolioCache = new Map<string, CacheEntry>();
const PORTFOLIO_CACHE_TTL = 5 * 60 * 1000;

router.get("/ai/portfolio-analysis", async (req, res) => {
  const raw = (req.query.holdings as string) ?? "";
  if (!raw) { res.status(400).json({ error: "holdings is required" }); return; }

  let holdings: Array<{ symbol: string; valueUSD: number; pct: number }>;
  try { holdings = JSON.parse(raw); } catch {
    res.status(400).json({ error: "holdings must be valid JSON" }); return;
  }

  if (!holdings.length) {
    res.json({ score: 50, riskLevel: "medium", summary: "No holdings found to analyze.", bullets: [], sentiment: "neutral" });
    return;
  }

  const fingerprint = holdings.map(h => `${h.symbol}:${h.pct.toFixed(1)}`).sort().join(",");
  const cached = portfolioCache.get(fingerprint);
  if (cached && Date.now() - cached.ts < PORTFOLIO_CACHE_TTL) {
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }, { signal: AbortSignal.timeout(15_000) });

    const raw2 = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw2.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed) throw new Error("No JSON in response");

    portfolioCache.set(fingerprint, { content: JSON.stringify(parsed), ts: Date.now() });
    consecutiveTimeouts = 0;
    res.json({ ...parsed, cached: false });
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

const newsSentimentCache = new Map<string, CacheEntry>();
const NEWS_CACHE_TTL = 15 * 60 * 1000;

router.get("/ai/news-sentiment", async (req, res) => {
  const symbol = ((req.query.symbol as string) ?? "").toUpperCase().trim();
  if (!symbol) { res.status(400).json({ error: "symbol is required" }); return; }

  const cached = newsSentimentCache.get(symbol);
  if (cached && Date.now() - cached.ts < NEWS_CACHE_TTL) {
    try { res.json({ ...JSON.parse(cached.content), symbol, cached: true }); return; } catch { /* fall through */ }
  }

  const fallbackNarratives = [
    `**${symbol}** continues to trade with mixed signals across major markets.`,
    "On-chain data shows steady accumulation from long-term holders.",
    "Macro crypto sentiment remains cautiously optimistic heading into Q3 2026.",
    "Watch key support/resistance levels before entering new positions.",
  ];

  if (!isAiAvailable()) {
    res.json({ symbol, sentiment: "neutral", narratives: fallbackNarratives, catalyst: null, risk: null, cached: false });
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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }, { signal: AbortSignal.timeout(15_000) });

    const raw2 = response.choices[0]?.message?.content ?? "";
    const jsonMatch = raw2.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (!parsed) throw new Error("No JSON in response");

    newsSentimentCache.set(symbol, { content: JSON.stringify(parsed), ts: Date.now() });
    consecutiveTimeouts = 0;
    res.json({ ...parsed, symbol, cached: false });
  } catch (err: any) {
    tripCircuitBreaker(err);
    logger.warn({ err: err?.message, symbol }, "AI news sentiment failed — serving fallback");
    res.json({ symbol, sentiment: "neutral", sentimentScore: 0, narratives: fallbackNarratives, catalyst: null, risk: null, cached: false });
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
