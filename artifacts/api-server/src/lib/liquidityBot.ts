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
import { eq, and, notInArray } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { FALLBACK_PRICES, seedMarketsIfNeeded } from "./priceUpdater.js";
import { serviceState } from "./serviceState.js";

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
  [0.0010, 2.8],
  [0.0025, 2.2],
  [0.0055, 1.7],
  [0.0120, 1.2],
  [0.0280, 0.8],
] as const;

/**
 * Estimate a realistic 24h quote-volume for a market when the DB has no real
 * volume data yet.  The `usdValue` is the mid-price expressed in USD
 * (base-asset USD price, not the cross price).  Tiers are intentionally
 * conservative so the synthetic depth matches real-world liquidity.
 */
function syntheticUsdVolume(baseUsdPrice: number): number {
  if (baseUsdPrice >= 50_000) return 2_000_000_000;   // BTC-tier
  if (baseUsdPrice >=  1_000) return   200_000_000;   // ETH / BNB-tier
  if (baseUsdPrice >=    100) return    50_000_000;   // SOL / AVAX-tier
  if (baseUsdPrice >=     10) return    10_000_000;   // LINK / DOT-tier
  if (baseUsdPrice >=      1) return     2_000_000;   // mid-cap alts
  if (baseUsdPrice >=   0.01) return       300_000;   // micro-cap / memes
  return                                    50_000;   // nano-cap
}

/* ── Compute sane base order size from 24-h volume ──────────────────────── */
function baseSize(
  volume24h: number,
  midPrice: number,
  baseUsdPrice: number,   // base-asset USD value (for synthetic vol fallback)
): number {
  if (!midPrice || midPrice <= 0) return 0.001;

  // If no real volume recorded yet, synthesise from the asset's USD price tier.
  // This ensures every pair gets meaningful order-book depth from day one.
  const effectiveQuoteVol = volume24h > 0
    ? volume24h
    : syntheticUsdVolume(baseUsdPrice);   // treat as USD-equivalent quote vol

  // target: ~0.03% of 24h volume per level in quote terms
  const quotePerLevel = effectiveQuoteVol * 0.0003;
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

    // Format price with appropriate precision (handles sub-satoshi like 1e-11)
    let priceStr: string;
    if (px >= 1000)       priceStr = px.toFixed(2);
    else if (px >= 1)     priceStr = px.toFixed(4);
    else if (px >= 0.001) priceStr = px.toFixed(6);
    else if (px >= 1e-8)  priceStr = px.toFixed(10);
    else {
      // Sub-satoshi: enough decimals to show 4+ significant figures
      const mag = -Math.floor(Math.log10(px));
      priceStr = px.toFixed(Math.min(mag + 4, 18)).replace(/0+$/, "").replace(/\.$/, "0");
    }

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
  baseUsdPrice: number,   // base-asset USD price for synthetic volume fallback
): Promise<void> {
  // If the live price is missing, try the static fallback map
  if (!midPrice || midPrice <= 0) {
    const baseAsset = symbol.split("/")[0];
    midPrice = baseAsset ? (FALLBACK_PRICES[baseAsset] ?? 0) : 0;
  }
  if (!midPrice || midPrice <= 0) return; // truly unknown — skip

  const bSize = baseSize(volume24h, midPrice, baseUsdPrice);
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
      isBot:             true,
      isSynthetic:       false,
    })),
  );
}

