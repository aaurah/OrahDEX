/**
 * universalMarkets.ts — Full N×(N-1) tradeable pair catalog.
 *
 * Collects unique canonical asset symbols from:
 *   1. Internal FALLBACK_PRICES (~160 coins) — highest priority, always present
 *   2. LetsExchange live /v2/coins or built-in fallback (~190–331 coins)
 *   3. SimpleSwap /get_all_currencies (~3 000 coins, normalized to canonical tickers)
 *
 * Caps the universe at CATALOG_MAX_ASSETS = 1 114, generating:
 *   1 114 × 1 113 = 1 239 882 directional pairs stored as type = "catalog".
 *
 * ISOLATION — catalog markets are intentionally excluded from all background services:
 *   • liquidityBot  – only handles type IN ('spot','futures') → no order books
 *   • priceUpdater  – only updates type IN ('spot','futures') → prices stay at seed value
 *   • SOR / routes  – catalog pairs resolve price via the USDT bridge at trade time
 */
import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { logger } from "./logger.js";
import { FALLBACK_PRICES } from "./priceUpdater.js";

export const CATALOG_MAX_ASSETS = 1_114;

const BASE_BATCH   = 20;    // base coins processed per outer iteration
const INSERT_CHUNK = 1_000; // DB insert batch size (avoids giant transactions)

// ── SS network-specific ticker → canonical OrahDEX symbol ─────────────────────
// Mirrors SS_TO_SYMBOL in priceUpdater.ts; duplicated here to avoid circular import.
const SS_NORM: Record<string, string> = {
  usdterc20:"USDT", usdttrc20:"USDT", usdtbsc:"USDT",   usdtsol:"USDT",
  usdtmatic:"USDT", usdtton:"USDT",   usdtop:"USDT",    usdtarb:"USDT",
  usdtavax:"USDT",  usdtalgo:"USDT",  usdtkava:"USDT",  usdtcelo:"USDT",
  usdcerc20:"USDC", usdcbsc:"USDC",   usdcsol:"USDC",   usdcmatic:"USDC",
  usdcop:"USDC",    usdcarb:"USDC",   usdcbase:"USDC",  usdcavax:"USDC", usdcton:"USDC",
  "bnb-bsc":"BNB",  bnbbsc:"BNB",     pol:"MATIC",      avaxc:"AVAX",
  etharb:"ETH",     ethop:"ETH",      ethbase:"ETH",    ethlinea:"ETH",
  ethscroll:"ETH",  ethbsc:"ETH",
  wbtcerc20:"WBTC", wbtcbsc:"WBTC",
  daierc20:"DAI",   daibsc:"DAI",     daimatic:"DAI",   daiarb:"DAI",
  linkbsc:"LINK",   unibsc:"UNI",
};

function normSS(ticker: string): string | null {
  if (!ticker) return null;
  const mapped = SS_NORM[ticker.toLowerCase()];
  if (mapped) return mapped;
  const c = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length >= 1 && c.length <= 12 ? c : null;
}

// Price formatter — mirrors fmtPrice() in priceUpdater.ts (not exported there)
function fmtP(p: number): string {
  if (!p || p <= 0 || !isFinite(p)) return "0";
  if (p >= 1_000)  return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.01)   return p.toFixed(6);
  if (p >= 0.0001) return p.toFixed(8);
  return p.toFixed(12).replace(/0+$/, "").replace(/\.$/, "0");
}

/**
 * Collect up to CATALOG_MAX_ASSETS unique canonical symbols, priority-ordered:
 *   internal FALLBACK_PRICES → LE live / built-in → SS live
 */
