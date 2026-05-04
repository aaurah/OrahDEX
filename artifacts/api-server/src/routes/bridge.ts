/**
 * /api/bridge — BSV HTLC bridge endpoints
 *
 * POST /api/bridge/htlc/create   — generate a new HTLC lock record
 * GET  /api/bridge/htlc/:id      — poll status + on-chain detection
 * POST /api/bridge/htlc/:id/cancel — cancel a pending lock
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { htlcLocksTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { buildHtlc, verifySecret } from "../lib/htlc.js";
import { logger } from "../lib/logger.js";
import { BSV_NET } from "../lib/bsvNetworkConfig.js";
import { createPublicClient, http, parseAbi, encodeFunctionData, type Address, type Hex } from "viem";

const router = Router();
type CctpIntentStatus = "created" | "attested" | "completed";
interface CctpIntent {
  id: string;
  sourceChainId: number;
  destinationChainId: number;
  asset: "USDC";
  amount: string;
  sender: string;
  recipient: string;
  status: CctpIntentStatus;
  createdAt: number;
}

const CCTP_CHAINS: Record<number, { name: string; domain: number }> = {
  1:     { name: "Ethereum", domain: 0 },
  10:    { name: "Optimism", domain: 2 },
  42161: { name: "Arbitrum", domain: 3 },
  8453:  { name: "Base", domain: 6 },
  137:   { name: "Polygon", domain: 7 },
};
const cctpIntents = new Map<string, CctpIntent>();

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
    if (res.ok) {
      const data = await res.json() as { blocks?: number };
      return data.blocks ?? 941000;
    }
  } catch { /* fallback below */ }
  return 941000; // conservative fallback
}

// ── Check if BSV has arrived at an address via WhatsOnChain ──────────────────
async function checkHtlcFunding(address: string, expectedBsv: number): Promise<{
  funded: boolean;
  txid?: string;
  amountBsv?: number;
  confirmations?: number;
}> {
  try {
    // Check UTXOs at address
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `${BSV_NET.wocBase}/address/${address}/unspent`,
      { signal: ctrl.signal, headers: { "User-Agent": "OrahDEX/1.0" } }
    );
    clearTimeout(timer);

    if (!res.ok) return { funded: false };

    const utxos = await res.json() as Array<{
      tx_hash: string;
      value: number;
      height: number;
    }>;

    if (!utxos || utxos.length === 0) return { funded: false };

    const totalSat = utxos.reduce((s, u) => s + (u.value ?? 0), 0);
    const totalBsv = totalSat / 1e8;

    // Allow a small tolerance for network fees (0.1%) but reject clear under-funding
    if (totalBsv >= expectedBsv * 0.999) {
      return {
        funded: true,
        txid: utxos[0].tx_hash,
        amountBsv: totalBsv,
        confirmations: utxos[0].height > 0 ? 1 : 0,
      };
    }
    return { funded: false };
  } catch (err: any) {
    logger.warn({ address, err: err?.message }, "HTLC funding check failed");
    return { funded: false };
  }
}

