/**
 * Liquidity Bot — OrahDEX
 *
 * Runs every 30 s. For every active market it:
 *  1. Wipes its own stale open orders
 *  2. Places a fresh 12-level bid/ask ladder around the live CoinGecko price
 *
 * This guarantees every market always has counter-parties so user orders
 * are never left hanging.  The bot wallet address is deliberately obvious
 * so it can be excluded from real-user analytics.
 */

import { db } from "@workspace/db";
import { ordersTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";

export const BOT_ADDRESS = "BOT_LIQUIDITY_ENGINE";

/* ── Spread / size schedule ─────────────────────────────────────────────── */
// Each level: [spread_fraction, size_multiplier]
// Tightest spread closest to mid-price, widening out.
const LEVELS = [
  [0.0003, 3.5],
  [0.0007, 3.0],
  [0.0012, 2.6],
  [0.0020, 2.2],
  [0.0032, 1.9],
  [0.0050, 1.6],
  [0.0075, 1.3],
  [0.0110, 1.0],
  [0.0160, 0.8],
  [0.0230, 0.6],
  [0.0330, 0.4],
  [0.0480, 0.3],
] as const;

/* ── Compute sane base order size from 24-h volume ──────────────────────── */
function baseSize(volume24h: number, midPrice: number): number {
  if (!midPrice || midPrice <= 0) return 0.001;
  // target: roughly 0.03 % of daily volume per level in quote terms
  const quotePerLevel = Math.max(volume24h * 0.0003, 10);
  const base = quotePerLevel / midPrice;
  // Floor at a sensible minimum so micro-cap coins aren't too small
  return Math.max(base, 0.0001);
}

/* ── Build one side of the ladder ───────────────────────────────────────── */
interface LevelOrder {
  side: "buy" | "sell";
  price: string;
  quantity: string;
  total: string;
}

function buildLadder(
  side: "buy" | "sell",
  midPrice: number,
  bSize: number,
): LevelOrder[] {
  return LEVELS.map(([spread, sizeMulti]) => {
    const sign = side === "buy" ? -1 : 1;
    const px   = midPrice * (1 + sign * spread);
    const qty  = bSize * sizeMulti;

    // Format price with appropriate precision
    let priceStr: string;
    if (px >= 1000)       priceStr = px.toFixed(2);
    else if (px >= 1)     priceStr = px.toFixed(4);
    else if (px >= 0.001) priceStr = px.toFixed(6);
    else                  priceStr = px.toFixed(10).replace(/0+$/, "").replace(/\.$/, "0");

    const qtyStr   = qty >= 1 ? qty.toFixed(4) : qty.toFixed(8);
    const totalStr = (px * qty).toFixed(6);

    return { side, price: priceStr, quantity: qtyStr, total: totalStr };
  });
}

/* ── Main refresh: wipe + re-seed one market ────────────────────────────── */
async function refreshMarket(
  symbol: string,
  quoteAsset: string,
  midPrice: number,
  volume24h: number,
): Promise<void> {
  if (!midPrice || midPrice <= 0) return;

  const bSize = baseSize(volume24h, midPrice);
  const orders: LevelOrder[] = [
    ...buildLadder("buy",  midPrice, bSize),
    ...buildLadder("sell", midPrice, bSize),
  ];

  // Delete stale open bot orders for this symbol in one shot
  await db.delete(ordersTable).where(
    and(
      eq(ordersTable.symbol, symbol),
      eq(ordersTable.walletAddress, BOT_ADDRESS),
      eq(ordersTable.status, "open"),
    ),
  );

  // Batch-insert fresh orders
  await db.insert(ordersTable).values(
    orders.map(o => ({
      id:                crypto.randomUUID(),
      symbol,
      walletAddress:     BOT_ADDRESS,
      networkType:       "bsv",
      side:              o.side,
      type:              "limit" as const,
      status:            "open" as const,
      price:             o.price,
      stopPrice:         null as string | null,
      quantity:          o.quantity,
      filledQuantity:    "0",
      remainingQuantity: o.quantity,
      total:             o.total,
      fee:               "0",
      feeAsset:          quoteAsset,
      timeInForce:       "GTC",
      txid:              null as string | null,
      signedTx:          null as string | null,
      matchedOrderId:    null as string | null,
    })),
  );
}

/* ── Full cycle: iterate all active markets ─────────────────────────────── */
async function runCycle(): Promise<void> {
  try {
    const markets = await db.select().from(marketsTable);
    const active  = markets.filter(m => m.status === "active");

    await Promise.all(
      active.map(m =>
        refreshMarket(
          m.symbol,
          m.quoteAsset,
          parseFloat(m.lastPrice) || 0,
          parseFloat(m.volume24h) || 0,
        ).catch(err =>
          logger.warn({ err, symbol: m.symbol }, "Bot: skipped market"),
        ),
      ),
    );

    logger.info({ markets: active.length }, "Liquidity bot cycle complete");
  } catch (err) {
    logger.error({ err }, "Liquidity bot cycle failed");
  }
}

/* ── Public start function ──────────────────────────────────────────────── */
export function startLiquidityBot(): void {
  logger.info("Liquidity bot starting — seeding order books…");
  // First run immediately, then every 30 s
  runCycle();
  setInterval(runCycle, 30_000);
}
