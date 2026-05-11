/**
 * trade.ts — Unified trade routing layer
 *
 * GET  /trade/modes          — describe both trading modes
 * POST /trade/wallet/quote   — on-chain swap quote (price only; tx signed client-side)
 * POST /trade/wallet         — validate & return on-chain routing params (no server-side signing)
 * POST /trade/exchange/quote — internal AMM quote
 * POST /trade/exchange       — settle internal ledger trade (proxies /swap)
 * POST /withdraw             — withdraw from internal balance to wallet (proxies /withdrawals)
 * POST /withdraw/challenge   — issue a nonce the EVM wallet must sign before /withdraw
 */

import { Router, type IRouter } from "express";
import { createPublicClient, http } from "viem";
import { db } from "@workspace/db";
import { marketsTable, tradesTable } from "@workspace/db/schema";
import { or, eq, desc } from "drizzle-orm";
import { settleSwap, getBalances, creditAvailable, debitAvailable } from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";
import { isVaultConfigured, getVaultAddress, getVaultChainId, vaultWithdraw } from "../lib/orahVault.js";
import { db as _db, pool } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import {
  issueWithdrawChallenge,
  verifyWithdrawSignature,
  issueBsvWithdrawChallenge,
  verifyBsvWithdrawSignature,
  issueSolWithdrawChallenge,
  verifySolWithdrawSignature,
  buildExchangeAuthMessage,
  verifyEvmSignature,
  issueExchangeChallenge,
  verifyExchangeSignature,
} from "../lib/walletAuth.js";

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

import { TOKEN_REGISTRY } from "../lib/tokenRegistry.js";

const router: IRouter = Router();

const FEE_PCT = 0.003; // 0.3%

// ── POST /withdraw/challenge ───────────────────────────────────────────────────
// Issues a server-side nonce that the wallet must sign before calling
// POST /withdraw. This proves the caller owns the walletAddress.
// Supports EVM (0x…), BSV (1…/3…), and Solana (base58) addresses.
router.post("/withdraw/challenge", (req, res) => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    res.json(issueWithdrawChallenge(walletAddress));
  } else if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(walletAddress)) {
    res.json(issueBsvWithdrawChallenge(walletAddress));
  } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    res.json(issueSolWithdrawChallenge(walletAddress));
  } else {
    res.status(400).json({ error: "Unsupported wallet address format. Supported: EVM (0x…), BSV (1…/3…), Solana (base58)." });
  }
});

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

function normalizeAssetSymbol(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toUpperCase();
  return v.length > 0 ? v : null;
}

function parseTradeSymbol(input: unknown): { base: string; quote: string; normalized: string } | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase().replace(/-/g, "/");
  const [base, quote] = normalized.split("/");
  if (!base || !quote) return null;
  return { base, quote, normalized: `${base}/${quote}` };
}

async function executeExchangeTrade(params: {
  walletAddress: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  minAmountOut?: number;
}) {
  const { walletAddress, minAmountOut } = params;
  const assetIn = params.assetIn.toUpperCase();
  const assetOut = params.assetOut.toUpperCase();
  const amountIn = params.amountIn;

  const rate = await resolveRate(assetIn, assetOut);
  if (!rate) {
    throw new Error("NO_PRICE");
  }

  const grossOut = amountIn * rate;
  const fee = grossOut * FEE_PCT;
  const amtOut = grossOut - fee;

  if (minAmountOut != null && amtOut < minAmountOut) {
    throw new Error(`SLIPPAGE_EXCEEDED:${amtOut.toFixed(8)}`);
  }

  await settleSwap({
    walletAddress,
    assetIn,
    assetOut,
    amountIn: amountIn.toFixed(8),
    amountOut: amtOut.toFixed(8),
  });
  await recordPlatformFee({ source: "swap", amount: fee, asset: assetOut });

  const tradeId = crypto.randomUUID();
  const price = amountIn > 0 ? amtOut / amountIn : 0;
  const symbol = `${assetIn}/${assetOut}`;
  try {
    await db.insert(tradesTable).values({
      id: tradeId,
      symbol,
      side: "buy",
      price: price.toFixed(18),
      quantity: amountIn.toFixed(18),
      total: amtOut.toFixed(18),
      fee: fee.toFixed(18),
      feeAsset: assetIn,
      walletAddress,
      txid: `exchange:${tradeId}`,
    });
  } catch (dbErr: any) {
    logger.warn({ dbErr: dbErr?.message }, "Exchange trade record insert failed (settlement still valid)");
  }

  const balances = await getBalances(walletAddress);
  return { tradeId, assetIn, assetOut, amountIn, amountOut: amtOut, fee, rate, balances };
}

