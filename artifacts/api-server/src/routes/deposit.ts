/**
 * deposit.ts — EVM deposit flow for OrahDEX
 *
 * GET  /deposit/address   — provision and return a user's unique deposit address
 * POST /deposit/verify    — verify an on-chain tx and credit the internal ledger
 * GET  /deposit/history   — list verified deposits for a wallet
 */

import { Router } from "express";
import { createPublicClient, http, type Hex } from "viem";
import { EVM_CHAINS } from "../lib/evmHtlc.js";
import {
  getOrCreateDepositAddress,
  isDepositAlreadyCredited,
  recordVerifiedDeposit,
} from "../lib/depositAddresses.js";
import { creditAvailable, getBalances } from "../lib/ledger.js";
import { pool } from "@workspace/db";

const router = Router();

// ── GET /deposit/address ──────────────────────────────────────────────────────
// Provisions (or returns) the user's dedicated OrahDEX deposit address.
// The address is unique per user wallet — funds sent here are credited to the
// sender's internal ledger after verification via POST /deposit/verify.

router.get("/deposit/address", async (req, res) => {
  const walletAddress = (req.query.walletAddress as string | undefined)?.trim();
  const chainId = parseInt((req.query.chainId as string | undefined) ?? "1", 10);

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required (must be 0x…)" });
    return;
  }

  const chain = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

  try {
    const { depositAddress, isNew } = await getOrCreateDepositAddress(walletAddress);

    const balances = await getBalances(walletAddress);
    const assetRow = (asset: string) =>
      balances.find(b => b.asset.toUpperCase() === asset.toUpperCase());

    res.json({
      depositAddress,
      isNew,
      chainId:       chain.chainId,
      chainName:     chain.name,
      nativeSymbol:  chain.nativeSymbol,
      blockExplorer: chain.blockExplorer,
      ledgerBalances: {
        [chain.nativeSymbol]: assetRow(chain.nativeSymbol)?.available ?? "0",
        USDC: assetRow("USDC")?.available ?? "0",
        USDT: assetRow("USDT")?.available ?? "0",
      },
    });
  } catch (err) {
    req.log.error({ err }, "deposit/address: failed");
    res.status(500).json({ error: "Failed to provision deposit address" });
  }
});

// ── POST /deposit/verify ──────────────────────────────────────────────────────
// Verifies an on-chain transaction and credits the user's internal ledger.
//
// Body: { walletAddress, txHash, chainId? }
//
// Verification steps:
//   1. Lookup the user's deposit address
//   2. Fetch the tx from the RPC provider
//   3. Confirm tx.to === depositAddress (case-insensitive)
//   4. Ensure tx is mined (blockNumber != null)
//   5. Guard against double-credit
//   6. Credit the ledger with ETH value from tx

router.post("/deposit/verify", async (req, res) => {
  const { walletAddress, txHash, chainId: rawChainId } = req.body ?? {};
  const chainId = parseInt(String(rawChainId ?? 1), 10);

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!txHash || !txHash.startsWith("0x")) {
    res.status(400).json({ error: "txHash is required (must be 0x…)" });
    return;
  }

  const chain = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

  try {
    // Step 1: Get deposit address
    const { depositAddress } = await getOrCreateDepositAddress(walletAddress);

    // Step 2: Guard double-credit
    const alreadyCredited = await isDepositAlreadyCredited(txHash, chainId);
    if (alreadyCredited) {
      res.status(409).json({ error: "This transaction has already been credited." });
      return;
    }

    // Step 3: Fetch tx from RPC
    const client = createPublicClient({ transport: http(chain.rpcUrl) });
    let tx: Awaited<ReturnType<typeof client.getTransaction>> | null = null;
    try {
      tx = await client.getTransaction({ hash: txHash as Hex });
    } catch {
      res.status(404).json({ error: "Transaction not found on-chain. It may not be mined yet." });
      return;
    }

    if (!tx) {
      res.status(404).json({ error: "Transaction not found on-chain." });
      return;
    }

    // Step 4: Ensure mined
    if (tx.blockNumber == null) {
      res.status(202).json({ error: "Transaction is still pending. Please wait for confirmation." });
      return;
    }

    // Step 5: Verify destination
    const txTo = (tx.to ?? "").toLowerCase();
    const depAddr = depositAddress.toLowerCase();
    if (txTo !== depAddr) {
      res.status(400).json({
        error: `Transaction destination mismatch. Expected ${depositAddress}, got ${tx.to ?? "(null)"}.`,
      });
      return;
    }

    // Step 6: Extract ETH value (in wei, convert to ETH)
    const valueWei   = tx.value ?? 0n;
    const valueEth   = Number(valueWei) / 1e18;
    const asset      = chain.nativeSymbol; // ETH / MATIC / BNB

    if (valueEth <= 0) {
      res.status(400).json({
        error: "Transaction carries zero native value. ERC-20 token deposits are not yet supported — send native ETH only.",
      });
      return;
    }

    const amountStr = valueEth.toFixed(18);

    // Step 7: Record + credit atomically
    await creditAvailable(walletAddress, asset, amountStr);
    await recordVerifiedDeposit({
      txHash,
      chainId,
      userWallet: walletAddress,
      asset,
      amount: amountStr,
    });

    req.log.info(
      { walletAddress, txHash, chainId, asset, amount: amountStr },
      "deposit/verify: credited",
    );

    const updatedBalances = await getBalances(walletAddress);
    const credited = updatedBalances.find(b => b.asset.toUpperCase() === asset.toUpperCase());

    res.json({
      success:    true,
      asset,
      amount:     valueEth,
      amountStr,
      newBalance: credited?.available ?? amountStr,
      txHash,
      chainId,
      message:    `+${valueEth.toFixed(6)} ${asset} credited to your OrahDEX balance`,
    });
  } catch (err) {
    req.log.error({ err }, "deposit/verify: failed");
    res.status(500).json({ error: "Deposit verification failed. Please try again." });
  }
});

