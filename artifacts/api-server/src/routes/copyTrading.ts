import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import {
  copyVaultsTable,
  copyVaultPositionsTable,
  copyVaultTradesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { buildSettlement, type TradeSettlement } from "../lib/settlement.js";
import { recordPlatformFee } from "../lib/feeCollector.js";
import { requireAdminToken, isValidAdminToken } from "../middleware/adminAuth.js";

// OrahDEX takes 10% of the vault manager's performance fee as platform revenue
const PLATFORM_COPY_FEE_SHARE = 0.10;

// Stable 63-bit advisory-lock key derived from a vault id (Postgres bigint range)
function vaultLockKey(vaultId: string): string {
  let h = 0n;
  for (let i = 0; i < vaultId.length; i++) {
    h = (h * 1099511628211n) ^ BigInt(vaultId.charCodeAt(i));
  }
  // Force into signed bigint range
  const mask = (1n << 63n) - 1n;
  return (h & mask).toString();
}

function verifyOrchestratorSecret(secret: unknown): boolean {
  const expected = process.env.ORCHESTRATOR_SECRET;
  if (!expected || expected.length < 16) return false;
  return typeof secret === "string" && secret === expected;
}

const router: IRouter = Router();

/* ── List all public vaults (leaderboard) ──────────────────────────── */
router.get("/copy/vaults", async (_req, res) => {
  try {
    const vaults = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.isPublic, true))
      .orderBy(desc(copyVaultsTable.tvl));
    res.json({ vaults });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy/vaults list error");
    res.status(500).json({ error: err?.message ?? "Failed to fetch vaults" });
  }
});

/* ── Get single vault with recent trades ───────────────────────────── */
router.get("/copy/vaults/:id", async (req, res) => {
  try {
    const [vault] = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.id, req.params.id));
    if (!vault) { res.status(404).json({ error: "Vault not found" }); return; }

    const trades = await db
      .select()
      .from(copyVaultTradesTable)
      .where(eq(copyVaultTradesTable.vaultId, req.params.id))
      .orderBy(desc(copyVaultTradesTable.executedAt))
      .limit(50);

    res.json({ vault, trades });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy/vaults/:id error");
    res.status(500).json({ error: err?.message ?? "Failed to fetch vault" });
  }
});

/* ── Create a vault (admin only) ───────────────────────────────────── */
router.post("/copy/vaults", requireAdminToken, async (req, res) => {
  try {
    const {
      leaderWallet, leaderName, name, description,
      tradingPairs, feeRate, minDeposit, maxCapacity, isPublic,
    } = req.body ?? {};

    if (!leaderWallet || !leaderName || !name) {
      res.status(400).json({ error: "leaderWallet, leaderName, and name are required" });
      return;
    }
    if (typeof leaderWallet !== "string" || typeof leaderName !== "string" || typeof name !== "string") {
      res.status(400).json({ error: "leaderWallet, leaderName, name must be strings" });
      return;
    }

    const feeRateNum = feeRate != null ? Number(feeRate) : 0.10;
    if (!Number.isFinite(feeRateNum) || feeRateNum < 0 || feeRateNum > 0.5) {
      res.status(400).json({ error: "feeRate must be between 0 and 0.5 (0–50%)" });
      return;
    }
    const minDepositNum = minDeposit != null ? Number(minDeposit) : 10;
    if (!Number.isFinite(minDepositNum) || minDepositNum <= 0) {
      res.status(400).json({ error: "minDeposit must be > 0" });
      return;
    }
    const maxCapacityNum = maxCapacity != null && maxCapacity !== "" ? Number(maxCapacity) : null;
    if (maxCapacityNum != null && (!Number.isFinite(maxCapacityNum) || maxCapacityNum <= 0)) {
      res.status(400).json({ error: "maxCapacity must be > 0 when provided" });
      return;
    }

    const id = crypto.randomUUID();
    const [vault] = await db
      .insert(copyVaultsTable)
      .values({
        id,
        leaderWallet: leaderWallet.toLowerCase(),
        leaderName,
        name,
        description: description ?? null,
        tradingPairs: tradingPairs ?? "BSV-USDT",
        feeRate: String(feeRateNum),
        minDeposit: String(minDepositNum),
        maxCapacity: maxCapacityNum != null ? String(maxCapacityNum) : null,
        isPublic: typeof isPublic === "boolean" ? isPublic : true,
      })
      .returning();

    logger.info({ id, leaderWallet, name }, "CopyVault created");
    res.json({ vault });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy/vaults create error");
    res.status(500).json({ error: err?.message ?? "Failed to create vault" });
  }
});

