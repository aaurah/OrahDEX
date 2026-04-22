/**
 * deposit.ts — EVM deposit flow for OrahDEX
 *
 * GET  /deposit/address   — provision and return a user's unique deposit address
 * POST /deposit/verify    — verify an on-chain tx and credit the internal ledger
 * GET  /deposit/history   — list verified deposits for a wallet
 */

import { Router } from "express";
import { EVM_CHAINS } from "../lib/evmHtlc.js";
import {
  isDepositAlreadyCredited,
  recordVerifiedDeposit,
} from "../lib/depositAddresses.js";
import { creditAvailable } from "../lib/ledger.js";
import { pool } from "@workspace/db";
import { getOrCreateWallet } from "../lib/bsvWallet.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// ── GET /deposit/address ──────────────────────────────────────────────────────
// Provisions (or returns) the user's dedicated OrahDEX deposit address.
// The address is unique per user wallet — funds sent here are credited to the
// sender's internal ledger after verification via POST /deposit/verify.

router.get("/deposit/address", async (req, res) => {
  const walletAddress = (req.query.walletAddress as string | undefined)?.trim();

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required (must be 0x…)" });
    return;
  }

  res.status(410).json({
    error: "Exchange deposit addresses are removed. Use direct wallet-to-wallet contract settlement (HTLC/CCTP).",
  });
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
  const { walletAddress, txHash } = req.body ?? {};

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required" });
    return;
  }
  if (!txHash || !txHash.startsWith("0x")) {
    res.status(400).json({ error: "txHash is required (must be 0x…)" });
    return;
  }

  res.status(410).json({
    error: "Exchange deposit verification is removed. Use direct wallet-to-wallet contract settlement (HTLC/CCTP).",
  });
});

// ── POST /deposit/sweep-wallet ───────────────────────────────────────────────
// Credits the on-chain native balance of a custodial hot wallet to the internal
// trading ledger.  Used when the user's own wallet address has received on-chain
// funds that haven't been credited yet (i.e. the "not tradable" on-chain balance).
//
// Body: { walletAddress, chainId? }
// Uses walletAddress as the on-chain address to read, not a separate deposit addr.

