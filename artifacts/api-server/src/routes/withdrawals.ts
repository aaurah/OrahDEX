import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { withdrawalRequestsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "node:crypto";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { processWithdrawal } from "../lib/withdrawalProcessor.js";

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

    // ── Attempt immediate on-chain processing ─────────────────────────────────
    // Run async so the HTTP response is fast. Errors are caught internally and
    // leave the request in "pending" for admin fallback.
    setImmediate(async () => {
      try {
        const result = await processWithdrawal({ asset, amount: parsed, network, recipient });

        if (result.status === "completed" && result.txid) {
          await pool.query(
            `UPDATE withdrawal_requests
             SET status = 'completed', txid = $1, note = $2, processed_at = now()
             WHERE id = $3`,
            [result.txid, result.explorer ?? null, id],
          );
          req.log.info({ id, txid: result.txid }, "withdrawals: auto-processed on-chain");
        } else if (result.note) {
          await pool.query(
            `UPDATE withdrawal_requests SET note = $1 WHERE id = $2`,
            [result.note, id],
          );
        }
      } catch (autoErr) {
        req.log.warn({ autoErr, id }, "withdrawals: auto-processing error (staying pending)");
      }
    });

    res.status(201).json({
      id,
      status: "pending",
      message: "Withdrawal submitted — processing on-chain now. Check withdrawal history for live status.",
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

// ── GET /admin/withdrawals ────────────────────────────────────────────────────
// Returns ALL withdrawal requests for the admin panel, newest first.
router.get("/admin/withdrawals", requireAdminToken, async (req, res) => {
  try {
    const { rows } = await pool.query<{
      id: string; wallet_address: string; asset: string; amount: string;
      network: string; network_label: string | null; recipient: string;
      fee: string | null; status: string; txid: string | null;
      note: string | null; created_at: Date; processed_at: Date | null;
    }>(
      `SELECT * FROM withdrawal_requests ORDER BY created_at DESC LIMIT 500`,
    );

    res.json(rows.map(r => ({
      id:           r.id,
      walletAddress: r.wallet_address,
      asset:        r.asset,
      amount:       parseFloat(r.amount),
      network:      r.network,
      networkLabel: r.network_label,
      recipient:    r.recipient,
      fee:          r.fee,
      status:       r.status,
      txid:         r.txid,
      note:         r.note,
      createdAt:    r.created_at,
      processedAt:  r.processed_at,
    })));
  } catch (err) {
    req.log.error({ err }, "admin/withdrawals: failed to fetch all");
    res.status(500).json({ error: "Failed to fetch withdrawal requests" });
  }
});

// ── PATCH /withdrawals/:id ────────────────────────────────────────────────────
// Admin action: update status to 'cancelled' (refunds balance), 'processing',
// or 'completed' (with optional txid).
router.patch("/withdrawals/:id", requireAdminToken, async (req, res) => {
  const { id } = req.params;
  const { status, txid, note } = req.body as { status: string; txid?: string; note?: string };

  const VALID = ["cancelled", "processing", "completed"];
  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch the current withdrawal request (lock for update)
    const { rows } = await client.query<{
      id: string; wallet_address: string; asset: string; amount: string; status: string;
    }>(
      `SELECT id, wallet_address, asset, amount, status
       FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Withdrawal request not found" });
      return;
    }

    const wr = rows[0];

    if (wr.status === status) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Request is already ${status}` });
      return;
    }

    if (wr.status === "completed" || wr.status === "cancelled") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Cannot change a ${wr.status} request` });
      return;
    }

    // If cancelling — refund the deducted balance back to the user
    if (status === "cancelled") {
      await client.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, updated_at)
         VALUES ($1::varchar, $2::varchar, $3::numeric, now())
         ON CONFLICT (wallet_address, asset_symbol)
         DO UPDATE SET available = user_balances.available + EXCLUDED.available,
                       updated_at = now()`,
        [wr.wallet_address, wr.asset, wr.amount],
      );
    }

    await client.query(
      `UPDATE withdrawal_requests
       SET status = $1::varchar,
           txid = COALESCE($2::varchar, txid),
           note = COALESCE($3::text, note),
           processed_at = CASE WHEN $1::varchar IN ('completed','cancelled') THEN now() ELSE processed_at END
       WHERE id = $4::varchar`,
      [status, txid ?? null, note ?? null, id],
    );

    await client.query("COMMIT");

    req.log.info({ id, status, walletAddress: wr.wallet_address, asset: wr.asset }, "withdrawals: status updated");

    // ── Sync status back to bot_withdrawal_history if this was a platform bot withdrawal ──
    if (wr.wallet_address === "platform_bot" && (status === "completed" || status === "cancelled")) {
      try {
        const historyRows = await db.select()
          .from(platformSettingsTable)
          .where(eq(platformSettingsTable.key, "bot_withdrawal_history"));
        const history: any[] = historyRows[0]?.value ? JSON.parse(historyRows[0].value) : [];
        const idx = history.findIndex((h: any) => h.id === id);
        if (idx !== -1) {
          history[idx].status = status === "completed" ? "completed" : "cancelled";
          if (txid && status === "completed") history[idx].txid = txid;
          await db.insert(platformSettingsTable)
            .values({ key: "bot_withdrawal_history", value: JSON.stringify(history) })
            .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: JSON.stringify(history), updatedAt: new Date() } });
        }
      } catch (syncErr) {
        req.log.warn({ syncErr }, "withdrawals: failed to sync status to bot_withdrawal_history (non-fatal)");
      }
    }

    res.json({ id, status, txid: txid ?? null, message: `Withdrawal ${status}` });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "withdrawals: failed to update status");
    res.status(500).json({ error: "Failed to update withdrawal status" });
  } finally {
    client.release();
  }
});

