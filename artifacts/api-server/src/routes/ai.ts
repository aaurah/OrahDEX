import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

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

// ── Cache for market analysis (5 min TTL) ────────────────────────────────────
interface CacheEntry { content: string; ts: number }
const analysisCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
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

  try {
    // Save user message
    await db.insert(messages).values({ conversationId: id, role: "user", content });

    // Load conversation history (last 20 messages to stay within context)
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
      model: "gpt-5-mini",
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

    // Save assistant response
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });

    // Update conversation title from first user message if still default
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (conv?.title === "New Chat") {
      const title = content.slice(0, 60).trim();
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI chat error");
    res.write(`data: ${JSON.stringify({ error: err?.message ?? "AI error" })}\n\n`);
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

  try {
    const prompt = `Give a concise 3-paragraph market analysis for ${symbol} as of early 2026. Cover:
1. What the asset is, its core use case, and its position in the market
2. Key recent developments, catalysts, or risks
3. How it might perform on a DEX like OrahDEX that settles on BSV blockchain

Keep it under 200 words. Use plain markdown. No financial advice disclaimer needed — just direct analysis.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content || "Analysis unavailable";
    analysisCache.set(symbol, { content, ts: Date.now() });
    res.json({ symbol, analysis: content, cached: false });
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI market analysis error");
    res.status(500).json({ error: err?.message ?? "Analysis failed" });
  }
});

// ── GET /ai/insights — overall market insights (cached 10 min) ────────────────
const insightsCache: CacheEntry = { content: "", ts: 0 };
const INSIGHTS_TTL = 10 * 60 * 1000;

router.get("/ai/insights", async (_req, res) => {
  if (insightsCache.content && Date.now() - insightsCache.ts < INSIGHTS_TTL) {
    try {
      res.json({ insights: JSON.parse(insightsCache.content), cached: true });
    } catch {
      res.json({ insights: [insightsCache.content], cached: true });
    }
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Give 3 brief, sharp market insights for crypto traders as of March 2026. Each insight should be 1-2 sentences. Format as a JSON array of strings. Focus on actionable trends across DeFi, L2s, and BSV ecosystem. Return only valid JSON, no markdown wrapping.`
        },
      ],
    });

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
    res.json({ insights: parsed, cached: false });
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI insights error");
    res.status(500).json({ error: err?.message ?? "Insights failed" });
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

  try {
    const prompt = action
      ? `Should I ${action} ${symbol} right now? Give a 2-sentence risk assessment with a bullish/bearish/neutral rating. Be direct.`
      : `Give a 1-sentence directional signal for ${symbol} as of March 2026: bullish, bearish, or neutral, and why. Be extremely concise.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const signal = response.choices[0]?.message?.content || "";
    const sentiment = signal.toLowerCase().includes("bullish") ? "bullish"
      : signal.toLowerCase().includes("bearish") ? "bearish" : "neutral";

    signalCache.set(cacheKey, { signal, sentiment, ts: Date.now() });
    res.json({ symbol, signal, sentiment });
  } catch (err: any) {
    logger.error({ err: err?.message }, "AI trade signal error");
    res.status(500).json({ error: err?.message ?? "Signal failed" });
  }
});

export default router;
