/**
 * externalSwap.ts — Seamless LE/SS swap backend for zero-liquidity trading pairs.
 *
 * GET  /api/external-swap/quote?from=BTC&to=USDT&amount=0.01
 *      → best rate from LetsExchange (fallback SimpleSwap)
 *
 * POST /api/external-swap/execute
 *      body: { fromCoin, toCoin, amount, walletAddress, outputAddress, symbol?, side? }
 *      → creates exchange, returns depositAddress + swapId
 *
 * GET  /api/external-swap/:swapId
 *      → live status (polls LE/SS, updates DB)
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { leRequest, AFFILIATE_ID } from "../lib/lePriceCache.js";
import { LE_COIN_NETWORK } from "../lib/leCoinNetwork.js";
import { quoteFromSSPair, createSsExchangePair, getSsExchange } from "../lib/simpleswap.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── GET /external-swap/quote ──────────────────────────────────────────────────
router.get("/external-swap/quote", async (req, res) => {
  const from   = String(req.query.from   ?? "").toUpperCase();
  const to     = String(req.query.to     ?? "").toUpperCase();
  const amtRaw = parseFloat(String(req.query.amount ?? "1"));
  const amount = isFinite(amtRaw) && amtRaw > 0 ? amtRaw : 1;

  if (!from || !to || from === to) {
    res.status(400).json({ error: "from and to required and must differ" });
    return;
  }

  try {
    const networkFrom = LE_COIN_NETWORK[from]?.network ?? from;
    const networkTo   = LE_COIN_NETWORK[to]?.network   ?? to;
    const { ok, data } = await leRequest("/v1/info", "POST", {
      from, to, network_from: networkFrom, network_to: networkTo, amount,
      affiliate_id: AFFILIATE_ID,
    });
    if (ok && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const estimated = parseFloat(String(d.estimated_to ?? d.to_amount ?? "")) || 0;
      if (estimated > 0) {
        res.json({
          venue: "letsexchange", from, to, amount,
          estimatedOutput: estimated,
          rate:      estimated / amount,
          minAmount: d.min_amount ? parseFloat(String(d.min_amount)) || null : null,
          maxAmount: d.max_amount ? parseFloat(String(d.max_amount)) || null : null,
        });
        return;
      }
    }
  } catch (e: any) {
    logger.debug({ err: e?.message }, "external-swap/quote: LE failed");
  }

  try {
    const result = await quoteFromSSPair(from, to, amount);
    if (result && result.estimatedAmount > 0) {
      res.json({
        venue: "simpleswap", from, to, amount,
        estimatedOutput: result.estimatedAmount,
        rate:      result.estimatedAmount / amount,
        minAmount: result.minAmount,
        maxAmount: result.maxAmount,
      });
      return;
    }
  } catch (e: any) {
    logger.debug({ err: e?.message }, "external-swap/quote: SS failed");
  }

  res.status(404).json({ error: `No quote available for ${from}→${to}` });
});

// ── POST /external-swap/execute ───────────────────────────────────────────────
router.post("/external-swap/execute", async (req, res) => {
  const {
    fromCoin, toCoin, amount, walletAddress,
    outputAddress, symbol, side,
  } = req.body ?? {};

  const from = String(fromCoin ?? "").toUpperCase();
  const to   = String(toCoin   ?? "").toUpperCase();
  const amt  = parseFloat(String(amount ?? "0"));

  if (!from || !to || from === to || !isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "fromCoin, toCoin and amount are required" });
    return;
  }
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const receiveAddr = String(outputAddress ?? "").trim();
  if (!receiveAddr) {
    res.status(400).json({ error: "outputAddress required — provide the address where you will receive toCoin" });
    return;
  }

  // Try LetsExchange first
  try {
    const networkFrom = LE_COIN_NETWORK[from]?.network ?? from;
    const networkTo   = LE_COIN_NETWORK[to]?.network   ?? to;
    const { ok, data } = await leRequest("/v1/transaction", "POST", {
      from, to,
      network_from: networkFrom,
      network_to:   networkTo,
      amount:       amt,
      withdrawal:   receiveAddr,
      affiliate_id: AFFILIATE_ID,
    });

    if (ok && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const txId          = String(d.id ?? d.transaction_id ?? "");
      const depositAddr   = String(d.deposit_address ?? "");
      const depositExtra  = d.deposit_extra_id ? String(d.deposit_extra_id) : null;
      const expectedOut   = parseFloat(String(d.to_amount ?? d.estimated_to ?? "")) || 0;

      if (txId && depositAddr) {
        const swapId = `le_${txId}`;
        await pool.query(`
          INSERT INTO external_swaps
            (id, venue_tx_id, venue, wallet_address, from_coin, to_coin, from_amount,
             to_amount, deposit_address, deposit_extra_id, output_address, status, mode, side, trade_symbol)
          VALUES ($1,$2,'letsexchange',$3,$4,$5,$6,$7,$8,$9,$10,'waiting_deposit','manual',$11,$12)
          ON CONFLICT (id) DO NOTHING
        `, [swapId, txId, String(walletAddress), from, to, amt, expectedOut || null,
            depositAddr, depositExtra, receiveAddr, side ?? null, symbol ?? null]);

        res.json({
          swapId, venue: "letsexchange",
          fromCoin: from, toCoin: to, fromAmount: amt,
          expectedOutput: expectedOut,
          depositAddress: depositAddr, depositExtraId: depositExtra,
          status: "waiting_deposit", mode: "manual",
        });
        return;
      }
    }
    logger.warn({ from, to, amt, data }, "LE execute: no txId/depositAddr in response");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "external-swap/execute: LE failed, trying SS");
  }

  // Fallback: SimpleSwap
  try {
    const ssResult = await createSsExchangePair({
      from, to, amount: amt, address: receiveAddr,
    });
    if (ssResult.ok) {
      const { exchange } = ssResult;
      const swapId       = `ss_${exchange.id}`;
      const expectedOut  = exchange.withdrawalAmount
        ? parseFloat(exchange.withdrawalAmount) || 0 : 0;

      await pool.query(`
        INSERT INTO external_swaps
          (id, venue_tx_id, venue, wallet_address, from_coin, to_coin, from_amount,
           to_amount, deposit_address, deposit_extra_id, output_address, status, mode, side, trade_symbol)
        VALUES ($1,$2,'simpleswap',$3,$4,$5,$6,$7,$8,$9,$10,'waiting_deposit','manual',$11,$12)
        ON CONFLICT (id) DO NOTHING
      `, [swapId, exchange.id, String(walletAddress), from, to, amt, expectedOut || null,
          exchange.depositAddress, exchange.depositExtraId, receiveAddr,
          side ?? null, symbol ?? null]);

      res.json({
        swapId, venue: "simpleswap",
        fromCoin: from, toCoin: to, fromAmount: amt,
        expectedOutput: expectedOut,
        depositAddress: exchange.depositAddress, depositExtraId: exchange.depositExtraId,
        status: "waiting_deposit", mode: "manual",
      });
      return;
    }
    logger.warn({ err: ssResult.error }, "external-swap/execute: SS also failed");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "external-swap/execute: SS exception");
  }

  res.status(503).json({ error: "No swap venue available for this pair. Please try again shortly." });
});

// ── GET /external-swap/:swapId ────────────────────────────────────────────────
router.get("/external-swap/:swapId", async (req, res) => {
  const swapId = String(req.params.swapId ?? "");
  if (!swapId) { res.status(400).json({ error: "swapId required" }); return; }

  let rows: any[];
  try {
    const result = await pool.query(`SELECT * FROM external_swaps WHERE id = $1`, [swapId]);
    rows = result.rows;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "external-swap status: DB query failed");
    res.status(500).json({ error: "DB error" });
    return;
  }
  if (!rows.length) { res.status(404).json({ error: "Swap not found" }); return; }
  const row = rows[0];

  let liveStatus: string = row.status;

  // Don't re-poll terminal statuses
  if (liveStatus !== "completed" && liveStatus !== "failed") {
    try {
      if (row.venue === "letsexchange") {
        const { ok, data } = await leRequest(
          `/v1/transaction/${row.venue_tx_id}/status`, "GET", null
        );
        if (ok) {
          const raw = typeof data === "string" ? data
            : (data && typeof data === "object" ? String((data as any).status ?? "") : "");
          if (raw) liveStatus = mapLeStatus(raw);
        }
      } else if (row.venue === "simpleswap") {
        const ssEx = await getSsExchange(row.venue_tx_id);
        if (ssEx) liveStatus = mapSsStatus(String((ssEx as any).status ?? ""));
      }
    } catch (e: any) {
      logger.debug({ err: e?.message }, "external-swap status poll (non-fatal)");
    }

    if (liveStatus !== row.status) {
      pool.query(
        `UPDATE external_swaps SET status=$1, updated_at=now() WHERE id=$2`,
        [liveStatus, swapId]
      ).catch(() => {});
    }
  }

  res.json({
    swapId,
    venue:          row.venue,
    fromCoin:       row.from_coin,
    toCoin:         row.to_coin,
    fromAmount:     parseFloat(row.from_amount  ?? "0"),
    expectedOutput: parseFloat(row.to_amount    ?? "0"),
    depositAddress: row.deposit_address,
    depositExtraId: row.deposit_extra_id,
    outputAddress:  row.output_address,
    status:         liveStatus,
  });
});

// ── Status normalizers ────────────────────────────────────────────────────────
function mapLeStatus(s: string): string {
  const st = s.toLowerCase();
  if (["finished", "done", "success", "complete"].includes(st))          return "completed";
  if (["failed", "error", "refunded", "expired", "overdue"].includes(st)) return "failed";
  if (["sending", "sent"].includes(st))                                  return "completing";
  if (["confirming", "exchanging", "processing"].includes(st))           return "confirming";
  return "waiting_deposit";
}

function mapSsStatus(s: string): string {
  const st = s.toLowerCase();
  if (["finished", "success", "complete"].includes(st))                  return "completed";
  if (["failed", "error", "refunded", "expired"].includes(st))           return "failed";
  if (["sending"].includes(st))                                          return "completing";
  if (["confirming", "exchanging"].includes(st))                         return "confirming";
  return "waiting_deposit";
}

export default router;
