import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne, isNotNull, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { buildSettlement } from "../lib/settlement.js";
import { BOT_ADDRESS } from "../lib/liquidityBot.js";
import { getOrCreateWallet, fetchWalletBalance } from "../lib/bsvWallet.js";
import { broadcastSettlement } from "../lib/bsvBroadcaster.js";
import { buildHtlc, buildP2SHLockingScript, MIN_LOCKTIME_BLOCKS, HTLC_MIN_SAT, DUST_SAT } from "../lib/htlc.js";
import { getBsvChainStatus, queryHtlcStatus } from "../lib/bsvChainMonitor.js";
import { pushNotification } from "../lib/notifQueue.js";
import { registerHtlc } from "../lib/htlcWatcher.js";
import { recordTradeMetric, getMetricsSummary } from "../lib/tradeMetrics.js";
import { getCachedQuote } from "../lib/routeCache.js";
import { lockForOrder, unlockFunds, settleTrade, seedInitialBalances, getBalances, ensureSeedForAsset } from "../lib/ledger.js";

const router: IRouter = Router();

// ── Helper: serialize an order row for API response ──────────────────────────
function serializeOrder(o: typeof ordersTable.$inferSelect) {
  return {
    ...o,
    price:             o.price             ? parseFloat(o.price)             : undefined,
    stopPrice:         o.stopPrice         ? parseFloat(o.stopPrice)         : undefined,
    quantity:          parseFloat(o.quantity),
    filledQuantity:    parseFloat(o.filledQuantity),
    remainingQuantity: parseFloat(o.remainingQuantity),
    total:             o.total             ? parseFloat(o.total)             : undefined,
    fee:               parseFloat(o.fee),
  };
}

