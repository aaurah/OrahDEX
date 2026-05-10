/**
 * trade.ts — Unified trade routing layer
 *
 * GET  /trade/modes          — describe both trading modes
 * POST /trade/wallet/quote   — on-chain swap quote (price only; tx signed client-side)
 * POST /trade/wallet         — validate & return on-chain routing params (no server-side signing)
 * POST /trade/exchange/quote — internal AMM quote
 * POST /trade/exchange       — settle internal ledger trade (proxies /swap)
 * POST /withdraw             — withdraw from internal balance to wallet (proxies /withdrawals)
 */

import { Router, type IRouter } from "express";
import { createPublicClient, http } from "viem";
import { db } from "@workspace/db";
import { marketsTable, tradesTable } from "@workspace/db/schema";
import { or, eq, desc } from "drizzle-orm";
import { settleSwap, getBalances, creditAvailable } from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";
import { isVaultConfigured, getVaultAddress, getVaultChainId, vaultWithdraw } from "../lib/orahdexVault.js";
import { db as _db, pool } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";

// ── Chain RPC map (for on-chain tx verification) ──────────────────────────────
const VERIFY_RPC: Record<number, string> = {
  1:      process.env.ETH_RPC_URL      ?? "https://eth.llamarpc.com",
  56:     process.env.BSC_RPC_URL      ?? "https://bsc-dataseed.binance.org",
  137:    process.env.POLYGON_RPC_URL  ?? "https://polygon-rpc.com",
  8453:   process.env.BASE_RPC_URL     ?? "https://mainnet.base.org",
  42161:  process.env.ARB_RPC_URL      ?? "https://arb1.arbitrum.io/rpc",
  10:     process.env.OP_RPC_URL       ?? "https://mainnet.optimism.io",
  43114:  process.env.AVAX_RPC_URL     ?? "https://api.avax.network/ext/bc/C/rpc",
};

const EVM_EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  10: "https://optimistic.etherscan.io",
  43114: "https://snowtrace.io",
};

function tradeExplorerUrl(txid: string | null | undefined, chainId?: number | null): string | null {
  if (!txid) return null;
  if (txid.startsWith("htlc-pending-")) return null;
  if (txid.startsWith("0x")) {
    const base = (chainId ? EVM_EXPLORERS[chainId] : null) ?? EVM_EXPLORERS[1] ?? "https://etherscan.io";
    return `${base}/tx/${txid}`;
  }
  return `${BSV_NET.explorer}/tx/${txid}`;
}

