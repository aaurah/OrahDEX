/**
 * feeRevenue.ts — Exchange revenue & fee-schedule API
 *
 * GET /api/revenue         — aggregated platform fee revenue (time-bucketed)
 * GET /api/fee-schedule    — public fee tier table
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { keeperEarningsTable, tradesTable, ordersTable } from "@workspace/db/schema";
import { eq, and, gte, sum, sql } from "drizzle-orm";
import { EXCHANGE_TREASURY, type FeeSource } from "../lib/feeCollector.js";

const router = Router();

// ── fee tiers ────────────────────────────────────────────────────────────────
const FEE_SCHEDULE = {
  spot: {
    maker:  "0.10%",
    taker:  "0.10%",
    description: "Order book maker & taker fee applied to the trade total.",
  },
  swap: {
    fee:    "0.30%",
    description: "AMM swap fee deducted from the output amount.",
  },
  p2p: {
    fee:    "0.05%",
    description: "Direct trade intent fee applied on acceptance.",
  },
  copyTrading: {
    performanceFee:   "Vault manager sets (typically 5–20% of PnL)",
    platformCut:      "10% of the vault performance fee",
    description:      "Platform takes 10% of the vault manager's performance fee.",
  },
  liquidity: {
    lpShare:   "0.25% of each swap routed through the pool",
    platform:  "0.05% platform fee on each swap",
    description: "LPs earn from the spread; platform retains 0.05% per swap.",
  },
  withdrawal: {
    bsv:  "0 BSV (free on-chain)",
    evm:  "Gas paid by user; 0 platform fee",
  },
  tiers: [
    { tier: "Standard",  volume: "< $10 k/30 d",  maker: "0.10%", taker: "0.10%", discount: "—" },
    { tier: "Silver",    volume: "$10 k–$100 k",   maker: "0.08%", taker: "0.09%", discount: "10%" },
    { tier: "Gold",      volume: "$100 k–$1 M",    maker: "0.05%", taker: "0.07%", discount: "30%" },
    { tier: "Platinum",  volume: "> $1 M/30 d",    maker: "0.02%", taker: "0.04%", discount: "60%" },
  ],
};

// ── GET /api/fee-schedule ─────────────────────────────────────────────────────
router.get("/fee-schedule", (_req, res) => {
  res.json(FEE_SCHEDULE);
});

// ── helpers ───────────────────────────────────────────────────────────────────
function sinceTs(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function sumFeesBySource(since: Date): Promise<Record<string, number>> {
  const rows = await db
    .select({
      source: keeperEarningsTable.source,
      total:  sum(keeperEarningsTable.amount),
    })
    .from(keeperEarningsTable)
    .where(
      and(
        eq(keeperEarningsTable.walletAddress, EXCHANGE_TREASURY),
        gte(keeperEarningsTable.earnedAt, since),
      )
    )
    .groupBy(keeperEarningsTable.source);

  return Object.fromEntries(rows.map((r) => [r.source, parseFloat(r.total ?? "0")]));
}

async function totalBySource(since: Date): Promise<number> {
  const map = await sumFeesBySource(since);
  return Object.values(map).reduce((a, b) => a + b, 0);
}

// ── GET /api/revenue ──────────────────────────────────────────────────────────
router.get("/revenue", async (req, res) => {
  try {
    const since24h  = sinceTs(1);
    const since7d   = sinceTs(7);
    const since30d  = sinceTs(30);
    const sinceAll  = new Date(0);

    const [by24h, by7d, by30d, byAll] = await Promise.all([
      sumFeesBySource(since24h),
      sumFeesBySource(since7d),
      sumFeesBySource(since30d),
      sumFeesBySource(sinceAll),
    ]);

    // Also aggregate order-book fills from tradesTable.fee for historical data
    // before feeCollector was integrated
    const [tradeRow] = await db
      .select({ total: sum(tradesTable.fee) })
      .from(tradesTable)
      .where(gte(tradesTable.timestamp, sinceAll));
    const historicalTradeFees = parseFloat(tradeRow?.total ?? "0");

    const SOURCES: FeeSource[] = ["swap", "orderbook", "copy_trade", "lp_spread", "p2p", "withdrawal"];

    function buildBreakdown(map: Record<string, number>) {
      return SOURCES.map((s) => ({ source: s, amount: map[s] ?? 0 }));
    }

    res.json({
      breakdown: {
        "24h":  buildBreakdown(by24h),
        "7d":   buildBreakdown(by7d),
        "30d":  buildBreakdown(by30d),
        "all":  buildBreakdown(byAll),
      },
      totals: {
        "24h":  Object.values(by24h).reduce((a, b) => a + b, 0),
        "7d":   Object.values(by7d).reduce((a, b) => a + b, 0),
        "30d":  Object.values(by30d).reduce((a, b) => a + b, 0),
        "all":  Object.values(byAll).reduce((a, b) => a + b, 0) + historicalTradeFees,
      },
      currency: "USD-equivalent",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Revenue query failed" });
  }
});

export default router;
