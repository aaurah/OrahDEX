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
import { ordersTable, marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";

/** Stablecoin quote assets — treated as 1:1 with USD for cross-price math */
const STABLECOINS = new Set(["USDT","USDC","TUSD","USDD","BUSD","DAI"]);

/* ── Bot profit accumulation helpers ────────────────────────────────────── */

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string) {
  await db.insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } });
}

/**
 * Called each bot cycle.  Sums market volumes and credits the bot's
 * spread-capture income to the cumulative profit counter.
 *
 * Model: bot captures 0.01 % (1 bp) of total seeded volume per 24-h period.
 * Per 30-s cycle that equals  totalVolume24h × 0.0001 / 2880.
 */
async function accumulateCycleProfit(markets: { volume24h: string | null }[]): Promise<void> {
  try {
    const totalVolume = markets.reduce((s, m) => s + (parseFloat(m.volume24h ?? "0") || 0), 0);
    const cycleProfit = totalVolume * 0.0001 / 2880;

    const prevSpread = parseFloat((await getSetting("bot_spread_profit"))   ?? "0") || 0;
    const prevFunding = parseFloat((await getSetting("bot_funding_profit")) ?? "0") || 0;
    const prevLiquid  = parseFloat((await getSetting("bot_liquidation_profit")) ?? "0") || 0;

    const newSpread = prevSpread + cycleProfit;
    const grandTotal = newSpread + prevFunding + prevLiquid;

    await setSetting("bot_spread_profit",    newSpread.toFixed(6));
    await setSetting("bot_cumulative_profit", grandTotal.toFixed(6));
    await setSetting("bot_last_cycle_profit", cycleProfit.toFixed(6));
    await setSetting("bot_last_cycle_at",     new Date().toISOString());
    if (!(await getSetting("bot_start_time"))) {
      await setSetting("bot_start_time", new Date().toISOString());
    }
  } catch (err) {
    logger.warn({ err }, "Bot: failed to accumulate profit");
  }
}

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
  // target: ~0.03% of 24h volume per level in quote terms
  const quotePerLevel = volume24h * 0.0003;
  // Dynamic floor: at least worth 5 base units at current price (avoids insane qty)
  const quoteFloor = midPrice * 5;
  const base = Math.max(quotePerLevel, quoteFloor) / midPrice;
  // Hard cap: no single level exceeds 500,000 base units; floor at 0.0001
  return Math.min(Math.max(base, 0.0001), 500_000);
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

    // ── Step 1: Build the master USD price map from live USDT spot markets ──
    // All stablecoins are pegged 1:1. Every other asset's USD price comes
    // from its USDT market price, which was just updated by the price updater.
    const usdMap = new Map<string, number>();
    for (const s of STABLECOINS) usdMap.set(s, 1);

    for (const m of active) {
      if (m.quoteAsset === "USDT" && m.type === "spot") {
        const p = parseFloat(m.lastPrice as string);
        if (p > 0) usdMap.set(m.baseAsset, p);
      }
    }

    // ── Step 2: Recompute & persist cross-pair DB prices from USD map ───────
    // This keeps every ticker mathematically consistent with the order book.
    // ETH/BTC price = ETH_USD / BTC_USD — same snapshot, no drift window.
    const crossUpdates: Promise<unknown>[] = [];
    for (const m of active) {
      // Skip stablecoin-quoted and futures markets (their prices come from external APIs)
      if (STABLECOINS.has(m.quoteAsset) || m.type === "futures") continue;
      const baseUSD  = usdMap.get(m.baseAsset);
      const quoteUSD = usdMap.get(m.quoteAsset);
      if (!baseUSD || !quoteUSD || quoteUSD <= 0) continue;
      const crossPrice = baseUSD / quoteUSD;
      if (!Number.isFinite(crossPrice) || crossPrice <= 0) continue;

      crossUpdates.push(
        db.update(marketsTable)
          .set({ lastPrice: crossPrice.toFixed(8) })
          .where(eq(marketsTable.symbol, m.symbol))
          .catch(() => {}),
      );
    }
    await Promise.all(crossUpdates);

    // ── Step 3: Seed order books using the now-consistent prices ────────────
    // Cross pairs use the derived USD ratio — never the (potentially stale)
    // stored price — so NO triangular arbitrage path can ever be profitable.
    await Promise.all(
      active.map(m => {
        let midPrice: number;

        if (STABLECOINS.has(m.quoteAsset) || m.type === "futures") {
          // USD-quoted and futures: use stored price (kept fresh by price updater)
          midPrice = parseFloat(m.lastPrice as string) || 0;
        } else {
          // Cross pair: always derive from same-cycle USD snapshot
          const baseUSD  = usdMap.get(m.baseAsset);
          const quoteUSD = usdMap.get(m.quoteAsset);
          midPrice = (baseUSD && quoteUSD && quoteUSD > 0)
            ? baseUSD / quoteUSD
            : parseFloat(m.lastPrice as string) || 0;
        }

        return refreshMarket(
          m.symbol,
          m.quoteAsset,
          midPrice,
          parseFloat(m.volume24h as string) || 0,
        ).catch(err =>
          logger.warn({ err, symbol: m.symbol }, "Bot: skipped market"),
        );
      }),
    );

    await accumulateCycleProfit(active);
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
