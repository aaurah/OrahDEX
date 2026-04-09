import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";

const router: IRouter = Router();

// ── POST /withdrawals ─────────────────────────────────────────────────────────
// Records a withdrawal request. Debiting from the internal ledger must be
// handled separately by the caller if using an internal balance.
// For external / non-custodial wallets this is a request-only record
// (OrahDEX doesn't hold those funds).
router.post("/withdrawals", async (req, res) => {
  try {
    const { walletAddress, asset, amount, network, networkLabel, recipient, fee } = req.body;

    if (!walletAddress || !asset || !amount || !network || !recipient) {
      res.status(400).json({ error: "Missing required fields: walletAddress, asset, amount, network, recipient" });
      return;
    }

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      res.status(400).json({ error: "Amount must be a positive number" });
      return;
    }

    const id = crypto.randomUUID();

    await db.insert(withdrawalRequestsTable).values({
      id,
      walletAddress,
      asset,
      amount: parsed.toString(),
      network,
      networkLabel: networkLabel ?? network,
      recipient,
      fee: fee ?? null,
      status: "pending",
    });

    req.log.info({ id, walletAddress, asset, amount, network, recipient }, "withdrawals: request created");

    res.status(201).json({
      id,
      status: "pending",
      message: "Withdrawal request recorded. Processing is manual — funds will be sent once verified.",
      walletAddress,
      asset,
      amount: parsed,
      network,
      recipient,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "withdrawals: failed to create request");
    res.status(500).json({ error: "Failed to record withdrawal request" });
  }
});

// ── GET /withdrawals/:walletAddress ──────────────────────────────────────────
// Returns the full withdrawal history for a wallet, newest first.
router.get("/withdrawals/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const rows = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.walletAddress, walletAddress))
      .orderBy(desc(withdrawalRequestsTable.createdAt))
      .limit(100);

    res.json(rows.map(r => ({
      id:           r.id,
      asset:        r.asset,
      amount:       parseFloat(r.amount),
      network:      r.network,
      networkLabel: r.networkLabel,
      recipient:    r.recipient,
      fee:          r.fee,
      status:       r.status,
      txid:         r.txid,
      note:         r.note,
      createdAt:    r.createdAt,
      processedAt:  r.processedAt,
    })));
  } catch (err) {
    req.log.error({ err }, "withdrawals: failed to fetch history");
    res.status(500).json({ error: "Failed to fetch withdrawal history" });
  }
});

export default router;