// ── Well-known ERC-20 token registry per chain ─────────────────────────────────
// Maps chainId → { symbol (uppercase) → { address (lowercase), decimals } }
// Used to validate that Transfer logs come from the expected token contract and
// to scale raw BigInt amounts correctly.
const TOKEN_REGISTRY: Record<number, Record<string, { address: string; decimals: number }>> = {
  1: { // Ethereum
    USDT:  { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6  },
    USDC:  { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6  },
    DAI:   { address: "0x6b175474e89094c44da98b954eedeac495271d0f", decimals: 18 },
    WETH:  { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", decimals: 18 },
    WBTC:  { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", decimals: 8  },
    LINK:  { address: "0x514910771af9ca656af840dff83e8264ecf986ca", decimals: 18 },
    UNI:   { address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18 },
  },
  56: { // BNB Chain
    USDT:  { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
    USDC:  { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
    WBNB:  { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", decimals: 18 },
  },
  137: { // Polygon
    USDT:  { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6  },
    USDC:  { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
    WMATIC:{ address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", decimals: 18 },
    WETH:  { address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", decimals: 18 },
  },
  8453: { // Base
    USDC:  { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6  },
    WETH:  { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  42161: { // Arbitrum One
    USDT:  { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6  },
    USDC:  { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6  },
    WETH:  { address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18 },
    WBTC:  { address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", decimals: 8  },
  },
  10: { // Optimism
    USDC:  { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6  },
    USDT:  { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6  },
    WETH:  { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  43114: { // Avalanche C-Chain
    USDT:  { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6  },
    USDC:  { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6  },
    WETH:  { address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", decimals: 18 },
  },
};

const router: IRouter = Router();
const tradeSettleLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." },
});
const tradeWithdrawLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." },
});

const FEE_PCT = 0.003; // 0.3%

// ── Shared: resolve mid-market rate from DB ────────────────────────────────────
async function resolveRate(assetIn: string, assetOut: string): Promise<number | null> {
  const toUsd = async (sym: string): Promise<number | null> => {
    if (sym === "USDT" || sym === "USDC" || sym === "DAI") return 1;
    const rows = await db.select().from(marketsTable).where(
      or(
        eq(marketsTable.symbol, `${sym}/USDT`),
        eq(marketsTable.symbol, `${sym}/USDC`),
        eq(marketsTable.symbol, `${sym}/USD`),
      )
    ).limit(1);
    if (rows[0]?.lastPrice) return parseFloat(rows[0].lastPrice);
    return null;
  };

  if (assetIn === assetOut) return 1;
  const inUsd  = await toUsd(assetIn);
  const outUsd = await toUsd(assetOut);
  if (!inUsd || !outUsd) return null;
  return inUsd / outUsd;
}

// ── GET /trade/modes ───────────────────────────────────────────────────────────
router.get("/trade/modes", (_req, res) => {
  res.json({
    modes: [
      {
        id: "wallet",
        name: "Wallet Mode (On-chain Swap)",
        description: "Routes through an on-chain DEX router (Uniswap-style). User signs the transaction with their own wallet. Funds never touch Orah — ETH leaves the wallet, USDC returns directly.",
        settlementLayer: "on-chain",
        gasRequired: true,
        custodial: false,
        endpoints: {
          quote: "POST /api/trade/wallet/quote",
          execute: "POST /api/trade/wallet  (params only — tx signed client-side)",
        },
      },
      {
        id: "exchange",
        name: "Exchange Mode (Internal Ledger)",
        description: "Trades execute against the internal Orah ledger. No gas, instant settlement. Withdraw via /withdraw which calls the Vault contract or hot-wallet broadcast.",
        settlementLayer: "internal-ledger",
        gasRequired: false,
        custodial: true,
        endpoints: {
          quote:   "POST /api/trade/exchange/quote",
          execute: "POST /api/trade/exchange",
          withdraw: "POST /api/withdraw",
        },
      },
    ],
  });
});

// ── POST /trade/wallet/quote ───────────────────────────────────────────────────
// Returns price-only quote for an on-chain swap. The actual transaction is
// signed and submitted by the user's wallet — this endpoint just provides
// the expected output and routing context.
router.post("/trade/wallet/quote", async (req, res) => {
  const { assetIn, assetOut, amountIn, chainId } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn    = parseFloat(amountIn);
    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    // Determine router address by chain — Uniswap V3 SwapRouter02 addresses
    const ROUTERS: Record<number, string> = {
      1:     "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Ethereum
      56:    "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // BSC (PancakeSwap V3)
      137:   "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Polygon
      42161: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Arbitrum
      10:    "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Optimism
      8453:  "0x2626664c2603336E57B271c5C0b26F421741e481", // Base
      324:   "0x99c56385daBCE3E81d8499d0b8d0257aBC07E8A3", // zkSync
    };

    res.json({
      mode: "wallet",
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
      fee:       fee.toFixed(8),
      feePct:    FEE_PCT * 100,
      rate:      rate.toFixed(8),
      chainId:   chainId ?? null,
      router:    chainId ? (ROUTERS[Number(chainId)] ?? null) : null,
      note: "Transaction must be signed and submitted by the user's wallet. Orah never holds funds in wallet mode.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/wallet/quote failed");
    res.status(500).json({ error: "Quote failed" });
  }
});

// ── POST /trade/wallet ─────────────────────────────────────────────────────────
// Returns validated routing parameters for the client to build & sign an
// on-chain DEX transaction. No funds touch the server.
router.post("/trade/wallet", async (req, res) => {
  const { assetIn, assetOut, amountIn, walletAddress, chainId, slippagePct } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn || !walletAddress) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn, walletAddress are required" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn        = parseFloat(amountIn);
    const grossOut     = amtIn * rate;
    const fee          = grossOut * FEE_PCT;
    const amtOut       = grossOut - fee;
    const slip         = parseFloat(slippagePct ?? "0.5") / 100;
    const minAmountOut = amtOut * (1 - slip);

    res.json({
      mode:          "wallet",
      walletAddress,
      assetIn:       assetIn.toUpperCase(),
      assetOut:      assetOut.toUpperCase(),
      amountIn:      amtIn.toFixed(8),
      amountOut:     amtOut.toFixed(8),
      minAmountOut:  minAmountOut.toFixed(8),
      fee:           fee.toFixed(8),
      feePct:        FEE_PCT * 100,
      slippagePct:   slippagePct ?? "0.5",
      chainId:       chainId ?? null,
      instructions: "Sign and submit the swap transaction via your wallet using the Uniswap V3 router for this chain.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/wallet failed");
    res.status(500).json({ error: "Routing failed" });
  }
});

// ── POST /trade/wallet/settle — record confirmed on-chain swap & credit balance ──
/**
 * Called by the frontend AFTER the user's on-chain swap transaction is confirmed.
 * 1. Fetches the tx receipt from the chain to verify success.
 * 2. Inserts a record in the trades table (with txid).
 * 3. Credits the user's internal exchange balance with the received assetOut amount,
 *    so tokens are immediately available for exchange-mode trading or withdrawal.
 *
 * Body: { txHash, chainId, walletAddress, assetIn, assetOut, amountIn, amountOut }
 */
router.post("/trade/wallet/settle", tradeSettleLimiter, async (req, res) => {
  const { txHash, chainId, walletAddress, assetIn, assetOut, amountIn, amountOut } = req.body ?? {};

  if (!txHash || !chainId || !walletAddress || !assetIn || !assetOut || !amountIn || !amountOut) {
    res.status(400).json({ error: "txHash, chainId, walletAddress, assetIn, assetOut, amountIn, amountOut are required" });
    return;
  }

  const numChain = parseInt(String(chainId), 10);
  if (isNaN(numChain) || !VERIFY_RPC[numChain]) {
    res.status(422).json({ error: `Unsupported chainId ${chainId}` });
    return;
  }

  // Guard: reject duplicate tx settlements
  const existing = await db.select({ id: tradesTable.id })
    .from(tradesTable)
    .where(eq(tradesTable.txid, txHash))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Transaction already settled", tradeId: existing[0].id });
    return;
  }

  try {
    // Verify the tx on-chain — require the receipt; do NOT proceed optimistically
    const client = createPublicClient({ transport: http(VERIFY_RPC[numChain]) });
    let receipt: { status: string; logs: { topics: string[]; data: string; address: string }[] } | null = null;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }) as any;
    } catch (rpcErr: any) {
      logger.warn({ txHash, chainId, err: rpcErr?.message }, "RPC receipt fetch failed");
      res.status(503).json({ error: "Could not verify transaction on-chain. Please try again later." });
      return;
    }

    if (!receipt) {
      res.status(404).json({ error: "Transaction not found on-chain. It may still be pending.", txHash });
      return;
    }
    if (receipt.status !== "success") {
      res.status(422).json({ error: "Transaction reverted on-chain", txHash });
      return;
    }

    // Derive the credited amount from the ERC-20 Transfer logs destined to the
    // caller's wallet, rather than trusting the client-supplied amountOut.
    // ERC-20 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const walletLower    = walletAddress.toLowerCase();
    const assetOutUpper  = assetOut.toUpperCase();

    // Look up the expected token contract address and decimals for assetOut on this chain
    const tokenInfo = TOKEN_REGISTRY[numChain]?.[assetOutUpper];

    let rawTransferAmount = 0n; // raw BigInt sum before decimal scaling

    for (const log of (receipt.logs ?? [])) {
      // Standard ERC-20 Transfer: topics[0]=sig, topics[1]=from, topics[2]=to
      if (
        log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
        log.topics.length < 3 ||
        log.topics[2]?.slice(-40).toLowerCase() !== walletLower.replace("0x", "")
      ) continue;

      // Reject transfers from unrecognised token contracts if we have a registry entry.
      // Unknown tokens (not in the registry) are accepted for forward compatibility but
      // assumed 18 decimals — operators should add them to TOKEN_REGISTRY as needed.
      if (tokenInfo && log.address?.toLowerCase() !== tokenInfo.address) continue;

      rawTransferAmount += BigInt(log.data || "0x0");
    }

    // Scale using the correct decimal count for the token
    const tokenDecimals   = tokenInfo?.decimals ?? 18;
    let   verifiedAmount  = Number(rawTransferAmount) / 10 ** tokenDecimals;

    // If no ERC-20 Transfer to the user was found, fall back to the tx's native
    // ETH value (for ETH-in / ETH-out swaps where there are no Transfer events).
    // If still zero, reject — we cannot verify what the user received.
    if (verifiedAmount <= 0) {
      // For native ETH output there are no Transfer logs. Accept client amountOut
      // only for native-asset-out swaps where assetOut matches the chain's native symbol.
      const NATIVE_SYMBOLS: Record<number, string> = { 1:"ETH", 56:"BNB", 137:"MATIC", 8453:"ETH", 42161:"ETH", 10:"ETH", 43114:"AVAX" };
      if (assetOutUpper === (NATIVE_SYMBOLS[numChain] ?? "")) {
        verifiedAmount = parseFloat(amountOut);
      } else {
        res.status(422).json({ error: "Could not verify received amount from on-chain logs. Settlement rejected.", txHash });
        return;
      }
    }

    const amtIn  = parseFloat(amountIn);
    const amtOut = verifiedAmount;
    const fee    = amtIn * FEE_PCT;
    const price  = amtIn > 0 ? amtOut / amtIn : 0;
    const symbol = `${assetIn.toUpperCase()}/${assetOutUpper}`;

    const tradeId = crypto.randomUUID();

    // Insert trade record and credit balance atomically. Without a shared transaction,
    // a failure in creditAvailable after the trade is inserted would prevent retries
    // (the dedup guard above would reject them as already settled).
    const dbClient = await pool.connect();
    try {
      await dbClient.query("BEGIN");

      await dbClient.query(
        `INSERT INTO trades
           (id, symbol, side, price, quantity, total, fee, fee_asset, wallet_address, txid)
         VALUES ($1,$2,'buy',$3,$4,$5,$6,$7,$8,$9)`,
        [
          tradeId, symbol, price.toFixed(8), amtIn.toFixed(8),
          amtOut.toFixed(8), fee.toFixed(8), assetIn.toUpperCase(),
          walletAddress, txHash,
        ],
      );

      // Credit the verified received amount to the user's internal balance
      await dbClient.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
         VALUES ($1, $2, $3, '0', now())
         ON CONFLICT (wallet_address, asset_symbol)
         DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
        [walletAddress, assetOutUpper, amtOut.toFixed(8)],
      );

      await dbClient.query("COMMIT");
    } catch (err) {
      await dbClient.query("ROLLBACK");
      throw err;
    } finally {
      dbClient.release();
    }

    logger.info({ tradeId, txHash, walletAddress, assetOut, amtOut }, "On-chain swap settled");

    res.json({
      settled:   true,
      tradeId,
      txHash,
      chainId:   numChain,
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOutUpper,
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
      fee:       fee.toFixed(8),
      message:   `${amtOut.toFixed(6)} ${assetOutUpper} credited to your exchange balance`,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/wallet/settle failed");
    res.status(500).json({ error: "Settlement failed" });
  }
});

// ── GET /trade/settlements/:walletAddress — settlement history ────────────────
router.get("/trade/settlements/:walletAddress", async (req, res) => {
  const { walletAddress } = req.params;
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const settlements = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.walletAddress, walletAddress))
      .orderBy(desc(tradesTable.timestamp))
      .limit(limit);

    const onChain   = settlements.filter(t => !!t.txid);
    const exchange  = settlements.filter(t => !t.txid);

    res.json({
      walletAddress,
      total:       settlements.length,
      onChain:     onChain.length,
      exchange:    exchange.length,
      settlements: settlements.map(t => ({
        id:        t.id,
        symbol:    t.symbol,
        side:      t.side,
        price:     parseFloat(t.price),
        quantity:  parseFloat(t.quantity),
        total:     parseFloat(t.total),
        fee:       parseFloat(t.fee),
        feeAsset:  t.feeAsset,
        txid:      t.txid ?? null,
        mode:      t.txid ? "on-chain" : "exchange",
        explorerUrl: tradeExplorerUrl(t.txid, null),
        timestamp: t.timestamp,
      })),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/settlements fetch failed");
    res.status(500).json({ error: "Failed to fetch settlement history" });
  }
});

// ── POST /trade/exchange/quote ─────────────────────────────────────────────────
router.post("/trade/exchange/quote", async (req, res) => {
  const { assetIn, assetOut, amountIn } = req.body ?? {};
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const amtIn    = parseFloat(amountIn);
    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    res.json({
      mode:      "exchange",
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
      fee:       fee.toFixed(8),
      feePct:    FEE_PCT * 100,
      rate:      rate.toFixed(8),
      note:      "Internal settlement — no gas required.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange/quote failed");
    res.status(500).json({ error: "Quote failed" });
  }
});

// ── POST /trade/exchange ───────────────────────────────────────────────────────
// Settle a trade on the internal ledger. Seeds balances for new users.
router.post("/trade/exchange", async (req, res) => {
  const { walletAddress, assetIn, assetOut, amountIn, minAmountOut } = req.body ?? {};

  if (!walletAddress || !assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "walletAddress, assetIn, assetOut, amountIn are required" });
    return;
  }

  const amtIn = parseFloat(amountIn);
  if (isNaN(amtIn) || amtIn <= 0) {
    res.status(400).json({ error: "amountIn must be a positive number" });
    return;
  }

  try {
    const rate = await resolveRate(assetIn.toUpperCase(), assetOut.toUpperCase());
    if (!rate) {
      res.status(422).json({ error: "No price available for this pair" });
      return;
    }

    const grossOut = amtIn * rate;
    const fee      = grossOut * FEE_PCT;
    const amtOut   = grossOut - fee;

    if (minAmountOut && amtOut < parseFloat(minAmountOut)) {
      res.status(422).json({
        error: `Slippage exceeded: expected at least ${minAmountOut}, got ${amtOut.toFixed(8)}`,
        amountOut: amtOut.toFixed(8),
      });
      return;
    }

    await settleSwap({
      walletAddress,
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
    });
    await recordPlatformFee({ source: "swap", amount: fee, asset: assetOut.toUpperCase() });

    // Record exchange-mode trade in trades table
    const tradeId = crypto.randomUUID();
    const price   = amtIn > 0 ? amtOut / amtIn : 0;
    const symbol  = `${assetIn.toUpperCase()}/${assetOut.toUpperCase()}`;
    try {
      await db.insert(tradesTable).values({
        id:           tradeId,
        symbol,
        side:         "buy",
        price:        price.toFixed(8),
        quantity:     amtIn.toFixed(8),
        total:        amtOut.toFixed(8),
        fee:          fee.toFixed(8),
        feeAsset:     assetIn.toUpperCase(),
        walletAddress,
        txid:         `exchange:${tradeId}`,
      });
    } catch (dbErr: any) {
      logger.warn({ dbErr: dbErr?.message }, "Exchange trade record insert failed (settlement still valid)");
    }

    const balances = await getBalances(walletAddress);

    const vaultActive  = isVaultConfigured();
    const vaultAddress = vaultActive ? getVaultAddress() : null;
    const vaultChain   = vaultActive ? getVaultChainId() : null;

    res.json({
      mode:       "exchange",
      success:    true,
      tradeId,
      walletAddress,
      assetIn:    assetIn.toUpperCase(),
      assetOut:   assetOut.toUpperCase(),
      amountIn:   amtIn.toFixed(8),
      amountOut:  amtOut.toFixed(8),
      fee:        fee.toFixed(8),
      feePct:     FEE_PCT * 100,
      rate:       rate.toFixed(8),
      settlement: {
        layer:           vaultActive ? "vault" : "internal-ledger",
        vaultAddress:    vaultAddress ?? null,
        vaultChainId:    vaultChain   ?? null,
        withdrawEnabled: vaultActive,
        note:            vaultActive
          ? `Withdrawals settled via OrahDEXVault on chain ${vaultChain}`
          : "Internal ledger settlement — deploy OrahDEXVault to enable on-chain withdrawals",
      },
      balances,
      settledAt:  new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange failed");
    if (err?.message?.includes("Insufficient")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_FUNDS" });
    } else {
      res.status(500).json({ error: err?.message ?? "Trade failed" });
    }
  }
});

// ── POST /withdraw ─────────────────────────────────────────────────────────────
// Withdraw from internal exchange balance to the user's on-chain wallet.
// Deducts the internal balance atomically, then attempts on-chain broadcast
// via the hot wallet. If a Vault contract address is configured, it will be
// used instead (set VAULT_CONTRACT_ADDRESS env var + deploy the contract first).
router.post("/withdraw", tradeWithdrawLimiter, async (req, res) => {
  const { walletAddress, asset, amount, network, recipient, networkLabel } = req.body ?? {};

  if (!walletAddress || !asset || !amount || !network || !recipient) {
    res.status(400).json({ error: "walletAddress, asset, amount, network, recipient are required" });
    return;
  }

  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  // If a Vault contract is configured, note it in the response (wiring deferred until contract is deployed)
  const vaultAddress = process.env.VAULT_CONTRACT_ADDRESS ?? null;

  const id     = crypto.randomUUID();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: balRows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );

    const available = parseFloat(balRows[0]?.available ?? "0");
    if (available < parsed) {
      await client.query("ROLLBACK");
      res.status(400).json({
        error: `Insufficient balance. Available: ${available} ${asset}, requested: ${parsed} ${asset}`,
        code: "INSUFFICIENT_FUNDS",
      });
      return;
    }

    await client.query(
      `UPDATE user_balances SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [parsed.toString(), walletAddress, asset],
    );

    await client.query(
      `INSERT INTO withdrawal_requests
         (id, wallet_address, asset, amount, network, network_label, recipient, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',now(),now())`,
      [id, walletAddress, asset, parsed.toString(), network, networkLabel ?? network, recipient],
    );

    await client.query("COMMIT");

    const useVault   = isVaultConfigured();
    const vaultAddr  = getVaultAddress();
    const vaultChain = getVaultChainId();

    logger.info({ id, walletAddress, asset, amount: parsed, network, recipient, useVault, vaultAddr }, "withdraw: request created");

    // Attempt async on-chain broadcast (vault → hot-wallet fallback)
    setImmediate(async () => {
      try {
        if (useVault) {
          await vaultWithdraw({ asset, amount: parsed, recipient, chainId: vaultChain });
          logger.info({ id, asset, amount: parsed, recipient, vault: vaultAddr }, "withdraw: vault.withdraw() succeeded");
        } else {
          await processWithdrawal({ asset, amount: parsed, network, recipient });
        }
        // Mark completed in DB
        await client.query(
          `UPDATE withdrawal_requests SET status='completed', updated_at=now() WHERE id=$1`,
          [id],
        ).catch(() => {});
      } catch (err: any) {
        logger.warn({ id, err: err?.message }, "withdraw: on-chain broadcast failed — staying pending");
      }
    });

    res.status(201).json({
      id,
      status:           "pending",
      walletAddress,
      asset,
      amount:           parsed.toString(),
      network,
      recipient,
      settlementMethod: useVault ? "vault" : "hot-wallet",
      vaultAddress:     vaultAddr,
      vaultChainId:     useVault ? vaultChain : null,
      note: useVault
        ? `vault.withdraw() called on OrahDEXVault at ${vaultAddr} (chainId ${vaultChain}).`
        : "Hot-wallet broadcast initiated. Fund the hot wallet to enable instant auto-withdrawals.",
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err: err?.message }, "withdraw: transaction failed");
    res.status(500).json({ error: err?.message ?? "Withdrawal failed" });
  } finally {
    client.release();
  }
});

export default router;