// ── GET /orders ───────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 200);
    // Normalize symbol: accept both "BSV-USDT" (URL/dash) and "BSV/USDT" (DB/slash)
    const rawSym = req.query.symbol as string | undefined;
    const symbol = rawSym ? rawSym.replace(/-/g, "/") : undefined;
    const status = req.query.status as string | undefined;

    // Push all filters to the DB — never fetch all rows and slice in memory
    const conditions = [eq(ordersTable.walletAddress, walletAddress)];
    if (symbol) conditions.push(eq(ordersTable.symbol, symbol));
    if (status) conditions.push(eq(ordersTable.status, status));

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit);

    res.json(orders.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to get orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /orders ───────────────────────────────────────────────────────────────
// Accepts an optional `evmSignature` field (MetaMask personal_sign) that proves
// the trader authorised this order. On match, a BSV OP_RETURN settlement
// transaction is generated and both orders are marked filled with the txid.
router.post("/orders", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress || !body.symbol || !body.side || !body.type || !body.quantity) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const id            = crypto.randomUUID();
    const quantity      = parseFloat(body.quantity);
    const price         = body.price ? parseFloat(body.price) : undefined;
    const total         = price ? price * quantity : undefined;
    const fee           = (total || 0) * 0.001;
    const networkType   = body.networkType ?? (body.walletAddress.startsWith("0x") ? "evm" : "bsv");

    // walletSource distinguishes real external wallets from demo/Orah API-ledger wallets.
    // "external" = MetaMask / Reown / injected (real on-chain funds, no auto-seeding)
    // "demo"     = $80k paper-money demo account
    // "orah"     = OrahDEX HD wallet (API ledger, real deposited funds)
    // Fallback: if walletAddress has a signature treat it as external, otherwise as orah/demo
    const walletSource: "external" | "demo" | "orah" =
      body.walletSource === "external" ? "external"
      : body.walletSource === "demo"   ? "demo"
      : body.walletSource === "orah"   ? "orah"
      : (body.evmSignature || body.signedTx) ? "external"
      : "orah";

    const isExternalWallet = walletSource === "external";

    // For external EVM wallets, validate reported on-chain balance to prevent
    // orders exceeding the user's real holdings.
    if (isExternalWallet && body.reportedBalance != null) {
      const reportedBal = parseFloat(body.reportedBalance);
      if (body.side === "sell" && quantity > reportedBal * 1.01) {
        res.status(400).json({
          error:   "Insufficient balance",
          code:    "INSUFFICIENT_FUNDS",
          detail:  `Order quantity ${quantity} exceeds reported on-chain balance ${reportedBal}`,
        });
        return;
      }
    }

    // ── Acquire ledger lock BEFORE inserting the order (No lock → No order) ──
    // BUY → lock quote asset (e.g. USDT).  SELL → lock base asset.
    // External EVM wallets: funds are on-chain — skip API-ledger lock entirely.
    //   Balance is already validated against reportedBalance above.
    // Demo / Orah wallets: use API ledger with auto-seeding for paper money.
    const [baseAsset, quoteAsset = "USDT"] = body.symbol.split("/");
    const lockAsset = body.side === "buy" ? quoteAsset : baseAsset;

    let lockPrice = price;
    if (!lockPrice && body.side === "buy") {
      const [mktRow] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, body.symbol));
      lockPrice = mktRow ? parseFloat(mktRow.lastPrice) : 0;
    }
    const lockAmount = body.side === "buy"
      ? (lockPrice ? (lockPrice * quantity).toString() : "0")
      : quantity.toString();

    if (!isExternalWallet && parseFloat(lockAmount) > 0 && lockAsset) {
      try {
        // Seed on first order (demo / Orah only)
        const existingBal = await getBalances(body.walletAddress);
        if (existingBal.length === 0) {
          await seedInitialBalances(body.walletAddress);
        }
        // Auto-credit if balance is missing or insufficient (paper money)
        await ensureSeedForAsset(body.walletAddress, lockAsset, lockAmount);
        // Lock funds — throws INSUFFICIENT_FUNDS:ASSET if balance is too low
        await lockForOrder({ walletAddress: body.walletAddress, asset: lockAsset, amount: lockAmount });
      } catch (ledgerErr: any) {
        const msg: string = ledgerErr?.message ?? "";
        if (msg.startsWith("INSUFFICIENT_FUNDS")) {
          const asset = msg.split(":")[1] ?? lockAsset;
          res.status(400).json({
            error:   "INSUFFICIENT_FUNDS",
            message: `Order rejected: insufficient ${asset} balance to cover this order.`,
            code:    "INSUFFICIENT_FUNDS",
          });
          return;
        }
        // Unexpected ledger error — log and fail safe (don't create a phantom order)
        req.log.error({ ledgerErr }, "Unexpected ledger error — rejecting order");
        res.status(500).json({ error: "Ledger error", message: "Could not lock funds. Please try again." });
        return;
      }
    }

    // ── All checks passed — insert the order ──────────────────────────────────
    const newOrder = {
      id,
      symbol:            body.symbol,
      walletAddress:     body.walletAddress,
      networkType,
      side:              body.side,              // "buy" | "sell"
      type:              body.type,              // "limit" | "market"
      status:            "open",
      price:             price?.toString(),
      stopPrice:         body.stopPrice?.toString(),
      quantity:          quantity.toString(),
      filledQuantity:    "0",
      remainingQuantity: quantity.toString(),
      total:             total?.toString(),
      fee:               fee.toString(),
      feeAsset:          body.symbol.split("/")[1] || "USDT",
      timeInForce:       body.timeInForce || "GTC",
      txid:              null as string | null,
      // EVM signature from MetaMask personal_sign — proves the trader authorised this order
      signedTx:          body.evmSignature || body.signedTx || null,
      matchedOrderId:    null as string | null,
    };

    await db.insert(ordersTable).values(newOrder);
    req.log.info({ orderId: id, side: body.side, networkType, walletSource }, "Order placed");

    /* Push order-placed notification to the user */
    const orderPair = body.symbol;
    const orderSide = (body.side as string).toUpperCase();
    pushNotification(body.walletAddress, {
      type: "order_placed",
      title: `${orderSide} Order Placed`,
      body: `${quantity} ${orderPair.split("/")[0]} @ ${price ? `$${price}` : "market"} · waiting for match`,
      pair: orderPair,
      side: body.side,
    });

    // ── Attempt order matching ───────────────────────────────────────────────
    // Works for limit, market, AND stop orders.
    // Stop orders: check current market price immediately. If the stop condition
    // is already met, execute as a market fill. Otherwise it stays "open" and
    // a background trigger loop will fire it when price crosses.
    let settlementTxid: string | null = null;
    let matchedOrderId: string | null = null;
    let lastSettlementType: string | null = null;
    let lastHtlcAddress: string | undefined;
    let lastHtlcSecretHash: string | undefined;
    let lastHtlcLocktimeBlocks: number | undefined;
    let lastCrossChain = false;
    let lastOpReturnPayload: string | undefined;

    const isMarket = body.type === "market";
    const isLimit  = body.type === "limit" && !!price;

    // ── Stop order trigger check ─────────────────────────────────────────────
    // If a stop order's trigger price is already beaten by the current market,
    // convert it to a market order so it fills immediately.
    let isStopTriggered = false;
    if (body.type === "stop" && body.stopPrice) {
      const stopTrigger = parseFloat(body.stopPrice);
      const [mkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, body.symbol));
      const mktPrice = mkt ? parseFloat(mkt.lastPrice) : 0;
      if (mktPrice > 0) {
        // Buy-stop: trigger when price rises ABOVE stopPrice (breakout entry)
        // Sell-stop: trigger when price falls BELOW stopPrice (stop-loss exit)
        isStopTriggered =
          (body.side === "buy"  && mktPrice >= stopTrigger) ||
          (body.side === "sell" && mktPrice <= stopTrigger);
      }
    }

    if (isMarket || isLimit || isStopTriggered) {
      const counterSide = body.side === "buy" ? "sell" : "buy";

      // For limit orders restrict by price; market/stop orders accept any price
      // Format price safely — avoid scientific notation (e.g. 1e-8) which
      // breaks numeric DB comparisons on very small asset prices.
      const safePriceStr = price != null ? price.toFixed(8) : undefined;

      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, body.symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, body.walletAddress),
          // Limit orders have price constraints; market + triggered-stop orders take any price
          ...(isLimit && safePriceStr
            ? [body.side === "buy"
                ? lte(ordersTable.price, safePriceStr)
                : gte(ordersTable.price, safePriceStr)]
            : []),
        )
      );

      // Sort: best price first (cheapest sell for buy, most expensive buy for sell)
      const sorted = counterOrders.sort((a, b) => {
        const pa = parseFloat(a.price ?? "0");
        const pb = parseFloat(b.price ?? "0");
        return body.side === "buy" ? pa - pb : pb - pa;
      });

      // ── Multi-fill loop: consume counter-orders until qty is satisfied ───────
      // This correctly handles large orders that span multiple counter-orders,
      // and does partial consumption of bot orders (instead of deleting the
      // entire bot order when only a fraction of it is needed).
      let remainingQty   = quantity;
      let totalFilled    = 0;
      let totalFillValue = 0;
      let lastFillPrice  = 0;
      let lastTxid: string | null = null;
      let lastMatchId: string | null = null;

      const [baseAsset, quoteAsset = "USDT"] = body.symbol.split("/");

      for (const match of sorted) {
        if (remainingQty <= 0.000001) break;

        // Use remainingQuantity directly — it is always kept up-to-date by
        // prior partial fills, so we must NOT subtract filledQuantity again
        // (that would double-count and produce negative availability).
        const matchAvail = parseFloat(match.remainingQuantity ?? match.quantity);
        if (matchAvail <= 0.000001) continue;

        const fillQty   = Math.min(remainingQty, matchAvail);
        const fillPrice = parseFloat(match.price ?? price?.toString() ?? "0");
        const fillValue = fillQty * fillPrice;
        const fillTotal = fillValue.toFixed(8);
        const isBot     = match.walletAddress === BOT_ADDRESS;

        // ── BSV On-Chain Settlement ────────────────────────────────────────
        // Architecture (per BSV Core DEX spec):
        //   1. UTXO-scripted swap contract: for cross-chain trades (EVM ↔ BSV),
        //      generate a P2SH HTLC — the secretHash is embedded in the OP_RETURN
        //      for audit, and the P2SH output locks the trade commitment on-chain.
        //   2. OP_RETURN audit record (v2): immutable on-chain record with full
        //      trade data + HTLC commitment hash.
        //   3. Real broadcast via settlement wallet UTXO (when funded).

        const tradeId      = crypto.randomUUID();
        const buyerNetwork  = body.side === "buy" ? networkType : (match.networkType ?? "evm");
        const sellerNetwork = body.side === "sell" ? networkType : (match.networkType ?? "evm");
        const isCrossChain  = buyerNetwork !== sellerNetwork && !isBot;

        // ── HTLC invariant guard ─────────────────────────────────────────────
        // HTLC must ONLY be generated for genuine cross-chain trades.
        // Same-chain bot fills never get an HTLC — confirmed by the isCrossChain flag.
        if (!isCrossChain && process.env.NODE_ENV !== "production") {
          // Dev-mode assertion: helps catch logic errors during testing
          req.log.debug({ buyerNetwork, sellerNetwork, isBot }, "Non-cross-chain fill — HTLC correctly skipped");
        }

        // For cross-chain matches, auto-generate an HTLC (UTXO-scripted swap contract)
        let htlcResult: Awaited<ReturnType<typeof buildHtlc>> | null = null;
        let htlcP2SHScriptHex: string | undefined;
        if (isCrossChain) {
          try {
            const chainStatus  = await getBsvChainStatus();
            const currentHeight = chainStatus.blockHeight || 943000;

            // Invariant 1: locktime must always be at least MIN_LOCKTIME_BLOCKS ahead
            // Use Math.max in case the cached height is stale
            const locktimeBlocks = Math.max(
              currentHeight + MIN_LOCKTIME_BLOCKS,
              943000 + MIN_LOCKTIME_BLOCKS,  // absolute floor in case chainStatus is zero
            );

            htlcResult        = buildHtlc({ locktimeBlocks });
            htlcP2SHScriptHex = buildP2SHLockingScript(htlcResult.redeemScript);

            req.log.info(
              {
                htlcAddress: htlcResult.htlcAddress,
                secretHash: htlcResult.secretHash.slice(0, 16) + "…",
                locktimeBlocks,
                currentHeight,
                marginBlocks: locktimeBlocks - currentHeight,
              },
              "HTLC generated for cross-chain trade settlement"
            );
          } catch (htlcErr) {
            req.log.warn({ htlcErr }, "HTLC generation failed — continuing with OP_RETURN only");
          }
        }

        // Build the v2 settlement record (OP_RETURN payload with HTLC fields)
        const fallbackSettlement = buildSettlement({
          tradeId,
          pair:          body.symbol,
          buyOrderId:    body.side === "buy" ? id : match.id,
          sellOrderId:   body.side === "sell" ? id : match.id,
          buyerAddress:  body.side === "buy" ? body.walletAddress : match.walletAddress,
          sellerAddress: body.side === "sell" ? body.walletAddress : match.walletAddress,
          buyerNetwork,
          sellerNetwork,
          amount:        fillQty.toString(),
          price:         fillPrice.toString(),
          total:         fillTotal,
          timestamp:     Date.now(),
          // HTLC fields (populated for cross-chain trades)
          htlcSecretHash:     htlcResult?.secretHash,
          htlcAddress:        htlcResult?.htlcAddress,
          htlcRedeemScript:   htlcResult?.redeemScript,
          htlcLocktimeBlocks: htlcResult?.locktimeBlocks,
        });

        let broadcastTxid    = fallbackSettlement.txid;
        let wasRealBroadcast = false;

        try {
          const wallet  = await getOrCreateWallet();
          const balance = await fetchWalletBalance(wallet.address);
          if (balance.funded && balance.utxos.length > 0) {
            const best    = balance.utxos.sort((a, b) => b.satoshis - a.satoshis)[0]!;
            const FEE_SAT = 500; // standard broadcast fee

            // Invariant 2: htlcSatoshis must be ≥ HTLC_MIN_SAT and never exceed
            // available UTXO after fees. If the UTXO is too small, skip HTLC output
            // to avoid a dust output or negative change amount.
            const maxHtlcSat   = best.satoshis - FEE_SAT - DUST_SAT;
            const safeHtlcSat  = Math.max(HTLC_MIN_SAT, DUST_SAT + 1);
            const canAddHtlc   = isCrossChain && htlcP2SHScriptHex && maxHtlcSat >= safeHtlcSat;
            const htlcSatoshis = canAddHtlc ? Math.min(safeHtlcSat, maxHtlcSat) : undefined;

            if (isCrossChain && htlcP2SHScriptHex && !canAddHtlc) {
              req.log.warn(
                { utxoSat: best.satoshis, FEE_SAT, maxHtlcSat, safeHtlcSat },
                "HTLC output skipped — UTXO too small to cover HTLC + fees without dust change"
              );
            }

            const result = await broadcastSettlement({
              privKeyHex:       wallet.privKeyHex,
              changeAddress:    wallet.address,
              utxo:             best,
              opReturnPayload:  fallbackSettlement.opReturnData,
              htlcP2SHScriptHex: canAddHtlc ? htlcP2SHScriptHex : undefined,
              htlcSatoshis,
            });
            if (result.broadcast) { broadcastTxid = result.txid; wasRealBroadcast = true; }
          }
        } catch (broadcastErr) {
          req.log.warn({ broadcastErr }, "BSV broadcast attempt failed — using deterministic txid");
        }

        req.log.info(
          {
            txid: broadcastTxid, fillQty, fillPrice, isBot,
            realBroadcast: wasRealBroadcast,
            settlementType: fallbackSettlement.settlementType,
            crossChain: isCrossChain,
          },
          wasRealBroadcast
            ? `BSV settlement BROADCAST to mainnet ✓ (${fallbackSettlement.settlementType})`
            : `BSV settlement committed — deterministic txid (${fallbackSettlement.settlementType})`
        );

        // ── Settle balances in the ledger ─────────────────────────────────
        const buyerAddress  = body.side === "buy" ? body.walletAddress : match.walletAddress;
        const sellerAddress = body.side === "sell" ? body.walletAddress : match.walletAddress;
        try {
          await settleTrade({ buyerAddress, sellerAddress, baseAsset: baseAsset!, quoteAsset: quoteAsset!, amount: fillQty.toString(), price: fillPrice.toString() });
        } catch (settleErr) {
          req.log.warn({ settleErr }, "Ledger settlement failed");
        }

        // ── Update the counter-order (partial or full consume) ────────────
        const newMatchFilled    = (parseFloat(match.filledQuantity ?? "0") + fillQty);
        const newMatchRemaining = Math.max(0, matchAvail - fillQty);
        const isMatchFullyFilled = newMatchRemaining <= 0.000001;

        if (isBot) {
          if (isMatchFullyFilled) {
            await db.delete(ordersTable).where(eq(ordersTable.id, match.id));
          } else {
            await db.update(ordersTable)
              .set({ filledQuantity: newMatchFilled.toString(), remainingQuantity: newMatchRemaining.toString(), updatedAt: new Date() })
              .where(eq(ordersTable.id, match.id));
          }
        } else {
          await db.update(ordersTable)
            .set({
              status:            isMatchFullyFilled ? "filled" : "open",
              filledQuantity:    newMatchFilled.toString(),
              remainingQuantity: newMatchRemaining.toString(),
              txid:              broadcastTxid,
              matchedOrderId:    id,
              updatedAt:         new Date(),
            })
            .where(eq(ordersTable.id, match.id));
        }

        totalFilled    += fillQty;
        totalFillValue += fillValue;
        remainingQty   -= fillQty;
        lastFillPrice   = fillPrice;
        lastTxid        = broadcastTxid;
        lastMatchId     = match.id;
        settlementTxid  = broadcastTxid;
        matchedOrderId  = match.id;
        // Track settlement metadata for API response
        lastSettlementType     = fallbackSettlement.settlementType;
        lastHtlcAddress        = htlcResult?.htlcAddress;
        lastHtlcSecretHash     = htlcResult?.secretHash;
        lastHtlcLocktimeBlocks = htlcResult?.locktimeBlocks;
        lastCrossChain         = isCrossChain;
        lastOpReturnPayload    = fallbackSettlement.opReturnData;

        // Register cross-chain HTLCs with the watcher so Relayer Keepers
        // are notified when the on-chain status transitions.
        if (isCrossChain && htlcResult?.htlcAddress && broadcastTxid) {
          registerHtlc({
            tradeId:        id,
            htlcAddress:    htlcResult.htlcAddress,
            secretHash:     htlcResult.secretHash,
            locktimeBlocks: htlcResult.locktimeBlocks,
            settlementTxid: broadcastTxid,
            pair:           body.symbol,
            userAddress:    body.walletAddress,
          });
        }
      }

      if (totalFilled > 0) {
        // ── Mark the user's order with actual fill amount ─────────────────
        const avgFillPrice    = totalFillValue / totalFilled;
        const isFullyFilled   = remainingQty <= 0.000001;
        const correctFee      = (totalFillValue * 0.001).toFixed(8);

        await db.update(ordersTable)
          .set({
            status:            isFullyFilled ? "filled" : "open",
            filledQuantity:    totalFilled.toString(),
            remainingQuantity: Math.max(0, remainingQty).toString(),
            price:             (isMarket || isStopTriggered) ? avgFillPrice.toString() : undefined,
            total:             totalFillValue.toFixed(8),
            fee:               correctFee,
            txid:              lastTxid,
            matchedOrderId:    lastMatchId,
            updatedAt:         new Date(),
          })
          .where(eq(ordersTable.id, id));

        /* Push order-filled notification */
        const fillSymbol = body.symbol as string;
        const fillBase   = fillSymbol.split("/")[0];
        pushNotification(body.walletAddress, {
          type:  isFullyFilled ? "order_filled" : "order_partial",
          title: isFullyFilled ? "Order Filled ✓" : `Partial Fill — ${totalFilled.toFixed(4)} ${fillBase}`,
          body:  `${totalFilled.toFixed(4)} ${fillBase} @ $${avgFillPrice.toFixed(4)} avg · BSV settled on-chain`,
          pair:  fillSymbol,
          txid:  lastTxid ?? undefined,
          side:  body.side,
        });
      }
    }

    // Return the created order (re-read for updated status if matched)
    const [created] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));

    res.status(201).json({
      ...serializeOrder(created),
      matched:        !!settlementTxid,
      settlementTxid,
      explorerUrl:    settlementTxid ? `https://whatsonchain.com/tx/${settlementTxid}` : null,
      // BSV Core DEX v2 settlement metadata
      settlement: settlementTxid ? {
        type:              lastSettlementType,
        crossChain:        lastCrossChain,
        htlcAddress:       lastHtlcAddress ?? null,
        htlcSecretHash:    lastHtlcSecretHash ?? null,
        htlcLocktimeBlocks: lastHtlcLocktimeBlocks ?? null,
        opReturnPayload:   lastOpReturnPayload ?? null,
      } : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to place order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /orders/:orderId ──────────────────────────────────────────────────────
router.get("/orders/:orderId", async (req, res) => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json({
      ...serializeOrder(order),
      explorerUrl: order.txid ? `https://whatsonchain.com/tx/${order.txid}` : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /orders/:orderId ───────────────────────────────────────────────────
router.delete("/orders/:orderId", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const [order] = await db
      .update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, req.params.orderId), eq(ordersTable.walletAddress, body.walletAddress)))
      .returning();

    if (!order) {
      res.status(404).json({ error: "Order not found or not owned by this wallet" });
      return;
    }

    // ── Unlock the reserved balance ──────────────────────────────────────────
    try {
      const [baseAsset, quoteAsset = "USDT"] = order.symbol.split("/");
      const lockAsset = order.side === "buy" ? quoteAsset : baseAsset;
      const remaining = parseFloat(order.remainingQuantity);

      // Market orders have no stored price — look up current market price so
      // the unlock amount mirrors what was locked at order placement time.
      let lockPrice = parseFloat(order.price ?? "0");
      if (!lockPrice && order.side === "buy") {
        const [mktRow] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, order.symbol));
        lockPrice = mktRow ? parseFloat(mktRow.lastPrice) : 0;
      }

      const lockAmount = order.side === "buy"
        ? (lockPrice * remaining).toString()
        : remaining.toString();

      if (parseFloat(lockAmount) > 0 && lockAsset) {
        await unlockFunds({ walletAddress: order.walletAddress, asset: lockAsset, amount: lockAmount });
      }
    } catch (unlockErr) {
      req.log.warn({ unlockErr }, "Ledger unlock failed on cancel");
    }

    res.json(serializeOrder(order));
  } catch (err) {
    req.log.error({ err }, "Failed to cancel order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /orders/precheck ─────────────────────────────────────────────────────
// Validates a potential order WITHOUT creating any DB record or transaction.
// Returns: { ok, errors[], warnings[], priceImpactPct, minReceived, route }
router.post("/orders/precheck", async (req, res) => {
  try {
    const { side, type, amount, price, slippageBps = 50, currentPrice } = req.body;
    // Normalize symbol format: accept both "BSV-USDT" (URL style) and "BSV/USDT" (DB style)
    const symbol: string = (req.body.symbol ?? "").replace("-", "/");

    if (!symbol || !side || !amount) {
      res.status(400).json({ ok: false, errors: [{ code: "AMOUNT_TOO_SMALL", detail: "Missing fields" }], warnings: [] });
      return;
    }

    const errors:   { code: string; detail?: string }[] = [];
    const warnings: { code: string; message: string  }[] = [];

    const qty = parseFloat(amount);

    // Pair enabled check (look up market) — must happen BEFORE px calculation
    // so we can use the DB market price as fallback for market orders.
    const [mkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
    if (!mkt) {
      errors.push({ code: "PAIR_DISABLED", detail: `Market ${symbol} not found` });
      res.json({ ok: false, errors, warnings });
      return;
    }

    const marketPrice = parseFloat(mkt.lastPrice);
    // For market orders without a price, fall back to the live market price
    // so slippage/impact calculations work correctly.
    const px  = price ? parseFloat(price) : (currentPrice ?? marketPrice ?? 0);
    const orderValue  = px * qty;

    // Min order size
    if (orderValue < 0.5) errors.push({ code: "AMOUNT_TOO_SMALL", detail: "Min order $0.50" });

    // Price required for limit/stop
    if ((type === "limit" || type === "stop") && (!px || px <= 0)) {
      errors.push({ code: "PRICE_REQUIRED" });
    }

    // Slippage / price impact (approximate AMM model)
    // For limit orders, use the market price (not the limit price) to compute
    // impact — a limit order far from market will just sit in the book and not
    // cause any immediate impact. Using the limit price would cause false
    // positives for high-value or off-market limit orders.
    const isTopTier  = ["BSV","BTC","ETH","BNB","SOL"].some(s => symbol.startsWith(s));
    const poolTvlUsd = isTopTier ? 500_000 : 50_000;
    const execPrice  = (type === "limit" || type === "stop") ? marketPrice : px;
    const impact     = ((execPrice * qty) / poolTvlUsd) * 100;
    const slipPct    = (slippageBps ?? 50) / 100;

    // Limit/stop orders execute at an exact price — slippage tolerance doesn't apply.
    // Only block truly extreme impact (>5%) that would severely move the market.
    if (impact > 5) {
      errors.push({ code: "PRICE_IMPACT_HIGH",
        detail: `${impact.toFixed(1)}% impact — split into smaller orders` });
    } else if (type === "market" && impact > slipPct && impact > 0.1) {
      // Slippage tolerance check applies to market orders only
      errors.push({ code: "SLIPPAGE_TOO_HIGH",
        detail: `Impact ${impact.toFixed(2)}% > tolerance ${slipPct.toFixed(2)}%` });
    } else if (impact > 1) {
      warnings.push({ code: "PRICE_IMPACT_MODERATE", message: "Your order will move the price by >1%." });
    }

    // Liquidity check — no open bot orders on the counter side? warn.
    const [base, quote = "USDT"] = symbol.split("/");
    const counterSide = side === "buy" ? "sell" : "buy";
    const counterOrders = await db.select().from(ordersTable).where(
      and(eq(ordersTable.symbol, symbol), eq(ordersTable.side, counterSide), eq(ordersTable.status, "open"))
    );
    if (counterOrders.length === 0) {
      warnings.push({ code: "LOW_LIQUIDITY", message: "No counter-orders visible — your order may wait for a match." });
    }

    // Route from hot cache (if available)
    const cached = getCachedQuote(base, quote);
    const route  = cached?.route ?? [base, quote];
    const feePct = cached?.feePct ?? 0.25;
    const minReceived = qty * (1 - feePct / 100) * (1 - slipPct / 100);

    res.json({
      ok:            errors.length === 0,
      errors,
      warnings,
      priceImpactPct: parseFloat(impact.toFixed(4)),
      minReceived:   parseFloat(minReceived.toFixed(8)),
      route,
      marketPrice,
      feePct,
    });
  } catch (err) {
    req.log.error({ err }, "Precheck error");
    res.status(500).json({ ok: false, errors: [{ code: "SERVER_ERROR", detail: "Precheck failed — try again" }], warnings: [] });
  }
});

// ── POST /metrics/trades ──────────────────────────────────────────────────────
// Receives latency + outcome telemetry from the frontend (via sendBeacon).
router.post("/metrics/trades", (req, res) => {
  try {
    const body = req.body;
    if (body?.symbol) recordTradeMetric(body);
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

// ── GET /metrics/trades ───────────────────────────────────────────────────────
// Returns aggregate latency + failure metrics for each pair/network/wallet.
router.get("/metrics/trades", (_req, res) => {
  res.json({ metrics: getMetricsSummary() });
});

router.get("/settlements", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const settled = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.status, "filled"), isNotNull(ordersTable.txid)));

    const real = settled
      .filter(o => o.txid && o.txid.length > 0)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit)
      .map(o => ({
        id:          o.id,
        txid:        o.txid!,
        explorerUrl: `https://whatsonchain.com/tx/${o.txid}`,
        symbol:      o.symbol,
        side:        o.side,
        price:       parseFloat(o.price ?? "0"),
        quantity:    parseFloat(o.quantity),
        total:       parseFloat(o.total ?? "0"),
        fee:         parseFloat(o.fee),
        feeAsset:    o.feeAsset,
        walletAddress: o.walletAddress,
        networkType: o.networkType,
        matchedOrderId: o.matchedOrderId,
        timestamp:   o.updatedAt.toISOString(),
        chain:       "BSV",
        status:      "confirmed" as const,
        confirmations: 6,
        requiredConfirmations: 3,
      }));

    res.json({ settlements: real, total: real.length });
  } catch (err) {
    req.log.error({ err }, "Failed to get settlements");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /settlements/htlc-status ─────────────────────────────────────────────
// Query the on-chain status of an HTLC P2SH output.
// Used by the Settlement Explorer UI to show LOCKED / CLAIMED / REFUNDED / EXPIRED.
router.get("/settlements/htlc-status", async (req, res) => {
  const { htlcAddress, locktimeBlocks } = req.query as { htlcAddress?: string; locktimeBlocks?: string };

  if (!htlcAddress || typeof htlcAddress !== "string") {
    res.status(400).json({ error: "htlcAddress query param required" });
    return;
  }

  const locktime = parseInt(locktimeBlocks ?? "0") || 0;
  if (locktime < 1) {
    res.status(400).json({ error: "locktimeBlocks query param required (positive integer)" });
    return;
  }

  try {
    const result = await queryHtlcStatus(htlcAddress, locktime);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to query HTLC status");
    res.status(500).json({ error: "Failed to query HTLC status" });
  }
});

export default router;
