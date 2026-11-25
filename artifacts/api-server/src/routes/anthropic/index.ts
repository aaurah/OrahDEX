import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages, marketsTable } from "@workspace/db/schema";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  createDevaiOllamaStream,
  isDevaiOllamaEnabled,
  oraModel,
  type DevAiChatMessage,
} from "@workspace/integrations-openai-ai-server";
import { eq, asc, desc } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { aiChatRateLimit } from "../../middleware/aiChatRateLimit.js";
import { getApiOllamaStatus as getDevaiOllamaStatus } from "../../lib/ollamaRuntime.js";
import { buildOraSystemPrompt } from "../../lib/oraPrompt.js";
import {
  parseNaturalLanguageOrder,
  formatOrderConfirmation,
} from "../../lib/nlOrderParser.js";

const router = Router();

router.get("/anthropic/status", async (_req, res) => {
  if (isDevaiOllamaEnabled()) {
    const { availableModels: _models, ...status } = await getDevaiOllamaStatus(oraModel);
    res.json(status);
    return;
  }
  const configured = Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL);
  res.json({
    provider: "anthropic", model: "claude-sonnet-4-6",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    ready: false, code: configured ? "UNVERIFIED" : "AI_PROVIDER_NOT_CONFIGURED",
    error: configured ? "Hosted provider is configured; send a message to verify a response."
      : "Anthropic integration is not configured on this API runtime.",
  });
});

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
      .limit(12);

    if (!rows.length) return "Live market data unavailable right now.";

    const lines = rows.map((m) => {
      const change = parseFloat(String(m.priceChangePercent24h ?? 0));
      const arrow = change >= 0 ? "▲" : "▼";
      return `${m.symbol}: $${Number(m.lastPrice ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${arrow}${Math.abs(change).toFixed(2)}% | Vol: $${Number(m.volume24h ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    });

    return `LIVE ORAHDEX MARKET DATA (top 12 by volume, updated now):\n${lines.join("\n")}`;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch live market data for Ora AI context");
    return "Live market data temporarily unavailable.";
  }
}

function buildSystemPrompt(marketContext: string): string {
  return buildOraSystemPrompt(marketContext);
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

router.post("/anthropic/conversations/:id/messages", aiChatRateLimit, async (req, res) => {
  try {
    const convId = Number(req.params.id);
    if (!convId) { res.status(400).json({ error: "Invalid id" }); return; }

    const { content } = req.body as { content?: string };
    if (!content || typeof content !== "string" || !content.trim() || content.length > 12_000) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

    const useLocalOllama = isDevaiOllamaEnabled();
    if (useLocalOllama) {
      const status = await getDevaiOllamaStatus(oraModel);
      if (!status.ready) {
        res.status(503).json({ error: status.error, code: status.code, model: oraModel, provider: status.provider });
        return;
      }
    } else if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || !process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL) {
      res.status(503).json({ error: "Anthropic integration is not configured on this API runtime.", code: "AI_PROVIDER_NOT_CONFIGURED" });
      return;
    }

    await db.insert(messages).values({ conversationId: convId, role: "user", content });

    const allMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(desc(messages.createdAt)).limit(20);

    const chatMessages = allMessages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const marketContext = await getLiveMarketContext();
    const systemPrompt = buildSystemPrompt(marketContext);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 120_000);
    const heartbeat = setInterval(() => {
      if (!res.destroyed) res.write(": waiting for model\n\n");
    }, 10_000);
    const cleanUp = () => { clearTimeout(deadline); clearInterval(heartbeat); controller.abort(); };
    res.once("close", cleanUp);
    res.once("finish", cleanUp);

    let fullResponse = "";

    if (useLocalOllama) {
      const ollamaMessages: DevAiChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...chatMessages,
      ];
      const stream = await createDevaiOllamaStream(ollamaMessages, 512, oraModel, controller.signal);
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
    } else {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: chatMessages,
      }, { signal: controller.signal });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
        }
      }
    }

    // Persist the assistant reply independently — a DB failure must not
    // send a false error event to the client (the user already saw the response).
    db.insert(messages).values({
      conversationId: convId,
      role: "assistant",
      content: fullResponse,
    }).catch((dbErr: unknown) => {
      logger.error({ dbErr }, "Anthropic: failed to persist assistant message");
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const localOllama = isDevaiOllamaEnabled();
    logger.error({ err, provider: localOllama ? "ollama" : "anthropic" }, "Ora chat stream failed");
    if (!res.headersSent) {
      res.status(localOllama ? 503 : 500).json({
        error: localOllama
          ? "Local Ollama could not complete this chat. Check Admin → DevAI for model status."
          : "AI request failed",
      });
    } else {
      const message = localOllama
        ? "Local Ollama could not complete this chat. Check Admin → DevAI for model status."
        : "AI stream error. Please try again.";
      res.write(`data: ${JSON.stringify({ content: message })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  }
});

// ── POST /ai/trade — Natural language order execution ─────────────────────────
//
// Body: { message: string; execute?: boolean }
//
// In preview mode (execute !== true): returns intent + confirmation string.
// Execution is deliberately disabled here. AI intent parsing is not a
// substitute for a wallet signature, funding proof, or the signed order flow.
//
// Flow:
//   1. Fetch top-50 markets for price context
//   2. Parse NL message via Anthropic tool_use
//   3. Build confirmation string
//   4. Return a preview; execution remains in the wallet-signed order flow.

router.post("/ai/trade", aiChatRateLimit, async (req, res) => {
  try {
    const { message, execute } = req.body as {
      message?: string;
      execute?: boolean;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    if (message.length > 2_000) {
      res.status(413).json({ error: "message must be 2000 characters or fewer" });
      return;
    }
    if (execute !== undefined && typeof execute !== "boolean") {
      res.status(400).json({ error: "execute must be a boolean" });
      return;
    }
    if (execute === true) {
      res.status(409).json({
        error: "AI cannot submit an order directly. Use the wallet-signed order flow to authorize and fund trades.",
        code: "SIGNED_ORDER_FLOW_REQUIRED",
        executed: false,
      });
      return;
    }

    // 1. Fetch top-50 markets by volume for price context
    const marketRows = await db
      .select({ symbol: marketsTable.symbol, lastPrice: marketsTable.lastPrice })
      .from(marketsTable)
      .orderBy(desc(marketsTable.volume24h))
      .limit(50);

    const marketContext = marketRows.map((m) => ({
      symbol:    m.symbol,
      lastPrice: parseFloat(String(m.lastPrice ?? 0)),
    }));

    // 2. Parse the natural language instruction
    const intent = await parseNaturalLanguageOrder(message.trim(), marketContext);

    // 3. Build confirmation string
    if (intent.type === "unknown") {
      res.json({ intent, confirmation: intent.reason, executed: false });
      return;
    }

    // Find the current price for this symbol (used in confirmation)
    const symbolMatch = marketContext.find(
      (m) => m.symbol.toUpperCase() === intent.symbol.toUpperCase(),
    );
    const currentPrice = symbolMatch?.lastPrice ?? 0;
    const confirmation = formatOrderConfirmation(intent, currentPrice);

    res.json({ intent, confirmation, executed: false });
  } catch (err) {
    logger.error({ err }, "POST /ai/trade failed");
    res.status(500).json({ error: "AI trade request failed" });
  }
});

export default router;
