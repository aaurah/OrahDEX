import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne, isNotNull, desc, sql } from "drizzle-orm";
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
import { settleEscrowMatch, isEscrowChain, findEscrowChain } from "../lib/escrowRelayer.js";
import type { WalletSource }     from "../lib/orderIntent.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import {
  buildOrderAuthMessage, verifyEvmSignature, isOrderNonceConsumed, recordConsumedOrderNonce,
  verifyBsvWithdrawSignature, verifySolWithdrawSignature,
  issueBsvOrderChallenge, verifyBsvOrderSignature,
  issueSolOrderChallenge, verifySolOrderSignature,
} from "../lib/walletAuth.js";

const router: IRouter = Router();

// ── Wallet-format helpers ─────────────────────────────────────────────────────

/** Detect EVM addresses (0x + 40 hex chars). */
function detectIsEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Detect BSV / legacy Bitcoin / Bitcoin Cash addresses (base58 P2PKH / P2SH). */
function detectIsBsvAddress(addr: string): boolean {
  // BSV mainnet: 1xxx (P2PKH) or 3xxx (P2SH) or bchtest / bitcoincash prefixed
  return /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr);
}

/** Detect Solana public keys (base58, 32–44 chars, no O/0/I/l). */
function detectIsSolAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) && !addr.startsWith("0x");
}

/**
 * Detect whether a DB unique-index violation was triggered.
 * Postgres raises error code 23505 for unique constraint violations; the
 * constraint name appears in the detail/message text.
 */
function isNonceUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return (
    e["code"] === "23505" ||
    String(e["message"] ?? "").includes("orders_wallet_nonce_uidx") ||
    String(e["detail"] ?? "").includes("orders_wallet_nonce_uidx")
  );
}

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

// ── POST /orders/bsv-challenge — Issue a BSV order challenge ─────────────────
// BSV wallets must request an order-bound challenge (not a withdrawal challenge)
// and sign it before placing an order.  This prevents a withdrawal challenge
// from being replayed as an order signature.
router.post("/orders/bsv-challenge", (req, res) => {
  const { walletAddress, symbol, side, quantity, nonce, expiry } = req.body;
  if (!walletAddress || !symbol || !side || !quantity || !nonce || !expiry) {
    res.status(400).json({ error: "walletAddress, symbol, side, quantity, nonce, and expiry are required" });
    return;
  }
  if (!detectIsBsvAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a BSV P2PKH/P2SH address" });
    return;
  }
  const challenge = issueBsvOrderChallenge({ walletAddress, symbol, side, quantity, nonce, expiry });
  res.json(challenge);
});

// ── POST /orders/sol-challenge — Issue a Solana order challenge ───────────────
router.post("/orders/sol-challenge", (req, res) => {
  const { walletAddress, symbol, side, quantity, nonce, expiry } = req.body;
  if (!walletAddress || !symbol || !side || !quantity || !nonce || !expiry) {
    res.status(400).json({ error: "walletAddress, symbol, side, quantity, nonce, and expiry are required" });
    return;
  }
  if (!detectIsSolAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a Solana base58 address" });
    return;
  }
  const challenge = issueSolOrderChallenge({ walletAddress, symbol, side, quantity, nonce, expiry });
  res.json(challenge);
});

