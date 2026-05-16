import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages, marketsTable } from "@workspace/db/schema";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { eq, asc, desc } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

const router = Router();

async function getLiveMarketContext(): Promise<string> {
  try {
    const rows = await db
      .select({
        symbol: marketsTable.symbol,
        baseAsset: marketsTable.baseAsset,
        quoteAsset: marketsTable.quoteAsset,
        lastPrice: marketsTable.lastPrice,
        priceChangePercent24h: marketsTable.priceChangePercent24h,
        volume24h: marketsTable.volume24h,
        high24h: marketsTable.high24h,
        low24h: marketsTable.low24h,
      })
      .from(marketsTable)
      .orderBy(desc(marketsTable.volume24h))
      .limit(30);

    if (!rows.length) return "Live market data unavailable right now.";

    const lines = rows.map((m) => {
      const change = m.priceChangePercent24h ?? 0;
      const arrow = change >= 0 ? "▲" : "▼";
      return `${m.symbol}: $${Number(m.lastPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${arrow}${Math.abs(change).toFixed(2)}% | Vol: $${Number(m.volume24h ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    });

    return `LIVE ORAHDEX MARKET DATA (top 30 by volume, updated now):\n${lines.join("\n")}`;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch live market data for Ora AI context");
    return "Live market data temporarily unavailable.";
  }
}

function buildSystemPrompt(marketContext: string): string {
  return `You are Ora — the AI Trading Intelligence of OrahDEX, a sovereign decentralized exchange where every coin is listed and every trade settles on Bitcoin SV (BSV) blockchain.

Your personality: Calm, sharp, and data-driven. You speak like a seasoned market analyst who deeply understands DeFi, crypto markets, and BSV's unique on-chain settlement model. You are confident but never reckless — you educate, not advise.

About OrahDEX:
- Settlement layer: BSV (Bitcoin SV) — every trade finalizes on-chain
- Keeper Protocol tiers: Standard (30bps), Guardian (25bps), Elder (20bps), Archon (15bps)
- Markets: BSV, BTC, ETH, SOL, all L1/L2s, DeFi, Gaming, Cosmos, AI/DePIN, Meme, RWA, BRC-20, Uniswap pools, PancakeSwap, Base, Zora — 1M+ pairs
- P2P trading: direct fiat-to-crypto, no KYC under thresholds
- Bridge: cross-chain swaps settling via BSV
- Futures: up to 100x leverage
- Spot, Copy Trading, Prediction Markets, NFT, Staking

${marketContext}

Your capabilities:
- Analyze live market data from OrahDEX (you have real-time prices above)
- Identify trends, movers, and signals from the live data
- Explain trading mechanics, fees, and Keeper tiers
- Explain DeFi protocols (Uniswap v3, PancakeSwap, Aave, Curve, etc.)
- Help users understand BSV on-chain settlement
- Suggest market education based on user goals
- Explain cross-chain bridging and settlement

Guidelines:
- Be concise and precise. No filler.
- Use the live data above to answer price/volume/trend questions accurately.
- Format with markdown: bold, bullets, tables when helpful.
- Never give financial advice — only market education and analysis.
- When asked about prices, use the live data you have — do not say you cannot access live data.
- Today's date: ${new Date().toISOString().split("T")[0]}`;
}

router.get("/anthropic/conversations", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.post("/anthropic/conversations", async (req, res) => {
  try {
    const { title } = req.body as { title?: string };
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const [row] = await db
      .insert(conversations)
      .values({ title: title.slice(0, 200) })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, "Failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

router.get("/anthropic/conversations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    res.json({ ...conv, messages: msgs });
  } catch (err) {
    logger.error({ err }, "Failed to get conversation");
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

router.delete("/anthropic/conversations/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

router.get("/anthropic/conversations/:id/messages", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json(msgs);
  } catch (err) {
    logger.error({ err }, "Failed to list messages");
    res.status(500).json({ error: "Failed to list messages" });
  }
});

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  try {
    const convId = Number(req.params.id);
    if (!convId) { res.status(400).json({ error: "Invalid id" }); return; }

    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    await db.insert(messages).values({ conversationId: convId, role: "user", content });

    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(asc(messages.createdAt));

    const chatMessages = allMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const marketContext = await getLiveMarketContext();
    const systemPrompt = buildSystemPrompt(marketContext);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    await db.insert(messages).values({
      conversationId: convId,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Anthropic stream failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "AI request failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

export default router;
