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
import { debitAvailable } from "../lib/ledger.js";

// OrahDEX takes 10% of the vault manager's performance fee as platform revenue
const PLATFORM_COPY_FEE_SHARE = 0.10;

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

/* ── Create a vault ────────────────────────────────────────────────── */
router.post("/copy/vaults", async (req, res) => {
  try {
    const {
      leaderWallet, leaderName, name, description,
      tradingPairs, feeRate, minDeposit, maxCapacity,
    } = req.body ?? {};

    if (!leaderWallet || !leaderName || !name) {
      res.status(400).json({ error: "leaderWallet, leaderName, and name are required" });
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
        feeRate: feeRate != null ? String(feeRate) : "0.10",
        minDeposit: minDeposit != null ? String(minDeposit) : "10",
        maxCapacity: maxCapacity != null ? String(maxCapacity) : null,
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
  try {
    const { followerWallet, amountUsdt } = req.body ?? {};
    if (!followerWallet || !amountUsdt || Number(amountUsdt) <= 0) {
      res.status(400).json({ error: "followerWallet and amountUsdt > 0 required" });
      return;
    }

    const [vault] = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.id, req.params.id));
    if (!vault) { res.status(404).json({ error: "Vault not found" }); return; }
    if (vault.status !== "active") { res.status(400).json({ error: "Vault is not accepting deposits" }); return; }

    const amount = Number(amountUsdt);
    if (amount < Number(vault.minDeposit)) {
      res.status(400).json({ error: `Minimum deposit is ${vault.minDeposit} USDT` });
      return;
    }
    if (vault.maxCapacity && (Number(vault.tvl) + amount) > Number(vault.maxCapacity)) {
      res.status(400).json({ error: "Vault is at maximum capacity" });
      return;
    }

    // Debit the follower's USDT before allocating shares
    try {
      await debitAvailable(followerWallet.toLowerCase(), "USDT", String(amount));
    } catch (err: any) {
      if (err?.message?.startsWith("INSUFFICIENT_FUNDS")) {
        res.status(400).json({ error: "Insufficient USDT balance" });
      } else {
        res.status(500).json({ error: "Failed to debit deposit" });
      }
      return;
    }

    const currentSharePrice = Number(vault.sharePrice) || 1;
    const sharesIssued = amount / currentSharePrice;
    const newTvl = Number(vault.tvl) + amount;
    const newTotalShares = Number(vault.totalShares) + sharesIssued;

    const positionId = crypto.randomUUID();

    const [position] = await db
      .insert(copyVaultPositionsTable)
      .values({
        id: positionId,
        vaultId: vault.id,
        followerWallet: followerWallet.toLowerCase(),
        sharesOwned: String(sharesIssued),
        depositAmountUsdt: String(amount),
        entrySharePrice: String(currentSharePrice),
        currentValue: String(amount),
      })
      .returning();

    await db
      .update(copyVaultsTable)
      .set({
        tvl: String(newTvl),
        totalShares: String(newTotalShares),
        followers: vault.followers + 1,
        updatedAt: new Date(),
      })
      .where(eq(copyVaultsTable.id, vault.id));

    logger.info({ vaultId: vault.id, followerWallet, sharesIssued, amount }, "CopyVault deposit");
    res.json({ position, sharesIssued, sharePrice: currentSharePrice });
  } catch (err: any) {
    logger.error({ err: err?.message }, "copy deposit error");
    res.status(500).json({ error: err?.message ?? "Failed to deposit" });
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

    const [position] = await db
      .select()
      .from(copyVaultPositionsTable)
      .where(
        and(
          eq(copyVaultPositionsTable.id, positionId),
          eq(copyVaultPositionsTable.followerWallet, followerWallet.toLowerCase()),
          eq(copyVaultPositionsTable.status, "active"),
        )
      );
    if (!position) { res.status(404).json({ error: "Active position not found" }); return; }

    const [vault] = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.id, req.params.id));
    if (!vault) { res.status(404).json({ error: "Vault not found" }); return; }

    const currentSharePrice = Number(vault.sharePrice) || 1;
    const shares = Number(position.sharesOwned);
    const redeemValue = shares * currentSharePrice;
    const entryValue = Number(position.depositAmountUsdt);
    const grossPnl = redeemValue - entryValue;

    const feeRate = Number(vault.feeRate);
    const performanceFee = grossPnl > 0 ? grossPnl * feeRate : 0;
    const netPayout = redeemValue - performanceFee;
    const realizedPnl = netPayout - entryValue;

    const newTvl = Math.max(0, Number(vault.tvl) - redeemValue);
    const newTotalShares = Math.max(0, Number(vault.totalShares) - shares);
    const newFollowers = Math.max(0, vault.followers - 1);

    // All three mutations (position status, vault TVL, follower credit) must succeed
    // or fail atomically — a partial commit would leave the vault in an inconsistent state
    // (e.g. position marked withdrawn but user never paid, or TVL reduced but no credit).
    const dbClient = await pool.connect();
    try {
      await dbClient.query("BEGIN");

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
        [String(newTvl), String(newTotalShares), newFollowers, vault.id],
      );

      if (netPayout > 0) {
        await dbClient.query(
          `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
           VALUES ($1, 'USDT', $2, '0', now())
           ON CONFLICT (wallet_address, asset_symbol)
           DO UPDATE SET available = user_balances.available + $2, updated_at = now()`,
          [followerWallet.toLowerCase(), netPayout.toFixed(8)],
        );
      }

      await dbClient.query("COMMIT");
    } catch (err) {
      await dbClient.query("ROLLBACK");
      throw err;
    } finally {
      dbClient.release();
    }

    // Record platform's share of the performance fee as exchange revenue (fire-and-forget)
    if (performanceFee > 0) {
      const platformCut = performanceFee * PLATFORM_COPY_FEE_SHARE;
      recordPlatformFee({ source: "copy_trade", amount: platformCut, asset: "USDT", txRef: vault.id });
    }

    logger.info({ vaultId: vault.id, followerWallet, netPayout, performanceFee }, "CopyVault withdraw");
    res.json({ netPayout, performanceFee, realizedPnl, redeemValue });
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

    if (secret !== process.env.ORCHESTRATOR_SECRET && secret !== "orah-internal") {
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

/* ── Update vault share price (recalculate from TVL) ───────────────── */
router.post("/copy/vaults/:id/sync-price", async (req, res) => {
  try {
    const { newTvl, secret } = req.body ?? {};
    if (secret !== process.env.ORCHESTRATOR_SECRET && secret !== "orah-internal") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [vault] = await db
      .select()
      .from(copyVaultsTable)
      .where(eq(copyVaultsTable.id, req.params.id));
    if (!vault) { res.status(404).json({ error: "Vault not found" }); return; }

    const totalShares = Number(vault.totalShares);
    const tvl = newTvl != null ? Number(newTvl) : Number(vault.tvl);
    const newSharePrice = totalShares > 0 ? tvl / totalShares : 1;

    const initialTvl = Number(vault.totalShares) * 1; // shares issued at $1
    const totalPnl = tvl - initialTvl;
    const totalPnlPct = initialTvl > 0 ? (totalPnl / initialTvl) * 100 : 0;

    await db
      .update(copyVaultsTable)
      .set({
        tvl: String(tvl),
        sharePrice: String(newSharePrice),
        totalPnl: String(totalPnl),
        totalPnlPct: String(totalPnlPct),
        updatedAt: new Date(),
      })
      .where(eq(copyVaultsTable.id, vault.id));

    res.json({ sharePrice: newSharePrice, tvl, totalPnlPct });
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
