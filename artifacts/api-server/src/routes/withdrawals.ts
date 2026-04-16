import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { withdrawalRequestsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";

const router: IRouter = Router();

// ── POST /withdrawals ─────────────────────────────────────────────────────────
// Creates a withdrawal request AND immediately deducts the amount from the
// user's available internal balance. If the balance is insufficient the
// request is rejected so the user cannot over-withdraw.
router.post("/withdrawals", async (req, res) => {
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
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check current available balance (lock the row for the transaction)
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
      });
      return;
    }

    // Deduct from available immediately so the balance reflects the pending withdrawal
    await client.query(
      `UPDATE user_balances
       SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [parsed.toString(), walletAddress, asset],
    );

    // Record the withdrawal request (using same client so it's in the same transaction)
    await client.query(
      `INSERT INTO withdrawal_requests
         (id, wallet_address, asset, amount, network, network_label, recipient, fee, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', now())`,
      [id, walletAddress, asset, parsed.toString(), network, networkLabel ?? network, recipient, fee ?? null],
    );

    await client.query("COMMIT");

    req.log.info({ id, walletAddress, asset, amount: parsed, network, recipient }, "withdrawals: request created and balance deducted");

    res.status(201).json({
      id,
      status: "pending",
      message: "Withdrawal request recorded. Funds will be sent on-chain to your address within 24 hours.",
      walletAddress,
      asset,
      amount: parsed,
      network,
      recipient,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "withdrawals: failed to create request");
    res.status(500).json({ error: "Failed to record withdrawal request" });
  } finally {
    client.release();
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
