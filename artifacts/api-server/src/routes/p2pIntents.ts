/**
 * P2P Intent Layer API
 *
 * Implements the intent model from the OrahDEX architecture document:
 *   "I will swap up to X of token A for token B at price P or better."
 *
 * Intents are signed off-chain, matched off-chain, settled on-chain.
 * This API handles the off-chain part: posting, listing, filling, cancelling.
 *
 * Endpoints:
 *   POST   /api/p2p/intents           — post a new swap intent
 *   GET    /api/p2p/intents           — list open intents (filterable)
 *   GET    /api/p2p/intents/:id       — get a single intent
 *   POST   /api/p2p/intents/:id/fill  — fill an intent (taker)
 *   DELETE /api/p2p/intents/:id       — cancel an intent (maker only)
 *   GET    /api/p2p/stats             — aggregate stats
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { p2pIntentsTable } from "@workspace/db/schema";
import { eq, and, or, desc, count, sql as drizzleSql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { FALLBACK_PRICES } from "../lib/priceUpdater.js";

const router = Router();

// ── POST /api/p2p/intents ─────────────────────────────────────────────────────
router.post("/p2p/intents", async (req, res) => {
  try {
    const {
      makerAddress,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      price,
      fiat          = "USD",
      paymentMethods = "",
      terms          = "",
      signature      = "",
      expiresInMs    = 24 * 60 * 60 * 1000,  // default 24 hours
    } = req.body as {
      makerAddress?: string;
      tokenIn?: string;
      tokenOut?: string;
      amountIn?: string | number;
      minAmountOut?: string | number;
      price?: string | number;
      fiat?: string;
      paymentMethods?: string;
      terms?: string;
      signature?: string;
      expiresInMs?: number;
    };

    if (!makerAddress || !tokenIn || !tokenOut || !amountIn || !minAmountOut) {
      res.status(400).json({ error: "makerAddress, tokenIn, tokenOut, amountIn and minAmountOut are required" });
      return;
    }

    const addr    = makerAddress.toLowerCase();
    const maxTtl  = 7 * 24 * 60 * 60 * 1000; // 7 days max
    const ttl     = Math.min(Math.max(expiresInMs, 60_000), maxTtl);
    const expiresAt = new Date(Date.now() + ttl);

    // Derive implied price if not given
    let impliedPrice = price ? String(price) : null;
    if (!impliedPrice) {
      const inPrice  = FALLBACK_PRICES[tokenIn.toUpperCase()]  ?? 0;
      const outPrice = FALLBACK_PRICES[tokenOut.toUpperCase()] ?? 0;
      if (inPrice > 0 && outPrice > 0) {
        impliedPrice = String(inPrice / outPrice);
      }
    }

    const intentId = randomUUID();
    const [intent] = await db.insert(p2pIntentsTable).values({
      intentId,
      makerAddress:  addr,
      tokenIn:       tokenIn.toUpperCase(),
      tokenOut:      tokenOut.toUpperCase(),
      amountIn:      String(amountIn),
      minAmountOut:  String(minAmountOut),
      price:         impliedPrice ?? String(amountIn),
      fiat:          fiat.toUpperCase(),
      paymentMethods,
      terms,
      signature,
      status:        "open",
      expiresAt,
    }).returning();

    logger.info({ intentId, addr, tokenIn, tokenOut }, "P2P intent posted");
    res.status(201).json(intent);
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /p2p/intents failed");
    res.status(500).json({ error: err?.message ?? "Failed to post intent" });
  }
});

// ── GET /api/p2p/intents ──────────────────────────────────────────────────────
router.get("/p2p/intents", async (req, res) => {
  try {
    const {
      tokenIn,
      tokenOut,
      maker,
      status  = "open",
      limit:  limitStr = "50",
    } = req.query as Record<string, string | undefined>;

    const limitN = Math.min(parseInt(limitStr ?? "50"), 200);

    // Expire stale open intents
    await db.update(p2pIntentsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(
        eq(p2pIntentsTable.status, "open"),
        drizzleSql`expires_at < NOW()`,
      ));

    const conditions = [];
    if (status)   conditions.push(eq(p2pIntentsTable.status, status));
    if (tokenIn)  conditions.push(eq(p2pIntentsTable.tokenIn,  tokenIn.toUpperCase()));
    if (tokenOut) conditions.push(eq(p2pIntentsTable.tokenOut, tokenOut.toUpperCase()));
    if (maker)    conditions.push(eq(p2pIntentsTable.makerAddress, maker.toLowerCase()));

    const intents = await db.select().from(p2pIntentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(p2pIntentsTable.createdAt))
      .limit(limitN);

    res.json({ intents, total: intents.length });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /p2p/intents failed");
    res.status(500).json({ error: err?.message ?? "Failed to list intents" });
  }
});

// ── GET /api/p2p/intents/:id ──────────────────────────────────────────────────
router.get("/p2p/intents/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    res.json(intent);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch intent" });
  }
});

// ── POST /api/p2p/intents/:id/fill ────────────────────────────────────────────
router.post("/p2p/intents/:id/fill", async (req, res) => {
  try {
    const id           = req.params.id;
    const { takerAddress, amountOut } = req.body as {
      takerAddress?: string;
      amountOut?: string | number;
    };

    if (!takerAddress || !amountOut) {
      res.status(400).json({ error: "takerAddress and amountOut are required" });
      return;
    }

    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    if (intent.status !== "open") {
      res.status(409).json({ error: `Intent is already ${intent.status}` }); return;
    }
    if (new Date() > intent.expiresAt) {
      await db.update(p2pIntentsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(p2pIntentsTable.intentId, id));
      res.status(410).json({ error: "Intent has expired" }); return;
    }

    const minOut = parseFloat(intent.minAmountOut);
    const actualOut = parseFloat(String(amountOut));
    if (actualOut < minOut) {
      res.status(400).json({
        error: `amountOut ${actualOut} is below minAmountOut ${minOut} (slippage check failed)`,
      });
      return;
    }

    const [filled] = await db.update(p2pIntentsTable).set({
      status:          "filled",
      takerAddress:    takerAddress.toLowerCase(),
      filledAmountOut: String(amountOut),
      updatedAt:       new Date(),
    }).where(eq(p2pIntentsTable.intentId, id)).returning();

    logger.info({ id, takerAddress, amountOut }, "P2P intent filled");
    res.json({ success: true, intent: filled });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /p2p/intents/:id/fill failed");
    res.status(500).json({ error: err?.message ?? "Fill failed" });
  }
});

// ── DELETE /api/p2p/intents/:id ───────────────────────────────────────────────
router.delete("/p2p/intents/:id", async (req, res) => {
  try {
    const id   = req.params.id;
    const addr = (req.query.walletAddress as string | undefined)?.toLowerCase();

    const [intent] = await db.select().from(p2pIntentsTable)
      .where(eq(p2pIntentsTable.intentId, id));

    if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
    if (addr && intent.makerAddress !== addr) {
      res.status(403).json({ error: "Only the maker can cancel this intent" }); return;
    }
    if (intent.status !== "open") {
      res.status(409).json({ error: `Intent is already ${intent.status}` }); return;
    }

    await db.update(p2pIntentsTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(p2pIntentsTable.intentId, id));

    res.json({ success: true, intentId: id, status: "cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Cancel failed" });
  }
});

// ── GET /api/p2p/stats ────────────────────────────────────────────────────────
router.get("/p2p/stats", async (_req, res) => {
  try {
    const [stats] = await db.select({
      total:     count(),
      open:      drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
      filled:    drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'filled')`,
      cancelled: drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'cancelled')`,
      expired:   drizzleSql<number>`COUNT(*) FILTER (WHERE status = 'expired')`,
    }).from(p2pIntentsTable);

    res.json({
      total:     stats?.total     ?? 0,
      open:      stats?.open      ?? 0,
      filled:    stats?.filled    ?? 0,
      cancelled: stats?.cancelled ?? 0,
      expired:   stats?.expired   ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch stats" });
  }
});

export default router;