/* ── Full cycle: iterate all active markets ─────────────────────────────── */
async function runCycle(): Promise<void> {
  try {
    const markets = await db.select({
      symbol:     marketsTable.symbol,
      baseAsset:  marketsTable.baseAsset,
      quoteAsset: marketsTable.quoteAsset,
      lastPrice:  marketsTable.lastPrice,
      volume24h:  marketsTable.volume24h,
      type:       marketsTable.type,
      status:     marketsTable.status,
    }).from(marketsTable)
      .where(notInArray(marketsTable.type, ["letsexchange"]));
    const active  = markets.filter(m => m.status === "active");

    // ── Step 1: Build the master USD price map from live USDT spot markets ──
    // All stablecoins are pegged 1:1. Every other asset's USD price comes
    // from its USDT market price, which was just updated by the price updater.
    // Seed from FALLBACK_PRICES first so every known asset has at least an
    // approximate price — live data overwrites the fallback when available.
    const usdMap = new Map<string, number>();
    for (const s of STABLECOINS) usdMap.set(s, 1);
    for (const [sym, px] of Object.entries(FALLBACK_PRICES)) {
      if (px > 0) usdMap.set(sym, px);
    }

    for (const m of active) {
      if (m.quoteAsset === "USDT" && m.type === "spot") {
        const p = parseFloat(m.lastPrice as string);
        if (p > 0) usdMap.set(m.baseAsset, p); // live price overwrites fallback
      }
    }

    // ── Step 2: Recompute & persist cross-pair DB prices from USD map ───────
    // This keeps every ticker mathematically consistent with the order book.
    // ETH/BTC price = ETH_USD / BTC_USD — same snapshot, no drift window.
    // Process in batches of 50 to avoid overwhelming the DB connection pool
    // (firing hundreds of concurrent UPDATE queries causes latency spikes and
    // can exhaust connections on constrained Replit PostgreSQL instances).
    const crossUpdates: { symbol: string; price: string }[] = [];
    for (const m of active) {
      // Skip stablecoin-quoted and futures markets (their prices come from external APIs)
      if (STABLECOINS.has(m.quoteAsset) || m.type === "futures") continue;
      const baseUSD  = usdMap.get(m.baseAsset);
      const quoteUSD = usdMap.get(m.quoteAsset);
      if (!baseUSD || !quoteUSD || quoteUSD <= 0) continue;
      const crossPrice = baseUSD / quoteUSD;
      if (!Number.isFinite(crossPrice) || crossPrice <= 0) continue;
      crossUpdates.push({ symbol: m.symbol, price: crossPrice.toFixed(8) });
    }

    const CROSS_BATCH = 50;
    for (let ci = 0; ci < crossUpdates.length; ci += CROSS_BATCH) {
      const batch = crossUpdates.slice(ci, ci + CROSS_BATCH);
      await Promise.all(
        batch.map(({ symbol, price }) =>
          db.update(marketsTable)
            .set({ lastPrice: price })
            .where(eq(marketsTable.symbol, symbol))
            .catch(err => logger.warn({ err, symbol }, "Bot: failed to update cross-price")),
        ),
      );
    }

    // ── Step 3: Seed order books using the now-consistent prices ────────────
    // Pre-build USDT volume map for O(1) lookups (avoids O(n²) active.find()).
    const usdtVolByBase = new Map<string, number>();
    for (const m of active) {
      if (m.quoteAsset === "USDT" && m.type === "spot") {
        const v = parseFloat(m.volume24h as string) || 0;
        if (v > 0) usdtVolByBase.set(m.baseAsset, v);
      }
    }

    // Process in batches of 20 directly — no intermediate marketJobs array
    // so the full 4003-element list is never held alongside the batch closures.
    const BATCH_SIZE = 20;
    for (let i = 0; i < active.length; i += BATCH_SIZE) {
      const batch = active.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(m => {
          const baseUSD  = usdMap.get(m.baseAsset)  ?? FALLBACK_PRICES[m.baseAsset]  ?? 0;
          const quoteUSD = usdMap.get(m.quoteAsset) ?? FALLBACK_PRICES[m.quoteAsset] ?? 1;

          let midPrice: number;
          if (STABLECOINS.has(m.quoteAsset) || m.type === "futures") {
            midPrice = parseFloat(m.lastPrice as string) || 0;
          } else {
            midPrice = (baseUSD > 0 && quoteUSD > 0)
              ? baseUSD / quoteUSD
              : parseFloat(m.lastPrice as string) || 0;
          }

          // Volume: DB value or derive via O(1) Map lookup (not O(n) find).
          let vol = parseFloat(m.volume24h as string) || 0;
          if (vol <= 0 && baseUSD > 0 && quoteUSD > 0) {
            const usdtVol = usdtVolByBase.get(m.baseAsset) ?? 0;
            if (usdtVol > 0) vol = usdtVol / quoteUSD;
          }

          return refreshMarket(m.symbol, m.quoteAsset, midPrice, vol, baseUSD)
            .catch(err => logger.warn({ err, symbol: m.symbol }, "Bot: skipped market"));
        }),
      );
    }

    await accumulateCycleProfit(active);
    serviceState.botLastCycleAt = Date.now();
    serviceState.botCycles++;
    logger.info({ markets: active.length }, "Liquidity bot cycle complete");
  } catch (err) {
    logger.error({ err }, "Liquidity bot cycle failed");
  }
}

/* ── Public start function ──────────────────────────────────────────────── */
export function startLiquidityBot(): void {
  logger.info("Liquidity bot starting — seeding order books…");
  let _busy = false;

  // Await market seeding before the first cycle so the bot always
  // sees the complete, stable set of active markets from the start.
  // Subsequent calls to seedMarketsIfNeeded() are near-instant no-ops.
  seedMarketsIfNeeded()
    .then(() => runCycle())
    .catch(err => logger.warn({ err }, "Liquidity bot: seed-then-first-cycle failed"));

  guardedInterval("liquidity-bot", runCycle, 120_000, { timeoutMs: 110_000 });
}
