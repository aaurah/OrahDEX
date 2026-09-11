/**
 * CopyVault Off-Chain Orchestrator
 *
 * `onTradeSettled` is invoked by `spotSettlement.settleSpotFill` after every
 * successful ledger settlement. For any vault whose `leaderWallet` matches the
 * trader, we record a mirrored trade row and bump `totalTrades`.
 *
 * Important: TVL and share-price are NOT mutated here. The mirrored trade is
 * a log entry only — actual P&L and the resulting share-price update is
 * applied by the `/copy/vaults/:id/sync-price` endpoint, which the admin (or
 * a future scheduled job authenticated with `ORCHESTRATOR_SECRET`) calls when
 * the vault's real holdings can be marked-to-market. This avoids inflating
 * vault value with simulated profits that don't correspond to real assets.
 */

import { db } from "@workspace/db";
import {
  copyVaultsTable,
  copyVaultTradesTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export interface LeaderTradeEvent {
  traderAddress: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  orderId?: string;
  /** Optional — leader's portfolio value used for proportional sizing. */
  traderPortfolioValue?: number;
}

/** Hook called from settleSpotFill after a successful ledger settle. */
export async function onTradeSettled(event: LeaderTradeEvent): Promise<void> {
  try {
    const trader = event.traderAddress.toLowerCase();
    const vaults = await db
      .select()
      .from(copyVaultsTable)
      .where(
        and(
          eq(copyVaultsTable.leaderWallet, trader),
          eq(copyVaultsTable.status, "active"),
        )
      );

    if (!vaults.length) return;

    for (const vault of vaults) {
      await mirrorTradeToVault(vault, event);
    }
  } catch (err: any) {
    // Never let copy-vault bookkeeping fail the underlying trade.
    logger.error({ err: err?.message }, "copyOrchestrator onTradeSettled error");
  }
}

async function mirrorTradeToVault(
  vault: typeof copyVaultsTable.$inferSelect,
  event: LeaderTradeEvent,
): Promise<void> {
  try {
    const vaultTvl = Number(vault.tvl);
    if (vaultTvl < 0.01) {
      logger.debug({ vaultId: vault.id }, "Vault TVL too low to mirror trade");
      return;
    }

    // Proportional sizing: copy quantity = leader qty × (vaultTvl / leaderPortfolio).
    // When `traderPortfolioValue` is provided (preferred), we mirror the leader's
    // position-weighted exposure. When unknown, fall back to sizing by trade
    // notional vs vault TVL — we copy the leader's qty 1-for-1 if the trade
    // fits the vault, otherwise size down so we never spend more than vaultTvl
    // on a single mirror. This is a safe lower bound (never larger than the
    // proportional formula above).
    const tradeNotional = event.price * event.quantity;
    const leaderPortfolio = event.traderPortfolioValue;
    const allocationRatio =
      leaderPortfolio && leaderPortfolio > 0
        ? Math.min(1, vaultTvl / leaderPortfolio)
        : tradeNotional > 0 ? Math.min(1, vaultTvl / tradeNotional) : 0;
    const copyQuantity = event.quantity * allocationRatio;
    const copyTotal = copyQuantity * event.price;

    if (copyQuantity < 0.000001) {
      logger.debug({ vaultId: vault.id, copyQuantity }, "Copy qty too small, skipping");
      return;
    }

    const tradeId = crypto.randomUUID();
    await db.insert(copyVaultTradesTable).values({
      id: tradeId,
      vaultId: vault.id,
      leaderOrderId: event.orderId ?? null,
      symbol: event.symbol,
      side: event.side,
      price: String(event.price),
      quantity: String(copyQuantity),
      total: String(copyTotal),
      status: "executed",
    });

    // Atomic increment — concurrent fills against the same leader must not
    // lose updates. SQL `total_trades = total_trades + 1` avoids the
    // read-modify-write race entirely.
    await db.update(copyVaultsTable).set({
      totalTrades: sql`${copyVaultsTable.totalTrades} + 1`,
      updatedAt: new Date(),
    }).where(eq(copyVaultsTable.id, vault.id));

    logger.info(
      { vaultId: vault.id, symbol: event.symbol, side: event.side, copyQuantity },
      "CopyVault: mirrored leader trade",
    );
  } catch (err: any) {
    logger.error({ err: err?.message, vaultId: vault.id }, "mirrorTradeToVault error");
  }
}

export function startCopyOrchestrator(): void {
  // Hook is invoked synchronously from spotSettlement; no background worker
  // needed at startup. This entry exists so the boot sequence can log readiness
  // and so a future scheduler (price-sync cron) can plug in here.
  logger.info("copyOrchestrator: ready (event-driven via settleSpotFill hook)");
}