/* ── Deposit into a vault ──────────────────────────────────────────── */
router.post("/copy/vaults/:id/deposit", async (req, res) => {
  const { followerWallet, amountUsdt } = req.body ?? {};
  if (!followerWallet || typeof followerWallet !== "string") {
    res.status(400).json({ error: "followerWallet required" });
    return;
  }
  const amount = Number(amountUsdt);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "amountUsdt > 0 required" });
    return;
  }
  const wallet = followerWallet.toLowerCase();
  const vaultId = req.params.id;

  // Single transaction:
  //  1. xact-advisory-lock the vault id (serialises concurrent deposits/withdraws)
  //  2. SELECT … FOR UPDATE the vault row + check status/min/cap
  //  3. Debit follower USDT ledger (raises INSUFFICIENT_FUNDS → ROLLBACK)
  //  4. Upsert position (one row per (vault, wallet) so followers stays accurate)
  //  5. Update vault TVL/shares/followers
  // If any step throws, the entire deposit unwinds — no orphaned debits, no
  // shares-without-balance, no double-counted followers.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [vaultLockKey(vaultId)]);

    const vRes = await client.query(
      `SELECT id, status, min_deposit, max_capacity, tvl, total_shares,
              share_price, followers
         FROM copy_vaults
        WHERE id = $1
        FOR UPDATE`,
      [vaultId],
    );
    const vault = vRes.rows[0];
    if (!vault) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Vault not found" });
      return;
    }
    if (vault.status !== "active") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Vault is not accepting deposits" });
      return;
    }
    if (amount < Number(vault.min_deposit)) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Minimum deposit is ${vault.min_deposit} USDT` });
      return;
    }
    if (vault.max_capacity && (Number(vault.tvl) + amount) > Number(vault.max_capacity)) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Vault is at maximum capacity" });
      return;
    }

    // Debit the follower's USDT inside the same txn (so a failure rolls everything back)
    const balRes = await client.query(
      `SELECT available FROM user_balances
        WHERE wallet_address = $1 AND asset_symbol = 'USDT'
        FOR UPDATE`,
      [wallet],
    );
    const available = Number(balRes.rows[0]?.available ?? 0);
    if (available < amount) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Insufficient USDT balance" });
      return;
    }
    await client.query(
      `UPDATE user_balances
          SET available = available - $1::numeric, updated_at = now()
        WHERE wallet_address = $2 AND asset_symbol = 'USDT'`,
      [amount.toFixed(8), wallet],
    );

    const sharePrice = Number(vault.share_price) || 1;
    const sharesIssued = amount / sharePrice;
    const newTvl = Number(vault.tvl) + amount;
    const newTotalShares = Number(vault.total_shares) + sharesIssued;

    // Idempotent follower count: one row per (vault, wallet). Re-deposit adds
    // shares to the existing active position so `followers` doesn't drift.
    const existing = await client.query(
      `SELECT id, shares_owned, deposit_amount_usdt
         FROM copy_vault_positions
        WHERE vault_id = $1 AND follower_wallet = $2 AND status = 'active'
        FOR UPDATE`,
      [vaultId, wallet],
    );

    let positionId: string;
    let newFollowers = vault.followers;
    if (existing.rows.length) {
      const row = existing.rows[0];
      positionId = row.id;
      const newShares = Number(row.shares_owned) + sharesIssued;
      const newDeposit = Number(row.deposit_amount_usdt) + amount;
      await client.query(
        `UPDATE copy_vault_positions
            SET shares_owned = $1, deposit_amount_usdt = $2,
                current_value = $3, updated_at = now()
          WHERE id = $4`,
        [String(newShares), String(newDeposit), String(newShares * sharePrice), positionId],
      );
    } else {
      positionId = crypto.randomUUID();
      await client.query(
        `INSERT INTO copy_vault_positions
           (id, vault_id, follower_wallet, shares_owned, deposit_amount_usdt,
            entry_share_price, current_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [positionId, vaultId, wallet, String(sharesIssued), String(amount),
         String(sharePrice), String(amount)],
      );
      newFollowers = vault.followers + 1;
    }

    await client.query(
      `UPDATE copy_vaults
          SET tvl = $1, total_shares = $2, followers = $3, updated_at = now()
        WHERE id = $4`,
      [String(newTvl), String(newTotalShares), newFollowers, vaultId],
    );

    await client.query("COMMIT");
    logger.info({ vaultId, wallet, sharesIssued, amount }, "CopyVault deposit");
    res.json({ positionId, sharesIssued, sharePrice });
  } catch (err: any) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    logger.error({ err: err?.message }, "copy deposit error");
    res.status(500).json({ error: err?.message ?? "Failed to deposit" });
  } finally {
    client.release();
  }
});

