/**
 * spotSettlement.ts — MARKET and LIMIT trade settlement for OrahDEX
 *
 * Handles one fill at a time.  Called from the matching loop in orders.ts
 * (or any future matching engine) for each counter-order that is consumed.
 *
 * Settlement pipeline for each fill:
 *   1. Detect cross-chain (buyerNetwork !== sellerNetwork && !isBot)
 *   2. If cross-chain → generate P2SH HTLC output + embed secretHash in OP_RETURN
 *   3. Build OP_RETURN payload (v2 settlement record)
 *   4. Attempt real BSV broadcast (silently falls back to deterministic txid if unfunded)
 *   5. Settle ledger balances atomically (locked→available for both parties)
 *   6. Register HTLC with watcher (for Relayer Keeper notifications)
 *   7. Return structured result for the matching loop to record
 *
 * ── Invariants ────────────────────────────────────────────────────────────────
 *
 *   • settleTrade() is called for every fill, including bot fills, so
 *     ledger balances are always consistent.
 *   • HTLC is only generated when isCrossChain === true (never for bot fills,
 *     never for same-network user orders).
 *   • If broadcast fails the order still settles — the OP_RETURN deterministic
 *     txid is used as the on-chain reference until a real broadcast can occur.
 */

import crypto from "node:crypto";
import type { Logger } from "pino";
import { buildSettlement } from "./settlement.js";
import { getOrCreateWallet, fetchWalletBalance } from "./bsvWallet.js";
import { broadcastSettlement } from "./bsvBroadcaster.js";
import {
  buildHtlc,
  buildP2SHLockingScript,
  MIN_LOCKTIME_BLOCKS,
  HTLC_MIN_SAT,
  DUST_SAT,
} from "./htlc.js";
import { getBsvChainStatus } from "./bsvChainMonitor.js";
import { settleTrade } from "./ledger.js";
import { BOT_ADDRESS } from "./liquidityBot.js";
import { onTradeSettled as copyVaultOnTradeSettled } from "./copyOrchestrator.js";
import { registerHtlc } from "./htlcWatcher.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpotFillParams {
  /** Unique trade ID for this specific fill (caller generates with crypto.randomUUID()) */
  tradeId:       string;
  /** ID of the incoming order (the new order, not the counter-order) */
  newOrderId:    string;
  /** The counter-order being consumed */
  matchOrder: {
    id:             string;
    walletAddress:  string;
    networkType?:   string | null;
  };
  pair:          string;    // e.g. "BSV/USDT"
  fillQty:       number;    // base asset filled in this fill
  fillPrice:     number;    // price for this fill
  buyerAddress:  string;
  sellerAddress: string;
  buyerNetwork:  string;    // "evm" | "bsv"
  sellerNetwork: string;
  /** True if the counter-order belongs to the liquidity bot */
  isBot:         boolean;
  log:           Logger;
}

export interface SpotFillResult {
  txid:               string;
  wasRealBroadcast:   boolean;
  settlementType:     string;
  isCrossChain:       boolean;
  htlcAddress?:       string;
  htlcSecretHash?:    string;
  htlcLocktimeBlocks?: number;
  opReturnPayload?:   string;
}

// ── Core settlement function ──────────────────────────────────────────────────

/**
 * Execute a single spot fill: build settlement, broadcast to BSV, settle ledger.
 *
 * This function is deliberately free of HTTP concerns (no `req`, no `res`).
 * It can be called from any context — orders route, stop-order engine, etc.
 */