export async function collectCatalogAssets(): Promise<string[]> {
  const seen    = new Set<string>();
  const ordered: string[] = [];

  const add = (sym: string) => {
    const s = sym.toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
    if (!s || s.length > 12 || seen.has(s)) return;
    seen.add(s);
    ordered.push(s);
  };

  // 1. Internal known assets (always tradeable, have fallback prices)
  for (const sym of Object.keys(FALLBACK_PRICES)) add(sym);

  // 2. LE live API; fall back to built-in coin list on any failure
  let leFetched = false;
  try {
    const { leRequest } = await import("./lePriceCache.js");
    const res = await leRequest("/v2/coins");
    if (res.ok && Array.isArray(res.data) && (res.data as unknown[]).length > 0) {
      for (const item of res.data as Record<string, unknown>[]) {
        const code = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase().trim();
        if (code) add(code);
      }
      leFetched = true;
    }
  } catch { /* fall through */ }

  if (!leFetched) {
    try {
      const { getBuiltInLeCoins } = await import("./leAllCoins.js");
      for (const s of getBuiltInLeCoins()) add(s);
    } catch { /* ignore */ }
  }

  // 3. SS live currency catalog (normalized)
  try {
    const { fetchSSCurrencies, isSimpleSwapConfigured } = await import("./simpleswap.js");
    if (isSimpleSwapConfigured()) {
      const currencies = await fetchSSCurrencies();
      for (const c of currencies) {
        const sym = normSS(c.symbol ?? "");
        if (sym) add(sym);
      }
    }
  } catch { /* non-fatal — SS is optional */ }

  return ordered.slice(0, CATALOG_MAX_ASSETS);
}

// Guards against concurrent runs (the job can take 2–5 min)
let _running = false;

/**
 * Generate the full N×(N-1) catalog of type="catalog" markets.
 *
 * Idempotent — ON CONFLICT DO NOTHING makes re-runs safe.
 * Expected runtime: ~2–5 min for 1.24 M pairs.
 */
export async function generateUniversalMarkets(): Promise<{ assets: number; inserted: number }> {
  if (_running) {
    logger.info("generateUniversalMarkets: already running — skipping this cycle");
    return { assets: 0, inserted: 0 };
  }
  _running = true;

  try {
    logger.info("generateUniversalMarkets: collecting asset universe…");
    const assets = await collectCatalogAssets();
    const N = assets.length;

    logger.info(
      { N, pairs: N * (N - 1) },
      `generateUniversalMarkets: ${N} unique assets → ${N * (N - 1)} pairs`,
    );

    let totalInserted = 0;

    for (let bi = 0; bi < N; bi += BASE_BATCH) {
      const baseBatch = assets.slice(bi, bi + BASE_BATCH);
      const rows: (typeof marketsTable.$inferInsert)[] = [];

      for (const base of baseBatch) {
        const baseUSD = FALLBACK_PRICES[base] ?? 0;
        for (const quote of assets) {
          if (base === quote) continue;
          const quoteUSD = FALLBACK_PRICES[quote] ?? 0;
          const price    = (baseUSD > 0 && quoteUSD > 0) ? fmtP(baseUSD / quoteUSD) : "0";
          rows.push({
            symbol:                `${base}/${quote}`,
            baseAsset:             base,
            quoteAsset:            quote,
            lastPrice:             price,
            priceChange24h:        "0",
            priceChangePercent24h: "0",
            volume24h:             "0",
            high24h:               price,
            low24h:                price,
            status:                "active",
            type:                  "catalog",
          });
        }
      }

      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        try {
          const result = await db
            .insert(marketsTable)
            .values(rows.slice(i, i + INSERT_CHUNK))
            .onConflictDoNothing();
          totalInserted += (result as any).rowCount ?? 0;
        } catch (err) {
          logger.warn({ err, base: baseBatch[0] }, "generateUniversalMarkets: chunk insert failed (non-fatal)");
        }
      }

      if (Math.floor(bi / BASE_BATCH) % 10 === 0) {
        logger.info(
          { progress: `${bi + baseBatch.length}/${N} bases`, inserted: totalInserted },
          "generateUniversalMarkets: progress",
        );
      }
    }

    logger.info(
      { N, inserted: totalInserted, total: N * (N - 1) },
      "generateUniversalMarkets: complete",
    );
    return { assets: N, inserted: totalInserted };
  } finally {
    _running = false;
  }
}