/* ── Withdraw from vault (redeem shares) ───────────────────────────── */
router.post("/copy/vaults/:id/withdraw", async (req, res) => {
  try {
    const { followerWallet, positionId } = req.body ?? {};
    if (!followerWallet || !positionId) {
      res.status(400).json({ error: "followerWallet and positionId required" });
      return;
    }

    const wallet = followerWallet.toLowerCase();
    const vaultId = req.params.id;

    // Lock the vault first, then re-read both vault and position inside the txn
    // so a concurrent /sync-price or deposit can't change sharePrice/TVL between
    // our read and our write.
    const dbClient = await pool.connect();
    let payload: { netPayout: number; performanceFee: number; realizedPnl: number; redeemValue: number; vaultIdOut: string } | null = null;
    try {
      await dbClient.query("BEGIN");
      await dbClient.query("SELECT pg_advisory_xact_lock($1)", [vaultLockKey(vaultId)]);

      const vRes = await dbClient.query(
        `SELECT id, share_price, fee_rate, tvl, total_shares, followers
           FROM copy_vaults WHERE id = $1 FOR UPDATE`,
        [vaultId],
      );
      const vault = vRes.rows[0];
      if (!vault) {
        await dbClient.query("ROLLBACK");
        res.status(404).json({ error: "Vault not found" });
        return;
      }

      const pRes = await dbClient.query(
        `SELECT id, shares_owned, deposit_amount_usdt
           FROM copy_vault_positions
          WHERE id = $1 AND follower_wallet = $2 AND vault_id = $3 AND status = 'active'
          FOR UPDATE`,
        [positionId, wallet, vaultId],
      );
      const position = pRes.rows[0];
      if (!position) {
        await dbClient.query("ROLLBACK");
        res.status(404).json({ error: "Active position not found" });
        return;
      }

      const sharePrice = Number(vault.share_price) || 1;
      const shares = Number(position.shares_owned);
      const redeemValue = shares * sharePrice;
      const entryValue = Number(position.deposit_amount_usdt);
      const grossPnl = redeemValue - entryValue;

      const feeRate = Number(vault.fee_rate);
      const performanceFee = grossPnl > 0 ? grossPnl * feeRate : 0;
      const netPayout = redeemValue - performanceFee;
      const realizedPnl = netPayout - entryValue;

      // Dust guard: refuse meaningless withdraws
      if (redeemValue < 0.000001) {
        await dbClient.query("ROLLBACK");
        res.status(400).json({ error: "Position too small to withdraw" });
        return;
      }

      const newTvl = Math.max(0, Number(vault.tvl) - redeemValue);
      const newTotalShares = Math.max(0, Number(vault.total_shares) - shares);
      const newFollowers = Math.max(0, vault.followers - 1);

      await dbClient.query(
        `UPDATE copy_vault_positions
            SET status = 'withdrawn', realized_pnl = $1, fees_paid = $2,
                withdrawn_at = now(), updated_at = now()
          WHERE id = $3`,
        [String(realizedPnl), String(performanceFee), positionId],
      );

      await dbClient.query(
        `UPDATE copy_vaults
            SET tvl = $1, total_shares = $2, followers = $3, updated_at = now()
          WHERE id = $4`,
        [String(newTvl), String(newTotalShares), newFollowers, vaultId],
      );

      if (netPayout > 0) {
        await dbClient.query(
          `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
           VALUES ($1, 'USDT', $2, '0', now())
           ON CONFLICT (wallet_address, asset_symbol)
           DO UPDATE SET available = user_balances.available + $2, updated_at = now()`,
          [wallet, netPayout.toFixed(8)],
        );
      }

      await dbClient.query("COMMIT");
      payload = { netPayout, performanceFee, realizedPnl, redeemValue, vaultIdOut: vaultId };
    } catch (err) {
      try { await dbClient.query("ROLLBACK"); } catch { /* ignore */ }
      throw err;
    } finally {
      dbClient.release();
    }

    // Record platform's share of the performance fee as exchange revenue (fire-and-forget)
    if (payload && payload.performanceFee > 0) {
      const platformCut = payload.performanceFee * PLATFORM_COPY_FEE_SHARE;
      recordPlatformFee({ source: "copy_trade", amount: platformCut, asset: "USDT", txRef: payload.vaultIdOut });
    }

    logger.info({ vaultId: payload!.vaultIdOut, wallet, ...payload }, "CopyVault withdraw");
    res.json(payload);
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy withdraw error");
    res.status(500).json({ error: err?.message ?? "Failed to withdraw" });
  }
});

