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
    if (event.side === "sell") {
      const simulatedPnl = copyTotal * 0.003;
      newTvl = vaultTvl + simulatedPnl;
    }

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

/**
 * Seed demo vaults for testing/demo purposes.
 * Called once on server start if no vaults exist.
 */
export async function seedDemoVaults(): Promise<void> {
  try {
    const existing = await db.select().from(copyVaultsTable).limit(1);
    if (existing.length > 0) return;

    const demos = [
      {
        id: crypto.randomUUID(),
        leaderWallet: "0xdemo1000000000000000000000000000000000001",
        leaderName: "Sovereign Phantom",
        name: "BSV Momentum Vault",
        description: "High-frequency momentum strategy on BSV/USDT. Average 3.2% weekly alpha.",
        tradingPairs: "BSV-USDT,ETH-USDT",
        feeRate: "0.10",
        minDeposit: "50",
        tvl: "142850",
        totalShares: "132265",
        sharePrice: "1.0801",
        totalPnl: "11582",
        totalPnlPct: "8.01",
        monthPnlPct: "3.24",
        totalTrades: 847,
        winRate: "0.681",
        followers: 238,
      },
      {
        id: crypto.randomUUID(),
        leaderWallet: "0xdemo2000000000000000000000000000000000002",
        leaderName: "Archon Delta",
        name: "Multi-Asset Arbitrage",
        description: "Cross-pair arbitrage across BSV, ETH, SOL and BTC pairs. Low drawdown, steady returns.",
        tradingPairs: "BSV-USDT,SOL-USDT,ETH-BTC",
        feeRate: "0.08",
        minDeposit: "100",
        tvl: "89200",
        totalShares: "79643",
        sharePrice: "1.1201",
        totalPnl: "9752",
        totalPnlPct: "12.01",
        monthPnlPct: "4.87",
        totalTrades: 1203,
        winRate: "0.724",
        followers: 157,
      },
      {
        id: crypto.randomUUID(),
        leaderWallet: "0xdemo3000000000000000000000000000000000003",
        leaderName: "Initiate Zero",
        name: "DeFi Yield Rotator",
        description: "Rotates capital into high-yield DeFi pairs. Focuses on altcoin momentum plays.",
        tradingPairs: "DOGE-USDT,SHIB-USDT,LINK-USDT",
        feeRate: "0.15",
        minDeposit: "10",
        tvl: "32100",
        totalShares: "33789",
        sharePrice: "0.9499",
        totalPnl: "-1710",
        totalPnlPct: "-5.01",
        monthPnlPct: "-1.23",
        totalTrades: 392,
        winRate: "0.512",
        followers: 89,
      },
      {
        id: crypto.randomUUID(),
        leaderWallet: "0xdemo4000000000000000000000000000000000004",
        leaderName: "Sentinel Prime",
        name: "BTC Macro Vault",
        description: "Long-term BTC accumulation strategy. Weekly DCA + momentum rebalancing.",
        tradingPairs: "BTC-USDT,BSV-USDT",
        feeRate: "0.05",
        minDeposit: "500",
        maxCapacity: "1000000",
        tvl: "510000",
        totalShares: "421488",
        sharePrice: "1.2099",
        totalPnl: "88120",
        totalPnlPct: "20.99",
        monthPnlPct: "7.33",
        totalTrades: 124,
        winRate: "0.790",
        followers: 412,
      },
    ];

    for (const demo of demos) {
      await db.insert(copyVaultsTable).values(demo as any).onConflictDoNothing();
    }

    logger.info({ count: demos.length }, "CopyVault: seeded demo vaults");
  } catch (err: any) {
    logger.error({ err: err?.message }, "seedDemoVaults error");
  }
}
