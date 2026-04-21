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

const router = Router();

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

    // Consider funded if ≥ 95% of expected amount (allow minor fee rounding)
    if (totalBsv >= expectedBsv * 0.95) {
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

export default router;