// ── GET /trade/modes ───────────────────────────────────────────────────────────
router.get("/trade/modes", (_req, res) => {
  res.json({
    modes: [
      {
        id: "wallet",
        name: "Wallet Mode (On-chain Swap)",
        description: "Routes through an on-chain DEX router (Uniswap-style). User signs the transaction with their own wallet. Funds never touch OrahDEX — ETH leaves the wallet, USDC returns directly.",
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
        description: "Trades execute against the internal OrahDEX ledger. No gas, instant settlement. Withdraw via /withdraw which calls the Vault contract or hot-wallet broadcast.",
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
      note: "Transaction must be signed and submitted by the user's wallet. OrahDEX never holds funds in wallet mode.",
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
router.post("/trade/wallet/settle", async (req, res) => {
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
    let receipt: {
      status: string;
      logs: { topics: string[]; data: string; address: string }[];
      blockNumber: bigint;
    } | null = null;
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

    // If no ERC-20 Transfer to the user was found, attempt to measure the
    // native-asset balance change for the caller's address between the block
    // before the tx and the tx block. This correctly captures ETH/BNB/MATIC
    // output swaps that arrive as internal transfers rather than ERC-20 events.
    // Trusting the client-supplied amountOut is explicitly prohibited here.
    if (verifiedAmount <= 0) {
      const NATIVE_SYMBOLS: Record<number, string> = { 1:"ETH", 56:"BNB", 137:"MATIC", 8453:"ETH", 42161:"ETH", 10:"ETH", 43114:"AVAX" };
      if (assetOutUpper === (NATIVE_SYMBOLS[numChain] ?? "") && receipt.blockNumber > 0n) {
        try {
          const [balBefore, balAfter] = await Promise.all([
            client.getBalance({ address: walletAddress as `0x${string}`, blockNumber: receipt.blockNumber - 1n }),
            client.getBalance({ address: walletAddress as `0x${string}`, blockNumber: receipt.blockNumber }),
          ]);
          const delta = balAfter > balBefore ? balAfter - balBefore : 0n;
          verifiedAmount = Number(delta) / 1e18;
        } catch (balErr: any) {
          logger.warn({ txHash, err: balErr?.message }, "Native balance delta query failed");
        }
      }
      if (verifiedAmount <= 0) {
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
          tradeId, symbol, price.toFixed(18), amtIn.toFixed(18),
          amtOut.toFixed(18), fee.toFixed(18), assetIn.toUpperCase(),
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

// ── POST /trade/exchange/challenge ────────────────────────────────────────────
// Issues a server-side nonce the EVM wallet must sign before POST /trade/exchange.
// Clients: call this endpoint, sign the returned `message` with personal_sign,
// then include `signature` + `nonce` in the POST /trade/exchange body.
router.post("/trade/exchange/challenge", (req, res) => {
  const { walletAddress, assetIn, assetOut, amountIn } = req.body as {
    walletAddress?: string; assetIn?: string; assetOut?: string; amountIn?: string;
  };
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    res.status(400).json({ error: "Valid EVM address required (0x…)" });
    return;
  }
  if (!assetIn || !assetOut || !amountIn) {
    res.status(400).json({ error: "assetIn, assetOut, amountIn are required" });
    return;
  }
  const challenge = issueExchangeChallenge({
    walletAddress,
    assetIn:  assetIn.toUpperCase(),
    assetOut: assetOut.toUpperCase(),
    amountIn: String(parseFloat(amountIn)),
  });
  res.json(challenge);
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
// EVM wallet callers (0x…) must supply `signature` + `nonce` to prove they
// authorised this swap. Obtain the canonical message from
// buildExchangeAuthMessage and sign it with personal_sign in MetaMask/ethers.
router.post("/trade/exchange", async (req, res) => {
  const body = req.body ?? {};
  const walletAddress = body.walletAddress;
  const signature = body.signature;
  const nonce = body.nonce;

  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  // Require wallet signature for EVM wallets to prove the caller owns walletAddress.
  // The signature must have been produced over the server-issued challenge from
  // POST /trade/exchange/challenge — this enforces single-use nonces and prevents replay.
  if (walletAddress.startsWith("0x")) {
    if (!signature || !nonce) {
      res.status(401).json({
        error: "signature and nonce are required for EVM wallet exchange swaps. " +
               "Request a challenge via POST /trade/exchange/challenge, sign the returned message, " +
               "and include signature + nonce in this request.",
      });
      return;
    }
    try {
      verifyExchangeSignature(walletAddress, String(nonce), signature);
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }
  }

  try {
    let assetIn = normalizeAssetSymbol(body.assetIn);
    let assetOut = normalizeAssetSymbol(body.assetOut);
    let amtIn = parseFloat(String(body.amountIn ?? "NaN"));
    let minOut = body.minAmountOut != null ? parseFloat(String(body.minAmountOut)) : undefined;

    // Advanced path: accept { symbol: "ETH/USDC", side: "sell|buy", quantity }
    if ((!assetIn || !assetOut || !Number.isFinite(amtIn)) && body.symbol && body.side && body.quantity != null) {
      const pair = parseTradeSymbol(body.symbol);
      const side = String(body.side).toLowerCase();
      const qty = parseFloat(String(body.quantity));
      if (!pair || !Number.isFinite(qty) || qty <= 0 || (side !== "buy" && side !== "sell")) {
        res.status(400).json({ error: "Invalid advanced trade params: symbol, side, quantity" });
        return;
      }
      if (side === "sell") {
        assetIn = pair.base;
        assetOut = pair.quote;
        amtIn = qty;
      } else {
        assetIn = pair.quote;
        assetOut = pair.base;
        const r = await resolveRate(assetIn, assetOut);
        if (!r || r <= 0) {
          res.status(422).json({ error: "No price available for this pair" });
          return;
        }
        // quantity for BUY is desired base output; convert to required quote input
        amtIn = qty / (r * (1 - FEE_PCT));
        if (minOut == null) minOut = qty * 0.999;
      }
    }

    if (!assetIn || !assetOut || !Number.isFinite(amtIn) || amtIn <= 0) {
      res.status(400).json({ error: "walletAddress, assetIn, assetOut, amountIn are required" });
      return;
    }

    const trade = await executeExchangeTrade({
      walletAddress,
      assetIn,
      assetOut,
      amountIn: amtIn,
      minAmountOut: minOut,
    });

    const vaultActive  = isVaultConfigured();
    const vaultAddress = vaultActive ? getVaultAddress() : null;
    const vaultChain   = vaultActive ? getVaultChainId() : null;

    res.json({
      mode:       "exchange",
      success:    true,
      tradeId: trade.tradeId,
      walletAddress,
      assetIn:    trade.assetIn,
      assetOut:   trade.assetOut,
      amountIn:   trade.amountIn.toFixed(8),
      amountOut:  trade.amountOut.toFixed(8),
      fee:        trade.fee.toFixed(8),
      feePct:     FEE_PCT * 100,
      rate:       trade.rate.toFixed(8),
      settlement: {
        layer:           vaultActive ? "vault" : "internal-ledger",
        vaultAddress:    vaultAddress ?? null,
        vaultChainId:    vaultChain   ?? null,
        withdrawEnabled: vaultActive,
        note:            vaultActive
          ? `Withdrawals settled via OrahVault on chain ${vaultChain}`
          : "Internal ledger settlement — deploy OrahVault to enable on-chain withdrawals",
      },
      balances: trade.balances,
      settledAt:  new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange failed");
    if (err?.message === "NO_PRICE") {
      res.status(422).json({ error: "No price available for this pair" });
    } else if (err?.message?.startsWith("SLIPPAGE_EXCEEDED:")) {
      res.status(422).json({
        error: "Slippage exceeded",
        amountOut: err.message.split(":")[1] ?? null,
      });
    } else if (err?.message?.includes("Insufficient") || err?.message?.includes("INSUFFICIENT_FUNDS")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_FUNDS" });
    } else {
      res.status(500).json({ error: err?.message ?? "Trade failed" });
    }
  }
});

// ── POST /trade/exchange/advanced ───────────────────────────────────────────────
// Dedicated advanced market-style endpoint: { walletAddress, symbol, side, quantity }
router.post("/trade/exchange/advanced", async (req, res) => {
  const { walletAddress, symbol, side, quantity, minAmountOut, signature, nonce } = req.body ?? {};
  const pair = parseTradeSymbol(symbol);
  const normalizedSide = String(side ?? "").toLowerCase();
  const qty = parseFloat(String(quantity));

  if (!walletAddress || !pair || (normalizedSide !== "buy" && normalizedSide !== "sell") || !Number.isFinite(qty) || qty <= 0) {
    res.status(400).json({ error: "walletAddress, symbol, side (buy|sell), quantity are required" });
    return;
  }

  if (String(walletAddress).startsWith("0x")) {
    if (!signature || !nonce) {
      res.status(401).json({
        error: "signature and nonce are required for EVM wallet exchange swaps. Request a challenge via POST /trade/exchange/challenge and include signature + nonce.",
      });
      return;
    }
    try {
      verifyExchangeSignature(String(walletAddress), String(nonce), String(signature));
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }
  }

  try {
    let assetIn: string;
    let assetOut: string;
    let amountIn: number;
    let minOut = minAmountOut != null ? parseFloat(String(minAmountOut)) : undefined;

    if (normalizedSide === "sell") {
      assetIn = pair.base;
      assetOut = pair.quote;
      amountIn = qty;
    } else {
      assetIn = pair.quote;
      assetOut = pair.base;
      const rate = await resolveRate(assetIn, assetOut);
      if (!rate || rate <= 0) {
        res.status(422).json({ error: "No price available for this pair" });
        return;
      }
      amountIn = qty / (rate * (1 - FEE_PCT));
      if (minOut == null) minOut = qty * 0.999;
    }

    const trade = await executeExchangeTrade({
      walletAddress,
      assetIn,
      assetOut,
      amountIn,
      minAmountOut: minOut,
    });

    res.json({
      mode: "exchange-advanced",
      success: true,
      tradeId: trade.tradeId,
      walletAddress,
      symbol: pair.normalized,
      side: normalizedSide,
      quantity: qty.toFixed(8),
      inputAsset: trade.assetIn,
      outputAsset: trade.assetOut,
      amountIn: trade.amountIn.toFixed(8),
      amountOut: trade.amountOut.toFixed(8),
      fee: trade.fee.toFixed(8),
      feePct: FEE_PCT * 100,
      rate: trade.rate.toFixed(8),
      balances: trade.balances,
      settledAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange/advanced failed");
    if (err?.message?.startsWith("SLIPPAGE_EXCEEDED:")) {
      res.status(422).json({ error: "Slippage exceeded", amountOut: err.message.split(":")[1] ?? null });
    } else if (err?.message?.includes("Insufficient") || err?.message?.includes("INSUFFICIENT_FUNDS")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_FUNDS" });
    } else {
      res.status(500).json({ error: err?.message ?? "Advanced trade failed" });
    }
  }
});

// ── POST /trade/exchange/mint ───────────────────────────────────────────────────
router.post("/trade/exchange/mint", async (req, res) => {
  const walletAddress = req.body?.walletAddress;
  const asset = normalizeAssetSymbol(req.body?.asset) ?? "USDC";
  const amount = parseFloat(String(req.body?.amount ?? "NaN"));

  if (!walletAddress || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "walletAddress and positive amount are required" });
    return;
  }

  try {
    await creditAvailable(walletAddress, asset, amount.toFixed(8));
    const balances = await getBalances(walletAddress);
    res.status(201).json({
      success: true,
      action: "mint",
      walletAddress,
      asset,
      amount: amount.toFixed(8),
      balances,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange/mint failed");
    res.status(500).json({ error: err?.message ?? "Mint failed" });
  }
});

// ── POST /trade/exchange/burn ───────────────────────────────────────────────────
router.post("/trade/exchange/burn", async (req, res) => {
  const walletAddress = req.body?.walletAddress;
  const asset = normalizeAssetSymbol(req.body?.asset) ?? "USDC";
  const amount = parseFloat(String(req.body?.amount ?? "NaN"));

  if (!walletAddress || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "walletAddress and positive amount are required" });
    return;
  }

  try {
    await debitAvailable(walletAddress, asset, amount.toFixed(8));
    const balances = await getBalances(walletAddress);
    res.json({
      success: true,
      action: "burn",
      walletAddress,
      asset,
      amount: amount.toFixed(8),
      balances,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "trade/exchange/burn failed");
    if (err?.message?.includes("INSUFFICIENT_FUNDS")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_FUNDS" });
    } else {
      res.status(500).json({ error: err?.message ?? "Burn failed" });
    }
  }
});

// ── POST /withdraw ─────────────────────────────────────────────────────────────
// Withdraw from internal exchange balance to the user's on-chain wallet.
// Deducts the internal balance atomically, then attempts on-chain broadcast
// via the hot wallet. If a Vault contract address is configured, it will be
// used instead (set VAULT_CONTRACT_ADDRESS env var + deploy the contract first).
// EVM wallet callers (0x…) must supply a `signature` obtained via
// POST /withdraw/challenge to prove ownership of walletAddress.
router.post("/withdraw", async (req, res) => {
  const { walletAddress, asset, amount, network, recipient, networkLabel, signature } = req.body ?? {};

  if (!walletAddress || !asset || !amount || !network || !recipient) {
    res.status(400).json({ error: "walletAddress, asset, amount, network, recipient are required" });
    return;
  }

  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  // Require wallet ownership proof for all external wallet types.
  if (walletAddress.startsWith("0x")) {
    // EVM wallet: verify challenge/signature round-trip
    if (!signature) {
      res.status(401).json({
        error: "signature is required for EVM wallet withdrawals. " +
               "Request a challenge via POST /withdraw/challenge, sign it with your wallet, " +
               "and include the signature in this request.",
      });
      return;
    }
    try {
      verifyWithdrawSignature(walletAddress, signature);
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }
  } else if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(walletAddress)) {
    // BSV P2PKH / P2SH wallet
    if (!signature) {
      res.status(401).json({
        error: "signature is required for BSV wallet withdrawals. " +
               "Request a challenge via POST /withdraw/challenge, sign it with your BSV wallet, " +
               "and include the base64 signature in this request.",
      });
      return;
    }
    try {
      verifyBsvWithdrawSignature(walletAddress, signature);
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }
  } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    // Solana base58 public key (32–44 chars, no version prefix)
    if (!signature) {
      res.status(401).json({
        error: "signature is required for Solana wallet withdrawals. " +
               "Request a challenge via POST /withdraw/challenge, sign it with your Solana wallet, " +
               "and include the signature in this request.",
      });
      return;
    }
    try {
      verifySolWithdrawSignature(walletAddress, signature);
    } catch (authErr: any) {
      res.status(401).json({ error: authErr.message });
      return;
    }
  } else {
    res.status(400).json({
      error: "Unsupported wallet address format. Supported: EVM (0x…), BSV (1…/3…), Solana (base58).",
    });
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
        ? `vault.withdraw() called on OrahVault at ${vaultAddr} (chainId ${vaultChain}).`
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
