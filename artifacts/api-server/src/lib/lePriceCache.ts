/**
 * lePriceCache.ts — Shared LetsExchange USD price cache
 *
 * Fetches coin→USDT rates from the LetsExchange /v1/info API in batches,
 * caches the results for 10 minutes, and exposes two helpers:
 *
 *   fetchLEPricesUSD(coins)  — trigger a full refresh (used by pairs route)
 *   getCachedLEPrices()      — non-blocking read of last cached map
 *   warmLEPriceCache()       — fire-and-forget warm-up (called at startup)
 *
 * Shared by both:
 *   routes/letsexchange.ts   — enriches LE pairs with real prices
 *   lib/priceUpdater.ts      — fills gaps for coins not on Binance/CoinGecko
 */

import { logger } from "./logger.js";

const LE_BASE      = "https://api.letsexchange.io/api";
const API_KEY      = process.env.LETSEXCHANGE_API_KEY ?? "";
const LE_PRICES_TTL = 10 * 60 * 1000; // 10 minutes

export interface NormalisedCoin {
  symbol:      string;
  name:        string;
  network:     string | null;
  networkName: string | null;
  image:       string | null;
  hasExtraId:  boolean;
  minAmount:   string | null;
  maxAmount:   string | null;
}

// ── Affiliate ID extraction ────────────────────────────────────────────────────
function getAffiliateId(): string {
  if (!API_KEY) return "";
  try {
    const parts = API_KEY.split(".");
    if (parts.length < 2) return "";
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const id = payload?.data?.id ?? payload?.sub ?? "";
    return String(id);
  } catch { return ""; }
}
export const AFFILIATE_ID = getAffiliateId();

// ── Shared in-memory cache ─────────────────────────────────────────────────────
interface CacheEntry { data: Record<string, number>; ts: number }
let _cache: CacheEntry | null = null;
let _pendingFetch: Promise<Record<string, number>> | null = null;

export function getCachedLEPrices(): Record<string, number> {
  if (_cache && Date.now() - _cache.ts < LE_PRICES_TTL) return _cache.data;
  return {};
}

