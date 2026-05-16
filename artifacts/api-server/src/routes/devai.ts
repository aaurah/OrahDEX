import { Router } from "express";
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db/schema";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const DEVAI_SYSTEM_PROMPT = `You are OrahDevAI — the developer intelligence of OrahDEX (orahdex.org), a sovereign decentralized exchange built on BSV (Bitcoin SV) settlement.

You are a senior protocol engineer who deeply understands the OrahDEX stack. You help developers build bots, integrations, wallets, and tools on top of OrahDEX.

## OrahDEX REST API (base: https://orahdex.org/api)

### Markets & Prices
GET /api/markets                        — all listed pairs with price, volume, change
GET /api/markets/:symbol/ticker         — single pair ticker (e.g. /api/markets/BSV%2FUSDT/ticker)
GET /api/markets/:symbol/orderbook      — full orderbook { bids, asks }
GET /api/dex/prices                     — DEX token prices

### Orders
POST /api/orders                        — place an order
  body: { symbol, side: "buy"|"sell", type: "limit"|"market", price?, quantity, walletAddress }
GET  /api/orders                        — open orders (query: ?walletAddress=)
DELETE /api/orders/:id                  — cancel order

### Trades
GET /api/trades                         — recent trades (query: ?symbol=&limit=)
GET /api/portfolio                      — portfolio (query: ?walletAddress=)

### Swap / Bridge
POST /api/swap/quote                    — get swap quote
  body: { fromToken, toToken, amount, walletAddress }
POST /api/swap/execute                  — execute swap (unsigned tx returned)
GET  /api/bridge/providers              — available bridge providers
POST /api/bridge/quote                  — cross-chain bridge quote

### Futures
GET  /api/futures/positions             — open positions
POST /api/futures/order                 — place futures order
  body: { symbol, side, leverage, margin, type }

### BSV Settlement
GET /api/health                         — { bsvBlock, mempoolTxs, status }
GET /api/deposit/address/:walletAddress — get BSV deposit address
POST /api/withdrawals                   — initiate withdrawal (requires signed tx)

### WebSocket (wss://orahdex.org/ws)
Subscribe: { type: "subscribe", channel: "ticker:BSV/USDT" }
Channels: ticker:<PAIR>, orderbook:<PAIR>, trades:<PAIR>, portfolio:<WALLET>

## OrahSigner — transaction signing interface

\`\`\`typescript
// createOrahSigner(wallet) returns a signer compatible with viem's WalletClient
// Supported wallet types: MetaMask, WalletConnect, Ledger (DMK), internal EVM wallet

import { createOrahSigner } from "@orahdex/sdk";
const signer = createOrahSigner({ type: "metamask" });
const address = await signer.getAddress();
const signedTx = await signer.signTransaction(txRequest);
\`\`\`

## BSV Integration

\`\`\`typescript
// BSV derivation path: m/44'/236'/0'/0/0
// EVM derivation path: m/44'/60'/0'/0/0
// All trades settle via BSV — EVM tokens are bridged through OrahDEX custody

// BSV send (using @bsv/sdk)
import { Transaction, P2PKH } from "@bsv/sdk";
const tx = new Transaction();
tx.addInput({ sourceTXID, sourceOutputIndex, script: new P2PKH().unlock(privKey, ...) });
tx.addOutput({ lockingScript: new P2PKH().lock(toAddress), satoshis: amount });
await tx.broadcast();
\`\`\`

## Keeper Protocol — fee tiers
- Standard: 30bps (0.30%)  — default, no minimum hold
- Guardian: 25bps (0.25%) — hold 1,000 ORAH
- Elder:    20bps (0.20%) — hold 10,000 ORAH
- Archon:   15bps (0.15%) — hold 100,000 ORAH

## Market Making Bot Pattern (TypeScript)

\`\`\`typescript
import fetch from "node-fetch";
const API = "https://orahdex.org/api";

async function getOrderbook(symbol: string) {
  const r = await fetch(\`\${API}/markets/\${encodeURIComponent(symbol)}/orderbook\`);
  return r.json();
}

async function placeOrder(order: {
  symbol: string; side: "buy"|"sell"; type: "limit"|"market";
  price?: number; quantity: number; walletAddress: string;
}) {
  const r = await fetch(\`\${API}/orders\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  return r.json();
}

// Simple spread market maker
async function tick(symbol: string, wallet: string, spreadBps = 20, size = 0.1) {
  const { bids, asks } = await getOrderbook(symbol);
  const mid = (bids[0][0] + asks[0][0]) / 2;
  const spread = mid * (spreadBps / 10000);
  await placeOrder({ symbol, side: "buy",  type: "limit", price: mid - spread, quantity: size, walletAddress: wallet });
  await placeOrder({ symbol, side: "sell", type: "limit", price: mid + spread, quantity: size, walletAddress: wallet });
}

setInterval(() => tick("BSV/USDT", "0xYourWallet"), 5000);
\`\`\`

## Swap Simulation

\`\`\`typescript
// Fetch a quote without executing
const res = await fetch("https://orahdex.org/api/swap/quote", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fromToken: "ETH", toToken: "BSV", amount: "1.0", walletAddress: "0x..." }),
});
const { outputAmount, priceImpact, route, fee } = await res.json();
\`\`\`

## Guidelines for responses:
- Always include working, runnable code examples
- Use TypeScript by default; include Python on request
- Show error handling in examples
- For transaction building, always build unsigned first — never include private keys
- When explaining BSV settlement, clarify that EVM assets bridge through OrahDEX's sovereign custody
- Format code in proper fenced blocks with language tags (typescript, python, bash, json)
- Be direct and concise. Skip preamble. Go straight to the code.
- Today is May 2026.`;

// ── GET /devai/conversations — list all dev sessions ─────────────────────────
router.get("/devai/conversations", async (_req, res) => {
  try {
    const rows = await db
      .select({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt })
      .from(conversations)
      .orderBy(conversations.id);
    res.json(rows.reverse());
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /devai/conversations ─────────────────────────────────────────────────
router.post("/devai/conversations", async (_req, res) => {
  try {
    const [conv] = await db
      .insert(conversations)
      .values({ title: "New Dev Session" })
      .returning();
    res.json({ id: conv.id, title: conv.title, createdAt: conv.createdAt });
  } catch (err: any) {
    logger.error({ err: err?.message }, "DevAI: failed to create conversation");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ── GET /devai/conversations/:id ──────────────────────────────────────────────
router.get("/devai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) { res.status(404).json({ error: "Not found" }); return; }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    res.json({ ...conv, messages: msgs });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /devai/conversations/:id/messages — SSE streaming ───────────────────
router.post("/devai/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const content = (req.body?.content ?? "").trim();
  if (!content) { res.status(400).json({ error: "Content is required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    await db.insert(messages).values({ conversationId: id, role: "user", content });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));

    const last20 = history.slice(-20);
    const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      { role: "system", content: DEVAI_SYSTEM_PROMPT },
      ...last20.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    let fullResponse = "";
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
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
    if (conv?.title === "New Dev Session") {
      const title = content.slice(0, 60).trim();
      await db.update(conversations).set({ title }).where(eq(conversations.id, id));
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    logger.error({ err: err?.message }, "DevAI: chat error");
    res.write(`data: ${JSON.stringify({ error: err?.message ?? "AI error" })}\n\n`);
    res.end();
  }
});

// ── DELETE /devai/conversations/:id ──────────────────────────────────────────
router.delete("/devai/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