// ── POST /admin/balance-adjust ────────────────────────────────────────────────
// Admin: manually credit or deduct a user's internal balance for a given asset.
router.post("/admin/balance-adjust", requireAdminToken, async (req, res) => {
  const { walletAddress, asset, amount, type, reason } = req.body as {
    walletAddress: string; asset: string; amount: string; type: "credit" | "deduct"; reason?: string;
  };

  if (!walletAddress || !asset || !amount || !type) {
    res.status(400).json({ error: "walletAddress, asset, amount, type are required" });
    return;
  }
  if (!["credit", "deduct"].includes(type)) {
    res.status(400).json({ error: "type must be 'credit' or 'deduct'" });
    return;
  }
  const parsed = parseFloat(amount);
  if (isNaN(parsed) || parsed <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (type === "deduct") {
      const { rows } = await client.query<{ available: string }>(
        `SELECT available FROM user_balances WHERE wallet_address = $1::varchar AND asset_symbol = $2::varchar FOR UPDATE`,
        [walletAddress, asset],
      );
      const available = parseFloat(rows[0]?.available ?? "0");
      if (available < parsed) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Insufficient balance: ${available} ${asset} available` });
        return;
      }
      await client.query(
        `UPDATE user_balances SET available = available - $1::numeric, updated_at = now()
         WHERE wallet_address = $2::varchar AND asset_symbol = $3::varchar`,
        [parsed.toString(), walletAddress, asset],
      );
    } else {
      await client.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, updated_at)
         VALUES ($1::varchar, $2::varchar, $3::numeric, now())
         ON CONFLICT (wallet_address, asset_symbol)
         DO UPDATE SET available = user_balances.available + EXCLUDED.available, updated_at = now()`,
        [walletAddress, asset, parsed.toString()],
      );
    }

    await client.query("COMMIT");
    req.log.info({ walletAddress, asset, amount: parsed, type, reason }, "admin: manual balance adjustment");
    res.json({ success: true, walletAddress, asset, amount: parsed, type });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    req.log.error({ err }, "admin/balance-adjust: failed");
    res.status(500).json({ error: "Balance adjustment failed" });
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
