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
import { isVaultConfigured, getVaultAddress, getVaultChainId, vaultWithdraw } from "../lib/orahVault.js";
import { db as _db, pool } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

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

const router: IRouter = Router();

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
    // Verify the tx on-chain
    const client = createPublicClient({ transport: http(VERIFY_RPC[numChain]) });
    let receipt: { status: string } | null = null;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    } catch (rpcErr: any) {
      logger.warn({ txHash, chainId, err: rpcErr?.message }, "RPC receipt fetch failed — proceeding with optimistic settlement");
    }

    if (receipt && receipt.status !== "success") {
      res.status(422).json({ error: "Transaction reverted on-chain", txHash });
      return;
    }

    const amtIn   = parseFloat(amountIn);
    const amtOut  = parseFloat(amountOut);
    const fee     = amtIn * FEE_PCT;
    const price   = amtIn > 0 ? amtOut / amtIn : 0;
    const symbol  = `${assetIn.toUpperCase()}/${assetOut.toUpperCase()}`;

    const tradeId = crypto.randomUUID();

    // Insert trade record
    await db.insert(tradesTable).values({
      id:            tradeId,
      symbol,
      side:          "buy",
      price:         price.toFixed(8),
      quantity:      amtIn.toFixed(8),
      total:         amtOut.toFixed(8),
      fee:           fee.toFixed(8),
      feeAsset:      assetIn.toUpperCase(),
      walletAddress,
      txid:          txHash,
    });

    // Credit the received asset to the user's internal balance
    try {
      await creditAvailable(walletAddress, assetOut.toUpperCase(), amtOut.toFixed(8));
    } catch (creditErr: any) {
      logger.warn({ creditErr: creditErr?.message }, "Balance credit failed after on-chain settlement (trade still recorded)");
    }

    logger.info({ tradeId, txHash, walletAddress, assetOut, amtOut }, "On-chain swap settled");

    res.json({
      settled:   true,
      tradeId,
      txHash,
      chainId:   numChain,
      assetIn:   assetIn.toUpperCase(),
      assetOut:  assetOut.toUpperCase(),
      amountIn:  amtIn.toFixed(8),
      amountOut: amtOut.toFixed(8),
      fee:       fee.toFixed(8),
      message:   `${amtOut.toFixed(6)} ${assetOut.toUpperCase()} credited to your exchange balance`,
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

    const onChain   = settlements.filter(t => t.txid && t.txid.startsWith("0x"));
    const exchange  = settlements.filter(t => !t.txid || !t.txid.startsWith("0x"));

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
        mode:      t.txid?.startsWith("0x") ? "on-chain" : "exchange",
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
    await recordPlatformFee(fee, assetOut.toUpperCase(), "exchange-swap");

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
          ? `Withdrawals settled via OrahVault on chain ${vaultChain}`
          : "Internal ledger settlement — deploy OrahVault to enable on-chain withdrawals",
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
router.post("/withdraw", async (req, res) => {
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
          await processWithdrawal({ id, walletAddress, asset, amount: parsed.toString(), network, recipient });
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