/* ── Follower's active positions ───────────────────────────────────── */
router.get("/copy/my-positions", async (req, res) => {
  try {
    const { walletAddress } = req.query as { walletAddress?: string };
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress required" });
      return;
    }

    const positions = await db
      .select({
        position: copyVaultPositionsTable,
        vault: copyVaultsTable,
      })
      .from(copyVaultPositionsTable)
      .innerJoin(copyVaultsTable, eq(copyVaultPositionsTable.vaultId, copyVaultsTable.id))
      .where(
        and(
          eq(copyVaultPositionsTable.followerWallet, walletAddress.toLowerCase()),
          eq(copyVaultPositionsTable.status, "active"),
        )
      )
      .orderBy(desc(copyVaultPositionsTable.createdAt));

    const enriched = positions.map(({ position, vault }) => {
      const sharePrice = Number(vault.sharePrice) || 1;
      const currentValue = Number(position.sharesOwned) * sharePrice;
      const entry = Number(position.depositAmountUsdt);
      const pnl = currentValue - entry;
      const pnlPct = entry > 0 ? (pnl / entry) * 100 : 0;
      return { ...position, currentValue, unrealizedPnl: pnl, unrealizedPnlPct: pnlPct, vault };
    });

    res.json({ positions: enriched });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy my-positions error");
    res.status(500).json({ error: err?.message ?? "Failed to fetch positions" });
  }
});

