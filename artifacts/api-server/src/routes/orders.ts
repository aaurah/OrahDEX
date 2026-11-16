import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and, lte, gte, ne, isNotNull, desc, asc, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { formatUnits, keccak256, recoverMessageAddress, toBytes } from "viem";
import { BOT_ADDRESS } from "../lib/liquidityBot.js";
import { getBsvChainStatus, queryHtlcStatus } from "../lib/bsvChainMonitor.js";
import { pushNotification } from "../lib/notifQueue.js";
import { recordTradeMetric, getMetricsSummary } from "../lib/tradeMetrics.js";
import { getCachedQuote } from "../lib/routeCache.js";
import { unlockFunds, getBalances } from "../lib/ledger.js";
import { verifyAndLockFunding }  from "../lib/fundingVerifier.js";
import { settleSpotFill }        from "../lib/spotSettlement.js";
import { initiateEvmHtlcSession, EVM_CHAINS } from "../lib/evmHtlc.js";
import {
  getConfirmedEvmOrderSettlement,
  getEvmOrderbookEscrowConfig,
  getEvmSettlementTxStatus,
  findActiveEvmOrderbookOrders,
  findConfirmedEvmOrderbookCancellation,
  orderKeyFromNonce,
  settleEvmOrderFill,
  verifyEvmOrderbookCancelTx,
  verifyEvmOrderLock,
} from "../lib/evmOrderbookEscrow.js";
import { TOKEN_REGISTRY } from "../lib/tokenRegistry.js";
import { settleEscrowMatch, isEscrowChain, findEscrowChain, ESCROW_ADDRESSES } from "../lib/escrowRelayer.js";
import type { WalletSource }     from "../lib/orderIntent.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import {
  buildOrderAuthMessage, buildOrderActionAuthMessage, verifyEvmSignature, isOrderNonceConsumed, recordConsumedOrderNonce,
  verifyBsvWithdrawSignature, verifySolWithdrawSignature,
  issueBsvOrderChallenge, verifyBsvOrderSignature,
  issueSolOrderChallenge, verifySolOrderSignature,
} from "../lib/walletAuth.js";

const router: IRouter = Router();

// ── Order-read challenge store ────────────────────────────────────────────────
// Wallets that want to prove ownership before reading their orders request a
// nonce via GET /orders/challenge, sign it with their private key, and pass
// `sig` + `nonce` as query params to GET /orders.
//
// Enforcement is opt-in via the REQUIRE_ORDER_READ_SIG env var so the change
// can be rolled out without breaking existing integrations immediately.
const _readChallenges = new Map<string, { nonce: string; expiresAt: number }>();
const READ_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.get("/orders/evm-settlement/config", async (_req, res) => {
  try {
    res.json(await getEvmOrderbookEscrowConfig());
  } catch {
    res.status(503).json({ chainId: 1, available: false });
  }
});

// ── Wallet-format helpers ─────────────────────────────────────────────────────

/** Detect EVM addresses (0x + 40 hex chars). */
function detectIsEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function decodeBase58(address: string): Uint8Array | null {
  if (typeof address !== "string" || address.length < 1 || address.length > 44) return null;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const char of address) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const char of address) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** Detect Base58Check BSV P2PKH/P2SH addresses, not arbitrary base58 strings. */
function detectIsBsvAddress(addr: string): boolean {
  const decoded = decodeBase58(addr);
  if (!decoded || decoded.length !== 25 || (decoded[0] !== 0 && decoded[0] !== 5)) return false;
  const payload = Buffer.from(decoded.subarray(0, 21));
  const checksum = Buffer.from(decoded.subarray(21));
  const expected = crypto.createHash("sha256")
    .update(crypto.createHash("sha256").update(payload).digest())
    .digest().subarray(0, 4);
  return crypto.timingSafeEqual(checksum, expected);
}

/** Detect Solana public keys (base58, 32–44 chars, no O/0/I/l). */
function detectIsSolAddress(addr: string): boolean {
  return addr.length >= 32 && addr.length <= 44 && decodeBase58(addr)?.length === 32;
}

function evmOrderKeyFromFundingRef(fundingRef: string | null | undefined): `0x${string}` | null {
  const parts = String(fundingRef ?? "").split(":");
  return parts[0] === "evm-order" && parts[1] === "1" &&
    /^0x[0-9a-fA-F]{64}$/.test(parts[3] ?? "")
    ? parts[3] as `0x${string}`
    : null;
}