router.post("/deposit/sweep-wallet", async (req, res) => {
  const { walletAddress } = req.body ?? {};

  if (!walletAddress || !walletAddress.startsWith("0x")) {
    res.status(400).json({ error: "walletAddress is required (must be 0x…)" });
    return;
  }

  res.status(410).json({
    error: "Ledger sweep is removed for non-custodial mode. Use direct wallet-to-wallet contract settlement.",
  });
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

// ── GET /deposit/bitcoin-address?network=bsv|btc|bch ─────────────────────────
// Returns the exchange deposit address for BSV (and info for BTC/BCH).
// BSV uses the platform settlement wallet; BTC/BCH returns supported: false.
router.get("/deposit/bitcoin-address", async (req, res) => {
  const network = ((req.query.network as string) ?? "bsv").toLowerCase();

  if (network !== "bsv") {
    res.json({
      network,
      supported: false,
      symbol: network.toUpperCase(),
      label: network === "btc" ? "Bitcoin" : "Bitcoin Cash",
      message: `${network.toUpperCase()} exchange deposits are coming soon. Use your personal wallet address to receive.`,
    });
    return;
  }

  try {
    const wallet = await getOrCreateWallet();
    const overrideRows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
    const address = overrideRows.length ? overrideRows[0].value : wallet.address;

    res.json({
      network:         "bsv",
      supported:       true,
      address,
      symbol:          "BSV",
      label:           "Bitcoin SV",
      minDeposit:      "0.001",
      explorerTx:      `${BSV_NET.explorer}/tx/`,
      explorerAddress: `${BSV_NET.explorer}/address/${address}`,
    });
  } catch (err) {
    req.log.error({ err }, "deposit/bitcoin-address: failed");
    res.status(500).json({ error: "Failed to load BSV deposit address" });
  }
});

// ── POST /deposit/bsv-verify ──────────────────────────────────────────────────
// Verifies a BSV on-chain transaction and credits the internal ledger.
// Body: { walletAddress, txHash }
router.post("/deposit/bsv-verify", async (req, res) => {
  const { walletAddress, txHash } = req.body ?? {};

  if (!walletAddress || !txHash) {
    res.status(400).json({ error: "walletAddress and txHash are required" });
    return;
  }

  try {
    const wallet = await getOrCreateWallet();
    const overrideRows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "bsv_settlement_address_override"));
    const depositAddress = overrideRows.length ? overrideRows[0].value : wallet.address;

    // Guard: double-credit check (use chainId=0 for BSV)
    const alreadyCredited = await isDepositAlreadyCredited(txHash, 0);
    if (alreadyCredited) {
      res.status(409).json({ error: "This transaction has already been credited" });
      return;
    }

    // Fetch tx from WhatsOnChain
    const txRes = await fetch(`${BSV_NET.wocBase}/tx/hash/${txHash}`);
    if (!txRes.ok) {
      res.status(400).json({ error: "Transaction not found on BSV chain. Please wait for confirmation and try again." });
      return;
    }

    const tx = await txRes.json() as { vout?: { value: number; scriptPubKey?: { addresses?: string[] } }[] };

    // Find output paying to deposit address
    const output = tx.vout?.find(o =>
      o.scriptPubKey?.addresses?.some(a => a.toLowerCase() === depositAddress.toLowerCase())
    );

    if (!output) {
      res.status(400).json({ error: "Transaction does not send BSV to the OrahDEX deposit address. Please ensure you sent to the correct address." });
      return;
    }

    const bsvAmount = output.value;
    if (bsvAmount < 0.001) {
      res.status(400).json({ error: `Deposit amount ${bsvAmount} BSV is below the minimum of 0.001 BSV.` });
      return;
    }

    // Record first (prevents double-credit if credit step fails), then credit
    await recordVerifiedDeposit({
      txHash,
      chainId:    0,
      userWallet: walletAddress,
      asset:      "BSV",
      amount:     String(bsvAmount),
    });
    await creditAvailable(walletAddress, "BSV", String(bsvAmount));

    req.log.info({ walletAddress, txHash, bsvAmount }, "BSV deposit credited");
    res.json({ success: true, asset: "BSV", amount: bsvAmount, txHash });
  } catch (err) {
    req.log.error({ err }, "deposit/bsv-verify: failed");
    res.status(500).json({ error: "Failed to verify BSV transaction" });
  }
});

