/**
 * externalSwap.ts — All-venue swap backend: LE, SimpleSwap, Swapzone, ChangeNow, StealthEx.
 *
 * GET  /api/external-swap/quote?from=BTC&to=ETH&amount=0.1
 *      → best rate across ALL configured swap venues (parallel race)
 *
 * POST /api/external-swap/execute
 *      body: { fromCoin, toCoin, amount, walletAddress, outputAddress, symbol?, side? }
 *      → creates exchange on winning venue, returns depositAddress + swapId
 *
 * GET  /api/external-swap/:swapId
 *      → live status (polls venue API, updates DB)
 */

import { Router } from "express";
import { pool } from "@workspace/db";
import { getBestExternalQuote } from "../lib/metaRouter.js";
import { createVenueExchange } from "../lib/leAutoRoute.js";
import { getCachedLEPrices } from "../lib/lePriceCache.js";
import { leRequest } from "../lib/lePriceCache.js";
import { getSsExchange } from "../lib/simpleswap.js";
import { getSzTransactionStatus } from "../lib/swapzone.js";
import { getLifiOutputAmount, resolveLifiToken } from "../lib/lifi.js";
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
    const prices   = getCachedLEPrices();
    const inUsd    = prices[from]  ?? (from  === "USDT" ? 1 : 0);
    const outUsd   = prices[to]    ?? (to    === "USDT" ? 1 : 0);

    // Fire custodial venues + LI.FI in parallel
    const lifiSupported = !!(resolveLifiToken(from) && resolveLifiToken(to));
    const [{ best, lowestMin }, lifiResult] = await Promise.all([
      getBestExternalQuote(from, to, amount, inUsd, outUsd),
      lifiSupported ? getLifiOutputAmount(from, to, amount) : Promise.resolve(null),
    ]);

    // Build onchain quote from LI.FI if available
    const onchainQuote = lifiResult && lifiResult.toAmount > 0 ? {
      venue:           "lifi",
      executionType:   "onchain",
      from,
      to,
      amount,
      estimatedOutput: lifiResult.toAmount,
      rate:            lifiResult.toAmount / amount,
      gasCostUsd:      lifiResult.gasCostUsd,
      tool:            lifiResult.tool,
      note:            "Non-custodial: user signs the swap transaction directly",
    } : null;

    if (best && best.expectedOutput > 0) {
      res.json({
        venue:           best.venue,
        from,
        to,
        amount,
        estimatedOutput: best.expectedOutput,
        rate:            best.expectedOutput / amount,
        minAmount:       best.minAmount,
        maxAmount:       best.maxAmount,
        canExecute:      best.canExecute,
        onchainQuote,   // LI.FI non-custodial alternative (may be null)
      });
      return;
    }

    // No custodial quote — but LI.FI might still work
    if (onchainQuote) {
      res.json({ ...onchainQuote, canExecute: true, minAmount: null, maxAmount: null });
      return;
    }

    if (lowestMin && lowestMin > 0) {
      res.status(422).json({
        error:     `Amount too small. Minimum is ${lowestMin} ${from}`,
        minAmount: lowestMin,
      });
      return;
    }
  } catch (e: any) {
    logger.warn({ err: e?.message, from, to }, "external-swap/quote: metaRouter error");
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
    res.status(400).json({ error: "outputAddress required — the address where you will receive toCoin" });
    return;
  }

  // Get the best quote across all venues
  const prices = getCachedLEPrices();
  const inUsd  = prices[from] ?? (from === "USDT" ? 1 : 0);
  const outUsd = prices[to]   ?? (to   === "USDT" ? 1 : 0);

  let winningVenue = "letsexchange";
  try {
    const { best } = await getBestExternalQuote(from, to, amt, inUsd, outUsd);
    if (best?.venue) winningVenue = best.venue;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "external-swap/execute: metaRouter quote failed, defaulting to letsexchange");
  }

  // Try the winning venue first, then cascade through the rest
  const venueOrder = [
    winningVenue,
    ...["letsexchange", "simpleswap", "swapzone", "changenow", "stealthex"].filter(v => v !== winningVenue),
  ];

  for (const venue of venueOrder) {
    try {
      const exchResult = await createVenueExchange(venue, from, to, amt, receiveAddr);
      if (!exchResult.ok || !exchResult.transactionId) continue;

      const swapId      = `${venue.slice(0, 2)}_${exchResult.transactionId}`;
      const venuePrefix = venue === "letsexchange" ? "le"
        : venue === "simpleswap"  ? "ss"
        : venue === "swapzone"    ? "sz"
        : venue === "changenow"   ? "cn"
        : venue === "stealthex"   ? "sx"
        : venue.slice(0, 2);
      const finalSwapId = `${venuePrefix}_${exchResult.transactionId}`;

      await pool.query(`
        INSERT INTO external_swaps
          (id, venue_tx_id, venue, wallet_address, from_coin, to_coin, from_amount,
           deposit_address, output_address, status, mode, side, trade_symbol)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'waiting_deposit','manual',$10,$11)
        ON CONFLICT (id) DO NOTHING
      `, [finalSwapId, exchResult.transactionId, venue, String(walletAddress),
          from, to, amt, exchResult.depositAddress ?? receiveAddr, receiveAddr,
          side ?? null, symbol ?? null]);

      res.json({
        swapId:         finalSwapId,
        venue,
        fromCoin:       from,
        toCoin:         to,
        fromAmount:     amt,
        depositAddress: exchResult.depositAddress,
        depositExtraId: exchResult.depositExtraId ?? null,
        status:         "waiting_deposit",
        mode:           "manual",
      });
      return;
    } catch (e: any) {
      logger.warn({ err: e?.message, venue }, "external-swap/execute: venue failed, trying next");
    }
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

  if (liveStatus !== "completed" && liveStatus !== "failed") {
    try {
      if (row.venue === "letsexchange") {
        const { ok, data } = await leRequest(`/v1/transaction/${row.venue_tx_id}/status`, "GET", null);
        if (ok) {
          const raw = typeof data === "string" ? data
            : (data && typeof data === "object" ? String((data as any).status ?? "") : "");
          if (raw) liveStatus = mapLeStatus(raw);
        }
      } else if (row.venue === "simpleswap") {
        const ssEx = await getSsExchange(row.venue_tx_id);
        if (ssEx) liveStatus = mapSsStatus(String((ssEx as any).status ?? ""));
      } else if (row.venue === "swapzone") {
        const szStatus = await getSzTransactionStatus(row.venue_tx_id);
        if (szStatus?.status) liveStatus = mapSzStatus(szStatus.status);
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
  if (["finished", "done", "success", "complete"].includes(st))           return "completed";
  if (["failed", "error", "refunded", "expired", "overdue"].includes(st)) return "failed";
  if (["sending", "sent"].includes(st))                                   return "completing";
  if (["confirming", "exchanging", "processing"].includes(st))            return "confirming";
  return "waiting_deposit";
}

function mapSsStatus(s: string): string {
  const st = s.toLowerCase();
  if (["finished", "success", "complete"].includes(st))        return "completed";
  if (["failed", "error", "refunded", "expired"].includes(st)) return "failed";
  if (["sending"].includes(st))                                return "completing";
  if (["confirming", "exchanging"].includes(st))               return "confirming";
  return "waiting_deposit";
}

function mapSzStatus(s: string): string {
  const st = s.toLowerCase();
  if (["completed", "finished", "success"].includes(st))       return "completed";
  if (["failed", "error", "refunded", "expired"].includes(st)) return "failed";
  if (["sending"].includes(st))                                return "completing";
  if (["confirming", "exchanging"].includes(st))               return "confirming";
  return "waiting_deposit";
}

export default router;