async function releaseLedgerOrderFunds(
  fundingRef: string,
  walletAddress: string,
  asset: string,
  amount: number,
): Promise<void> {
  if (!fundingRef.startsWith("ledger:") || !asset || !Number.isFinite(amount) || amount <= 0) return;
  await unlockFunds({ walletAddress, asset, amount: amount.toFixed(18) });
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
  if (txid.startsWith("htlc-pending-") || txid.startsWith("evm-settlement:")) {
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

async function reconcilePendingEvmOrderbookOrders(rows: Array<typeof ordersTable.$inferSelect>, log: any): Promise<boolean> {
  let changed = false;
  const handled = new Set<string>();
  for (const row of rows) {
    const marker = String(row.txid ?? "");
    if (row.status !== "processing" || !String(row.fundingRef ?? "").startsWith("evm-order:1:")) continue;
    if (/^0x[0-9a-fA-F]{64}$/.test(marker)) {
      const ageMs = Date.now() - new Date(row.updatedAt).getTime();
      if (ageMs < 600_000) continue;
      const remaining = Number(row.remainingQuantity ?? row.quantity);
      await db.update(ordersTable)
        .set({ status: remaining <= 1e-9 ? "filled" : "open", updatedAt: new Date() })
        .where(and(
          eq(ordersTable.id, row.id),
          eq(ordersTable.status, "processing"),
          eq(ordersTable.txid, marker),
        ));
      changed = true;
      continue;
    }
    if (!marker.startsWith("evm-settlement:")) continue;
    const [, settlementId, txHash] = marker.split(":");
    if (!/^0x[0-9a-fA-F]{64}$/.test(settlementId ?? "") || handled.has(settlementId)) continue;
    handled.add(settlementId);

    const partnerId = row.matchedOrderId;
    if (!partnerId) continue;
    const [partner] = await db.select().from(ordersTable).where(eq(ordersTable.id, partnerId)).limit(1);
    if (!partner) continue;
    const rowKey = evmOrderKeyFromFundingRef(row.fundingRef);
    const partnerKey = evmOrderKeyFromFundingRef(partner.fundingRef);
    if (!rowKey || !partnerKey) continue;

    if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      const txStatus = await getEvmSettlementTxStatus(txHash as `0x${string}`);
      if (txStatus === "reverted") {
        await db.transaction(async (tx) => {
          for (const order of [row, partner]) {
            if (order.status !== "processing" || !String(order.txid ?? "").startsWith(`evm-settlement:${settlementId}:`)) continue;
            await tx.update(ordersTable)
              .set({ status: "open", txid: null, matchedOrderId: null, updatedAt: new Date() })
              .where(and(
                eq(ordersTable.id, order.id),
                eq(ordersTable.status, "processing"),
                eq(ordersTable.txid, order.txid!),
              ));
          }
        });
        changed = true;
        continue;
      }
      if (txStatus === "pending") continue;
    }

    const settlement = await getConfirmedEvmOrderSettlement(settlementId as `0x${string}`);
    if (!settlement) continue;
    const isCorrectPair =
      (rowKey.toLowerCase() === settlement.buyOrderKey.toLowerCase() &&
        partnerKey.toLowerCase() === settlement.sellOrderKey.toLowerCase()) ||
      (rowKey.toLowerCase() === settlement.sellOrderKey.toLowerCase() &&
        partnerKey.toLowerCase() === settlement.buyOrderKey.toLowerCase());
    if (!isCorrectPair) {
      log.error({ settlementId, rowId: row.id, partnerId }, "orderbook recovery event does not match saved order pair");
      continue;
    }

    const quantity = Number(settlement.baseAmount);
    const gross = Number(settlement.grossQuoteAmount);
    const fee = Number(settlement.feeAmount);
    if (!(quantity > 0) || !(gross > 0)) continue;
    await db.transaction(async (tx) => {
      for (const order of [row, partner]) {
        if (
          order.status !== "processing" ||
          !String(order.txid ?? "").startsWith(`evm-settlement:${settlementId}`)
        ) continue;
        const previousFilled = Number(order.filledQuantity ?? "0");
        const previousRemaining = Number(order.remainingQuantity ?? order.quantity);
        if (quantity > previousRemaining + 1e-9) {
          log.error({ settlementId, orderId: order.id, quantity, previousRemaining }, "orderbook recovery fill exceeds saved remainder");
          continue;
        }
        const filledQuantity = previousFilled + quantity;
        const remainingQuantity = Math.max(0, previousRemaining - quantity);
        const priorTotal = previousFilled > 0 ? Number(order.total ?? "0") : 0;
        const priorFee = previousFilled > 0 && order.side === "sell" ? Number(order.fee ?? "0") : 0;
        await tx.update(ordersTable)
          .set({
            status: "processing",
            filledQuantity: filledQuantity.toFixed(18),
            remainingQuantity: remainingQuantity.toFixed(18),
            total: (priorTotal + gross).toFixed(18),
            fee: (priorFee + (order.side === "sell" ? fee : 0)).toFixed(18),
            txid: settlement.txHash,
            updatedAt: new Date(),
          })
          .where(and(
            eq(ordersTable.id, order.id),
            eq(ordersTable.status, "processing"),
            eq(ordersTable.txid, order.txid!),
          ));
      }
    });
    changed = true;
  }
  return changed;
}

async function reconcileConfirmedEvmOrderbookCancellations(
  rows: Array<typeof ordersTable.$inferSelect>,
  log: any,
): Promise<boolean> {
  let changed = false;
  for (const row of rows) {
    const needsStatusUpdate = row.status === "open" || row.status === "processing";
    const needsProofBackfill = row.status === "cancelled" && !row.txid;
    if ((!needsStatusUpdate && !needsProofBackfill) ||
        !String(row.fundingRef ?? "").startsWith("evm-order:1:")) continue;

    const [, , escrowAddress, orderKey, lockTxHash] = String(row.fundingRef).split(":");
    if (!escrowAddress || !/^0x[0-9a-fA-F]{64}$/.test(orderKey ?? "") ||
        !/^0x[0-9a-fA-F]{64}$/.test(lockTxHash ?? "")) continue;

    try {
      const cancellation = await findConfirmedEvmOrderbookCancellation({
        escrowAddress,
        orderKey: orderKey as `0x${string}`,
        walletAddress: row.walletAddress,
        lockTxHash,
      });
      if (!cancellation || cancellation.refundAmount <= 0n) continue;

      await db.update(ordersTable)
        .set({ status: "cancelled", txid: cancellation.txHash, updatedAt: new Date() })
        .where(and(
          eq(ordersTable.id, row.id),
          inArray(ordersTable.status, ["open", "processing", "cancelled"]),
        ));
      log.info({ orderId: row.id, txHash: cancellation.txHash }, "reconciled confirmed Ethereum order cancellation");
      changed = true;
    } catch (error: any) {
      log.warn({ orderId: row.id, err: error?.message }, "Ethereum order cancellation reconciliation failed");
    }
  }
  return changed;
}

// ── GET /orders/challenge — issue a read-ownership nonce ─────────────────────
// Clients request a nonce, sign it with their private key (EVM: personal_sign),
// then pass `sig` + `nonce` to GET /orders to prove they own the address.
// Enforcement is controlled by REQUIRE_ORDER_READ_SIG env var.
router.get("/orders/challenge", (req, res) => {
  const walletAddress = req.query.walletAddress as string;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  const nonce     = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + READ_CHALLENGE_TTL_MS;
  _readChallenges.set(walletAddress.toLowerCase(), { nonce, expiresAt });
  res.json({
    message:    `OrahDEX order read authorization for ${walletAddress}\nnonce: ${nonce}`,
    nonce,
    expiresAt,
    instructions: "Sign this message with your wallet (EVM: personal_sign / eth_signMessage) and pass sig + nonce as query params to GET /orders.",
  });
});

// ── GET /orders ───────────────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    // ── Ownership proof (T005) ──────────────────────────────────────────────
    // If `sig` + `nonce` are supplied, verify the caller owns this wallet.
    // If REQUIRE_ORDER_READ_SIG=true, signature is mandatory for EVM wallets.
    const sig      = req.query.sig  as string | undefined;
    const sigNonce = req.query.nonce as string | undefined;
    const isEvmWallet = /^0x[0-9a-fA-F]{40}$/.test(walletAddress);

    if (sig && sigNonce) {
      const challenge = _readChallenges.get(walletAddress.toLowerCase());
      if (!challenge || challenge.nonce !== sigNonce || Date.now() > challenge.expiresAt) {
        res.status(401).json({
          error: "Invalid or expired ownership challenge. Request a fresh one via GET /orders/challenge.",
        });
        return;
      }
      if (isEvmWallet) {
        try {
          const message   = `OrahDEX order read authorization for ${walletAddress}\nnonce: ${sigNonce}`;
          const recovered = await recoverMessageAddress({ message, signature: sig as `0x${string}` });
          if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
            res.status(401).json({ error: "Signature does not match wallet address." });
            return;
          }
        } catch {
          res.status(401).json({ error: "Invalid signature format." });
          return;
        }
      }
      // Challenge consumed — one-time use
      _readChallenges.delete(walletAddress.toLowerCase());
    } else if (process.env.REQUIRE_ORDER_READ_SIG === "true" && isEvmWallet) {
      // Strict mode: enforce signature for EVM wallets
      res.status(401).json({
        error:        "Ownership proof required to read orders.",
        instructions: "Call GET /orders/challenge?walletAddress=<addr> to get a nonce, sign it, then pass sig and nonce here.",
      });
      return;
    }

    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 200);
    // Normalize symbol: accept both "BSV-USDT" (URL/dash) and "BSV/USDT" (DB/slash)
    const rawSym = req.query.symbol as string | undefined;
    const symbol = rawSym ? rawSym.replace(/-/g, "/") : undefined;
    const rawStatus = req.query.status as string | undefined;
    const VALID_STATUSES = new Set(["open", "filled", "cancelled", "partial", "expired", "pending"]);
    if (rawStatus && !VALID_STATUSES.has(rawStatus)) {
      res.status(400).json({ error: `Invalid status '${rawStatus}'. Allowed values: ${[...VALID_STATUSES].join(", ")}` });
      return;
    }
    const status = rawStatus;

    // Push all filters to the DB — never fetch all rows and slice in memory
    const conditions = [eq(ordersTable.walletAddress, walletAddress)];
    if (symbol) conditions.push(eq(ordersTable.symbol, symbol));
    if (status) conditions.push(eq(ordersTable.status, status));

    let orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit);

    let ordersChanged = false;
    try {
      ordersChanged = await reconcilePendingEvmOrderbookOrders(orders, req.log);
    } catch (reconcileErr: any) {
      req.log.warn({ err: reconcileErr?.message }, "orders: orderbook settlement recovery check failed");
    }
    try {
      ordersChanged = (await reconcileConfirmedEvmOrderbookCancellations(orders, req.log)) || ordersChanged;
    } catch (reconcileErr: any) {
      req.log.warn({ err: reconcileErr?.message }, "orders: cancellation reconciliation check failed");
    }
    if (ordersChanged) {
      orders = await db.select().from(ordersTable)
        .where(and(...conditions))
        .orderBy(desc(ordersTable.createdAt))
        .limit(limit);
    }

    res.json(orders.map(serializeOrder));
  } catch (err) {
    req.log.error({ err }, "Failed to get orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /orders/recover-evm ─────────────────────────────────────────────────
// Recreates rows for confirmed active Ethereum escrow orders that were not
// saved after the wallet transaction. This only syncs verified chain state;
// it never sends or signs a transaction.
router.post("/orders/recover-evm", async (req, res) => {
  try {
    const walletAddress = String(req.body?.walletAddress ?? "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      res.status(400).json({ error: "A valid Ethereum wallet address is required." });
      return;
    }

    const rows = await db.select().from(ordersTable)
      .where(sql`lower(${ordersTable.walletAddress}) = ${walletAddress.toLowerCase()}`);
    const knownLockTxHashes = rows
      .map((row) => String(row.fundingRef ?? "").split(":")[4] ?? "")
      .filter((txHash) => /^0x[0-9a-fA-F]{64}$/.test(txHash));
    const onchainOrders = await findActiveEvmOrderbookOrders(walletAddress, knownLockTxHashes);
    const knownKeys = new Set(rows.map((row) => String(row.fundingRef ?? "").split(":")[3]?.toLowerCase()));
    const tokenSymbol = (address: string) => {
      if (address.toLowerCase() === "0x0000000000000000000000000000000000000000") return "ETH";
      return Object.entries(TOKEN_REGISTRY[1] ?? {})
        .find(([, info]) => info.address.toLowerCase() === address.toLowerCase())?.[0] ?? null;
    };
    const tokenDecimals = (address: string) => {
      if (address.toLowerCase() === "0x0000000000000000000000000000000000000000") return 18;
      return Object.values(TOKEN_REGISTRY[1] ?? {})
        .find((info) => info.address.toLowerCase() === address.toLowerCase())?.decimals ?? null;
    };

    const recovered: Array<ReturnType<typeof serializeOrder>> = [];
    for (const order of onchainOrders) {
      if (knownKeys.has(order.orderKey.toLowerCase())) continue;
      const baseSymbol = tokenSymbol(order.baseToken);
      const quoteSymbol = tokenSymbol(order.quoteToken);
      const decimals = tokenDecimals(order.baseToken);
      if (!baseSymbol || !quoteSymbol || decimals == null) {
        req.log.warn({ orderKey: order.orderKey }, "Skipping recovered escrow order with unsupported token");
        continue;
      }
      const symbol = `${baseSymbol}/${quoteSymbol}`;
      const quantityRaw = BigInt(order.originalBaseAmountRaw);
      const remainingRaw = BigInt(order.remainingBaseAmountRaw);
      const recoveredOrder = {
        id: crypto.randomUUID(),
        symbol,
        walletAddress,
        networkType: "evm",
        side: order.side,
        type: "limit",
        status: "open",
        price: formatUnits(BigInt(order.limitPriceX18), 18),
        quantity: formatUnits(quantityRaw, decimals),
        filledQuantity: formatUnits(quantityRaw - remainingRaw, decimals),
        remainingQuantity: formatUnits(remainingRaw, decimals),
        fee: "0",
        feeAsset: quoteSymbol,
        timeInForce: "GTC",
        txid: null,
        signedTx: null,
        matchedOrderId: null,
        fundingRef: `evm-order:1:${order.escrowAddress}:${order.orderKey}:${order.lockTxHash}`,
        nonce: `recovered:${order.orderKey.toLowerCase()}`,
        expiry: String(order.expiresAt),
        chainId: 1,
      };
      await db.insert(ordersTable).values(recoveredOrder).onConflictDoNothing();
      const [saved] = await db.select().from(ordersTable).where(and(
        sql`lower(${ordersTable.walletAddress}) = ${walletAddress.toLowerCase()}`,
        eq(ordersTable.nonce, recoveredOrder.nonce),
      )).limit(1);
      if (saved) {
        knownKeys.add(order.orderKey.toLowerCase());
        recovered.push(serializeOrder(saved));
      }
    }

    res.json({ recovered, count: recovered.length });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "Failed to recover active Ethereum order rows");
    res.status(500).json({ error: "Could not scan and recover active Ethereum orders." });
  }
});

// ── POST /orders/bsv-challenge — Issue a BSV order challenge ─────────────────
// BSV wallets must request an order-bound challenge (not a withdrawal challenge)
// and sign it before placing an order.  This prevents a withdrawal challenge
// from being replayed as an order signature.
router.post("/orders/bsv-challenge", (req, res) => {
  const { walletAddress, symbol, side, quantity, type, price, stopPrice, chainId, timeInForce, nonce, expiry } = req.body;
  if (!walletAddress || !symbol || !side || !quantity || !type || !timeInForce || !nonce || !expiry) {
    res.status(400).json({ error: "wallet and complete order intent fields are required" });
    return;
  }
  if (!detectIsBsvAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a BSV P2PKH/P2SH address" });
    return;
  }
  const challenge = issueBsvOrderChallenge({
    walletAddress, symbol, side, quantity, type,
    price: price == null ? "" : String(price),
    stopPrice: stopPrice == null ? "" : String(stopPrice),
    chainId: chainId == null ? "" : String(chainId),
    timeInForce, nonce, expiry,
  });
  res.json(challenge);
});

// ── POST /orders/sol-challenge — Issue a Solana order challenge ───────────────
router.post("/orders/sol-challenge", (req, res) => {
  const { walletAddress, symbol, side, quantity, type, price, stopPrice, chainId, timeInForce, nonce, expiry } = req.body;
  if (!walletAddress || !symbol || !side || !quantity || !type || !timeInForce || !nonce || !expiry) {
    res.status(400).json({ error: "wallet and complete order intent fields are required" });
    return;
  }
  if (!detectIsSolAddress(walletAddress)) {
    res.status(400).json({ error: "walletAddress must be a Solana base58 address" });
    return;
  }
  const challenge = issueSolOrderChallenge({
    walletAddress, symbol, side, quantity, type,
    price: price == null ? "" : String(price),
    stopPrice: stopPrice == null ? "" : String(stopPrice),
    chainId: chainId == null ? "" : String(chainId),
    timeInForce, nonce, expiry,
  });
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
    if (type === "stop") {
      res.status(503).json({ error: "Stop orders are temporarily unavailable while settlement safeguards are completed." });
      return;
    }
    if (type === "limit" && (rawPrice == null || !Number.isFinite(rawPrice) || rawPrice <= 0)) {
      res.status(400).json({ error: "Limit orders require a valid price" });
      return;
    }
    const timeInForce = String(body.timeInForce ?? (type === "market" ? "IOC" : "GTC")).toUpperCase();
    if (timeInForce !== "GTC" && timeInForce !== "IOC") {
      res.status(400).json({ error: "Only GTC and IOC time-in-force values are supported" });
      return;
    }
    if (type === "market" && timeInForce !== "IOC") {
      res.status(400).json({ error: "Market orders must use IOC to prevent unintended resting orders" });
      return;
    }
    if (type === "limit" && timeInForce !== "GTC") {
      res.status(400).json({ error: "Limit orders currently support GTC only" });
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

    // Classify wallet source based on address format — explicit format detection
    // prevents clients from lying about their wallet type to bypass auth checks.
    const isEvmAddress = detectIsEvmAddress(body.walletAddress);
    const isBsvAddress = detectIsBsvAddress(body.walletAddress);
    const isSolAddress = detectIsSolAddress(body.walletAddress);
    if (!isEvmAddress && !isBsvAddress && !isSolAddress) {
      res.status(400).json({ error: "Unsupported wallet address format for signed spot orders" });
      return;
    }

    // Derive the network from the decoded address format; never trust a client label.
    const networkType = isEvmAddress ? "evm" : isBsvAddress ? "bsv" : "sol";

    // Any recognized chain wallet format must be treated as external so clients
    // cannot spoof walletSource to bypass signature verification.
    const walletSource: "external" | "orah" =
      (isEvmAddress || isBsvAddress || isSolAddress) ? "external"
      : body.walletSource === "external" ? "external"
      : "orah";

    const isExternalWallet = walletSource === "external";
    const signedChainId = body.chainId == null ? "" : String(parseInt(String(body.chainId), 10));

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
      if (!Number.isSafeInteger(expiryUnixSec) || expiryUnixSec <= Math.floor(Date.now() / 1000) ||
          expiryUnixSec > Math.floor(Date.now() / 1000) + 300) {
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
          type,
          price:         rawPrice == null ? "" : rawPrice.toString(),
          stopPrice:     stopPrice == null ? "" : stopPrice.toString(),
          chainId:       signedChainId,
          timeInForce,
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
            type,
            price: rawPrice == null ? "" : rawPrice.toString(),
            stopPrice: stopPrice == null ? "" : stopPrice.toString(),
            chainId: signedChainId,
            timeInForce,
            expiry: orderExpiry,
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
            type,
            price: rawPrice == null ? "" : rawPrice.toString(),
            stopPrice: stopPrice == null ? "" : stopPrice.toString(),
            chainId: signedChainId,
            timeInForce,
            expiry: orderExpiry,
          });
        } catch (authErr: any) {
          res.status(401).json({ error: authErr.message, code: "SIGNATURE_MISMATCH" });
          return;
        }
      }

      // Consume the nonce after successful verification (single-use enforcement).
      recordConsumedOrderNonce(body.walletAddress, orderNonce, expiryUnixSec);
    }

    // ── Validate and extract optional chainId ────────────────────────────────────
    // When provided, enables on-chain RPC balance verification in fundingVerifier
    // and allows the matching engine to reject cross-chain EVM mismatches.
    // Unknown chainId values are rejected (not silently dropped) to prevent
    // orders from unrecognised chains slipping through without cross-chain protection.
    // Derive supported chain IDs from all registered EVM chains and escrow deployments.
    // Adding a chain to EVM_CHAINS or ESCROW_ADDRESSES automatically allows it here.
    const SUPPORTED_CHAIN_IDS = new Set([
      ...Object.keys(EVM_CHAINS).map(Number),
      ...Object.keys(ESCROW_ADDRESSES).map(Number),
    ]);
    let chainId: number | undefined;
    if (body.chainId != null) {
      const n = Number(body.chainId);
      if (!Number.isSafeInteger(n) || !SUPPORTED_CHAIN_IDS.has(n)) {
        res.status(400).json({ error: `Unsupported chainId: ${n}. Supported: ${[...SUPPORTED_CHAIN_IDS].sort((a, b) => a - b).join(", ")}` });
        return;
      }
      chainId = n;
    }

    // Warn when an EVM external order arrives without chainId — the matching engine
    // can still handle it (legacy-compatible) but cannot reject cross-chain mismatches.
    if (walletSource === "external" && networkType === "evm" && chainId == null) {
      req.log.warn(
        { walletAddress: body.walletAddress, symbol },
        "orders: EVM external order missing chainId — cross-chain match protection unavailable. Client should send chainId.",
      );
    }

    // ── Acquire funding lock BEFORE inserting the order (No funding → No order) ──
    // fundingVerifier enforces balance-bucket isolation:
    //   MARKET / LIMIT  → spot bucket (user_balances)
    //   FUTURES         → futures margin bucket (futures_margin_accounts)
    // Returns a fundingRef that proves funds are committed.
    const [baseAsset, quoteAsset = "USDT"] = symbol.split("/");
    const lockAsset = side === "buy" ? quoteAsset : baseAsset;

    let lockPrice = price;
    if (!lockPrice) {
      const [mktRow] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, symbol));
      lockPrice = mktRow ? parseFloat(mktRow.lastPrice) : 0;
    }
    if (side === "buy" && (lockPrice == null || !Number.isFinite(lockPrice) || lockPrice <= 0)) {
      res.status(400).json({ error: "Unable to determine buy price for funding lock" });
      return;
    }
    if (type === "market" && (!lockPrice || !Number.isFinite(lockPrice) || lockPrice <= 0)) {
      res.status(422).json({ error: "A valid reference price is required for protected market execution" });
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
    let onchainOrderKey: `0x${string}` | null = null;
    if (body.orderbookLockTxHash != null) {
      if (!isEvmAddress || chainId !== 1 || type !== "limit") {
        res.status(400).json({
          error: "Wallet-funded orderbook settlement currently supports Ethereum mainnet limit orders only.",
          code: "ORDERBOOK_NETWORK_UNSUPPORTED",
        });
        return;
      }
      const config = await getEvmOrderbookEscrowConfig();
      if (!config.available) {
        res.status(503).json({
          error: "Ethereum order escrow is not deployed and verified yet.",
          code: "ORDERBOOK_SETTLEMENT_UNAVAILABLE",
        });
        return;
      }
      if (Math.abs(feeRate - config.feeBps / 10_000) > 1e-9) {
        res.status(503).json({
          error: "Ethereum escrow fee does not match this market's configured trading fee.",
          code: "ORDERBOOK_FEE_MISMATCH",
        });
        return;
      }
      try {
        const verifiedLock = await verifyEvmOrderLock({
          chainId,
          walletAddress: body.walletAddress,
          nonce: String(body.nonce ?? ""),
          txHash: String(body.orderbookLockTxHash),
          side,
          base: baseAsset,
          quote: quoteAsset,
          quantity: body.quantity,
          price: body.price,
          expiresAt: Number(body.orderbookExpiresAt),
        });
        fundingRef = verifiedLock.fundingRef;
        onchainOrderKey = verifiedLock.orderKey;
      } catch (lockErr: any) {
        const message = String(lockErr?.message ?? "Could not verify Ethereum order escrow");
        const awaitingConfirmations = message.includes("awaiting Ethereum confirmations");
        res.status(awaitingConfirmations ? 425 : 400).json({
          error: message,
          code: awaitingConfirmations ? "ORDERBOOK_LOCK_PENDING" : "ORDERBOOK_LOCK_INVALID",
        });
        return;
      }
    } else if (parseFloat(lockAmount) > 0 && lockAsset) {
      const fundingVerif = await verifyAndLockFunding({
        walletAddress:   body.walletAddress,
        ledgerOnly:      true,
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
    if (!fundingRef.startsWith("ledger:") && !fundingRef.startsWith("evm-order:1:")) {
      res.status(503).json({
        error: "Wallet-to-wallet order matching is paused until confirmed on-chain settlement is tracked. Use the separate swap flow instead.",
        code: "SETTLEMENT_UNAVAILABLE",
      });
      return;
    }

    // ── All checks passed — insert the order ──────────────────────────────────
    const newOrder = {
      id,
      symbol,
      walletAddress:     body.walletAddress,
      networkType,
      side,                                      // "buy" | "sell"
      type,                                      // "limit" | "market" | "stop"
      status:            "processing",
      price:             price != null ? price.toFixed(18) : undefined,
      stopPrice:         stopPrice != null ? stopPrice.toFixed(18) : undefined,
      quantity:          quantity.toFixed(18),
      filledQuantity:    "0",
      remainingQuantity: quantity.toFixed(18),
      total:             total != null ? total.toFixed(18) : undefined,
      fee:               fee.toFixed(18),
      feeAsset:          symbol.split("/")[1] || "USDT",
      timeInForce,
      txid:              null as string | null,
      // EVM signature from MetaMask personal_sign — proves the trader authorised this order
      signedTx:          body.evmSignature || body.signedTx || null,
      matchedOrderId:    null as string | null,
      fundingRef:        fundingRef || null,
      nonce:             body.nonce ?? id,   // use provided nonce or fall back to order id
      expiry:            body.expiry ? String(body.expiry) : String(Math.floor(Date.now() / 1000) + 5 * 60),
      chainId:           chainId ?? null,
    };

    try {
      await db.insert(ordersTable).values(newOrder);
    } catch (insertErr: unknown) {
      await releaseLedgerOrderFunds(fundingRef, body.walletAddress, lockAsset, parseFloat(lockAmount))
        .catch((unlockErr) => req.log.error({ unlockErr, orderId: id }, "Failed to release funds after order insert failure"));
      // Catch unique constraint violations on (wallet_address, nonce) — orders_wallet_nonce_uidx
      if (isNonceUniqueViolation(insertErr)) {
        res.status(409).json({ error: "Order nonce has already been used. Sign a fresh order with a new nonce.", code: "NONCE_REPLAYED" });
        return;
      }
      throw insertErr; // re-throw all other DB errors
    }
    req.log.info({ orderId: id, side, networkType, walletSource }, "Order placed");

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
      const safePriceStr = price != null ? price.toFixed(18) : undefined;

      // Fetch counter-orders sorted by best price, capped at 500 rows.
      // ORDER BY pushes sorting into the DB so only the cheapest sells / most
      // expensive buys are loaded — avoids reading the entire order book in memory.
      const counterOrders = await db.select().from(ordersTable).where(
        and(
          eq(ordersTable.symbol, symbol),
          eq(ordersTable.side, counterSide),
          eq(ordersTable.status, "open"),
          eq(ordersTable.type, "limit"),
          sql`(${ordersTable.fundingRef} LIKE 'ledger:%' OR ${ordersTable.fundingRef} LIKE 'evm-order:1:%')`,
          ne(ordersTable.walletAddress, BOT_ADDRESS),
          ne(ordersTable.walletAddress, body.walletAddress),
          ...(isMarket && lockPrice
            ? [side === "buy"
              ? lte(ordersTable.price, (lockPrice * 1.005).toFixed(18))
              : gte(ordersTable.price, (lockPrice * 0.995).toFixed(18))]
            : []),
          // Limit orders have price constraints; market + triggered-stop orders take any price
          ...(isLimit && safePriceStr
            ? [side === "buy"
                ? lte(ordersTable.price, safePriceStr)
                : gte(ordersTable.price, safePriceStr)]
            : []),
        )
      )
        .orderBy(side === "buy" ? asc(ordersTable.price) : desc(ordersTable.price))
        .limit(500);

      // already sorted by the DB — alias for clarity
      const sorted = counterOrders;

      // External EVM orders must match only against external EVM counterparties
      // so settlement remains wallet-to-wallet via HTLC, not synthetic ledger fill.
      // When both the incoming order and a candidate have a chainId, they must match —
      // cross-chain EVM fills (e.g. Ethereum vs Arbitrum) are rejected here.
      const incomingIsOrderbookEscrow = fundingRef.startsWith("evm-order:1:");
      const requiresDefiWalletToWallet = fundingRef.startsWith("evm-");
      const eligibleMatches = incomingIsOrderbookEscrow
        ? sorted.filter((candidate) =>
            !!evmOrderKeyFromFundingRef(candidate.fundingRef) &&
            Number(candidate.chainId ?? 1) === Number(chainId ?? 1))
        : sorted.filter((candidate) => !evmOrderKeyFromFundingRef(candidate.fundingRef));
      const walletMatchCandidates = requiresDefiWalletToWallet
        ? sorted.filter((candidate) => {
            const isBot = candidate.walletAddress === BOT_ADDRESS;
            if (isBot) return false;
            const ref = candidate.fundingRef ?? "";
            const isEvmExternal = (
              ref.startsWith("evm-sig:") ||
              ref.startsWith("evm-balance:") ||
              (candidate.walletAddress.startsWith("0x") &&
                (candidate.networkType ?? "evm") === "evm" &&
                !ref.startsWith("ledger:") &&
                !ref.startsWith("margin:"))
            );
            if (!isEvmExternal) return false;
            return true;
          })
        : eligibleMatches;
      const finalEligibleMatches = incomingIsOrderbookEscrow
        ? eligibleMatches.filter((candidate) => candidate.walletAddress !== body.walletAddress)
        : walletMatchCandidates.filter((candidate) => !evmOrderKeyFromFundingRef(candidate.fundingRef));

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

      for (const match of finalEligibleMatches) {
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

        const tradeId       = crypto.randomUUID();
        const buyerNetwork  = side === "buy" ? networkType : (match.networkType ?? "evm");
        const sellerNetwork = side === "sell" ? networkType : (match.networkType ?? "evm");
        const buyerAddress  = side === "buy" ? body.walletAddress : match.walletAddress;
        const sellerAddress = side === "sell" ? body.walletAddress : match.walletAddress;
        const buyerChainId  = side === "buy" ? chainId : (match.chainId ?? undefined);
        const sellerChainId = side === "sell" ? chainId : (match.chainId ?? undefined);

        // ── Detect EVM/EVM wallet-to-wallet fill ─────────────────────────
        // A fill is "EVM external" when:
        //   • walletSource === "external" AND networkType === "evm"  (incoming order)
        //   • match.fundingRef starts with "evm-sig:" or "evm-balance:"  (counter-order)
        //     OR the counter-order's address is 0x-prefixed with no internal fundingRef
        // Bot orders always use the internal ledger and are never EVM-HTLC candidates.
        const incomingIsEvmExternal = fundingRef.startsWith("evm-");
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
        const bothOrderbookEscrow =
          !!onchainOrderKey && !!evmOrderKeyFromFundingRef(matchFundingRef0) &&
          Number(chainId ?? 1) === Number(match.chainId ?? 1);

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
        if (bothEvmExternal && !bothOrderbookEscrow) {
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
            // Cross-chain escrow (buyer on chainA, seller on chainB): the escrow
            // relayer releases each leg on its own chain, so this is now supported.
          }
        }

        // Claim the exact snapshot before settling. Concurrent takers and
        // cancellation must not consume a reservation already being processed.
        const [claimedMatch] = await db.update(ordersTable)
          .set({ status: "processing", updatedAt: new Date() })
          .where(and(
            eq(ordersTable.id, match.id),
            eq(ordersTable.status, "open"),
            eq(ordersTable.remainingQuantity, match.remainingQuantity!),
          )).returning({ id: ordersTable.id });
        if (!claimedMatch) continue;

        let fillResult: Awaited<ReturnType<typeof settleSpotFill>>;
        let orderbookSettlementId: `0x${string}` | null = null;

        try {
          if (bothOrderbookEscrow) {
            const incomingOrderKey = onchainOrderKey ?? orderKeyFromNonce(String(body.nonce ?? ""));
            const matchedOrderKey = evmOrderKeyFromFundingRef(matchFundingRef0);
            if (!matchedOrderKey) {
              await db.update(ordersTable)
                .set({ status: "open", updatedAt: new Date() })
                .where(and(eq(ordersTable.id, match.id), eq(ordersTable.status, "processing")));
              continue;
            }
            const buyerOrderKey = side === "buy" ? incomingOrderKey : matchedOrderKey;
            const sellerOrderKey = side === "sell" ? incomingOrderKey : matchedOrderKey;
            const incomingFilledAfter = (totalFilled + fillQty).toFixed(18);
            const matchFilledAfter = (parseFloat(match.filledQuantity ?? "0") + fillQty).toFixed(18);
            const buyerFilledAfter = side === "buy" ? incomingFilledAfter : matchFilledAfter;
            const sellerFilledAfter = side === "sell" ? incomingFilledAfter : matchFilledAfter;
            const settlementId = keccak256(toBytes(
              `${buyerOrderKey}:${sellerOrderKey}:${buyerFilledAfter}:${sellerFilledAfter}`,
            ));
            orderbookSettlementId = settlementId;
            const pendingRef = `evm-settlement:${settlementId}`;

            await Promise.all([
              db.update(ordersTable)
                .set({ txid: pendingRef, matchedOrderId: match.id, updatedAt: new Date() })
                .where(eq(ordersTable.id, id)),
              db.update(ordersTable)
                .set({ txid: pendingRef, matchedOrderId: id, updatedAt: new Date() })
                .where(eq(ordersTable.id, match.id)),
            ]);

            const settlement = await settleEvmOrderFill({
              settlementId,
              buyOrderKey: buyerOrderKey,
              sellOrderKey: sellerOrderKey,
              base: baseAsset,
              quote: quoteAsset,
              baseAmount: fillQty.toFixed(18),
              grossQuoteAmount: fillValue.toFixed(18),
            }, async (txHash) => {
              const submittedRef = `evm-settlement:${settlementId}:${txHash}`;
              await Promise.all([
                db.update(ordersTable).set({ txid: submittedRef, updatedAt: new Date() }).where(eq(ordersTable.id, id)),
                db.update(ordersTable).set({ txid: submittedRef, updatedAt: new Date() }).where(eq(ordersTable.id, match.id)),
              ]);
            });
            fillResult = {
              txid: settlement.txHash,
              wasRealBroadcast: !settlement.alreadySettled,
              settlementType: "evm_orderbook",
              isCrossChain: false,
            };
          } else if (bothEvmExternal) {
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
              buyerChainId,
              sellerChainId,
              isBot,
              feePct:        feeRate,
              log:           req.log,
            });
          }
        } catch (fillErr: any) {
          if (bothOrderbookEscrow) {
            req.log.error(
              { err: fillErr?.message, tradeId, settlementId: orderbookSettlementId, matchId: match.id },
              "orders: atomic Ethereum settlement is pending reconciliation; order state remains processing",
            );
            res.status(202).json({
              id,
              symbol,
              status: "processing",
              settlementPending: true,
              code: "ONCHAIN_SETTLEMENT_PENDING",
            });
            return;
          }
          await db.update(ordersTable).set({ status: "open", updatedAt: new Date() })
            .where(and(eq(ordersTable.id, match.id), eq(ordersTable.status, "processing")));
          // Ledger settlement failed for this match. Since settleTrade() threw
          // before committing, no funds changed — skip this match and try the next.
          req.log.error(
            { err: fillErr?.message, code: fillErr?.code, tradeId, matchId: match.id, fillQty, fillPrice },
            "orders: fill settlement failed — skipping match, trying next counter-order",
          );
          // Cross-chain HTLC failures: notify both parties so they understand
          // why their cross-chain fill was skipped.
          if (fillErr?.code === "CROSS_CHAIN_HTLC_ERROR") {
            for (const addr of [buyerAddress, sellerAddress]) {
              pushNotification(addr, {
                type:  "settlement_skipped",
                title: "Cross-chain fill skipped",
                body:  "A cross-chain match was found but the HTLC could not be generated. The fill was skipped to protect fund safety — your order remains open.",
                pair:  symbol,
              });
            }
          }
          continue;
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
          // Optimistic concurrency guard: only update the counter-order if it is
          // still 'open'.  A concurrent taker may have already consumed it (their
          // settleTrade will have thrown SETTLEMENT_INSUFFICIENT_LOCK and they will
          // have continued to the next match).  If we get 0 rows here the ledger
          // already committed for this fill — log a warning and continue; the fill
          // value is already recorded in totalFilled above.
          const previousMatchFilled = parseFloat(match.filledQuantity ?? "0");
          const previousMatchTotal = previousMatchFilled > 0 ? parseFloat(match.total ?? "0") : 0;
          const previousMatchFee = previousMatchFilled > 0 && match.side === "sell" ? parseFloat(match.fee ?? "0") : 0;
          const [updatedMatch] = await db.update(ordersTable)
            .set({
              status:            isMatchFullyFilled ? "filled" : "open",
              filledQuantity:    newMatchFilled.toFixed(18),
              remainingQuantity: newMatchRemaining.toFixed(18),
              total:             bothOrderbookEscrow ? (previousMatchTotal + fillValue).toFixed(18) : undefined,
              fee:               bothOrderbookEscrow
                ? (previousMatchFee + (match.side === "sell" ? fillValue * feeRate : 0)).toFixed(18)
                : undefined,
              txid:              broadcastTxid,
              matchedOrderId:    id,
              updatedAt:         new Date(),
            })
            .where(and(eq(ordersTable.id, match.id), eq(ordersTable.status, "processing")))
            .returning({ id: ordersTable.id });

          if (!updatedMatch) {
            req.log.warn(
              { matchId: match.id, tradeId },
              "orders: counter-order status already changed (concurrent consume) — fill credited, order state diverged",
            );
          }
        }

        if (bothOrderbookEscrow) {
          await db.update(ordersTable)
            .set({
              filledQuantity: (totalFilled + fillQty).toFixed(18),
              remainingQuantity: Math.max(0, remainingQty - fillQty).toFixed(18),
              total: (totalFillValue + fillValue).toFixed(18),
              fee: (side === "sell" ? (totalFillValue + fillValue) * feeRate : 0).toFixed(18),
              txid: broadcastTxid,
              matchedOrderId: match.id,
              updatedAt: new Date(),
            })
            .where(eq(ordersTable.id, id));
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
        let escrowSettled = bothOrderbookEscrow;
        let escrowGated   = false;

        if (bothEvmExternal && !bothOrderbookEscrow) {
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
                  ? "Match found across different chains. Your funds are safe in escrow — cancel to refund and re-place matching your counterparty's chain."
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
        if (bothEvmExternal && !bothOrderbookEscrow && !lastEvmHtlcSession && !escrowSettled && !escrowGated) {
          // Determine chain — prefer incoming order's chainId, then counterparty's, then Ethereum.
          const rawChainId = body.chainId
            ? Number(body.chainId)
            : (match.chainId ?? (side === "buy" ? (sellerChainId ?? 1) : (buyerChainId ?? 1)));
          const chainId = Number.isInteger(rawChainId) && rawChainId > 0 && rawChainId in EVM_CHAINS
            ? rawChainId : 1;
          const chainConfig = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

          // Skip HTLC if no contract is deployed for this chain — fall through to ledger settlement.
          const htlcEnabled = !!chainConfig.contractAddress;

          // Resolve token addresses from pair — each stablecoin uses its own contract.
          const [base, quot] = symbol.split("/");
          const baseIsNative = base === chainConfig.nativeSymbol || base === "ETH" || base === "BNB" || base === "MATIC" || base === "AVAX";
          // Resolve per-asset token contract address (null = native coin lock via lockETH).
          const sellerToken =
            baseIsNative                      ? null :
            base === "USDT"                   ? (chainConfig.usdtAddress ?? null) :
            base === "USDC"                   ? (chainConfig.usdcAddress ?? null) :
            null;
          const buyerToken =
            quot === "USDT"                   ? (chainConfig.usdtAddress ?? null) :
            quot === "USDC"                   ? (chainConfig.usdcAddress ?? null) :
            null;

          // Amounts in smallest on-chain units
          const ETH_DECIMALS  = 18;
          const USDT_DECIMALS = 6;
          const fillWei       = BigInt(Math.round(fillQty   * 10 ** ETH_DECIMALS));
          const fillUsdt      = BigInt(Math.round(fillValue * 10 ** USDT_DECIMALS));

          if (!htlcEnabled) {
            req.log.warn({ chainId, symbol }, "orders: HTLC skipped — no contract deployed for chain, using ledger settlement");
          }

          try {
            if (!htlcEnabled) throw new Error("no_contract");
            lastEvmHtlcSession = await initiateEvmHtlcSession({
              tradeId:       tradeId,
              pair:          symbol,
              chainId,
              sellerAddress: sellerAddress as `0x${string}`,
              buyerAddress:  buyerAddress  as `0x${string}`,
              sellerAsset:   baseIsNative ? chainConfig.nativeSymbol : (base ?? "ETH"),
              sellerAmount:  fillWei.toString(),
              sellerToken,
              buyerAsset:    quot ?? "USDT",
              buyerAmount:   fillUsdt.toString(),
              buyerToken,
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
        const marketRemainderCancelled = isMarket && !isFullyFilled;
        const correctFee      = (
          fundingRef.startsWith("evm-order:1:") && side !== "sell"
            ? 0
            : totalFillValue * feeRate
        ).toFixed(18);
        // Record exchange revenue from the order book fill fee
        const feeAssetSymbol = symbol.split("/")[1] ?? "USDT";
        recordPlatformFee({ source: "orderbook", amount: correctFee, asset: feeAssetSymbol, txRef: id });

        await db.update(ordersTable)
          .set({
            status:            isFullyFilled ? "filled" : marketRemainderCancelled ? "cancelled" : "open",
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

        // Market orders are IOC. Release any unfilled reservation; for limit
        // buys release only price improvement on the units that actually filled.
        const releaseAmount = isMarket
          ? side === "buy"
            ? Math.max(0, parseFloat(lockAmount) - totalFillValue)
            : Math.max(0, quantity - totalFilled)
          : side === "buy" && type === "limit" && price != null
            ? Math.max(0, price * totalFilled - totalFillValue)
            : 0;
        if (releaseAmount > 0) {
          await releaseLedgerOrderFunds(fundingRef, body.walletAddress, lockAsset, releaseAmount);
        }

        /* Push order-filled notification */
        const fillSymbol = symbol;
        const fillBase   = fillSymbol.split("/")[0];
        pushNotification(body.walletAddress, {
          type:  isFullyFilled ? "order_filled" : "order_partial",
          title: isFullyFilled ? "Order Filled ✓" : `Partial Fill — ${totalFilled.toFixed(4)} ${fillBase}`,
          body:  `${totalFilled.toFixed(4)} ${fillBase} @ ${avgFillPrice.toFixed(4)} avg · ${fundingRef.startsWith("evm-order:1:") ? "settled directly on Ethereum" : "settled in trading balance"}${marketRemainderCancelled ? " · unfilled remainder cancelled" : ""}`,
          pair:  fillSymbol,
          txid:  lastTxid ?? undefined,
          side,
        });
      }
    }

    // ── Market orders are Immediate-Or-Cancel ─────────────────────────────────
    // Never report an external venue quote as a DEX fill. If there is no match,
    // return the reservation and reject explicitly.
    if ((isMarket || isStopTriggered) && totalFilled === 0) {
      await releaseLedgerOrderFunds(fundingRef, body.walletAddress, lockAsset, parseFloat(lockAmount));
      await db.update(ordersTable).set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.id, id));
      res.status(422).json({
        error: "No matching sellers found for this market order. Place a limit order to set your price, or try again when liquidity is available.",
        code:  "NO_LIQUIDITY",
      });
      return;
    }

    // Return the created order (re-read for updated status if matched)
    await db.update(ordersTable).set({ status: "open", updatedAt: new Date() })
      .where(and(eq(ordersTable.id, id), eq(ordersTable.status, "processing")));
    const [created] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (created.status === "open" && totalFilled === 0) {
      pushNotification(body.walletAddress, {
        type: "order_placed", title: `${side.toUpperCase()} Order Placed`,
        body: `${quantity} ${baseAsset} @ ${price} ${quoteAsset} · waiting for match`,
        pair: symbol, side,
      });
    }

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
// Atomically cancels the order AND unlocks its reserved balance in a single
// pool transaction.  No fire-and-forget — if the unlock fails the entire
// operation rolls back and the order stays open so the client can retry.
// The POST /orders/recover-locked endpoint remains available as a last-resort
// reconciliation tool for any previously-orphaned locks.
router.delete("/orders/:orderId", async (req, res) => {
  try {
    const body = req.body;
    if (!detectIsEvmAddress(body.walletAddress) || !body.signature || !body.nonce || !body.expiry) {
      res.status(401).json({ error: "A valid EVM wallet, signed cancellation, nonce, and expiry are required" });
      return;
    }
    const expiry = parseInt(String(body.expiry), 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(expiry) || expiry <= nowSec || expiry > nowSec + 5 * 60) {
      res.status(401).json({ error: "Cancellation signature is expired or has an invalid expiry" });
      return;
    }
    const actionMessage = buildOrderActionAuthMessage({
      walletAddress: body.walletAddress,
      action: "cancel",
      orderId: req.params.orderId,
      nonce: String(body.nonce),
      expiry: String(expiry),
    });
    try {
      verifyEvmSignature(body.walletAddress, actionMessage, String(body.signature));
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }

    const [existingOrder] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, String(req.params.orderId)))
      .limit(1);
    const fundingRef = String(existingOrder?.fundingRef ?? "");
    const isOrderbookEscrowOrder = fundingRef.startsWith("evm-order:1:");
    let orderbookCancelVerified = false;
    if (isOrderbookEscrowOrder) {
      const [, , escrowAddress, orderKey] = fundingRef.split(":");
      if (!escrowAddress || !orderKey || !body.orderbookCancelTxHash) {
        res.status(400).json({
          error: "Ethereum escrow orders must be canceled on-chain before removing them from the orderbook.",
          code: "ORDERBOOK_CANCEL_PROOF_REQUIRED",
        });
        return;
      }
      try {
        await verifyEvmOrderbookCancelTx({
          escrowAddress,
          orderKey: orderKey as `0x${string}`,
          walletAddress: String(body.walletAddress),
          txHash: String(body.orderbookCancelTxHash),
        });
        orderbookCancelVerified = true;
        if (existingOrder) await reconcilePendingEvmOrderbookOrders([existingOrder], req.log);
      } catch (cancelErr: any) {
        res.status(400).json({
          error: String(cancelErr?.message ?? "Could not verify escrow cancellation"),
          code: "ORDERBOOK_CANCEL_INVALID",
        });
        return;
      }
    }

    const client = await pool.connect();
    let orderRow: Record<string, unknown>;
    try {
      await client.query("BEGIN");

      // Step 1: Mark the order cancelled (only if open and owned by this wallet)
      const { rows: cancelRows } = await client.query<Record<string, unknown>>(
        `UPDATE orders
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1
           AND lower(wallet_address) = lower($2)
           AND (
             status = 'open'
             OR ($3::boolean = true AND status = 'processing' AND funding_ref LIKE 'evm-order:1:%')
           )
         RETURNING *`,
        [req.params.orderId, body.walletAddress, orderbookCancelVerified],
      );

      if (!cancelRows.length) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Order not found or not owned by this wallet" });
        return;
      }
      orderRow = cancelRows[0]!;

      // Step 2: Compute the unlock amount
      const symbol    = String(orderRow.symbol ?? "");
      const side      = String(orderRow.side   ?? "");
      const [base, quote = "USDT"] = symbol.split("/");
      const lockAsset = side === "buy" ? quote : base;
      const remaining = parseFloat(String(orderRow.remaining_quantity ?? "0"));
      let   lockPrice = parseFloat(String(orderRow.price ?? "0"));

      // Market buy orders have no stored price — look up the current market
      // price within the same connection so the unlock mirrors the lock.
      if (!lockPrice && side === "buy") {
        const { rows: mktRows } = await client.query<{ last_price: string }>(
          `SELECT last_price FROM markets WHERE symbol = $1 LIMIT 1`,
          [symbol],
        );
        lockPrice = mktRows[0] ? parseFloat(mktRows[0].last_price) : 0;
      }

      const lockAmount = side === "buy" ? lockPrice * remaining : remaining;

      // Step 3: Unlock reserved balance in the same transaction
      if (lockAmount > 0 && lockAsset && String(orderRow.funding_ref ?? "").startsWith("ledger:")) {
        const wallet     = String(orderRow.wallet_address ?? "");
        const normWallet = /^0x/i.test(wallet) ? wallet.toLowerCase() : wallet;
        await client.query(
          `UPDATE user_balances
           SET locked     = GREATEST(locked - $1::numeric, '0'),
               available  = available + LEAST($1::numeric, locked),
               updated_at = NOW()
           WHERE wallet_address = $2 AND asset_symbol = $3`,
          [lockAmount.toFixed(18), normWallet, lockAsset],
        );
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // Return a serialized response from the raw DB row
    res.json({
      id:                String(orderRow!.id ?? ""),
      walletAddress:     String(orderRow!.wallet_address ?? ""),
      symbol:            String(orderRow!.symbol ?? ""),
      side:              String(orderRow!.side ?? ""),
      type:              String(orderRow!.type ?? ""),
      status:            String(orderRow!.status ?? ""),
      price:             orderRow!.price != null ? parseFloat(String(orderRow!.price)) : undefined,
      quantity:          parseFloat(String(orderRow!.quantity ?? "0")),
      filledQuantity:    parseFloat(String(orderRow!.filled_quantity ?? "0")),
      remainingQuantity: parseFloat(String(orderRow!.remaining_quantity ?? "0")),
      fee:               parseFloat(String(orderRow!.fee ?? "0")),
      total:             orderRow!.total != null ? parseFloat(String(orderRow!.total)) : undefined,
      txid:              orderRow!.txid ?? null,
      createdAt:         orderRow!.created_at ?? null,
      updatedAt:         orderRow!.updated_at ?? null,
    });
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
router.post("/orders/recover-locked", requireAdminToken, async (req, res) => {
  try {
    const { walletAddress, altAddress } = req.body ?? {};
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const addresses: string[] = [walletAddress];
    if (altAddress && altAddress !== walletAddress) addresses.push(altAddress);
    const pending = await pool.query(
      `SELECT id FROM orders
       WHERE lower(wallet_address) = ANY($1::text[])
         AND status IN ('processing', 'pending') LIMIT 1`,
      [addresses.map(address => String(address).toLowerCase())],
    );
    if (pending.rows.length > 0) {
      res.status(409).json({ error: "Reconcile pending settlement before recovering locked balances." });
      return;
    }

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

    // Liquidity check — no open orders on the counter side? warn.
    // Uses LIMIT 1 so we only need to know existence, not count the entire book.
    const [base, quote = "USDT"] = symbol.split("/");
    const counterSide = side === "buy" ? "sell" : "buy";
    const counterOrders = await db.select({ id: ordersTable.id }).from(ordersTable).where(
      and(eq(ordersTable.symbol, symbol), eq(ordersTable.side, counterSide), eq(ordersTable.status, "open"))
    ).limit(1);
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