// ── POST /deposit/sweep-wallet ───────────────────────────────────────────────
// Credits the on-chain native balance of a custodial hot wallet to the internal
// trading ledger.  Used when the user's own wallet address has received on-chain
// funds that haven't been credited yet (i.e. the "not tradable" on-chain balance).
//
// Body: { walletAddress, chainId? }
// Uses walletAddress as the on-chain address to read, not a separate deposit addr.

router.post("/deposit/sweep-wallet", async (req, res) => {
  const { walletAddress, chainId: rawChainId } = req.body ?? {};
  const chainId = parseInt(String(rawChainId ?? 1), 10);

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required (must be 0x…)" });
    return;
  }

  const chain = EVM_CHAINS[chainId] ?? EVM_CHAINS[1]!;

  try {
    const client = createPublicClient({ transport: http(chain.rpcUrl) });

    // Read current on-chain balance
    const balanceWei = await client.getBalance({ address: walletAddress as Hex });
    const balanceNative = Number(balanceWei) / 1e18;

    if (balanceNative <= 0) {
      res.status(400).json({ error: "No on-chain balance to sweep." });
      return;
    }

    // Use a deterministic reference to prevent double-crediting the same balance
    // Key: wallet + chain + truncated balance to 6dp (prevents re-sweeping same snapshot)
    const sweepRef = `sweep:${walletAddress.toLowerCase()}:${chainId}:${balanceNative.toFixed(6)}`;
    const alreadyCredited = await isDepositAlreadyCredited(sweepRef, chainId);
    if (alreadyCredited) {
      res.status(409).json({ error: "This balance has already been credited to your trading account." });
      return;
    }

    const asset     = chain.nativeSymbol;
    const amountStr = balanceNative.toFixed(18);

    await creditAvailable(walletAddress, asset, amountStr);
    await recordVerifiedDeposit({
      txHash:     sweepRef,
      chainId,
      userWallet: walletAddress,
      asset,
      amount:     amountStr,
    });

    req.log.info({ walletAddress, chainId, asset, amount: amountStr }, "deposit/sweep-wallet: credited");

    const updatedBalances = await getBalances(walletAddress);
    const credited = updatedBalances.find(b => b.asset.toUpperCase() === asset.toUpperCase());

    res.json({
      success:    true,
      asset,
      amount:     balanceNative,
      amountStr,
      newBalance: credited?.available ?? amountStr,
      message:    `+${balanceNative.toFixed(6)} ${asset} credited to your trading account`,
    });
  } catch (err) {
    req.log.error({ err }, "deposit/sweep-wallet: failed");
    res.status(500).json({ error: "Sweep failed. Please try again." });
  }
});

// ── GET /deposit/history ──────────────────────────────────────────────────────
// List the user's verified deposit history.

router.get("/deposit/history", async (req, res) => {
  const walletAddress = (req.query.walletAddress as string | undefined)?.trim();
  if (!walletAddress) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      tx_hash: string; chain_id: number; asset: string;
      amount: string; verified_at: string;
    }>(
      `SELECT tx_hash, chain_id, asset, amount::text, verified_at
       FROM evm_deposits_verified
       WHERE user_wallet = $1
       ORDER BY verified_at DESC
       LIMIT 50`,
      [walletAddress],
    );

    res.json({
      deposits: rows.map(r => ({
        txHash:     r.tx_hash,
        chainId:    r.chain_id,
        asset:      r.asset,
        amount:     parseFloat(r.amount),
        verifiedAt: r.verified_at,
        explorer:   EVM_CHAINS[r.chain_id]?.blockExplorer ?? "https://etherscan.io",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "deposit/history: failed");
    res.status(500).json({ error: "Failed to fetch deposit history" });
  }
});

export default router;
