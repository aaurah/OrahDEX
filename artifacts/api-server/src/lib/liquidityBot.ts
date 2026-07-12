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

import { db, pool, withDbRetry } from "@workspace/db";
import { ordersTable, marketsTable, platformSettingsTable } from "@workspace/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { FALLBACK_PRICES, seedMarketsIfNeeded } from "./priceUpdater.js";
import { serviceState } from "./serviceState.js";
import { isDbConnError } from "./dbErrors.js";

/** Stablecoin quote assets — treated as 1:1 with USD for cross-price math */
const STABLECOINS = new Set(["USDT","USDC","TUSD","USDD","BUSD","DAI"]);

/* ── Bot profit accumulation helpers ────────────────────────────────────── */

async function getSetting(key: string): Promise<string | null> {
  try {
    const rows = await withDbRetry(() =>
      db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key))
    );
    return rows[0]?.value ?? null;
  } catch { return null; }
}

async function setSetting(key: string, value: string) {
  await withDbRetry(() =>
    db.insert(platformSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value, updatedAt: new Date() } })
  );
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
// 10 levels per side (20 orders total) for a deep, realistic order book.
const LEVELS = [
  [0.0002, 4.2],
  [0.0005, 3.6],
  [0.0010, 3.0],
  [0.0020, 2.5],
  [0.0040, 2.0],
  [0.0080, 1.6],
  [0.0150, 1.2],
  [0.0280, 0.9],
  [0.0500, 0.6],
  [0.0900, 0.4],
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
    else if (px >= 0.01)  priceStr = px.toFixed(6);
    else {
      // Sub-cent: derive decimals from magnitude so tight spreads never collapse
      // to the same rounded value (fixed toFixed(10) was too coarse below ~1e-6
      // and produced identical bid/ask strings for nano-cap pairs).
      const mag = -Math.floor(Math.log10(px));
      priceStr = px.toFixed(Math.min(mag + 4, 18)).replace(/0+$/, "").replace(/\.$/, "0");
    }

    const qtyStr   = qty >= 1 ? qty.toFixed(4) : qty.toFixed(8);
    const totalStr = (px * qty).toFixed(6);

    return { side, price: priceStr, quantity: qtyStr, total: totalStr };
  });
}

/* ── Build orders in memory for one market (no DB I/O) ──────────────────── */
function buildMarketOrders(
  symbol:      string,
  quoteAsset:  string,
  midPrice:    number,
  volume24h:   number,
  baseUsdPrice: number,
): (typeof ordersTable.$inferInsert)[] {
  // If the live price is missing, try the static fallback map
  if (!midPrice || midPrice <= 0) {
    const baseAsset = symbol.split("/")[0];
    midPrice = baseAsset ? (FALLBACK_PRICES[baseAsset] ?? 0) : 0;
  }
  if (!midPrice || midPrice <= 0) return []; // truly unknown — skip

  const bSize = baseSize(volume24h, midPrice, baseUsdPrice);
  const levels: LevelOrder[] = [
    ...buildLadder("buy",  midPrice, bSize),
    ...buildLadder("sell", midPrice, bSize),
  ];

  return levels.map(o => ({
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
  }));
}