// ── POST /orders ───────────────────────────────────────────────────────────────
// Accepts a required `evmSignature` field (MetaMask personal_sign) for external
// EVM wallets that proves the trader authorised this specific order.
// The canonical message is built server-side from the order parameters.
// On match, a BSV OP_RETURN settlement transaction is generated and both orders
// are marked filled with the txid.
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

    const symbol = typeof body.symbol === "string" && body.symbol.length > 0
      ? body.symbol.replace(/-/g, "/")
      : null;
    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }
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
    // Stop orders also require a limit price (worst-case fill price) to prevent
    // execution at an arbitrary or zero price after the trigger fires.
    if (type === "stop" && (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0)) {
      res.status(400).json({ error: "Stop orders require a valid price (limit price after trigger)" });
      return;
    }
    if (type === "limit" && (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0)) {
      res.status(400).json({ error: "Limit orders require a valid price" });
      return;
    }

    const id            = crypto.randomUUID();
    const price         = rawPrice;
    const total         = price ? price * quantity : undefined;
    // Look up the per-market taker fee so the recorded order fee matches what
    // the matching engine and ledger will actually deduct on settlement.
    // Falls back to 0.1% if the market row is missing or the fee column is unset.
    let feeRate = 0.001;
    try {
      const [feeMkt] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
      const tf = feeMkt ? parseFloat(feeMkt.takerFee) : NaN;
      if (Number.isFinite(tf) && tf >= 0) feeRate = tf;
    } catch { /* fall back to default */ }
    const fee           = (total || 0) * feeRate;
    const networkType   = body.networkType ?? (body.walletAddress.startsWith("0x") ? "evm" : "bsv");

    // Classify wallet source based on address format — explicit format detection
    // prevents clients from lying about their wallet type to bypass auth checks.
    const isEvmAddress = detectIsEvmAddress(body.walletAddress);
    const isBsvAddress = detectIsBsvAddress(body.walletAddress);
    const isSolAddress = detectIsSolAddress(body.walletAddress);

    // Address format detection always takes priority over client-supplied walletSource.
    // This prevents a client from setting walletSource:"orah" with an EVM address to
    // skip the cryptographic signature verification that external wallets require.
    const walletSource: "external" | "orah" =
      (isEvmAddress || isBsvAddress || isSolAddress) ? "external"
      : body.walletSource === "orah" ? "orah"
      : "orah";

    const isExternalWallet = walletSource === "external";

    // ── Verify wallet ownership for external wallets ─────────────────────────
    // The signature must have been produced by the private key of walletAddress
    // over the canonical order-authorisation message. This prevents any caller who
    // merely knows a walletAddress from placing orders on its behalf.
    //
    // For BSV and Solana wallets, a prior-nonce check in the DB enforces that
    // each (wallet, nonce) pair is truly single-use even across server restarts.
    if (walletSource === "external") {
      const orderNonce  = body.nonce  ? String(body.nonce)  : id;
      const orderExpiry = body.expiry ? String(body.expiry) : String(Math.floor(Date.now() / 1000) + 5 * 60);
      const expiryUnixSec = parseInt(orderExpiry, 10);

      // Enforce expiry.
      if (expiryUnixSec <= Math.floor(Date.now() / 1000)) {
        res.status(401).json({ error: "Order signature has expired. Sign a fresh order with a future expiry.", code: "SIGNATURE_EXPIRED" });
        return;
      }

      // Check for prior nonce use in-memory cache first (fast path), then DB.
      const priorNonceUse = isOrderNonceConsumed(body.walletAddress, orderNonce);
      if (priorNonceUse) {
        res.status(401).json({ error: "Order nonce has already been used. Sign a fresh order with a new nonce.", code: "NONCE_REPLAYED" });
        return;
      }

      // DB-level nonce uniqueness check: lower(wallet_address) + nonce.
      // Enforces single-use even across server restarts (the in-memory cache is lost on restart).
      const existingNonce = await db.select({ id: ordersTable.id }).from(ordersTable)
        .where(and(
          sql`lower(${ordersTable.walletAddress}) = lower(${body.walletAddress})`,
          eq(ordersTable.nonce, orderNonce),
        ))
        .limit(1);
      if (existingNonce.length > 0) {
        res.status(401).json({ error: "Order nonce has already been used. Sign a fresh order with a new nonce.", code: "NONCE_REPLAYED" });
        return;
      }

      if (isEvmAddress) {
        // EVM: personal_sign with canonical order auth message
        const evmSig = body.evmSignature ?? body.signedTx;
        if (!evmSig) {
          res.status(401).json({
            error: "evmSignature is required for external EVM wallet orders. " +
                   "Sign the canonical order message with personal_sign and include it in the request.",
            code: "SIGNATURE_REQUIRED",
          });
          return;
        }
        const authMsg = buildOrderAuthMessage({
          walletAddress: body.walletAddress,
          symbol:        symbol,
          side:          body.side,
          quantity:      quantity.toString(),
          nonce:         orderNonce,
          expiry:        orderExpiry,
        });
        try {
          verifyEvmSignature(body.walletAddress, authMsg, evmSig);
        } catch (authErr: any) {
          res.status(401).json({ error: authErr.message, code: "SIGNATURE_MISMATCH" });
          return;
        }
      } else if (isBsvAddress) {
        // BSV: verify ECDSA signature against an order-bound challenge.
        // Clients must obtain a challenge via POST /orders/bsv-challenge
        // (which binds to symbol/side/quantity) and sign it.
        const sig = body.bsvSignature ?? body.signedTx;
        if (!sig) {
          res.status(401).json({
            error: "bsvSignature is required for external BSV wallet orders. " +
                   "Request an order challenge via POST /orders/bsv-challenge, sign it with your BSV wallet, " +
                   "and include the signature in this request.",
            code: "SIGNATURE_REQUIRED",
          });
          return;
        }
        try {
          verifyBsvOrderSignature(body.walletAddress, sig, {
            symbol,
            side,
            quantity: quantity.toString(),
          });
        } catch (authErr: any) {
          res.status(401).json({ error: authErr.message, code: "SIGNATURE_MISMATCH" });
          return;
        }
      } else if (isSolAddress) {
        // Solana: verify Ed25519 signature against an order-bound challenge.
        // Clients must obtain a challenge via POST /orders/sol-challenge.
        const sig = body.solSignature ?? body.signedTx;
        if (!sig) {
          res.status(401).json({
            error: "solSignature is required for external Solana wallet orders. " +
                   "Request an order challenge via POST /orders/sol-challenge, sign it with your Solana wallet, " +
                   "and include the signature in this request.",
            code: "SIGNATURE_REQUIRED",
          });
          return;
        }
        try {
          verifySolOrderSignature(body.walletAddress, sig, {
            symbol,
            side,
            quantity: quantity.toString(),
          });
        } catch (authErr: any) {
          res.status(401).json({ error: authErr.message, code: "SIGNATURE_MISMATCH" });
          return;
        }
      }

      // Consume the nonce after successful verification (single-use enforcement).
      recordConsumedOrderNonce(body.walletAddress, orderNonce, expiryUnixSec);
    }

    // ── Validate and extract optional chainId (additive — existing clients unaffected) ──
    // When provided, enables on-chain RPC balance verification in fundingVerifier.
    // Must be a numeric value in the supported set; unknown values are silently ignored.
    const SUPPORTED_CHAIN_IDS = new Set([1, 56, 137, 8453, 42161, 10, 43114, 11155111]);
    const chainId = body.chainId != null
      ? (() => {
          const n = parseInt(String(body.chainId), 10);
          return SUPPORTED_CHAIN_IDS.has(n) ? n : undefined;
        })()
      : undefined;

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

    // Market buy orders lock against the last market price, but the actual fill
    // happens at the bot's ask (slightly higher). Add a 0.5% slippage buffer so
    // the locked amount always covers the fill cost and settleTrade never throws
    // SETTLEMENT_INSUFFICIENT_LOCK due to a small price discrepancy.
    const lockSlippage = (side === "buy" && type === "market") ? 1.005 : 1;
    const lockAmount = side === "buy"
      ? (lockPrice ? (lockPrice * quantity * lockSlippage).toString() : "0")
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
        chainId,
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
      price:             price != null ? price.toFixed(18) : undefined,
      stopPrice:         stopPrice != null ? stopPrice.toFixed(18) : undefined,
      quantity:          quantity.toFixed(18),
      filledQuantity:    "0",
      remainingQuantity: quantity.toFixed(18),
      total:             total != null ? total.toFixed(18) : undefined,
      fee:               fee.toFixed(18),
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

    try {
      await db.insert(ordersTable).values(newOrder);
    } catch (insertErr: unknown) {
      // Catch unique constraint violations on (wallet_address, nonce) — orders_wallet_nonce_uidx
      if (isNonceUniqueViolation(insertErr)) {
        res.status(409).json({ error: "Order nonce has already been used. Sign a fresh order with a new nonce.", code: "NONCE_REPLAYED" });
        return;
      }
      throw insertErr; // re-throw all other DB errors
    }
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
    // Hoisted so the IOC check after the match block can read them
    let totalFilled    = 0;
    let totalFillValue = 0;
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
      // totalFilled / totalFillValue are hoisted to outer scope (see above)
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

        // ─────────────────────────────────────────────────────────────────────
        // ESCROW INTEGRITY PRECHECK — runs BEFORE any DB writes / fillResult.
        // ─────────────────────────────────────────────────────────────────────
        // `release(orderId)` drains the WHOLE deposit, so once any escrow
        // deposit exists for either order, the only safe settlement is a
        // single fill that consumes both orders completely. Anything else
        // (partial fill, cross-chain mismatch, one-sided lock) would leave
        // funds either over-released or unreachable. We must skip this match
        // entirely — no DB updates, no fillResult — and let the user cancel
        // their order to refund. Detected escrow chains are reused later to
        // avoid double-scanning all chains.
        //
        // Note on `bothEvmExternal=false` orders: bots / internal-ledger
        // counterparties can never have an escrow deposit (only self-custody
        // EVM users do), so this gate doesn't apply to them.
        let prefetchedSellerChain: number | null = null;
        let prefetchedBuyerChain:  number | null = null;
        let escrowAnyDeposit = false;
        if (bothEvmExternal) {
          try {
            const buyerOrderId  = side === "buy"  ? id : match.id;
            const sellerOrderId = side === "sell" ? id : match.id;
            [prefetchedBuyerChain, prefetchedSellerChain] = await Promise.all([
              findEscrowChain(buyerOrderId),
              findEscrowChain(sellerOrderId),
            ]);
            escrowAnyDeposit =
              prefetchedBuyerChain !== null || prefetchedSellerChain !== null;
          } catch (err: any) {
            // Fail-closed: if we can't read any escrow chain, assume the
            // worst (deposit might exist) and gate the trade. Better to
            // skip a match than to risk releasing locked funds blindly.
            req.log.error(
              { err: err?.message, incomingId: id, matchId: match.id },
              "orders: escrow precheck RPC failure — failing closed (skipping match)",
            );
            continue;
          }

          if (escrowAnyDeposit) {
            const incomingFullyConsumed = (remainingQty - fillQty) <= 0.000001;
            const matchFullyConsumed    = (matchAvail   - fillQty) <= 0.000001;
            if (!incomingFullyConsumed || !matchFullyConsumed) {
              // Locked funds + partial fill → skip THIS match entirely.
              // Order remains open; another match attempt may succeed.
              for (const addr of [buyerAddress, sellerAddress]) {
                pushNotification(addr, {
                  type:  "settlement_skipped",
                  title: "Partial fill against locked funds",
                  body:  "Found a match but escrow holds the full order amount and only a partial fill is available. Cancel to refund and re-place at the available size.",
                  pair:  symbol,
                });
              }
              req.log.warn(
                { incomingId: id, matchId: match.id, fillQty, remainingQty, matchAvail },
                "orders: escrow precheck — partial fill against locked funds, skipping match",
              );
              continue;  // try next match
            }
            // Different chains? → can't settle, skip match.
            if (
              prefetchedBuyerChain !== null &&
              prefetchedSellerChain !== null &&
              prefetchedBuyerChain !== prefetchedSellerChain
            ) {
              for (const addr of [buyerAddress, sellerAddress]) {
                pushNotification(addr, {
                  type:  "settlement_skipped",
                  title: "Cross-chain match",
                  body:  `Match found across different chains (${prefetchedSellerChain} vs ${prefetchedBuyerChain}) — cross-chain settlement is coming soon. Cancel to refund.`,
                  pair:  symbol,
                });
              }
              req.log.warn(
                { incomingId: id, matchId: match.id, sellerChain: prefetchedSellerChain, buyerChain: prefetchedBuyerChain },
                "orders: escrow precheck — cross-chain mismatch, skipping match",
              );
              continue;  // try next match
            }
          }
        }

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
            pair:          symbol,
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
              .set({ filledQuantity: newMatchFilled.toFixed(18), remainingQuantity: newMatchRemaining.toFixed(18), updatedAt: new Date() })
              .where(eq(ordersTable.id, match.id));
          }
        } else {
          await db.update(ordersTable)
            .set({
              status:            isMatchFullyFilled ? "filled" : "open",
              filledQuantity:    newMatchFilled.toFixed(18),
              remainingQuantity: newMatchRemaining.toFixed(18),
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

        // ── OrahDEXEscrow on-chain release (preferred non-custodial path) ─────
        // Both parties lock their funds into the OrahDEXEscrow contract before
        // matching (via the LockFundsDialog popup). When a match happens, the
        // relayer (= deployer wallet, EVM_WALLET_SECRET) calls release() for
        // each leg: seller's locked base → buyer's wallet, buyer's locked
        // quote → seller's wallet. This completes the atomic swap on-chain
        // without ever touching the internal ledger for the matched amount.
        //
        // ── Status flags (drive HTLC suppression below) ───────────────────────
        //   escrowSettled  → both legs released on-chain; HTLC must NOT run
        //   escrowGated    → escrow-locked funds exist but couldn't release
        //                    (partial fill, one-sided lock, cross-chain); HTLC
        //                    must NOT run because that would create a parallel
        //                    settlement against the same locked funds. Funds
        //                    stay safe in escrow; user cancels to refund.
        let escrowSettled = false;
        let escrowGated   = false;

        if (bothEvmExternal) {
          const releaseChainId = body.chainId && Number.isInteger(Number(body.chainId)) && isEscrowChain(Number(body.chainId))
            ? Number(body.chainId)
            : 1;  // default to Ethereum mainnet (where escrow is deployed)

          // ── Pre-flight: does ANY escrow deposit exist for either order? ─
          // Reuse the chain values already resolved by the fail-CLOSED precheck
          // above (lines ~473-478). Those values are authoritative: if the precheck
          // RPC failed it threw and we already `continue`d past this match. A
          // second scan here with a swallowed catch would be fail-OPEN — an RPC
          // blip would make `anyEscrowDeposit` look false and allow HTLC to run
          // against locked funds. Reusing prefetchedBuyerChain/SellerChain keeps
          // the settlement decision consistent with the precheck decision.
          const anyEscrowDeposit =
            prefetchedBuyerChain !== null || prefetchedSellerChain !== null;

          // ── Partial-fill safety: release(orderId) drains the WHOLE deposit. ─
          // We must only call it when this single fill consumes BOTH orders
          // fully. Otherwise the first partial fill would send the entire
          // locked amount to one counterparty — direct funds-loss bug.
          //
          // NOTE: `remainingQty` was already decremented at line ~513
          // (`remainingQty -= fillQty`). So the post-fill remainder for the
          // incoming order IS `remainingQty` itself — do NOT subtract fillQty
          // again or you double-count and let partial fills slip through.
          const epsilon = 0.000001;
          const isIncomingFullyFilled = remainingQty <= epsilon;
          const isFullMatchFill       = isMatchFullyFilled && isIncomingFullyFilled;

          if (anyEscrowDeposit && !isFullMatchFill) {
            // Locked funds + partial fill → we can't safely release a portion.
            // Block HTLC fallback and notify users to cancel for a refund.
            escrowGated = true;
            for (const addr of [buyerAddress, sellerAddress]) {
              pushNotification(addr, {
                type:  "settlement_skipped",
                title: "Partial fill against locked funds",
                body:  "Your match is a partial fill but escrow holds the full amount. Cancel the order to refund locked funds, then re-place at a size that matches available liquidity.",
                pair:  symbol,
              });
            }
            req.log.warn(
              { tradeId, incomingId: id, matchId: match.id, fillQty, remainingQty, matchAvail },
              "orders: escrow gated — partial fill against locked funds, HTLC fallback suppressed",
            );
          }

          if (isEscrowChain(releaseChainId) && isFullMatchFill && !escrowGated) {
            // Determine which order id belongs to which side. `id` is the
            // incoming order; `match.id` is the counter-order being consumed.
            const buyerOrderId  = side === "buy"  ? id : match.id;
            const sellerOrderId = side === "sell" ? id : match.id;

            try {
              const result = await settleEscrowMatch({
                buyerOrderId,
                sellerOrderId,
                buyerAddress,
                sellerAddress,
                // Reuse precheck values to keep the per-request settlement
                // decision deterministic and avoid contradictory re-scans.
                prefetchedBuyerChain,
                prefetchedSellerChain,
              });
              req.log.info(
                {
                  tradeId,
                  hintChainId: releaseChainId,
                  resolvedChainId: result.resolvedChainId,
                  bothLocked: result.bothLocked,
                  skipReason: result.skipReason,
                  baseLeg:  result.baseLeg,
                  quoteLeg: result.quoteLeg,
                },
                "orders: escrow release attempted for both legs",
              );

              // ── Surface safety-gate failures to BOTH users ────────────────
              // If we skipped release because one side didn't lock (or chains
              // mismatched), tell the user clearly. Their funds — if locked —
              // remain safe in escrow; they can cancel to recover. Also set
              // escrowGated so HTLC path is suppressed when at least one side
              // has actual locked funds (skipReason mentions "did not lock"
              // or "cross-chain"; "neither side" → fall through to HTLC).
              if (!result.bothLocked && result.skipReason) {
                const isNeitherSide = result.skipReason.includes("neither side");
                if (!isNeitherSide) {
                  // At least one side has locked funds → block HTLC fallback.
                  escrowGated = true;
                }
                const friendly = result.skipReason.includes("cross-chain")
                  ? "Match found on different chains — cross-chain settlement coming soon. Cancel to refund your locked funds."
                  : result.skipReason.includes("seller did not")
                    ? "Counterparty (seller) didn't complete on-chain lock. If you locked, your funds are safe — cancel to refund."
                    : result.skipReason.includes("buyer did not")
                      ? "Counterparty (buyer) didn't complete on-chain lock. If you locked, your funds are safe — cancel to refund."
                      : isNeitherSide
                        ? null  // suppress notification — legacy/bot trade, HTLC will handle it
                        : "Match could not settle on-chain. Funds locked in escrow remain safe — cancel to refund.";
                if (friendly) {
                  for (const addr of [buyerAddress, sellerAddress]) {
                    pushNotification(addr, {
                      type:  "settlement_skipped",
                      title: "On-chain settlement skipped",
                      body:  friendly,
                      pair:  symbol,
                    });
                  }
                }
              }
              // Notify both parties when on-chain release succeeded.
              if (result.baseLeg.ok && result.baseLeg.txHash) {
                pushNotification(buyerAddress, {
                  type:  "settlement_onchain",
                  title: "On-chain settlement",
                  body:  `Received ${fillQty.toFixed(6)} ${symbol.split("/")[0]} on-chain.`,
                  pair:  symbol,
                  txid:  result.baseLeg.txHash,
                  side:  "buy",
                });
              }
              if (result.quoteLeg.ok && result.quoteLeg.txHash) {
                pushNotification(sellerAddress, {
                  type:  "settlement_onchain",
                  title: "On-chain settlement",
                  body:  `Received ${(fillQty * fillPrice).toFixed(2)} ${symbol.split("/")[1] ?? "USDT"} on-chain.`,
                  pair:  symbol,
                  txid:  result.quoteLeg.txHash,
                  side:  "sell",
                });
              }
              // If BOTH legs released, we have a complete on-chain settlement
              // and the HTLC fallback must be suppressed.
              if (result.baseLeg.ok && result.quoteLeg.ok) {
                escrowSettled = true;
              }
              // ── Single-leg release: still suppress HTLC ─────────────────
              // If only one leg broadcast (other failed mid-flight on RPC,
              // nonce, revert, etc.) we are in a half-settled state. Running
              // HTLC now would create a parallel claim against funds that
              // are already partly released. Block HTLC and surface to user
              // — the relayer's idempotent retry will pick up the failed leg
              // on the next match attempt (release() is one-shot per orderId).
              if ((result.baseLeg.ok || result.quoteLeg.ok) && !escrowSettled) {
                escrowGated = true;
                req.log.error(
                  {
                    tradeId,
                    baseLegOk:  result.baseLeg.ok,
                    quoteLegOk: result.quoteLeg.ok,
                    baseReason:  result.baseLeg.reason,
                    quoteReason: result.quoteLeg.reason,
                  },
                  "orders: ESCROW HALF-SETTLED — only one leg released, HTLC suppressed, manual reconciliation required",
                );
                for (const addr of [buyerAddress, sellerAddress]) {
                  pushNotification(addr, {
                    type:  "settlement_skipped",
                    title: "Settlement needs review",
                    body:  "One side of the trade settled on-chain but the other failed. Support has been notified — your funds are not at risk. Please contact support if not resolved within 1 hour.",
                    pair:  symbol,
                  });
                }
              }
              if (result.baseLeg.ok || result.quoteLeg.ok) {
                // Use the first available release tx hash as the canonical
                // settlement reference for this fill.
                const onchainTxid =
                  (result.baseLeg.ok ? result.baseLeg.txHash : null) ??
                  (result.quoteLeg.ok ? result.quoteLeg.txHash : null);
                if (onchainTxid) {
                  // Override the placeholder htlc-pending- txid with the real one.
                  await db.update(ordersTable)
                    .set({ txid: onchainTxid })
                    .where(eq(ordersTable.id, id));
                  await db.update(ordersTable)
                    .set({ txid: onchainTxid })
                    .where(eq(ordersTable.id, match.id));
                  settlementTxid = onchainTxid;
                  lastTxid       = onchainTxid;
                }
              }
            } catch (relErr: any) {
              // FAIL-CLOSED: if escrow release threw and a deposit exists,
              // we MUST suppress HTLC. Otherwise HTLC could lock more funds
              // and create a parallel claim against the escrow deposit.
              if (escrowAnyDeposit) {
                escrowGated = true;
                for (const addr of [buyerAddress, sellerAddress]) {
                  pushNotification(addr, {
                    type:  "settlement_skipped",
                    title: "Settlement error",
                    body:  "Couldn't reach the chain to settle — please try again in a moment, or cancel to refund locked funds.",
                    pair:  symbol,
                  });
                }
              }
              req.log.error(
                {
                  err: relErr?.message,
                  tradeId,
                  chainId: releaseChainId,
                  escrowGated,
                  escrowAnyDeposit,
                },
                "orders: escrow release threw — HTLC suppressed when deposit exists",
              );
            }
          }
        }

        // ── EVM HTLC atomic settlement (non-custodial wallet-to-wallet) ───────
        // Required for all EVM/EVM external fills.  Both parties lock their funds
        // into the OrahDEXHTLC contract on-chain; the OrahDEX relayer calls
        // reveal() once both locks are confirmed, completing the atomic swap.
        // Internal ledger settlement is skipped for this path (funds stay on-chain).
        // Suppress HTLC when escrow already settled OR escrow holds funds
        // we can't safely release (partial fill, one-sided lock, cross-chain).
        // Running HTLC in those cases would create a parallel claim against
        // the same locked funds — the very bug the safety gate prevents.
        if (bothEvmExternal && !lastEvmHtlcSession && !escrowSettled && !escrowGated) {
          // Determine chain — use incoming order's chainId if provided, else default to 1 (Ethereum).
          // Validate chainId: must be a positive integer present in EVM_CHAINS.
          const rawChainId = body.chainId ? Number(body.chainId) : 1;
          const chainId = Number.isInteger(rawChainId) && rawChainId > 0 && rawChainId in EVM_CHAINS
            ? rawChainId : 1;
          const chainConfig = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

          // Resolve token addresses from pair
          const [base, quot] = symbol.split("/");
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
              pair:          symbol,
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

      // ── Release the slippage buffer after a fully-filled market buy ──────────
      // settleTrade only debits the actual fill cost; the 0.5% over-lock stays
      // in the locked column until we explicitly release it here.
      if (
        side === "buy" && type === "market" &&
        remainingQty <= 0.000001 && totalFilled > 0 && parseFloat(lockAmount) > 0
      ) {
        const actualCost = totalFillValue;
        const excess = parseFloat(lockAmount) - actualCost;
        if (excess > 1e-9 && lockAsset) {
          try {
            await unlockFunds({ walletAddress: body.walletAddress, asset: lockAsset!, amount: excess.toFixed(18) });
          } catch (excessErr: any) {
            req.log.warn({ excessErr: excessErr?.message }, "orders: failed to release market-buy slippage buffer excess");
          }
        }
      }

      if (totalFilled > 0) {
        // ── Mark the user's order with actual fill amount ─────────────────
        const avgFillPrice    = totalFillValue / totalFilled;
        const isFullyFilled   = remainingQty <= 0.000001;
        const correctFee      = (totalFillValue * 0.001).toFixed(18);
        // Record exchange revenue from the order book fill fee (0.1%)
        const feeAssetSymbol = symbol.split("/")[1] ?? "USDT";
        recordPlatformFee({ source: "orderbook", amount: correctFee, asset: feeAssetSymbol, txRef: id });

        await db.update(ordersTable)
          .set({
            status:            isFullyFilled ? "filled" : "open",
            filledQuantity:    totalFilled.toFixed(18),
            remainingQuantity: Math.max(0, remainingQty).toFixed(18),
            price:             (isMarket || isStopTriggered) ? avgFillPrice.toFixed(18) : undefined,
            total:             totalFillValue.toFixed(18),
            fee:               correctFee,
            txid:              lastTxid,
            matchedOrderId:    lastMatchId,
            updatedAt:         new Date(),
          })
          .where(eq(ordersTable.id, id));

        /* Push order-filled notification */
        const fillSymbol = symbol;
        const fillBase   = fillSymbol.split("/")[0];
        pushNotification(body.walletAddress, {
          type:  isFullyFilled ? "order_filled" : "order_partial",
          title: isFullyFilled ? "Order Filled ✓" : `Partial Fill — ${totalFilled.toFixed(4)} ${fillBase}`,
          body:  `${totalFilled.toFixed(4)} ${fillBase} @ $${avgFillPrice.toFixed(4)} avg · BSV settled on-chain`,
          pair:  fillSymbol,
          txid:  lastTxid ?? undefined,
          side,
        });
      }
    }

    // ── Market orders are Immediate-Or-Cancel: if nothing filled, delete and reject ──
    // A market order that finds no eligible counter-party should never stay open.
    // Leaving it open creates zombie orders that confuse the user (they have to
    // manually cancel something that will never fill).
    if ((isMarket || isStopTriggered) && totalFilled === 0) {
      // Remove the order — it never matched; no funds were moved.
      await db.delete(ordersTable).where(eq(ordersTable.id, id));
      res.status(422).json({
        error: "No matching sellers found for this market order. Place a limit order to set your price, or try again when liquidity is available.",
        code:  "NO_LIQUIDITY",
      });
      return;
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
    const symbol: string = (req.body.symbol ?? "").replace(/-/g, "/");

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

  // Strict allow-list validation for BSV P2SH addresses:
  // - mainnet starts with "3", testnet starts with "2"
  // - Base58 charset only (no 0, O, I, l)
  // - Typical P2SH length range
  const p2shAddressPattern = /^[23][1-9A-HJ-NP-Za-km-z]{24,50}$/;
  if (!p2shAddressPattern.test(htlcAddress)) {
    res.status(400).json({ error: "Invalid htlcAddress format" });
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