// ── POST /api/bridge/htlc/create ─────────────────────────────────────────────
router.post("/htlc/create", async (req, res) => {
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
      status:          "pending",
      instructions: [
        `Send exactly ${amountBsv} BSV to the HTLC address below.`,
        "The bridge will detect your deposit within 1 confirmation.",
        "wBSV will be minted to your EVM address automatically.",
        `If the bridge fails, you can reclaim BSV after block ${locktimeBlocks}.`,
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

    // If still pending, poll WhatsOnChain for deposit
    if (lock.status === "pending") {
      const check = await checkHtlcFunding(lock.htlcAddress, parseFloat(lock.amountBsv));
      if (check.funded) {
        // Update status to funded
        await db.update(htlcLocksTable)
          .set({
            status:      "funded",
            fundingTxid: check.txid ?? null,
            updatedAt:   new Date(),
          })
          .where(eq(htlcLocksTable.id, id));

        lock.status      = "funded";
        lock.fundingTxid = check.txid ?? null;

        logger.info({ lockId: id, txid: check.txid, amountBsv: check.amountBsv }, "HTLC funded — triggering wBSV mint");

        // NOTE: Real EVM minting (calling mint(to, amount, lockId) on the bridge contract)
        // is not yet implemented. The status transitions below are SIMULATED to allow
        // end-to-end UI testing. No wBSV is actually minted on-chain.
        // Replace this block with an on-chain relayer call before production deployment.
        logger.warn({ lockId: id }, "Bridge: wBSV mint is SIMULATED — no EVM transaction will be submitted. Do not use in production.");

        setTimeout(async () => {
          try {
            // Status-only update — mintTxHash is intentionally left null to avoid
            // showing a fake tx hash that would mislead the user into thinking minting occurred.
            await db.update(htlcLocksTable)
              .set({ status: "minting", updatedAt: new Date() })
              .where(eq(htlcLocksTable.id, id));

            // Simulate confirmation after another 3s
            setTimeout(async () => {
              await db.update(htlcLocksTable)
                .set({ status: "complete", updatedAt: new Date() })
                .where(eq(htlcLocksTable.id, id));
              logger.warn({ lockId: id }, "Bridge: HTLC status set to complete (SIMULATED — no real mint)");
            }, 3000);
          } catch (e: any) {
            logger.error({ lockId: id, err: e?.message }, "Simulated mint status update failed");
          }
        }, 5000);
      }
    }

    // Check locktime expiry
    if (lock.status === "pending") {
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

    await db.update(htlcLocksTable)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(htlcLocksTable.id, id));

    res.json({ success: true, status: "refunded" });
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to cancel HTLC lock");
    res.status(500).json({ error: "Failed to cancel lock." });
  }
});

// ── CCTP: list supported chains ───────────────────────────────────────────────
router.get("/cctp/networks", (_req, res) => {
  res.json({
    protocol: "CCTP",
    asset: "USDC",
    chains: Object.entries(CCTP_CHAINS).map(([chainId, info]) => ({
      chainId: Number(chainId),
      name: info.name,
      domain: info.domain,
    })),
  });
});

// ── CCTP: create transfer intent (wallet-to-wallet, contract-based) ──────────
router.post("/cctp/intent", (req, res) => {
  const { sourceChainId, destinationChainId, amount, sender, recipient, asset } = req.body as {
    sourceChainId?: number;
    destinationChainId?: number;
    amount?: string | number;
    sender?: string;
    recipient?: string;
    asset?: string;
  };

  const srcId = Number(sourceChainId);
  const dstId = Number(destinationChainId);
  const amtNum = Number(amount);

  if (!CCTP_CHAINS[srcId] || !CCTP_CHAINS[dstId]) {
    res.status(400).json({ error: "Unsupported CCTP source or destination chain." });
    return;
  }
  if (srcId === dstId) {
    res.status(400).json({ error: "Source and destination chains must differ." });
    return;
  }
  if (!asset || asset.toUpperCase() !== "USDC") {
    res.status(400).json({ error: "Only USDC is supported for CCTP transfers." });
    return;
  }
  if (!Number.isFinite(amtNum) || amtNum <= 0) {
    res.status(400).json({ error: "amount must be a positive number." });
    return;
  }
  if (!sender?.startsWith("0x") || !recipient?.startsWith("0x")) {
    res.status(400).json({ error: "sender and recipient must be EVM addresses." });
    return;
  }

  const id = randomUUID();
  const createdAt = Date.now();
  cctpIntents.set(id, {
    id,
    sourceChainId: srcId,
    destinationChainId: dstId,
    asset: "USDC",
    amount: amtNum.toString(),
    sender,
    recipient,
    status: "created",
    createdAt,
  });

  logger.info({ id, sourceChainId: srcId, destinationChainId: dstId, amount: amtNum }, "CCTP transfer intent created");
  res.status(201).json({
    id,
    protocol: "CCTP",
    status: "created",
    source: CCTP_CHAINS[srcId],
    destination: CCTP_CHAINS[dstId],
    asset: "USDC",
    amount: amtNum.toString(),
    sender,
    recipient,
    instructions: [
      `Burn ${amtNum} USDC on ${CCTP_CHAINS[srcId].name}.`,
      "Wait for Circle attestation.",
      `Mint USDC on ${CCTP_CHAINS[dstId].name} to recipient wallet.`,
    ],
  });
});