/* ── Full cycle: iterate all active markets ─────────────────────────────── */
async function runCycle(): Promise<void> {
  try {
    const markets = await withDbRetry(() =>
      db.select({
        symbol:     marketsTable.symbol,
        baseAsset:  marketsTable.baseAsset,
        quoteAsset: marketsTable.quoteAsset,
        lastPrice:  marketsTable.lastPrice,
        volume24h:  marketsTable.volume24h,
        type:       marketsTable.type,
        status:     marketsTable.status,
      }).from(marketsTable)
        .where(notInArray(marketsTable.type, ["letsexchange"]))
    );
    const active = markets.filter(m => m.status === "active");

    // ── Step 1: Build the master USD price map from live USDT spot markets ──
    const usdMap = new Map<string, number>();
    for (const s of STABLECOINS) usdMap.set(s, 1);
    for (const [sym, px] of Object.entries(FALLBACK_PRICES)) {
      if (px > 0) usdMap.set(sym, px);
    }
    for (const m of active) {
      if (m.quoteAsset === "USDT" && m.type === "spot") {
        const p = parseFloat(m.lastPrice as string);
        if (p > 0) usdMap.set(m.baseAsset, p);
      }
    }

    // ── Step 2: Bulk update cross-pair prices ────────────────────────────────
    const crossUpdates: { symbol: string; price: string }[] = [];
    for (const m of active) {
      if (STABLECOINS.has(m.quoteAsset) || m.type === "futures") continue;
      const baseUSD  = usdMap.get(m.baseAsset);
      const quoteUSD = usdMap.get(m.quoteAsset);
      if (!baseUSD || !quoteUSD || quoteUSD <= 0) continue;
      const crossPrice = baseUSD / quoteUSD;
      if (!Number.isFinite(crossPrice) || crossPrice <= 0) continue;
      crossUpdates.push({ symbol: m.symbol, price: crossPrice.toFixed(8) });
    }

    if (crossUpdates.length > 0) {
      const BULK_CHUNK = 10_000;
      for (let ci = 0; ci < crossUpdates.length; ci += BULK_CHUNK) {
        const chunk       = crossUpdates.slice(ci, ci + BULK_CHUNK);
        const placeholders = chunk
          .map((_, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::numeric)`)
          .join(", ");
        const params = chunk.flatMap(u => [u.symbol, u.price]);
        await pool
          .query(
            `UPDATE markets AS m
               SET last_price = v.price
             FROM (VALUES ${placeholders}) AS v(symbol, price)
             WHERE m.symbol = v.symbol`,
            params,
          )
          .catch(err => {
            if (isDbConnError(err)) {
              logger.warn("liquidityBot: bulk cross-price update skipped — transient DB connection error");
            } else {
              logger.error({ err }, "Bot: bulk cross-price update failed");
            }
          });
      }
    }

    // ── Step 3: Build all new orders in memory (pure CPU, zero DB round-trips)
    // Previously: N×DELETE + N×INSERT + N×150ms delay = O(N) queries + O(N) latency.
    // Now: 1×DELETE (all bot orders) + chunked bulk INSERT = ~3 queries total.
    // This prevents the guardedInterval timeout that occurs once active markets
    // grow beyond ~80 (150ms × N markets eventually exceeds the 110s budget).
    const usdtVolByBase = new Map<string, number>();
    for (const m of active) {
      if (m.quoteAsset === "USDT" && m.type === "spot") {
        const v = parseFloat(m.volume24h as string) || 0;
        if (v > 0) usdtVolByBase.set(m.baseAsset, v);
      }
    }

    const allOrders: (typeof ordersTable.$inferInsert)[] = [];
    for (const m of active) {
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

      let vol = parseFloat(m.volume24h as string) || 0;
      if (vol <= 0 && baseUSD > 0 && quoteUSD > 0) {
        const usdtVol = usdtVolByBase.get(m.baseAsset) ?? 0;
        if (usdtVol > 0) vol = usdtVol / quoteUSD;
      }

      const marketOrders = buildMarketOrders(m.symbol, m.quoteAsset, midPrice, vol, baseUSD);
      for (const o of marketOrders) allOrders.push(o);
    }

    // Chunked DELETE — avoids a single 48k-row operation that exceeds the
    // query_timeout on the production DB (large table + 4 indexes + WAL).
    // Each chunk deletes ≤5 000 rows, completing in < 500 ms per round-trip.
    const DELETE_CHUNK = 5_000;
    let deletedCount: number;
    do {
      const result = await pool.query<{ id: string }>(
        `DELETE FROM orders
         WHERE id IN (
           SELECT id FROM orders
           WHERE wallet_address = $1 AND status = $2
           LIMIT $3
         )`,
        [BOT_ADDRESS, "open", DELETE_CHUNK],
      );
      deletedCount = result.rowCount ?? 0;
    } while (deletedCount >= DELETE_CHUNK);

    // Single UNNEST bulk INSERT — 1 DB round-trip for the entire batch.
    // Previously: 25 sequential db.insert() calls of 2,000 rows each held the
    // DB server under write pressure for ~100 s per cycle, saturating all pool
    // connections.  UNNEST processes the entire 48k-row batch in one pass:
    // the server reads the arrays, inserts all rows, and updates all 4 indexes
    // once — reducing write time to ~3-5 s and leaving the pool free.
    if (allOrders.length > 0) {
      const ids       = allOrders.map(o => o.id);
      const symbols   = allOrders.map(o => o.symbol);
      const sides     = allOrders.map(o => o.side);
      const prices    = allOrders.map(o => o.price    ?? "0");
      const qtys      = allOrders.map(o => o.quantity);
      const totals    = allOrders.map(o => o.total    ?? "0");
      const feeAssets = allOrders.map(o => o.feeAsset ?? "USDT");

      await pool.query(
        `INSERT INTO orders
           (id, symbol, wallet_address, network_type, side, type, status,
            price, stop_price, quantity, filled_quantity, remaining_quantity,
            total, fee, fee_asset, time_in_force, is_bot, is_synthetic)
         SELECT
           t.id, t.symbol, $8, 'bsv', t.side, 'limit', 'open',
           t.price, NULL, t.qty, 0, t.qty,
           t.total, 0, t.fee_asset, 'GTC', TRUE, FALSE
         FROM unnest($1::text[], $2::text[], $3::text[],
                     $4::numeric[], $5::numeric[], $6::numeric[], $7::text[])
              AS t(id, symbol, side, price, qty, total, fee_asset)
         ON CONFLICT (id) DO NOTHING`,
        [ids, symbols, sides, prices, qtys, totals, feeAssets, BOT_ADDRESS],
      ).catch(err => {
        if (isDbConnError(err)) {
          logger.warn("liquidityBot: UNNEST insert skipped — transient DB connection error");
        } else {
          logger.warn({ err, orderCount: allOrders.length }, "Bot: UNNEST bulk insert failed");
        }
      });
    }

    const activeLen = active.length;
    const ordersLen = allOrders.length;
    await accumulateCycleProfit(active);
    // Release large arrays before the next GC boundary
    (active as unknown[]).length = 0;
    crossUpdates.length = 0;
    allOrders.length = 0;
    usdMap.clear();
    usdtVolByBase.clear();
    // Hint V8 to collect now while the heap is clear (--expose-gc flag required)
    (globalThis as any).gc?.();
    serviceState.botLastCycleAt = Date.now();
    serviceState.botCycles++;
    logger.info({ markets: activeLen, orders: ordersLen }, "Liquidity bot cycle complete");
  } catch (err) {
    if (isDbConnError(err)) {
      logger.warn("liquidityBot: cycle skipped — transient DB connection error");
    } else {
      logger.error({ err }, "Liquidity bot cycle failed");
    }
  }
}

/* ── Public start function ──────────────────────────────────────────────── */
export function startLiquidityBot(): void {
  logger.info("Liquidity bot starting — seeding order books…");

  // Seed markets (fast no-op after first run) then hand full control to
  // guardedInterval.  The previous pattern called runCycle() directly before
  // guardedInterval started, which meant guardedInterval's busy-lock was never
  // set for that first run.  When the first cycle ran long (many chunks × pool
  // wait), guardedInterval fired a second concurrent cycle at T+120 s, stacking
  // multiple cycles and exhausting the connection pool.
  //
  // Fix: seed fire-and-forget, then guardedInterval owns ALL cycles starting at
  // initialDelayMs=500 ms (seed completes well within that window).
  seedMarketsIfNeeded()
    .catch(err => logger.warn({ err }, "Liquidity bot: market seed failed (non-fatal)"));

  guardedInterval("liquidity-bot", runCycle, 120_000, {
    timeoutMs:     110_000,
    initialDelayMs: 500,
  });
}
