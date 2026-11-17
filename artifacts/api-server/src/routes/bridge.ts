/**
 * /api/bridge — BSV HTLC bridge endpoints
 *
 * POST /api/bridge/htlc/create   — generate a new HTLC lock record
 * GET  /api/bridge/htlc/:id      — poll status + on-chain detection
 * POST /api/bridge/htlc/:id/cancel — cancel a pending lock
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { db, pool } from "@workspace/db";
import { htlcLocksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { buildHtlc } from "../lib/htlc.js";
import { logger } from "../lib/logger.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { createPublicClient, http, parseAbi, encodeFunctionData, type Address, type Hex } from "viem";
import { pushNotification } from "../lib/notifQueue.js";

const router = Router();
const CCTP_CHAINS: Record<number, { name: string; domain: number }> = {
  1:     { name: "Ethereum", domain: 0 },
  10:    { name: "Optimism", domain: 2 },
  42161: { name: "Arbitrum", domain: 3 },
  8453:  { name: "Base", domain: 6 },
  137:   { name: "Polygon", domain: 7 },
};
const VALID_EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const VALID_BSV_ADDR = /^[1-9A-HJ-NP-Za-km-z]{26,35}$/;

// ── Current BSV block height (reused from chain monitor) ──────────────────────
async function getCurrentBlockHeight(): Promise<number> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${BSV_NET.wocBase}/chain/info`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`WhatsOnChain returned ${res.status}`);
    const data = await res.json() as { blocks?: number };
    if (!Number.isSafeInteger(data.blocks) || !data.blocks || data.blocks <= 0) {
      throw new Error("WhatsOnChain returned an invalid block height");
    }
    return data.blocks;
  } catch (err) {
    logger.warn({ err }, "Could not verify BSV tip before creating HTLC");
    throw new Error("BSV chain status is unavailable. No lock was created; retry when the network is reachable.");
  }
}

// ── Check if BSV has arrived at an address via WhatsOnChain ──────────────────
async function checkHtlcFunding(address: string, expectedBsv: number): Promise<{
  funded: boolean;
  hasFunds: boolean;
  chainCheckUnavailable?: boolean;
  txid?: string;
  amountBsv?: number;
  confirmations?: number;
}> {
  try {
    // Check UTXOs at address
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(
        `${BSV_NET.wocBase}/address/${address}/unspent`,
        { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return { funded: false, hasFunds: false, chainCheckUnavailable: true };

    const utxos = await res.json() as Array<{
      tx_hash: string;
      value: number;
      height: number;
    }>;

    if (!utxos || utxos.length === 0) return { funded: false, hasFunds: false };

    const confirmedUtxos = utxos.filter(u => Number.isSafeInteger(u.height) && u.height > 0);
    if (confirmedUtxos.length === 0) return { funded: false, hasFunds: true, amountBsv: 0, confirmations: 0 };

    const totalSat = confirmedUtxos.reduce((s, u) => s + (u.value ?? 0), 0);
    const totalBsv = totalSat / 1e8;

    // Allow a small tolerance for network fees (0.1%) but reject clear under-funding
    if (totalBsv >= expectedBsv * 0.999) {
      return {
        funded: true,
        hasFunds: true,
        txid: confirmedUtxos[0].tx_hash,
        amountBsv: totalBsv,
        confirmations: 1,
      };
    }
    return {
      funded: false,
      hasFunds: true,
      txid: confirmedUtxos[0]?.tx_hash,
      amountBsv: totalBsv,
      confirmations: 1,
    };
  } catch (err: any) {
    logger.warn({ address, err: err?.message }, "HTLC funding check failed");
    return { funded: false, hasFunds: false, chainCheckUnavailable: true };
  }
}

async function creditConfirmedTestnetHtlcOnce(lockId: string, fundingTxid: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      status: string;
      amount_bsv: string;
      recipient_evm_address: string | null;
      sender_bsv_address: string | null;
    }>(
      `SELECT status, amount_bsv, recipient_evm_address, sender_bsv_address
       FROM htlc_locks WHERE id = $1 FOR UPDATE`,
      [lockId],
    );
    if (!rows.length) throw new Error("HTLC lock was not found during credit.");
    const lock = rows[0];
    if (lock.status === "complete") {
      await client.query("COMMIT");
      return null;
    }
    if (lock.status !== "funded") {
      await client.query("COMMIT");
      return null;
    }

    const creditAddr = lock.recipient_evm_address ?? lock.sender_bsv_address;
    if (!creditAddr) throw new Error("HTLC has no balance recipient.");
    const grossBsv = parseFloat(lock.amount_bsv);
    const netBsv = (grossBsv * (1 - 0.001)).toFixed(8);
    const normalizedCreditAddr = /^0x/i.test(creditAddr) ? creditAddr.toLowerCase() : creditAddr;

    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, 'BSV', $2, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + EXCLUDED.available, updated_at = now()`,
      [normalizedCreditAddr, netBsv],
    );
    const updated = await client.query(
      `UPDATE htlc_locks
       SET status = 'complete', funding_txid = COALESCE(funding_txid, $2), updated_at = now()
       WHERE id = $1 AND status = 'funded'
       RETURNING id`,
      [lockId, fundingTxid],
    );
    if (!updated.rowCount) throw new Error("HTLC status changed before credit could be committed.");
    await client.query("COMMIT");

    return { creditAddr, grossBsv, netBsv };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── POST /api/bridge/htlc/create ─────────────────────────────────────────────
router.post("/htlc/create", async (req, res) => {
  if (!BSV_NET.isTestnet) {
    res.status(503).json({
      error: "Legacy BSV HTLC bridging is disabled on mainnet until the refund path is secured. No transaction was sent.",
    });
    return;
  }

  try {
    const { amountBsv, senderBsvAddress, recipientEvmAddress, evmChainId } = req.body as {
      amountBsv?: number;
      senderBsvAddress?: string;
      recipientEvmAddress?: string;
      evmChainId?: number;
    };

    // Basic validation
    if (!amountBsv || isNaN(amountBsv) || amountBsv <= 0) {
      res.status(400).json({ error: "amountBsv must be a positive number." });
      return;
    }
    if (amountBsv > 1000) {
      res.status(400).json({ error: "Single bridge amount capped at 1,000 BSV." });
      return;
    }
    if (senderBsvAddress !== undefined && senderBsvAddress !== null && senderBsvAddress !== "") {
      if (!VALID_BSV_ADDR.test(senderBsvAddress)) {
        res.status(400).json({ error: "Invalid senderBsvAddress format. Expected a valid BSV base58 address." });
        return;
      }
    }
    if (recipientEvmAddress !== undefined && recipientEvmAddress !== null && recipientEvmAddress !== "") {
      if (!VALID_EVM_ADDR.test(recipientEvmAddress)) {
        res.status(400).json({ error: "Invalid recipientEvmAddress format. Expected 0x followed by 40 hex characters." });
        return;
      }
    }
    if (!senderBsvAddress && !recipientEvmAddress) {
      res.status(400).json({ error: "At least one of senderBsvAddress or recipientEvmAddress is required to credit the bridge deposit." });
      return;
    }

    // Get current block height to compute absolute locktime
    const currentBlock = await getCurrentBlockHeight();
    // Lock expires 144 blocks from now (~24 hours on BSV at ~1 block/min average)
    const locktimeBlocks = currentBlock + 144;

    // Build the HTLC script and P2SH address
    const htlc = buildHtlc({ locktimeBlocks });

    // Store record in DB
    const lockId = randomUUID();
    await db.insert(htlcLocksTable).values({
      id:                  lockId,
      secret:              htlc.secret,
      secretHash:          htlc.secretHash,
      htlcAddress:         htlc.htlcAddress,
      redeemScript:        htlc.redeemScript,
      amountBsv:           amountBsv.toString(),
      locktimeBlocks,
      senderBsvAddress:    senderBsvAddress ?? null,
      recipientEvmAddress: recipientEvmAddress ?? null,
      evmChainId:          evmChainId ?? 1,
      status:              "pending",
      createdAtBlock:      currentBlock,
    });

    logger.info({ lockId, htlcAddress: htlc.htlcAddress, amountBsv, locktimeBlocks }, "HTLC lock created");

    // Return everything the frontend needs to display the deposit step
    res.json({
      lockId,
      htlcAddress:     htlc.htlcAddress,
      redeemScript:    htlc.redeemScript,
      secretHash:      htlc.secretHash,
      amountBsv,
      locktimeBlocks,
      currentBlock,
      expiresInBlocks: 144,
      // estimated time: BSV targets ~1 block/min but often much faster
      expiresIn:       "~24 hours",
      explorerBase:    BSV_NET.explorer,
      status:          "pending",
      instructions: [
        `Send exactly ${amountBsv} BSV to the HTLC address below.`,
        "Testnet-only flow. Do not send real BSV.",
        "A confirmed testnet deposit may credit your OrahDEX test balance.",
        `No in-app refund or EVM mint is implemented. Test locktime: block ${locktimeBlocks}.`,
      ],
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to create HTLC lock");
    res.status(500).json({ error: "Failed to create HTLC lock. Please try again." });
  }
});

// ── GET /api/bridge/htlc/:id — poll status ───────────────────────────────────
router.get("/htlc/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Lock not found." });
      return;
    }

    const lock = rows[0];
    const lockIsTestnet = lock.htlcAddress.startsWith("2");
    if (lockIsTestnet !== BSV_NET.isTestnet) {
      res.status(409).json({ error: "This lock belongs to a different BSV network than the server is configured for." });
      return;
    }
    if (!BSV_NET.isTestnet) {
      res.status(503).json({
        error: "Legacy mainnet HTLC settlement is paused because the script does not securely bind claim and refund spends. No balance or on-chain funds were changed. Provide the lock ID or transaction ID for recovery review.",
      });
      return;
    }

    let fundingCheck: Awaited<ReturnType<typeof checkHtlcFunding>> | null = null;
    if (lock.status === "pending") {
      fundingCheck = await checkHtlcFunding(lock.htlcAddress, parseFloat(lock.amountBsv));
      if (fundingCheck.funded) {
        const fundedRows = await db.update(htlcLocksTable)
          .set({
            status:      "funded",
            fundingTxid: fundingCheck.txid ?? null,
            updatedAt:   new Date(),
          })
          .where(and(eq(htlcLocksTable.id, id), eq(htlcLocksTable.status, "pending")))
          .returning({ id: htlcLocksTable.id });

        if (fundedRows.length === 0) {
          const refreshed = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, id));
          if (refreshed.length > 0) Object.assign(lock, refreshed[0]);
        } else {
          lock.status      = "funded";
          lock.fundingTxid = fundingCheck.txid ?? null;
        }
      }
    }

    // Only confirmed testnet funds can be credited. The ledger update and lock
    // completion commit atomically so a restart cannot strand or double-credit it.
    if (lock.status === "funded") {
      fundingCheck ??= await checkHtlcFunding(lock.htlcAddress, parseFloat(lock.amountBsv));
      if (fundingCheck.funded) {
        try {
          const credited = await creditConfirmedTestnetHtlcOnce(id, fundingCheck.txid ?? lock.fundingTxid ?? null);
          if (credited) {
            lock.status = "complete";
            lock.fundingTxid = fundingCheck.txid ?? lock.fundingTxid;
            logger.info(
              { lockId: id, txid: fundingCheck.txid, creditAddr: credited.creditAddr, netBsv: credited.netBsv },
              "Bridge: confirmed testnet BSV credited atomically",
            );
            pushNotification(credited.creditAddr, {
              type: "bridge",
              title: "Testnet bridge complete",
              body: `${credited.netBsv} BSV testnet balance credited.`,
            });
          } else {
            const refreshed = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, id));
            if (refreshed.length > 0) Object.assign(lock, refreshed[0]);
          }
        } catch (e: any) {
          logger.error({ lockId: id, err: e?.message }, "Bridge: testnet credit failed; funded status retained for retry");
        }
      }
    }

    // Check locktime expiry
    if (
      lock.status === "pending" &&
      fundingCheck &&
      !fundingCheck.chainCheckUnavailable &&
      !fundingCheck.hasFunds
    ) {
      const currentBlock = await getCurrentBlockHeight();
      if (currentBlock >= lock.locktimeBlocks) {
        await db.update(htlcLocksTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(htlcLocksTable.id, id));
        lock.status = "expired";
      }
    }

    // Don't expose the secret to the client
    const { secret: _secret, redeemScript: _rs, ...safeFields } = lock;

    res.json({
      ...safeFields,
      explorerBase: BSV_NET.explorer,
      chainCheckUnavailable: Boolean(fundingCheck?.chainCheckUnavailable),
      recoveryNotice: lock.status === "minting"
        ? "This legacy lock has an ambiguous credit state. It was not credited again; reconcile the balance and transaction before taking action."
        : undefined,
      // Include redeem script (not the secret — that stays server-side)
      redeemScript: lock.redeemScript,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to get HTLC lock");
    res.status(500).json({ error: "Failed to fetch lock status." });
  }
});

// ── POST /api/bridge/htlc/:id/cancel ─────────────────────────────────────────
router.post("/htlc/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(htlcLocksTable).where(eq(htlcLocksTable.id, id));

    if (!rows.length) {
      res.status(404).json({ error: "Lock not found." });
      return;
    }
    const lock = rows[0];

    if (lock.status !== "pending") {
      res.status(400).json({ error: `Cannot cancel a lock with status '${lock.status}'.` });
      return;
    }

    res.status(409).json({
      error: "Closing a bridge request does not cancel its on-chain HTLC or refund funds. The lock status was not changed.",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to cancel HTLC lock");
    res.status(500).json({ error: "Failed to cancel lock." });
  }
});

// ── CCTP: list supported chains ───────────────────────────────────────────────
router.get("/cctp/networks", (_req, res) => {
  res.json({
    protocol: "CCTP",
    available: false,
    message: "CCTP settlement is not connected to Circle burn, attestation, or mint transactions.",
    asset: "USDC",
    chains: Object.entries(CCTP_CHAINS).map(([chainId, info]) => ({
      chainId: Number(chainId),
      name: info.name,
      domain: info.domain,
    })),
  });
});

// ── CCTP: create transfer intent (wallet-to-wallet, contract-based) ──────────
router.post("/cctp/intent", (_req, res) => {
  res.status(503).json({
    error: "CCTP transfers are disabled until real burn, attestation, and mint transactions are verified. No transfer was submitted.",
  });
});

// ── CCTP: poll transfer intent status ─────────────────────────────────────────
router.get("/cctp/intent/:id", (_req, res) => {
  res.status(503).json({
    error: "CCTP status polling is disabled because prior status updates were simulated, not settled on-chain.",
  });
});

// ── GET /api/bridge/evm-lock-info — decode a lockETH tx + return refund path ──
// Called by the HtlcLockRecovery UI so a user can recover ETH whose HTLC
// timelock expired without the counter-party locking.
router.get("/evm-lock-info", async (req, res) => {
  const { txHash, chainId: chainIdStr } = req.query as { txHash?: string; chainId?: string };

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    res.status(400).json({ error: "Provide a valid 0x transaction hash." });
    return;
  }

  const chainId = parseInt(chainIdStr ?? "1");

  // Multiple fallback RPCs tried in order until one works
  const RPC_FALLBACKS: Record<number, string[]> = {
    1: [
      process.env.ETH_RPC_URL ?? "",
      "https://ethereum.publicnode.com",
      "https://eth.llamarpc.com",
      "https://1rpc.io/eth",
    ].filter(Boolean),
    11155111: [
      process.env.SEPOLIA_RPC_URL ?? "",
      "https://ethereum-sepolia.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
      "https://rpc.sepolia.org",
      "https://1rpc.io/sepolia",
    ].filter(Boolean),
    137: [
      process.env.POLYGON_RPC_URL ?? "",
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon.publicnode.com",
    ].filter(Boolean),
    56: [
      process.env.BSC_RPC_URL ?? "",
      "https://bsc-dataseed.binance.org",
      "https://bsc.publicnode.com",
    ].filter(Boolean),
    8453: [
      process.env.BASE_RPC_URL ?? "",
      "https://mainnet.base.org",
      "https://base.publicnode.com",
      "https://1rpc.io/base",
    ].filter(Boolean),
    42161: [
      process.env.ARB_RPC_URL ?? "",
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.publicnode.com",
      "https://1rpc.io/arb",
    ].filter(Boolean),
  };
  const CONTRACT_ADDRS: Record<number, string | null> = {
    1:        process.env.EVM_HTLC_CONTRACT_ETH      ?? null,
    11155111: process.env.EVM_HTLC_CONTRACT_SEPOLIA  ?? null,
    137:      process.env.EVM_HTLC_CONTRACT_POLYGON  ?? null,
    56:       process.env.EVM_HTLC_CONTRACT_BSC      ?? null,
    8453:     process.env.EVM_HTLC_CONTRACT_BASE     ?? null,
    42161:    process.env.EVM_HTLC_CONTRACT_ARB      ?? null,
  };
  const rpcList = RPC_FALLBACKS[chainId] ?? RPC_FALLBACKS[1];

  const HTLC_ABI = parseAbi([
    "function getLock(bytes32 id) view returns (address sender, address recipient, address token, uint256 amount, bytes32 secretHash, uint256 timelockUnix, bool revealed, bool refunded)",
    "function refund(bytes32 id)",
  ]);

  try {
    // Try each RPC in sequence until we get the transaction — track which one worked
    let tx: Awaited<ReturnType<ReturnType<typeof createPublicClient>["getTransaction"]>> | null = null;
    let workingRpc = rpcList[0];
    let lastRpcError = "";
    for (const rpcUrl of rpcList) {
      try {
        const c = createPublicClient({ transport: http(rpcUrl, { timeout: 8_000 }) });
        tx = await c.getTransaction({ hash: txHash as Hex });
        if (tx) { workingRpc = rpcUrl; break; }
      } catch (e: any) {
        lastRpcError = e?.message ?? String(e);
        logger.warn({ rpcUrl, err: lastRpcError.slice(0, 80) }, "bridge: evm-lock-info RPC miss, trying next");
      }
    }
    if (!tx) {
      res.status(404).json({
        error: `Transaction not found on Ethereum mainnet. It may be very recent (wait 1–2 min) or the hash may be incorrect. (${lastRpcError.slice(0, 120)})`,
      });
      return;
    }

    const input = tx.input ?? "";
    if (!input || input.length < 10) {
      res.status(400).json({ error: "Transaction does not appear to be a contract call." });
      return;
    }

    // lockId is the first 32-byte ABI parameter (bytes 4–35 of calldata)
    // Works for both 1-param (lockETH(bytes32)) and 4-param (lockETH(bytes32,...)) variants
    const lockIdHex = input.slice(10, 74);
    if (lockIdHex.length < 64) {
      res.status(400).json({ error: "Could not extract lockId from calldata." });
      return;
    }
    const lockId = ("0x" + lockIdHex) as Hex;

    // The contract is always the tx recipient
    const contractAddress = tx.to as Address | null;
    if (!contractAddress) {
      res.status(400).json({ error: "Could not determine HTLC contract address." });
      return;
    }

    // Reuse the RPC that successfully returned the transaction
    const client = createPublicClient({ transport: http(workingRpc, { timeout: 8_000 }) });

    // Amount locked = tx.value for native-ETH locks; may be 0 for token locks
    // or contracts where the amount is stored in calldata. getLock() below
    // will correct this via lockData[3] if available.
    let lockedWei = tx.value ?? 0n;

    // Known cancel/refund selectors — try in order of likelihood
    // cancel(bytes32) = 0xc4d252f5, refund(bytes32) = 0x7249fbb6
    const CANCEL_SIGS = [
      { name: "cancel", selector: "0xc4d252f5", abi: "function cancel(bytes32 id)" },
      { name: "refund", selector: "0x7249fbb6", abi: "function refund(bytes32 id)" },
    ] as const;

    // Determine which cancel function the contract exposes by simulation
    let cancelCalldata: Hex | null = null;
    let cancelSimFailed = false;
    let cancelRevertReason = "";

    for (const sig of CANCEL_SIGS) {
      const calldata = (sig.selector + lockId.slice(2).padStart(64, "0")) as Hex;
      try {
        const gasEst = await client.estimateGas({
          to:   contractAddress,
          data: calldata,
          account: tx.from as Address,
        });
        if (gasEst > 0n) {
          cancelCalldata  = calldata;
          break;
        }
      } catch (e: any) {
        cancelRevertReason = e?.message ?? String(e);
        cancelSimFailed = true;
      }
    }

    // Try getLock for richer state info (standard 4-param HTLC ABI)
    let timelockUnixSecs: number | null = null;
    let revealed  = false;
    let refunded  = false;
    try {
      const lockData = await client.readContract({
        address:      contractAddress,
        abi:          HTLC_ABI,
        functionName: "getLock",
        args:         [lockId],
      }) as readonly [Address, Address, Address, bigint, Hex, bigint, boolean, boolean];
      timelockUnixSecs = Number(lockData[5]);
      revealed         = lockData[6];
      refunded         = lockData[7];
      // If tx.value was 0 (token lock or calldata-amount variant), use the
      // on-chain stored amount from getLock so the UI shows the real figure.
      if (lockedWei === 0n && lockData[3] > 0n) {
        lockedWei = lockData[3];
      }
    } catch {
      // Contract doesn't implement getLock — use simulation result
    }

    const amountEth = (Number(lockedWei) / 1e18).toFixed(6);
    const now        = Math.floor(Date.now() / 1000);
    const isExpired  = timelockUnixSecs !== null ? timelockUnixSecs < now : false; // unknown ≠ expired; show as active
    const canRefund  = !!cancelCalldata && !revealed && !refunded;

    if (!canRefund && cancelSimFailed) {
      // Simulation failed — lock may be gone already (already cancelled/revealed)
      // Check tx logs to confirm the lock was ever created
      const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
      const hasLog  = (receipt?.logs ?? []).some(
        l => l.address?.toLowerCase() === contractAddress.toLowerCase()
      );
      if (!hasLog) {
        res.status(400).json({ error: "This transaction does not appear to interact with the HTLC contract." });
        return;
      }
      // Log exists but cancel failed — likely already cancelled/revealed
      res.json({
        lockId, contractAddress, sender: tx.from,
        amount: lockedWei.toString(), amountEth,
        timelockUnix: timelockUnixSecs ?? 0,
        isExpired: true, revealed: true, refunded: false,
        canRefund: false,
        refundCalldata: null,
        chainId,
        note: "Lock is no longer active on the contract (already cancelled or settled).",
      });
      return;
    }

    res.json({
      lockId,
      contractAddress,
      sender:       tx.from,
      amount:       lockedWei.toString(),
      amountEth,
      timelockUnix: timelockUnixSecs ?? 0,
      isExpired,
      revealed,
      refunded,
      canRefund,
      refundCalldata: cancelCalldata,
      chainId,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, txHash }, "bridge: evm-lock-info failed");
    res.status(500).json({ error: "Failed to fetch lock info." });
  }
});

export default router;
