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
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { or, eq } from "drizzle-orm";
import { settleSwap, getBalances, seedInitialBalances } from "../lib/ledger.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";
import { isVaultConfigured, getVaultAddress, getVaultChainId, vaultWithdraw } from "../lib/orahVault.js";
import { db as _db, pool } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import crypto from "node:crypto";
import { logger } from "../lib/logger.js";

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
    await seedInitialBalances(walletAddress);

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

    await settleSwap(walletAddress, assetIn.toUpperCase(), assetOut.toUpperCase(), amtIn, amtOut);
    await recordPlatformFee(fee, assetOut.toUpperCase(), "exchange-swap");

    const balances = await getBalances(walletAddress);

    res.json({
      mode:       "exchange",
      success:    true,
      walletAddress,
      assetIn:    assetIn.toUpperCase(),
      assetOut:   assetOut.toUpperCase(),
      amountIn:   amtIn.toFixed(8),
      amountOut:  amtOut.toFixed(8),
      fee:        fee.toFixed(8),
      feePct:     FEE_PCT * 100,
      rate:       rate.toFixed(8),
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
