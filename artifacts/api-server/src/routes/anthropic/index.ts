import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages, marketsTable, ordersTable } from "@workspace/db/schema";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { eq, asc, desc } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { randomBytes, randomUUID } from "node:crypto";
import {
  parseNaturalLanguageOrder,
  formatOrderConfirmation,
  type ParsedOrderIntent,
} from "../../lib/nlOrderParser.js";

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
      const change = parseFloat(String(m.priceChangePercent24h ?? 0));
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
    logger.error({ err }, "Anthropic stream failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "AI request failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

// ── POST /ai/trade — Natural language order execution ─────────────────────────
//
// Body: { walletAddress: string; message: string; execute?: boolean }
//
// In preview mode (execute !== true): returns intent + confirmation string.
// In execute mode (execute === true):  places the order into ordersTable if
//   the intent has sufficient parameters, then returns orderId.
//
// Flow:
//   1. Fetch top-50 markets for price context
//   2. Parse NL message via Anthropic tool_use
//   3. Build confirmation string
//   4. Optionally insert order row

router.post("/ai/trade", async (req, res) => {
  try {
    const { walletAddress, message, execute } = req.body as {
      walletAddress?: string;
      message?: string;
      execute?: boolean;
    };

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "message is required" });
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
    const intent: ParsedOrderIntent = await parseNaturalLanguageOrder(message.trim(), marketContext);

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

    // 4. Execute if requested and we have enough params
    if (execute === true) {
      const canExecute = canPlaceOrder(intent);

      if (!canExecute) {
        // Not enough info to place — return as preview with a hint
        res.json({
          intent,
          confirmation,
          executed: false,
          hint: "Specify quantity or amount to execute this order.",
        });
        return;
      }

      // Build order row
      const orderId    = randomUUID();
      const nonce      = randomBytes(16).toString("hex");
      const now        = Date.now();
      const expiryUnix = String(now + 24 * 60 * 60 * 1000); // 24 hours

      const orderRow = buildOrderRow({
        orderId,
        nonce,
        expiry: expiryUnix,
        walletAddress,
        intent,
        currentPrice,
      });

      await db.insert(ordersTable).values(orderRow);

      logger.info({ orderId, walletAddress, intent }, "AI trade order placed");

      res.status(201).json({ intent, confirmation, executed: true, orderId });
      return;
    }

    // Preview mode — return intent + confirmation only
    res.json({ intent, confirmation, executed: false });
  } catch (err) {
    logger.error({ err }, "POST /ai/trade failed");
    res.status(500).json({ error: "AI trade request failed" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the intent has enough fields to place a real order
 * (i.e. we know quantity or quoteAmount).
 */
function canPlaceOrder(intent: ParsedOrderIntent): boolean {
  switch (intent.type) {
    case "market":
      return intent.quantity != null || intent.quoteAmount != null;
    case "limit":
      return (intent.quantity != null || intent.quoteAmount != null) && intent.price > 0;
    case "stop_limit":
      return intent.quantity > 0 && intent.stopPrice > 0 && intent.limitPrice > 0;
    case "trailing_stop":
      return intent.quantity > 0 && intent.trailPercent > 0;
    case "twap":
      return intent.totalAmount > 0 && intent.durationMinutes > 0 && intent.slices >= 2;
    case "oco":
      return intent.quantity > 0 && intent.limitPrice > 0 && intent.stopPrice > 0;
    default:
      return false;
  }
}

interface OrderRowParams {
  orderId:       string;
  nonce:         string;
  expiry:        string;
  walletAddress: string;
  intent:        Exclude<ParsedOrderIntent, { type: "unknown" }>;
  currentPrice:  number;
}

/**
 * Map a parsed order intent to an ordersTable insert row.
 * Quantity defaults to 0 when only quoteAmount is specified (matching engine resolves it).
 * Stop price is stored in the stopPrice column when present.
 */
function buildOrderRow(p: OrderRowParams) {
  const { orderId, nonce, expiry, walletAddress, intent, currentPrice } = p;

  // Resolve quantity: use explicit quantity if set; estimate from quoteAmount when possible
  let quantity: string;
  let price: string | undefined;
  let stopPrice: string | undefined;

  switch (intent.type) {
    case "market": {
      const qty = intent.quantity ?? (
        intent.quoteAmount != null && currentPrice > 0
          ? intent.quoteAmount / currentPrice
          : 0
      );
      quantity = String(qty);
      break;
    }
    case "limit": {
      const limitQty = intent.quantity ?? (
        intent.quoteAmount != null && intent.price > 0
          ? intent.quoteAmount / intent.price
          : 0
      );
      quantity = String(limitQty);
      price    = String(intent.price);
      break;
    }
    case "stop_limit":
      quantity  = String(intent.quantity);
      stopPrice = String(intent.stopPrice);
      price     = String(intent.limitPrice);
      break;
    case "trailing_stop":
      quantity = String(intent.quantity);
      // Encode trailPercent in price field for now (exchange engine convention)
      price    = String(intent.trailPercent);
      break;
    case "twap":
      quantity = String(intent.totalAmount);   // quantity = total USD amount for TWAP
      break;
    case "oco":
      quantity  = String(intent.quantity);
      price     = String(intent.limitPrice);
      stopPrice = String(intent.stopPrice);
      break;
  }

  return {
    id:                orderId,
    symbol:            intent.symbol,
    walletAddress:     walletAddress.toLowerCase(),
    networkType:       walletAddress.startsWith("0x") ? "evm" : "bsv",
    side:              intent.side,
    type:              intent.type,
    status:            "open",
    price:             price ?? null,
    stopPrice:         stopPrice ?? null,
    quantity:          quantity || "0",
    remainingQuantity: quantity || "0",
    filledQuantity:    "0",
    fee:               "0",
    nonce,
    expiry,
  };
}

export default router;
