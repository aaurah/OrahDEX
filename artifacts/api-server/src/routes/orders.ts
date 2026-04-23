import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne, isNotNull, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { BOT_ADDRESS } from "../lib/liquidityBot.js";
import { getBsvChainStatus, queryHtlcStatus } from "../lib/bsvChainMonitor.js";
import { pushNotification } from "../lib/notifQueue.js";
import { recordTradeMetric, getMetricsSummary } from "../lib/tradeMetrics.js";
import { getCachedQuote } from "../lib/routeCache.js";
import { unlockFunds, getBalances } from "../lib/ledger.js";
import { verifyAndLockFunding }  from "../lib/fundingVerifier.js";
import { settleSpotFill }        from "../lib/spotSettlement.js";
import { initiateEvmHtlcSession, EVM_CHAINS } from "../lib/evmHtlc.js";
import type { WalletSource }     from "../lib/orderIntent.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { recordPlatformFee } from "../lib/feeCollector.js";

const router: IRouter = Router();

function settlementExplorerUrl(txid: string | null | undefined, chainId?: number | null): string | null {
  if (!txid) return null;

  // Pending EVM HTLC sessions do not have a final settlement tx yet.
  if (txid.startsWith("htlc-pending-")) {
    const cfg = chainId ? EVM_CHAINS[chainId] : null;
    if (!cfg) return null;
    return cfg.contractAddress
      ? `${cfg.blockExplorer}/address/${cfg.contractAddress}`
      : cfg.blockExplorer;
  }

  if (txid.startsWith("0x")) {
    const cfg = chainId ? EVM_CHAINS[chainId] : null;
    const explorerBase = cfg?.blockExplorer ?? "https://etherscan.io";
    return `${explorerBase}/tx/${txid}`;
  }

  return `${BSV_NET.explorer}/tx/${txid}`;
}

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
    explorerUrl:       settlementExplorerUrl(o.txid, null),
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

    const side = body.side === "buy" || body.side === "sell" ? body.side : null;
    const type = body.type === "market" || body.type === "limit" || body.type === "stop" ? body.type : null;
    if (!side || !type) {
      res.status(400).json({ error: "Invalid order side or type" });
      return;
    }

    const symbol = String(body.symbol).replace(/-/g, "/");
    const quantity = parseFloat(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      res.status(400).json({ error: "Invalid quantity" });
      return;
    }

    const rawPrice = body.price != null ? parseFloat(body.price) : undefined;
    if (rawPrice != null && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
      res.status(400).json({ error: "Invalid price" });
      return;
    }

    const stopPrice = body.stopPrice != null ? parseFloat(body.stopPrice) : undefined;
    if (type === "stop" && (stopPrice == null || !Number.isFinite(stopPrice) || stopPrice <= 0)) {
      res.status(400).json({ error: "Stop orders require a valid stopPrice" });
      return;
    }
    if (type === "limit" && (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0)) {
      res.status(400).json({ error: "Limit orders require a valid price" });
      return;
    }

    const id            = crypto.randomUUID();
    const price         = rawPrice;
    const total         = price ? price * quantity : undefined;
    const fee           = (total || 0) * 0.001;
    const networkType   = body.networkType ?? (body.walletAddress.startsWith("0x") ? "evm" : "bsv");

    const walletSource: "external" | "orah" =
      body.walletSource === "external" ? "external"
      : body.walletSource === "orah"   ? "orah"
      : (body.evmSignature || body.signedTx) ? "external"
      : "orah";

    const isExternalWallet = walletSource === "external";

    // ── Acquire funding lock BEFORE inserting the order (No funding → No order) ──
    // fundingVerifier enforces balance-bucket isolation:
    //   MARKET / LIMIT  → spot bucket (user_balances)
    //   FUTURES         → futures margin bucket (futures_margin_accounts)
    // Returns a fundingRef that proves funds are committed.
    const [baseAsset, quoteAsset = "USDT"] = symbol.split("/");
    const lockAsset = side === "buy" ? quoteAsset : baseAsset;

    let lockPrice = price;
    if (!lockPrice && side === "buy") {
      const [mktRow] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
      lockPrice = mktRow ? parseFloat(mktRow.lastPrice) : 0;
    }
    if (side === "buy" && (lockPrice == null || !Number.isFinite(lockPrice) || lockPrice <= 0)) {
      res.status(400).json({ error: "Unable to determine buy price for funding lock" });
      return;
    }

    const lockAmount = side === "buy"
      ? (lockPrice ? (lockPrice * quantity).toString() : "0")
      : quantity.toString();

    let fundingRef = "";
    if (parseFloat(lockAmount) > 0 && lockAsset) {
      const fundingVerif = await verifyAndLockFunding({
        walletAddress:   body.walletAddress,
        kind:            "SPOT",   // orders.ts always handles SPOT (MARKET + LIMIT)
        side,
        walletSource,
        asset:           lockAsset!,
        amount:          lockAmount,
        signature:       body.evmSignature ?? body.signedTx,
        reportedBalance: body.reportedBalance != null ? parseFloat(body.reportedBalance) : undefined,
      });
      if (!fundingVerif.valid) {
        res.status(400).json({ error: fundingVerif.error, code: fundingVerif.code });
        return;
      }
      fundingRef = fundingVerif.fundingRef;
    }

    // ── All checks passed — insert the order ──────────────────────────────────
    const newOrder = {
      id,
      symbol,
      walletAddress:     body.walletAddress,
      networkType,
      side,                                      // "buy" | "sell"
      type,                                      // "limit" | "market" | "stop"
      status:            "open",
      price:             price?.toString(),
      stopPrice:         stopPrice?.toString(),
      quantity:          quantity.toString(),
      filledQuantity:    "0",
      remainingQuantity: quantity.toString(),
      total:             total?.toString(),
      fee:               fee.toString(),
      feeAsset:          symbol.split("/")[1] || "USDT",
      timeInForce:       body.timeInForce || "GTC",
      txid:              null as string | null,
      // EVM signature from MetaMask personal_sign — proves the trader authorised this order
      signedTx:          body.evmSignature || body.signedTx || null,
      matchedOrderId:    null as string | null,
      fundingRef:        fundingRef || null,
      nonce:             body.nonce ?? id,   // use provided nonce or fall back to order id
      expiry:            body.expiry ? String(body.expiry) : String(Math.floor(Date.now() / 1000) + 5 * 60),
    };

    await db.insert(ordersTable).values(newOrder);
    req.log.info({ orderId: id, side, networkType, walletSource }, "Order placed");

    /* Push order-placed notification to the user */
    const orderPair = symbol;
    const orderSide = side.toUpperCase();
    pushNotification(body.walletAddress, {
      type: "order_placed",
      title: `${orderSide} Order Placed`,
      body: `${quantity} ${orderPair.split("/")[0]} @ ${price ? `$${price}` : "market"} · waiting for match`,
      pair: orderPair,
      side,
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
    // EVM HTLC session — set when both parties are external EVM wallets
    let lastEvmHtlcSession: Awaited<ReturnType<typeof initiateEvmHtlcSession>> | null = null;

    const isMarket = type === "market";
    const isLimit  = type === "limit" && !!price;

    // ── Stop order trigger check ─────────────────────────────────────────────
    // If a stop order's trigger price is already beaten by the current market,
    // convert it to a market order so it fills immediately.
    let isStopTriggered = false;
    if (type === "stop" && stopPrice) {
      const stopTrigger = stopPrice;
      const [mkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
      const mktPrice = mkt ? parseFloat(mkt.lastPrice) : 0;
      if (mktPrice > 0) {
        // Buy-stop: trigger when price rises ABOVE stopPrice (breakout entry)
        // Sell-stop: trigger when price falls BELOW stopPrice (stop-loss exit)
        isStopTriggered =
          (side === "buy"  && mktPrice >= stopTrigger) ||
          (side === "sell" && mktPrice <= stopTrigger);
      }
    }

    if (isMarket || isLimit || isStopTriggered) {
      const counterSide = side === "buy" ? "sell" : "buy";

      // For limit orders restrict by price; market/stop orders accept any price
      // Format price safely — avoid scientific notation (e.g. 1e-8) which
      // breaks numeric DB comparisons on very small asset prices.
      const safePriceStr = price != null ? price.toFixed(8) : undefined;

      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          ne(ordersTable.walletAddress, body.walletAddress),
          // Limit orders have price constraints; market + triggered-stop orders take any price
          ...(isLimit && safePriceStr
            ? [side === "buy"
                ? lte(ordersTable.price, safePriceStr)
                : gte(ordersTable.price, safePriceStr)]
            : []),
        )
      );

      // Sort: best price first (cheapest sell for buy, most expensive buy for sell)
      const sorted = counterOrders.sort((a, b) => {
        const pa = parseFloat(a.price ?? "0");
        const pb = parseFloat(b.price ?? "0");
        return side === "buy" ? pa - pb : pb - pa;
      });

      // External EVM orders must match only against external EVM counterparties
      // so settlement remains wallet-to-wallet via HTLC, not synthetic ledger fill.
      const requiresDefiWalletToWallet = walletSource === "external" && networkType === "evm";
      const eligibleMatches = requiresDefiWalletToWallet
        ? sorted.filter((candidate) => {
            const isBot = candidate.walletAddress === BOT_ADDRESS;
            if (isBot) return false;
            const ref = candidate.fundingRef ?? "";
            return (
              ref.startsWith("evm-sig:") ||
              ref.startsWith("evm-balance:") ||
              (candidate.walletAddress.startsWith("0x") &&
                (candidate.networkType ?? "evm") === "evm" &&
                !ref.startsWith("ledger:") &&
                !ref.startsWith("margin:"))
            );
          })
        : sorted;

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

      const [baseAsset, quoteAsset = "USDT"] = symbol.split("/");

      for (const match of eligibleMatches) {
        if (remainingQty <= 0.000001) break;

        // Use remainingQuantity directly — it is always kept up-to-date by
        // prior partial fills, so we must NOT subtract filledQuantity again
        // (that would double-count and produce negative availability).
        const matchAvail = parseFloat(match.remainingQuantity ?? match.quantity);
        if (matchAvail <= 0.000001) continue;

        const fillQty   = Math.min(remainingQty, matchAvail);
        const fillPrice = parseFloat(match.price ?? price?.toString() ?? "0");
        const fillValue = fillQty * fillPrice;
        const isBot     = match.walletAddress === BOT_ADDRESS;

        const tradeId      = crypto.randomUUID();
        const buyerNetwork  = side === "buy" ? networkType : (match.networkType ?? "evm");
        const sellerNetwork = side === "sell" ? networkType : (match.networkType ?? "evm");
        const buyerAddress  = side === "buy" ? body.walletAddress : match.walletAddress;
        const sellerAddress = side === "sell" ? body.walletAddress : match.walletAddress;

        // ── Detect EVM/EVM wallet-to-wallet fill ─────────────────────────
        // A fill is "EVM external" when:
        //   • walletSource === "external" AND networkType === "evm"  (incoming order)
        //   • match.fundingRef starts with "evm-sig:" or "evm-balance:"  (counter-order)
        //     OR the counter-order's address is 0x-prefixed with no internal fundingRef
        // Bot orders always use the internal ledger and are never EVM-HTLC candidates.
        const incomingIsEvmExternal = walletSource === "external" && networkType === "evm";
        const matchFundingRef0 = match.fundingRef ?? "";
        const matchIsEvmExternal = !isBot && (
          matchFundingRef0.startsWith("evm-sig:") ||
          matchFundingRef0.startsWith("evm-balance:") ||
          (match.walletAddress.startsWith("0x") &&
           (match.networkType ?? "evm") === "evm" &&
           !matchFundingRef0.startsWith("ledger:") &&
           !matchFundingRef0.startsWith("margin:"))
        );
        const bothEvmExternal = incomingIsEvmExternal && matchIsEvmExternal;

        let fillResult: Awaited<ReturnType<typeof settleSpotFill>>;

        if (bothEvmExternal) {
          // ── On-chain EVM path: HTLC atomic settlement ──────────────────
          // Both parties hold funds in their own wallets. Skip internal ledger
          // settlement — funds are transferred directly on-chain via the HTLC
          // contract (lockETH / lockToken → reveal). The HTLC watcher calls
          // reveal() once both parties have locked, completing the trade.
          fillResult = {
            // Placeholder txid until the HTLC reveal transaction settles on-chain.
            // Prefixed so auditing tools can distinguish it from real broadcast txids.
            txid:             "htlc-pending-" + crypto.createHash("sha256").update(tradeId).digest("hex").slice(0, 32),
            wasRealBroadcast: false,
            settlementType:   "evm_htlc",
            isCrossChain:     false,
          };
        } else {
          // ── Standard path: BSV OP_RETURN + internal ledger settlement ──
          // Architecture (per BSV Core DEX spec):
          //   1. UTXO-scripted swap contract: for cross-chain trades (EVM ↔ BSV),
          //      generate a P2SH HTLC — the secretHash is embedded in the OP_RETURN.
          //   2. OP_RETURN audit record (v2): immutable on-chain record.
          //   3. Real broadcast via settlement wallet UTXO (best-effort).
          fillResult = await settleSpotFill({
            tradeId,
            newOrderId:    id,
            matchOrder:    match,
            pair:          body.symbol,
            fillQty,
            fillPrice,
            buyerAddress,
            sellerAddress,
            buyerNetwork,
            sellerNetwork,
            isBot,
            log:           req.log,
          });
        }

        const broadcastTxid = fillResult.txid;

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
        // Track settlement metadata for API response (from spotSettlement module)
        lastSettlementType     = fillResult.settlementType;
        lastHtlcAddress        = fillResult.htlcAddress;
        lastHtlcSecretHash     = fillResult.htlcSecretHash;
        lastHtlcLocktimeBlocks = fillResult.htlcLocktimeBlocks;
        lastCrossChain         = fillResult.isCrossChain;
        lastOpReturnPayload    = fillResult.opReturnPayload;
        // Note: HTLC registration with watcher is handled inside settleSpotFill()

        // ── EVM HTLC atomic settlement (non-custodial wallet-to-wallet) ───────
        // Required for all EVM/EVM external fills.  Both parties lock their funds
        // into the OrahDEXHTLC contract on-chain; the OrahDEX relayer calls
        // reveal() once both locks are confirmed, completing the atomic swap.
        // Internal ledger settlement is skipped for this path (funds stay on-chain).
        if (bothEvmExternal && !lastEvmHtlcSession) {
          // Determine chain — use incoming order's chainId if provided, else default to 1 (Ethereum)
          const chainId = body.chainId ? Number(body.chainId) : 1;
          const chainConfig = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

          // Resolve token addresses from pair
          const [base, quot] = body.symbol.split("/");
          const baseIsNative = base === chainConfig.nativeSymbol || base === "ETH" || base === "BNB" || base === "MATIC";
          const quoteIsUsdt  = quot === "USDT" || quot === "USDC";

          // Amounts in smallest on-chain units
          const ETH_DECIMALS  = 18;
          const USDT_DECIMALS = 6;
          const fillWei       = BigInt(Math.round(fillQty   * 10 ** ETH_DECIMALS));
          const fillUsdt      = BigInt(Math.round(fillValue * 10 ** USDT_DECIMALS));

          try {
            lastEvmHtlcSession = await initiateEvmHtlcSession({
              tradeId:       tradeId,
              pair:          body.symbol,
              chainId,
              sellerAddress: sellerAddress as `0x${string}`,
              buyerAddress:  buyerAddress  as `0x${string}`,
              sellerAsset:   baseIsNative ? chainConfig.nativeSymbol : (base ?? "ETH"),
              sellerAmount:  fillWei.toString(),
              sellerToken:   baseIsNative ? null : (chainConfig.usdtAddress ?? null),
              buyerAsset:    quoteIsUsdt ? "USDT" : (quot ?? "USDT"),
              buyerAmount:   fillUsdt.toString(),
              buyerToken:    quoteIsUsdt ? (chainConfig.usdtAddress ?? null) : null,
            });

            req.log.info(
              { sessionId: lastEvmHtlcSession.id, tradeId, sellerAddress, buyerAddress, chainId },
              "orders: EVM HTLC session created — awaiting on-chain locks from both parties"
            );
          } catch (evmErr: any) {
            // HTLC session creation failure is a hard error for EVM/EVM external fills.
            // The trade is not yet settled — the fill loop will record the fill with
            // a deterministic txid and the UI will guide the user to complete locking.
            req.log.error({ err: evmErr?.message, tradeId }, "orders: EVM HTLC session creation failed");
          }
        }
      }

      if (totalFilled > 0) {
        // ── Mark the user's order with actual fill amount ─────────────────
        const avgFillPrice    = totalFillValue / totalFilled;
        const isFullyFilled   = remainingQty <= 0.000001;
        const correctFee      = (totalFillValue * 0.001).toFixed(8);
        // Record exchange revenue from the order book fill fee (0.1%)
        const feeAssetSymbol = (body.symbol as string).split("/")[1] ?? "USDT";
        recordPlatformFee({ source: "orderbook", amount: correctFee, asset: feeAssetSymbol, txRef: id });

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

    // Derive quoteSymbol from the order symbol so the client never has to
    // parse it — required for fill notification display on all order types.
    const symbolParts = (created.symbol ?? "").split("/");
    const quoteSymbol = symbolParts[1]?.replace("-PERP", "") ?? "USDT";

    res.status(201).json({
      ...serializeOrder(created),
      matched:        !!settlementTxid,
      settlementTxid,
      quoteSymbol,
      explorerUrl:    settlementExplorerUrl(settlementTxid, lastEvmHtlcSession?.chainId ?? null),
      // BSV Core DEX v2 settlement metadata
      settlement: settlementTxid ? {
        type:              lastSettlementType,
        crossChain:        lastCrossChain,
        htlcAddress:       lastHtlcAddress ?? null,
        htlcSecretHash:    lastHtlcSecretHash ?? null,
        htlcLocktimeBlocks: lastHtlcLocktimeBlocks ?? null,
        opReturnPayload:   lastOpReturnPayload ?? null,
      } : null,
      // EVM HTLC non-custodial settlement session (present when both parties are external EVM wallets)
      // The frontend should prompt both parties to lock their funds on-chain to complete the trade.
      evmHtlcSession: lastEvmHtlcSession ? {
        id:              lastEvmHtlcSession.id,
        tradeId:         lastEvmHtlcSession.tradeId,
        chainId:         lastEvmHtlcSession.chainId,
        contractAddress: lastEvmHtlcSession.contractAddress,
        secretHash:      lastEvmHtlcSession.secretHash,
        status:          lastEvmHtlcSession.status,
        sellerLock: {
          lockId:          lastEvmHtlcSession.sellerLock.lockId,
          contractAddress: lastEvmHtlcSession.sellerLock.contractAddress,
          asset:           lastEvmHtlcSession.sellerLock.asset,
          amount:          lastEvmHtlcSession.sellerLock.amount,
          tokenAddress:    lastEvmHtlcSession.sellerLock.tokenAddress,
          timelockUnix:    lastEvmHtlcSession.sellerLock.timelockUnix,
          calldata:        lastEvmHtlcSession.sellerLock.calldata,
          instructions:    lastEvmHtlcSession.sellerLock.instructions,
        },
        buyerLock: {
          lockId:          lastEvmHtlcSession.buyerLock.lockId,
          contractAddress: lastEvmHtlcSession.buyerLock.contractAddress,
          asset:           lastEvmHtlcSession.buyerLock.asset,
          amount:          lastEvmHtlcSession.buyerLock.amount,
          tokenAddress:    lastEvmHtlcSession.buyerLock.tokenAddress,
          timelockUnix:    lastEvmHtlcSession.buyerLock.timelockUnix,
          calldata:        lastEvmHtlcSession.buyerLock.calldata,
          instructions:    lastEvmHtlcSession.buyerLock.instructions,
        },
        expiresAt: lastEvmHtlcSession.expiresAt,
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
      explorerUrl: settlementExplorerUrl(order.txid, null),
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

// ── POST /orders/recover-locked ───────────────────────────────────────────────
// Scans the ledger for locked balances that exceed what open orders actually
// require, and moves the excess back to available.
// This recovers funds that were orphaned when a cancel request previously
// failed silently (e.g. wallet-address mismatch across BSV/EVM networks).
// Accepts optional `altAddress` for cross-network Orah wallet users.
router.post("/orders/recover-locked", async (req, res) => {
  try {
    const { walletAddress, altAddress } = req.body ?? {};
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const addresses: string[] = [walletAddress];
    if (altAddress && altAddress !== walletAddress) addresses.push(altAddress);

    // 1. Gather all open orders across all wallet addresses
    const openOrders = await db
      .select()
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, "open"),
        // drizzle `inArray` for two values
        ...(addresses.length === 1
          ? [eq(ordersTable.walletAddress, addresses[0]!)]
          : [eq(ordersTable.walletAddress, addresses[0]!)] // handled below via merge
        ),
      ));

    // If there's a second address, fetch its open orders too and merge
    let openOrdersAll = [...openOrders];
    if (addresses.length > 1) {
      const alt = await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.status, "open"), eq(ordersTable.walletAddress, addresses[1]!)));
      openOrdersAll = [...openOrders, ...alt];
    }

    // 2. Calculate expected locked amount per (walletAddress, asset) from open orders
    const expectedLocked: Record<string, Record<string, number>> = {};
    for (const o of openOrdersAll) {
      const [baseAsset, quoteAsset = "USDT"] = o.symbol.split("/");
      const lockAsset = o.side === "buy" ? quoteAsset : baseAsset;
      const remaining = parseFloat(o.remainingQuantity ?? o.quantity);
      const lockPrice = parseFloat(o.price ?? "0");
      const lockAmount = o.side === "buy"
        ? lockPrice * remaining
        : remaining;

      if (!lockAsset || lockAmount <= 0) continue;
      if (!expectedLocked[o.walletAddress]) expectedLocked[o.walletAddress] = {};
      expectedLocked[o.walletAddress][lockAsset] = (expectedLocked[o.walletAddress][lockAsset] ?? 0) + lockAmount;
    }

    // 3. For each address, get actual locked balances and unlock any orphaned amount
    const recovered: { walletAddress: string; asset: string; amount: string }[] = [];

    for (const addr of addresses) {
      const balances = await getBalances(addr);
      for (const bal of balances) {
        const actualLocked = parseFloat(bal.locked);
        if (actualLocked <= 0) continue;
        const expectedForAsset = expectedLocked[addr]?.[bal.asset] ?? 0;
        const orphaned = actualLocked - expectedForAsset;
        if (orphaned > 0.000001) {
          await unlockFunds({ walletAddress: addr, asset: bal.asset, amount: orphaned.toFixed(8) });
          recovered.push({ walletAddress: addr, asset: bal.asset, amount: orphaned.toFixed(8) });
          req.log.info({ addr, asset: bal.asset, orphaned }, "recover-locked: unlocked orphaned funds");
        }
      }
    }

    res.json({ recovered, count: recovered.length });
  } catch (err) {
    req.log.error({ err }, "Failed to recover locked funds");
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
        explorerUrl: settlementExplorerUrl(o.txid, null),
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
