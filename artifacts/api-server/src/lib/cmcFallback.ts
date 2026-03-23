/**
 * CoinMarketCap fallback helpers
 *
 * Used when CoinGecko is rate-limited (429) or unavailable.
 * All functions return null when the CMC_API_KEY env var is missing.
 */

const CMC_KEY = process.env["CMC_API_KEY"];
const CMC_BASE = "https://pro-api.coinmarketcap.com/v1";

function cmcHeaders() {
  return {
    "X-CMC_PRO_API_KEY": CMC_KEY ?? "",
    Accept: "application/json",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spot prices  (replaces CoinGecko /simple/price)
// Returns a map of SYMBOL → { usd, usd_24h_change, usd_24h_vol, usd_market_cap }
// ─────────────────────────────────────────────────────────────────────────────
export async function cmcFetchPrices(symbols: string[]): Promise<Record<string, {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  usd_market_cap: number;
}> | null> {
  if (!CMC_KEY) return null;
  try {
    const url = `${CMC_BASE}/cryptocurrency/quotes/latest?symbol=${symbols.join(",")}&convert=USD`;
    const res = await fetch(url, { headers: cmcHeaders(), signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const json = await res.json();
    const out: Record<string, any> = {};
    for (const [sym, data] of Object.entries(json.data as Record<string, any>)) {
      const q = data?.quote?.USD ?? {};
      out[sym.toUpperCase()] = {
        usd:             q.price             ?? 0,
        usd_24h_change:  q.percent_change_24h ?? 0,
        usd_24h_vol:     q.volume_24h         ?? 0,
        usd_market_cap:  q.market_cap         ?? 0,
      };
    }
    return out;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top coins market list  (replaces CoinGecko /coins/markets)
// Returns array of normalised coin objects, up to `limit` coins.
// ─────────────────────────────────────────────────────────────────────────────
export async function cmcFetchMarkets(limit = 250): Promise<any[] | null> {
  if (!CMC_KEY) return null;
  try {
    const pages = Math.ceil(limit / 200);
    const all: any[] = [];
    for (let start = 1; start <= pages * 200; start += 200) {
      const url = `${CMC_BASE}/cryptocurrency/listings/latest?start=${start}&limit=200&convert=USD&sort=market_cap`;
      const res = await fetch(url, { headers: cmcHeaders(), signal: AbortSignal.timeout(12000) });
      if (!res.ok) break;
      const json = await res.json();
      const batch: any[] = json.data ?? [];
      all.push(...batch);
      if (batch.length < 200) break;
      if (all.length >= limit) break;
    }
    if (!all.length) return null;
    return all.slice(0, limit).map((c: any, i: number) => {
      const q = c.quote?.USD ?? {};
      return {
        id:            `cmc-${c.id}`,
        rank:          c.cmc_rank ?? (i + 1),
        name:          c.name,
        symbol:        (c.symbol ?? "").toUpperCase(),
        image:         `https://s2.coinmarketcap.com/static/img/coins/64x64/${c.id}.png`,
        price:         q.price             ?? 0,
        marketCap:     q.market_cap         ?? 0,
        volume24h:     q.volume_24h         ?? 0,
        change24h:     q.percent_change_24h ?? 0,
        high24h:       0,
        low24h:        0,
        circulatingSupply: c.circulating_supply ?? 0,
      };
    });
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exchange listings  (replaces CoinGecko /exchanges)
// Returns { exchanges, totalVolumeUsd } or null
// ─────────────────────────────────────────────────────────────────────────────
export async function cmcFetchExchanges(limit = 100): Promise<{
  exchanges: any[];
  totalVolumeUsd: number;
} | null> {
  if (!CMC_KEY) return null;
  try {
    const url = `${CMC_BASE}/exchange/listings/latest?limit=${limit}&convert=USD&sort=volume_24h`;
    const res = await fetch(url, { headers: cmcHeaders(), signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const json = await res.json();
    const raw: any[] = json.data ?? [];
    let totalVolumeUsd = 0;
    const DEX_TYPES = new Set(["dex", "defi"]);
    const exchanges = raw.map((e: any, idx: number) => {
      const vol = e.quote?.USD?.volume_24h ?? 0;
      totalVolumeUsd += vol;
      const isDex = DEX_TYPES.has((e.type ?? "").toLowerCase());
      return {
        id:               String(e.id),
        name:             e.name,
        url:              e.urls?.website?.[0] ?? null,
        image:            e.logo ?? null,
        country:          e.country ?? null,
        yearEstablished:  e.date_launched ? new Date(e.date_launched).getFullYear() : null,
        type:             isDex ? "dex" : "cex",
        chain:            null,
        rank:             e.market_cap_by_total_assets_rank ?? (idx + 1),
        trustScore:       Math.round((e.quote?.USD?.effective_liquidity_24h ?? 5) / 10),
        tradeVolume24hBtc: 0,
        tradeVolume24hUsd: vol,
        marketCap:        e.quote?.USD?.market_cap_by_total_assets ?? 0,
        source:           "cmc",
      };
    });
    return { exchanges, totalVolumeUsd };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coin tickers / exchange listings for a single coin  (replaces CoinGecko /coins/:id/tickers)
// Returns normalised tickers array or null
// ─────────────────────────────────────────────────────────────────────────────
export async function cmcFetchTickers(symbol: string): Promise<any[] | null> {
  if (!CMC_KEY) return null;
  try {
    // Step 1: resolve symbol → CMC id
    const mapUrl = `${CMC_BASE}/cryptocurrency/map?symbol=${encodeURIComponent(symbol)}&limit=1`;
    const mapRes = await fetch(mapUrl, { headers: cmcHeaders(), signal: AbortSignal.timeout(10000) });
    if (!mapRes.ok) return null;
    const mapJson = await mapRes.json();
    const cmcId: number | undefined = mapJson.data?.[0]?.id;
    if (!cmcId) return null;

    // Step 2: get market pairs for that coin
    const pairsUrl = `${CMC_BASE}/exchange/market-pairs/latest?id=${cmcId}&limit=100&convert=USD`;
    const pairsRes = await fetch(pairsUrl, { headers: cmcHeaders(), signal: AbortSignal.timeout(10000) });
    if (!pairsRes.ok) return null;
    const pairsJson = await pairsRes.json();
    const pairs: any[] = pairsJson.data?.market_pairs ?? [];

    return pairs.map((p: any) => ({
      exchangeId:    String(p.exchange?.id ?? ""),
      exchangeName:  p.exchange?.name ?? "",
      exchangeLogo:  p.exchange?.logo ?? null,
      base:          p.market_pair_base?.currency_symbol ?? symbol,
      target:        p.market_pair_quote?.currency_symbol ?? "USDT",
      price:         p.quote?.USD?.price ?? 0,
      volume:        p.quote?.USD?.volume_24h ?? 0,
      spread:        null,
      trustScore:    null,
      tradeUrl:      null,
      convertedLast: p.quote?.USD?.price ?? 0,
      convertedVol:  p.quote?.USD?.volume_24h ?? 0,
      isAnomaly:     false,
      isStale:       false,
    }));
  } catch {
    return null;
  }
}