// ── GET /deposit/altchain-address ─────────────────────────────────────────────
// Generic handler for any non-EVM, non-BSV, non-SOL chain.
// Looks up platform_settings for key `{network}_deposit_address`.
// Admins configure an address by setting e.g. `xrp_deposit_address` in platform_settings.
router.get("/deposit/altchain-address", async (req, res) => {
  const network = ((req.query.network as string | undefined) ?? "").toLowerCase().trim();
  if (!network) {
    res.status(400).json({ error: "network is required" });
    return;
  }

  // Lookup table for human-readable metadata per chain
  const CHAIN_META: Record<string, { symbol: string; label: string; minDeposit: string; explorerBase: string; addrPrefix?: string }> = {
    btc:    { symbol: "BTC",   label: "Bitcoin",           minDeposit: "0.0001",  explorerBase: "https://mempool.space",       addrPrefix: "bc1…, 1…, or 3…" },
    bch:    { symbol: "BCH",   label: "Bitcoin Cash",      minDeposit: "0.001",   explorerBase: "https://explorer.bitcoin.com/bch" },
    ltc:    { symbol: "LTC",   label: "Litecoin",          minDeposit: "0.01",    explorerBase: "https://blockchair.com/litecoin" },
    doge:   { symbol: "DOGE",  label: "Dogecoin",          minDeposit: "10",      explorerBase: "https://blockchair.com/dogecoin" },
    dash:   { symbol: "DASH",  label: "Dash",              minDeposit: "0.01",    explorerBase: "https://blockchair.com/dash" },
    zec:    { symbol: "ZEC",   label: "Zcash",             minDeposit: "0.01",    explorerBase: "https://blockchair.com/zcash" },
    xmr:    { symbol: "XMR",   label: "Monero",            minDeposit: "0.01",    explorerBase: "https://xmrchain.net" },
    xrp:    { symbol: "XRP",   label: "XRP Ledger",        minDeposit: "1",       explorerBase: "https://xrpscan.com" },
    ada:    { symbol: "ADA",   label: "Cardano",           minDeposit: "2",       explorerBase: "https://cardanoscan.io" },
    dot:    { symbol: "DOT",   label: "Polkadot",          minDeposit: "0.1",     explorerBase: "https://polkadot.subscan.io" },
    cosmos: { symbol: "ATOM",  label: "Cosmos Hub",        minDeposit: "0.1",     explorerBase: "https://www.mintscan.io/cosmos" },
    xlm:    { symbol: "XLM",   label: "Stellar",           minDeposit: "1",       explorerBase: "https://stellar.expert/explorer/public" },
    near:   { symbol: "NEAR",  label: "NEAR Protocol",     minDeposit: "0.1",     explorerBase: "https://nearblocks.io" },
    algo:   { symbol: "ALGO",  label: "Algorand",          minDeposit: "1",       explorerBase: "https://algoexplorer.io" },
    tron:   { symbol: "TRX",   label: "TRON Network",      minDeposit: "1",       explorerBase: "https://tronscan.org" },
    ton:    { symbol: "TON",   label: "The Open Network",  minDeposit: "0.1",     explorerBase: "https://tonscan.org" },
    hbar:   { symbol: "HBAR",  label: "Hedera",            minDeposit: "1",       explorerBase: "https://hashscan.io" },
    vet:    { symbol: "VET",   label: "VeChain",           minDeposit: "100",     explorerBase: "https://vechainstats.com" },
    icp:    { symbol: "ICP",   label: "Internet Computer", minDeposit: "0.01",    explorerBase: "https://dashboard.internetcomputer.org" },
    fil:    { symbol: "FIL",   label: "Filecoin",          minDeposit: "0.1",     explorerBase: "https://filfox.info" },
    sui:    { symbol: "SUI",   label: "Sui Network",       minDeposit: "0.1",     explorerBase: "https://suiscan.xyz" },
    apt:    { symbol: "APT",   label: "Aptos",             minDeposit: "0.1",     explorerBase: "https://aptoscan.com" },
    kas:    { symbol: "KAS",   label: "Kaspa",             minDeposit: "10",      explorerBase: "https://explorer.kaspa.org" },
    stx:    { symbol: "STX",   label: "Stacks",            minDeposit: "1",       explorerBase: "https://explorer.stacks.co" },
    eos:    { symbol: "EOS",   label: "EOS Network",       minDeposit: "0.1",     explorerBase: "https://bloks.io" },
    egld:   { symbol: "EGLD",  label: "MultiversX",        minDeposit: "0.01",    explorerBase: "https://explorer.multiversx.com" },
  };

  const meta = CHAIN_META[network];

  try {
    const settingKey = `${network}_deposit_address`;
    const envKey = `${network.toUpperCase()}_DEPOSIT_ADDRESS`;

    const overrideRows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, settingKey));

    const address = overrideRows.length
      ? overrideRows[0].value
      : (process.env[envKey] ?? null);

    if (!address) {
      res.json({
        network,
        supported: false,
        symbol:  meta?.symbol ?? network.toUpperCase(),
        label:   meta?.label  ?? network.toUpperCase(),
        message: `${meta?.symbol ?? network.toUpperCase()} exchange deposits are being set up. Please check back soon or contact support.`,
      });
      return;
    }

    res.json({
      network,
      supported:       true,
      address,
      symbol:          meta?.symbol     ?? network.toUpperCase(),
      label:           meta?.label      ?? network.toUpperCase(),
      minDeposit:      meta?.minDeposit ?? "0",
      explorerAddress: meta?.explorerBase ? `${meta.explorerBase}/address/${address}` : null,
    });
  } catch (err) {
    req.log.error({ err }, `deposit/altchain-address (${network}): failed`);
    res.status(500).json({ error: "Failed to load deposit address" });
  }
});