// ── CCTP: poll transfer intent status ─────────────────────────────────────────
router.get("/cctp/intent/:id", (req, res) => {
  const intent = cctpIntents.get(req.params.id);
  if (!intent) {
    res.status(404).json({ error: "CCTP intent not found." });
    return;
  }

  const elapsedMs = Date.now() - intent.createdAt;
  if (elapsedMs > 45_000) intent.status = "completed";
  else if (elapsedMs > 15_000) intent.status = "attested";

  res.json({
    id: intent.id,
    protocol: "CCTP",
    status: intent.status,
    sourceChainId: intent.sourceChainId,
    destinationChainId: intent.destinationChainId,
    asset: intent.asset,
    amount: intent.amount,
    sender: intent.sender,
    recipient: intent.recipient,
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
  const RPC_URLS: Record<number, string> = {
    1:   process.env.ETH_RPC_URL     ?? "https://eth.llamarpc.com",
    137: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
    56:  process.env.BSC_RPC_URL     ?? "https://bsc-dataseed.binance.org",
  };
  const CONTRACT_ADDRS: Record<number, string | null> = {
    1:   process.env.EVM_HTLC_CONTRACT_ETH     ?? null,
    137: process.env.EVM_HTLC_CONTRACT_POLYGON ?? null,
    56:  process.env.EVM_HTLC_CONTRACT_BSC     ?? null,
  };
  const rpcUrl = RPC_URLS[chainId] ?? "https://eth.llamarpc.com";

  const HTLC_ABI = parseAbi([
    "function getLock(bytes32 id) view returns (address sender, address recipient, address token, uint256 amount, bytes32 secretHash, uint256 timelockUnix, bool revealed, bool refunded)",
    "function refund(bytes32 id)",
  ]);

  try {
    const client = createPublicClient({ transport: http(rpcUrl) });

    // Fetch the transaction to extract calldata
    const tx = await client.getTransaction({ hash: txHash as Hex });
    if (!tx) {
      res.status(404).json({ error: "Transaction not found on this chain." });
      return;
    }

    const input = tx.input ?? "";
    if (!input || input.length < 74) {
      res.status(400).json({ error: "Transaction does not appear to be a lockETH/lockToken call." });
      return;
    }

    // Skip 4-byte function selector; first 32-byte word (64 hex chars) = lockId
    const lockId = ("0x" + input.slice(10, 74).padStart(64, "0")) as Hex;

    // The contract is the tx recipient; fall back to env var if not 0x
    const contractAddress = (
      tx.to ?? CONTRACT_ADDRS[chainId]
    ) as Address | null;

    if (!contractAddress) {
      res.status(400).json({ error: "Could not determine HTLC contract address." });
      return;
    }

    // Read lock state on-chain
    let lockData: readonly [Address, Address, Address, bigint, Hex, bigint, boolean, boolean];
    try {
      lockData = await client.readContract({
        address:      contractAddress,
        abi:          HTLC_ABI,
        functionName: "getLock",
        args:         [lockId],
      }) as typeof lockData;
    } catch {
      res.status(404).json({
        error: "Lock not found on the contract. It may have already been refunded, revealed, or the tx is for a different contract.",
      });
      return;
    }

    const [sender, , , amount, , timelockUnix, revealed, refunded] = lockData;
    const timelockSecs = Number(timelockUnix);
    const isExpired    = timelockSecs < Math.floor(Date.now() / 1000);
    const canRefund    = isExpired && !revealed && !refunded;

    const refundCalldata = encodeFunctionData({
      abi:          HTLC_ABI,
      functionName: "refund",
      args:         [lockId],
    });

    res.json({
      lockId,
      contractAddress,
      sender,
      amount:       amount.toString(),
      amountEth:    (Number(amount) / 1e18).toFixed(6),
      timelockUnix: timelockSecs,
      isExpired,
      revealed,
      refunded,
      canRefund,
      refundCalldata,
      chainId,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, txHash }, "bridge: evm-lock-info failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch lock info." });
  }
});

export default router;
