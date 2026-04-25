/**
 * CopyVault Off-Chain Orchestrator
 *
 * Watches the OrahDEX trade feed and automatically mirrors leader trades
 * into all vaults that follow that leader. Proportional sizing based on
 * vault TVL vs leader portfolio.
 *
 * Architecture:
 *   1. On each completed trade, check if the trader is a vault leader.
 *   2. For each active vault that leader manages, compute the proportional
 *      trade size (vaultTvl / leaderPortfolioSize * leaderTradeSize).
 *   3. Submit a copy trade to the vault and update share price.
 *   4. Emit notification to followers.
 */

import { db } from "@workspace/db";
import {
  copyVaultsTable,
  copyVaultTradesTable,
  copyVaultPositionsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";

const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET ?? "orah-internal";
const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";

export interface LeaderTradeEvent {
  traderAddress: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  orderId?: string;
  traderPortfolioValue?: number;
}

/**
 * Called whenever a trade is settled on OrahDEX.
 * Check if this trader is a vault leader and mirror the trade.
 */
export async function onTradeSettled(event: LeaderTradeEvent): Promise<void> {
  try {
    const vaults = await db
      .select()
      .from(copyVaultsTable)
      .where(
        and(
          eq(copyVaultsTable.leaderWallet, event.traderAddress.toLowerCase()),
          eq(copyVaultsTable.status, "active"),
        )
      );

    if (!vaults.length) return;

    for (const vault of vaults) {
      await mirrorTradeToVault(vault, event);
    }
  } catch (err: any) {
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

    const leaderPortfolioValue = event.traderPortfolioValue ?? (event.price * event.quantity * 10);
    const allocationRatio = Math.min(1, vaultTvl / leaderPortfolioValue);

    const copyQuantity = event.quantity * allocationRatio;
    const copyTotal = copyQuantity * event.price;

    if (copyQuantity < 0.000001) {
      logger.debug({ vaultId: vault.id, copyQuantity }, "Copy quantity too small, skipping");
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

    let newTvl = vaultTvl;
    // TVL changes only when followers deposit or withdraw — mirrored trades
    // record the activity but do not inflate TVL with simulated profits.
    // Share price is updated by the sync-price endpoint once real P&L is known.

    const totalShares = Number(vault.totalShares) || 1;
    const newSharePrice = newTvl / totalShares;

    await db.update(copyVaultsTable).set({
      tvl: String(newTvl),
      sharePrice: String(newSharePrice),
      totalTrades: vault.totalTrades + 1,
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