// ── Low-level LE API helper ───────────────────────────────────────────────────
export async function leRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url  = `${LE_BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  const opts: RequestInit = { method, headers, signal: AbortSignal.timeout(8000) };
  if (body && method === "POST") opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ── Network→USDT network mapping ──────────────────────────────────────────────
function pickUsdtNet(coinNet: string | null): string {
  const n = (coinNet ?? "").toUpperCase();
  if (n === "TRC20" || n === "TRX")                  return "TRC20";
  if (n === "BEP20" || n === "BSC")                  return "BEP20";
  if (n === "SOL")                                    return "SOL";
  if (n === "POL" || n === "POLYGON" || n === "MATIC") return "POL";
  return "ERC20";
}

// ── Full batched price fetch ───────────────────────────────────────────────────
export async function fetchLEPricesUSD(
  coins: NormalisedCoin[],
): Promise<Record<string, number>> {
  // Return cached result if still fresh
  if (_cache && Date.now() - _cache.ts < LE_PRICES_TTL) return _cache.data;
  // Coalesce concurrent callers onto the same in-flight promise
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    // De-dupe: one network entry per symbol (first occurrence wins)
    const seen  = new Set<string>();
    const queue: NormalisedCoin[] = [];
    for (const c of coins) {
      if (!seen.has(c.symbol) && c.symbol !== "USDT" && c.symbol !== "USDC") {
        seen.add(c.symbol);
        queue.push(c);
      }
    }

    const map: Record<string, number> = {};
    const BATCH = 20;

    for (let i = 0; i < queue.length; i += BATCH) {
      const batch = queue.slice(i, i + BATCH);
      await Promise.all(batch.map(async coin => {
        try {
          const usdtNet     = pickUsdtNet(coin.network);
          const networkFrom = coin.network ?? coin.symbol;
          const mkBody = (amt: number) => ({
            from:         coin.symbol,
            to:           "USDT",
            network_from: networkFrom,
            network_to:   usdtNet,
            amount:       amt,
            affiliate_id: AFFILIATE_ID,
          });

          let amt = parseFloat(coin.minAmount ?? "") || 1;
          let res = await leRequest("/v1/info", "POST", mkBody(amt));
          if (res.ok && res.data) {
            let rate = parseFloat((res.data as any).rate ?? "");
            if (rate > 0) { map[coin.symbol] = rate; return; }

            // Retry with LE's stated minimum if first attempt gave rate=0
            const depositMin = parseFloat((res.data as any).deposit_min_amount ?? "");
            if (depositMin > 0 && depositMin !== amt) {
              res  = await leRequest("/v1/info", "POST", mkBody(depositMin));
              if (res.ok && res.data) {
                rate = parseFloat((res.data as any).rate ?? "");
                if (rate > 0) map[coin.symbol] = rate;
              }
            }
          }
        } catch { /* skip on network error */ }
      }));
      if (i + BATCH < queue.length) await new Promise(r => setTimeout(r, 200));
    }

    if (Object.keys(map).length > 5) {
      _cache = { data: map, ts: Date.now() };
      logger.info({ coins: Object.keys(map).length }, "LE USD prices cached (shared cache)");
    }
    _pendingFetch = null;
    return map;
  })();

  return _pendingFetch;
}

// ── Simple single-coin price fetch ────────────────────────────────────────────
// Used by the price updater to fetch prices for individual LE-only coins
// that aren't on Binance, without needing the full coin list.
export async function fetchLECoinPriceUSD(
  symbol: string,
  network: string | null,
  minAmount: string | null,
): Promise<number> {
  // Check shared cache first
  const cached = getCachedLEPrices();
  if (cached[symbol] && cached[symbol] > 0) return cached[symbol];

  try {
    const usdtNet = pickUsdtNet(network);
    const networkFrom = network ?? symbol;
    const mkBody = (amt: number) => ({
      from:         symbol,
      to:           "USDT",
      network_from: networkFrom,
      network_to:   usdtNet,
      amount:       amt,
      affiliate_id: AFFILIATE_ID,
    });

    let amt = parseFloat(minAmount ?? "") || 1;
    let res = await leRequest("/v1/info", "POST", mkBody(amt));
    if (res.ok && res.data) {
      let rate = parseFloat((res.data as any).rate ?? "");
      if (rate > 0) return rate;

      const depositMin = parseFloat((res.data as any).deposit_min_amount ?? "");
      if (depositMin > 0 && depositMin !== amt) {
        res = await leRequest("/v1/info", "POST", mkBody(depositMin));
        if (res.ok && res.data) {
          rate = parseFloat((res.data as any).rate ?? "");
          if (rate > 0) return rate;
        }
      }
    }
  } catch { /* silent */ }
  return 0;
}

// ── Key-coin definitions for direct LE price fetch ───────────────────────────
// Used when Binance is unavailable to get live prices for liquid coins.
const LE_KEY_COINS: Array<{ symbol: string; network: string; minAmount: string }> = [
  { symbol: "ETH",   network: "ETH",       minAmount: "0.01"   },
  { symbol: "BTC",   network: "BTC",       minAmount: "0.0001" },
  { symbol: "BNB",   network: "BEP20",     minAmount: "0.1"    },
  { symbol: "SOL",   network: "SOL",       minAmount: "0.1"    },
  { symbol: "XRP",   network: "XRP",       minAmount: "10"     },
  { symbol: "ADA",   network: "ADA",       minAmount: "10"     },
  { symbol: "DOGE",  network: "DOGE",      minAmount: "10"     },
  { symbol: "AVAX",  network: "AVAX",      minAmount: "0.1"    },
  { symbol: "MATIC", network: "POL",       minAmount: "10"     },
  { symbol: "LINK",  network: "ERC20",     minAmount: "1"      },
  { symbol: "DOT",   network: "DOT",       minAmount: "1"      },
  { symbol: "UNI",   network: "ERC20",     minAmount: "1"      },
  { symbol: "ATOM",  network: "COSMOS",    minAmount: "1"      },
  { symbol: "LTC",   network: "LTC",       minAmount: "0.1"    },
  { symbol: "BCH",   network: "BCH",       minAmount: "0.01"   },
  { symbol: "TRX",   network: "TRC20",     minAmount: "10"     },
  { symbol: "NEAR",  network: "NEAR",      minAmount: "1"      },
  { symbol: "ARB",   network: "ARBITRUM",  minAmount: "1"      },
  { symbol: "OP",    network: "OPTIMISM",  minAmount: "1"      },
  { symbol: "SUI",   network: "SUI",       minAmount: "1"      },
  { symbol: "INJ",   network: "INJ",       minAmount: "0.1"    },
  { symbol: "APT",   network: "APTOS",     minAmount: "0.1"    },
  { symbol: "MKR",   network: "ERC20",     minAmount: "0.01"   },
  { symbol: "AAVE",  network: "ERC20",     minAmount: "0.1"    },
];

/**
 * Fetches live USD prices from LetsExchange for the top liquid coins.
 * Results are stored in the shared cache (TTL = 10 min).
 * Called when Binance is unavailable so ETH/BTC/etc. get real market prices
 * rather than falling back to stale hardcoded values.
 *
 * Coins already present in a fresh cache are skipped — no redundant API calls.
 */
export async function fetchLEKeyPricesIfNeeded(): Promise<Record<string, number>> {
  // Return without fetching if the cache is still fresh
  if (_cache && Date.now() - _cache.ts < LE_PRICES_TTL) return _cache.data;

  // Coalesce concurrent callers
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    const map: Record<string, number> = { ...(_cache?.data ?? {}) };

    await Promise.allSettled(LE_KEY_COINS.map(async coin => {
      if (map[coin.symbol] && map[coin.symbol] > 0) return; // already cached

      const usdtNet = pickUsdtNet(coin.network);
      const mkBody = (amt: number) => ({
        from:         coin.symbol,
        to:           "USDT",
        network_from: coin.network,
        network_to:   usdtNet,
        amount:       amt,
        affiliate_id: AFFILIATE_ID,
      });

      try {
        let amt = parseFloat(coin.minAmount) || 1;
        const initialRes = await leRequest("/v1/info", "POST", mkBody(amt));
        if (initialRes.ok && initialRes.data) {
          let rate = parseFloat((initialRes.data as any).rate ?? "");
          if (rate > 0) { map[coin.symbol] = rate; return; }

          const depositMin = parseFloat((initialRes.data as any).deposit_min_amount ?? "");
          if (depositMin > 0 && depositMin !== amt) {
            const retryRes = await leRequest("/v1/info", "POST", mkBody(depositMin));
            if (retryRes.ok && retryRes.data) {
              rate = parseFloat((retryRes.data as any).rate ?? "");
              if (rate > 0) map[coin.symbol] = rate;
            }
          }
        }
      } catch { /* skip on network error */ }
    }));

    if (Object.keys(map).length > 0) {
      _cache = { data: map, ts: Date.now() };
    }
    _pendingFetch = null;
    return map;
  })();

  return _pendingFetch;
}

// ── Startup warm-up ───────────────────────────────────────────────────────────
// Fetches the full LE coin list and pre-populates the price cache.
// Called once at server start — non-blocking (fire and forget).
export async function warmLEPriceCache(): Promise<void> {
  if (!API_KEY) return;
  try {
    const res = await leRequest("/v2/coins");
    if (!res.ok || !Array.isArray(res.data)) return;

    // Normalise the raw coin list into NormalisedCoin[]
    const coins: NormalisedCoin[] = [];
    const seen = new Set<string>();
    for (const item of res.data as Record<string, unknown>[]) {
      const symbol = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      const networks = Array.isArray(item.networks)
        ? (item.networks as Record<string, unknown>[]).filter(n => n.is_active !== 0)
        : [];
      const network     = networks[0] ? (networks[0].code as string | null) ?? null : null;
      const networkName = networks[0] ? (networks[0].name as string | null) ?? null : null;
      coins.push({
        symbol,
        name:        (item.name ?? symbol) as string,
        network,
        networkName,
        image:       (item.icon ?? item.image ?? null) as string | null,
        hasExtraId:  networks[0] ? !!(networks[0].has_extra) : false,
        minAmount:   (item.min_amount ?? null) as string | null,
        maxAmount:   (item.max_amount ?? null) as string | null,
      });
    }

    await fetchLEPricesUSD(coins);
  } catch (err) {
    logger.warn({ err }, "LE price cache warm-up failed (non-fatal)");
  }
}