export async function settleSpotFill(params: SpotFillParams): Promise<SpotFillResult> {
  const {
    tradeId, newOrderId, matchOrder, pair,
    fillQty, fillPrice, buyerAddress, sellerAddress,
    buyerNetwork, sellerNetwork, isBot, log,
  } = params;

  const fillValue = fillQty * fillPrice;
  const fillTotal = fillValue.toFixed(8);
  const [baseAsset, quoteAsset = "USDT"] = pair.split("/");

  // ── 1. Cross-chain detection ─────────────────────────────────────────────
  // Bot orders are always same-chain (the bot only operates on the internal ledger)
  const isCrossChain = buyerNetwork !== sellerNetwork && !isBot;

  // ── 2. HTLC generation (cross-chain only) ────────────────────────────────
  let htlcResult: Awaited<ReturnType<typeof buildHtlc>> | null = null;
  let htlcP2SHScriptHex: string | undefined;

  if (isCrossChain) {
    try {
      const chainStatus    = await getBsvChainStatus();
      const currentHeight  = chainStatus.blockHeight || 943000;
      const locktimeBlocks = Math.max(
        currentHeight + MIN_LOCKTIME_BLOCKS,
        943000 + MIN_LOCKTIME_BLOCKS,
      );
      htlcResult        = buildHtlc({ locktimeBlocks });
      htlcP2SHScriptHex = buildP2SHLockingScript(htlcResult.redeemScript);

      log.info(
        {
          htlcAddress: htlcResult.htlcAddress,
          secretHash:  htlcResult.secretHash.slice(0, 16) + "…",
          locktimeBlocks,
          currentHeight,
          marginBlocks: locktimeBlocks - currentHeight,
        },
        "spotSettlement: HTLC generated for cross-chain fill"
      );
    } catch (err) {
      log.warn({ err }, "spotSettlement: HTLC generation failed — continuing with OP_RETURN only");
    }
  }

  // ── 3. Build OP_RETURN settlement payload ────────────────────────────────
  // Determine which ID is the buy order vs sell order.
  // The new/incoming order (newOrderId) is the buyer when the match counter-order is on the sell side.
  const newOrderIsBuy = matchOrder.walletAddress === sellerAddress;
  const fallback = buildSettlement({
    tradeId,
    pair,
    buyOrderId:         newOrderIsBuy ? newOrderId : matchOrder.id,
    sellOrderId:        newOrderIsBuy ? matchOrder.id : newOrderId,
    buyerAddress,
    sellerAddress,
    buyerNetwork,
    sellerNetwork,
    amount:             fillQty.toString(),
    price:              fillPrice.toString(),
    total:              fillTotal,
    timestamp:          Date.now(),
    htlcSecretHash:     htlcResult?.secretHash,
    htlcAddress:        htlcResult?.htlcAddress,
    htlcRedeemScript:   htlcResult?.redeemScript,
    htlcLocktimeBlocks: htlcResult?.locktimeBlocks,
  });

  // ── 4. Settle ledger balances FIRST (atomic, source of truth) ───────────
  // Run for every fill — bot fills too.  The ledger must be committed before
  // any on-chain broadcast so the two cannot diverge (broadcast is best-effort;
  // ledger is authoritative). If ledger settlement fails we do NOT broadcast.
  try {
    await settleTrade({
      buyerAddress,
      sellerAddress,
      baseAsset:   baseAsset!,
      quoteAsset:  quoteAsset!,
      amount:      fillQty.toString(),
      price:       fillPrice.toString(),
      isBotSeller: sellerAddress === BOT_ADDRESS,
      isBotBuyer:  buyerAddress  === BOT_ADDRESS,
    });
  } catch (err) {
    // Ledger settlement is the source of truth for balances.
    // A failure here means the fill cannot be credited — propagate so the
    // caller can roll back order state and avoid phantom balances.
    log.error({ err, tradeId }, "spotSettlement: ledger settlement failed — aborting fill (no broadcast)");
    throw err;
  }

  // ── 5. Attempt real BSV broadcast (best-effort) ──────────────────────────
  // Only broadcast AFTER the ledger is committed.  If broadcast fails the
  // deterministic txid is used as the audit reference; the ledger is already
  // settled so user balances are correct regardless.
  let broadcastTxid    = fallback.txid;
  let wasRealBroadcast = false;

  try {
    const wallet  = await getOrCreateWallet();
    const balance = await fetchWalletBalance(wallet.address);
    if (balance.funded && balance.utxos.length > 0) {
      const best    = balance.utxos.sort((a, b) => b.satoshis - a.satoshis)[0]!;
      const FEE_SAT = 500;
      const maxHtlcSat  = best.satoshis - FEE_SAT - DUST_SAT;
      const safeHtlcSat = Math.max(HTLC_MIN_SAT, DUST_SAT + 1);
      const canAddHtlc  = isCrossChain && !!htlcP2SHScriptHex && maxHtlcSat >= safeHtlcSat;
      const htlcSat     = canAddHtlc ? Math.min(safeHtlcSat, maxHtlcSat) : undefined;

      if (isCrossChain && htlcP2SHScriptHex && !canAddHtlc) {
        log.warn(
          { utxoSat: best.satoshis, maxHtlcSat, safeHtlcSat },
          "spotSettlement: HTLC output skipped — UTXO too small"
        );
      }

      const result = await broadcastSettlement({
        privKeyHex:        wallet.privKeyHex,
        changeAddress:     wallet.address,
        utxo:              best,
        opReturnPayload:   fallback.opReturnData,
        htlcP2SHScriptHex: canAddHtlc ? htlcP2SHScriptHex : undefined,
        htlcSatoshis:      htlcSat,
      });
      if (result.broadcast) {
        broadcastTxid    = result.txid;
        wasRealBroadcast = true;
      }
    }
  } catch (err) {
    log.warn({ err }, "spotSettlement: BSV broadcast failed — using deterministic txid (ledger already settled)");
  }

  // Mark unbroadcast (local-only) settlement txids so the UI doesn't link
  // them to WhatsOnChain (which would 404). Real broadcasts stay un-prefixed.
  if (!wasRealBroadcast && !broadcastTxid.startsWith("local:")) {
    broadcastTxid = `local:${broadcastTxid}`;
  }

  log.info(
    {
      txid:           broadcastTxid,
      fillQty,
      fillPrice,
      isBot,
      realBroadcast:  wasRealBroadcast,
      settlementType: fallback.settlementType,
      crossChain:     isCrossChain,
    },
    wasRealBroadcast
      ? `spotSettlement: BROADCAST to mainnet ✓ (${fallback.settlementType})`
      : `spotSettlement: deterministic txid committed (${fallback.settlementType})`
  );

  // ── 5b. CopyVault hook: mirror this trade into any vault led by buyer/seller ─
  // Fire-and-forget — copy bookkeeping must never fail the underlying fill.
  void copyVaultOnTradeSettled({
    traderAddress: buyerAddress,
    symbol: pair,
    side: "buy",
    price: fillPrice,
    quantity: fillQty,
    orderId: newOrderId,
  }).catch(err => log.warn({ err }, "spotSettlement: copyVault hook (buy) failed"));
  void copyVaultOnTradeSettled({
    traderAddress: sellerAddress,
    symbol: pair,
    side: "sell",
    price: fillPrice,
    quantity: fillQty,
    orderId: matchOrder.id,
  }).catch(err => log.warn({ err }, "spotSettlement: copyVault hook (sell) failed"));

  // ── 6. Register HTLC with watcher (Relayer Keeper notifications) ─────────
  if (isCrossChain && htlcResult?.htlcAddress && broadcastTxid) {
    registerHtlc({
      tradeId:        newOrderId,   // link HTLC to the incoming order
      htlcAddress:    htlcResult.htlcAddress,
      secretHash:     htlcResult.secretHash,
      locktimeBlocks: htlcResult.locktimeBlocks,
      settlementTxid: broadcastTxid,
      pair,
      userAddress:    buyerAddress,
    }).catch(err => log.warn({ err }, "spotSettlement: HTLC watcher register failed"));
  }

  return {
    txid:               broadcastTxid,
    wasRealBroadcast,
    settlementType:     fallback.settlementType,
    isCrossChain,
    htlcAddress:        htlcResult?.htlcAddress,
    htlcSecretHash:     htlcResult?.secretHash,
    htlcLocktimeBlocks: htlcResult?.locktimeBlocks,
    opReturnPayload:    fallback.opReturnData,
  };
}