// ── GET /deposit/solana-address ───────────────────────────────────────────────
// Returns the platform's Solana deposit address (from platform_settings or env).
router.get("/deposit/solana-address", async (req, res) => {
  try {
    const overrideRows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "solana_deposit_address"));

    const address = overrideRows.length
      ? overrideRows[0].value
      : (process.env.SOLANA_DEPOSIT_ADDRESS ?? null);

    if (!address) {
      res.json({
        network:   "sol",
        supported: false,
        symbol:    "SOL",
        message:   "Solana exchange deposits are being configured. Please check back soon.",
      });
      return;
    }

    res.json({
      network:         "sol",
      supported:       true,
      address,
      symbol:          "SOL",
      label:           "Solana",
      minDeposit:      "0.01",
      explorerTx:      "https://solscan.io/tx/",
      explorerAddress: `https://solscan.io/account/${address}`,
    });
  } catch (err) {
    req.log.error({ err }, "deposit/solana-address: failed");
    res.status(500).json({ error: "Failed to load Solana deposit address" });
  }
});

// ── POST /deposit/solana-verify ───────────────────────────────────────────────
// Verifies a Solana transaction signature and credits the internal ledger.
// Body: { walletAddress, txHash (Solana signature) }
router.post("/deposit/solana-verify", async (req, res) => {
  const { walletAddress, txHash } = req.body ?? {};

  if (!walletAddress || !txHash) {
    res.status(400).json({ error: "walletAddress and txHash are required" });
    return;
  }

  // Basic Solana signature format check (base58, ~87-88 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(txHash.trim())) {
    res.status(400).json({ error: "Invalid Solana transaction signature format" });
    return;
  }

  try {
    // Get deposit address
    const overrideRows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "solana_deposit_address"));

    const depositAddress = overrideRows.length
      ? overrideRows[0].value
      : (process.env.SOLANA_DEPOSIT_ADDRESS ?? null);

    if (!depositAddress) {
      res.status(503).json({ error: "Solana deposits are not yet configured. Please contact support." });
      return;
    }

    // Guard: double-credit (chainId = -1 for Solana)
    const alreadyCredited = await isDepositAlreadyCredited(txHash.trim(), -1);
    if (alreadyCredited) {
      res.status(409).json({ error: "This transaction has already been credited" });
      return;
    }

    // Fetch tx from Solana mainnet RPC
    const rpcRes = await fetch("https://api.mainnet-beta.solana.com", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          txHash.trim(),
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });

    if (!rpcRes.ok) {
      res.status(400).json({ error: "Could not reach Solana network. Please try again." });
      return;
    }

    const rpcData = await rpcRes.json() as {
      result?: {
        meta?: { err: unknown; preBalances: number[]; postBalances: number[] };
        transaction?: { message?: { accountKeys?: { pubkey: string; signer: boolean }[] } };
      };
    };

    const tx = rpcData.result;
    if (!tx) {
      res.status(400).json({ error: "Transaction not found on Solana. Please wait for confirmation and try again." });
      return;
    }

    if (tx.meta?.err) {
      res.status(400).json({ error: "Transaction failed on-chain and cannot be credited." });
      return;
    }

    // Find deposit address index in account keys
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const depIdx = accountKeys.findIndex(
      k => k.pubkey.toLowerCase() === depositAddress.toLowerCase()
    );

    if (depIdx === -1) {
      res.status(400).json({ error: "Transaction does not send SOL to the OrahDEX deposit address. Please ensure you sent to the correct address." });
      return;
    }

    const pre  = tx.meta?.preBalances?.[depIdx]  ?? 0;
    const post = tx.meta?.postBalances?.[depIdx] ?? 0;
    const lamports = post - pre;

    if (lamports <= 0) {
      res.status(400).json({ error: "No SOL received at the deposit address in this transaction." });
      return;
    }

    const solAmount = lamports / 1e9; // lamports → SOL

    if (solAmount < 0.01) {
      res.status(400).json({ error: `Deposit amount ${solAmount.toFixed(6)} SOL is below the minimum of 0.01 SOL.` });
      return;
    }

    // Record first (prevents double-credit if credit step fails), then credit
    await recordVerifiedDeposit({
      txHash:     txHash.trim(),
      chainId:    -1,
      userWallet: walletAddress,
      asset:      "SOL",
      amount:     String(solAmount),
    });
    await creditAvailable(walletAddress, "SOL", String(solAmount));

    req.log.info({ walletAddress, txHash, solAmount }, "SOL deposit credited");
    res.json({ success: true, asset: "SOL", amount: solAmount, txHash });
  } catch (err) {
    req.log.error({ err }, "deposit/solana-verify: failed");
    res.status(500).json({ error: "Failed to verify Solana transaction" });
  }
});

export default router;