/* ── Execute a copy trade (called by orchestrator) ─────────────────── */
router.post("/copy/vaults/:id/trade", async (req, res) => {
  try {
    const { symbol, side, price, quantity, leaderOrderId, secret } = req.body ?? {};

    if (!verifyOrchestratorSecret(secret)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (!symbol || !side || !price || !quantity) {
      res.status(400).json({ error: "symbol, side, price, quantity required" });
      return;
    }

    const [vault] = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.id, req.params.id));
    if (!vault || vault.status !== "active") {
      res.status(404).json({ error: "Vault not found or inactive" });
      return;
    }

    const p = Number(price);
    const q = Number(quantity);
    const total = p * q;

    const settlementResult = buildSettlement({
      tradeId: crypto.randomUUID(),
      pair: symbol,
      buyOrderId: leaderOrderId ?? "copy-trade",
      sellOrderId: "vault-" + vault.id,
      buyerAddress: vault.leaderWallet,
      sellerAddress: vault.leaderWallet,
      buyerNetwork: "evm",
      sellerNetwork: "evm",
      amount: String(q),
      price: String(p),
      total: String(total),
      timestamp: Date.now(),
    } as TradeSettlement);

    const tradeId = crypto.randomUUID();
    const [trade] = await db
      .insert(copyVaultTradesTable)
      .values({
        id: tradeId,
        vaultId: vault.id,
        leaderOrderId: leaderOrderId ?? null,
        symbol,
        side,
        price: String(p),
        quantity: String(q),
        total: String(total),
        txid: settlementResult.txid ?? null,
        status: "executed",
      })
      .returning();

    const newTrades = vault.totalTrades + 1;
    await db
      .update(copyVaultsTable)
      .set({ totalTrades: newTrades, updatedAt: new Date() })
      .where(eq(copyVaultsTable.id, vault.id));

    res.json({ trade });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy vault trade error");
    res.status(500).json({ error: err?.message ?? "Failed to execute trade" });
  }
});

/* ── Update vault share price (admin or orchestrator only) ─────────── */
router.post("/copy/vaults/:id/sync-price", async (req, res) => {
  try {
    const { newTvl, secret, status } = req.body ?? {};
    const adminToken = req.headers["x-admin-token"];
    if (!isValidAdminToken(adminToken) && !verifyOrchestratorSecret(secret)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const vaultId = req.params.id;
    const client = await pool.connect();
    let result: { sharePrice: number; tvl: number; totalPnlPct: number; status: string } | null = null;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [vaultLockKey(vaultId)]);

      const vRes = await client.query(
        `SELECT id, tvl, total_shares, status FROM copy_vaults WHERE id = $1 FOR UPDATE`,
        [vaultId],
      );
      const vault = vRes.rows[0];
      if (!vault) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Vault not found" });
        return;
      }

      const totalShares = Number(vault.total_shares);
      const tvl = newTvl != null && Number.isFinite(Number(newTvl)) ? Number(newTvl) : Number(vault.tvl);
      const newSharePrice = totalShares > 0 ? tvl / totalShares : 1;
      const initialTvl = totalShares * 1; // shares were issued at $1
      const totalPnl = tvl - initialTvl;
      const totalPnlPct = initialTvl > 0 ? (totalPnl / initialTvl) * 100 : 0;

      const newStatus = (typeof status === "string" && ["active", "paused", "closed"].includes(status))
        ? status
        : vault.status;

      await client.query(
        `UPDATE copy_vaults
            SET tvl = $1, share_price = $2, total_pnl = $3,
                total_pnl_pct = $4, status = $5, updated_at = now()
          WHERE id = $6`,
        [String(tvl), String(newSharePrice), String(totalPnl), String(totalPnlPct), newStatus, vaultId],
      );
      await client.query("COMMIT");
      result = { sharePrice: newSharePrice, tvl, totalPnlPct, status: newStatus };
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }

    res.json(result);
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy sync-price error");
    res.status(500).json({ error: err?.message ?? "Failed to sync price" });
  }
});

/* ── Leaderboard stats summary ─────────────────────────────────────── */
router.get("/copy/stats", async (_req, res) => {
  try {
    const result = await db
      .select({
        totalVaults: sql<number>`count(*)::int`,
        totalTvl: sql<string>`coalesce(sum(tvl::numeric), 0)::text`,
        totalFollowers: sql<number>`coalesce(sum(followers), 0)::int`,
        avgPnlPct: sql<string>`coalesce(avg(total_pnl_pct::numeric), 0)::text`,
      })
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.status, "active"));

    res.json(result[0] ?? { totalVaults: 0, totalTvl: "0", totalFollowers: 0, avgPnlPct: "0" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
