import { Router, type IRouter } from "express";

const router: IRouter = Router();

let cache: { data: any; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

// Separate long-lived cache for coin market caps (30 min) to avoid rate-limiting
let mcCache: { defiMcByName: Record<string,number>; defiMcById: Record<string,number>; cefiMcByName: Record<string,number>; cefiMcById: Record<string,number>; defiTotal: number; cefiTotal: number; ts: number } | null = null;
const MC_CACHE_MS = 30 * 60 * 1000;

// Chain mapping for DEX identification
const CHAIN_MAP: Array<[string[], string]> = [
  [["raydium", "orca", "serum", "lifinity", "saber", "marinade", "aldrin"], "Solana"],
  [["pancakeswap", "pancake", "biswap", "apeswap", "babyswap", "nomiswap"], "BSC"],
  [["quickswap", "swapr", "dfyn", "polydex", "polycat"], "Polygon"],
  [["gmx", "camelot", "zyberswap", "arbswap"], "Arbitrum"],
  [["velodrome", "aerodrome"], "Base/Optimism"],
  [["traderjoe", "trader_joe", "pangolin", "platypus", "lydia"], "Avalanche"],
  [["osmosis", "junoswap", "terraswap", "astroport"], "Cosmos"],
  [["thorswap", "thorchain"], "THORChain"],
  [["loopring", "zigzag"], "Ethereum L2"],
  [["spookyswap", "spiritswap", "beethoven_x"], "Fantom"],
  [["uniswap", "sushiswap", "curve", "balancer", "dydx", "bancor", "kyber", "1inch",
    "paraswap", "dodo", "hashflow", "clipper", "maverick", "woofi"], "Ethereum"],
];

function getChain(id: string, name: string): string {
  const s = (id + " " + name).toLowerCase();
  for (const [keys, chain] of CHAIN_MAP) {
    if (keys.some(k => s.includes(k))) return chain;
  }
  if (s.includes("solana")) return "Solana";
  if (s.includes("polygon") || s.includes("matic")) return "Polygon";
  if (s.includes("arbitrum")) return "Arbitrum";
  if (s.includes("optimis")) return "Optimism";
  if (s.includes("avalanche") || s.includes("avax")) return "Avalanche";
  if (s.includes("bsc") || s.includes("binance smart")) return "BSC";
  if (s.includes("cosmos")) return "Cosmos";
  if (s.includes("near")) return "NEAR";
  if (s.includes("tron")) return "Tron";
  return "Ethereum";
}

// Known exchange-id → CoinGecko token-id mapping for market cap lookup
const CEX_TOKEN_MAP: Record<string, string> = {
  binance:         "binancecoin",
  okex:            "okb",
  "crypto-com":    "crypto-com-chain",
  kucoin:          "kucoin-shares",
  bitget:          "bitget-token",
  gateio:          "gatechain-token",
  bitfinex:        "leo-token",
  woo_network:     "woo-network",
  mexc:            "mexc-token",
  huobi:           "huobi-token",
};

// Fuzzy match exchange name → market cap from coin list
function matchMarketCap(
  id: string,
  name: string,
  mcByName: Record<string, number>,
  mcById: Record<string, number>,
  isCex: boolean
): number {
  // Direct CEX token override
  if (isCex) {
    const tokenId = CEX_TOKEN_MAP[id.toLowerCase()];
    if (tokenId && mcById[tokenId.replace(/[^a-z0-9]/g, "")]) {
      return mcById[tokenId.replace(/[^a-z0-9]/g, "")];
    }
  }
  const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (mcByName[n]) return mcByName[n];
  const idClean = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (mcById[idClean]) return mcById[idClean];
  const firstWord = n.split(" ")[0];
  if (!firstWord || firstWord.length < 3) return 0;
  for (const [key, val] of Object.entries(mcByName)) {
    const kFirst = key.split(" ")[0];
    if (kFirst === firstWord || kFirst.startsWith(firstWord) || firstWord.startsWith(kFirst)) {
      return val;
    }
  }
  return 0;
}

async function fetchCoinMarketCaps() {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  const result = { defiMcByName: {} as Record<string,number>, defiMcById: {} as Record<string,number>, cefiMcByName: {} as Record<string,number>, cefiMcById: {} as Record<string,number>, defiTotal: 0, cefiTotal: 0 };
  try {
    const defiResp = await fetch("https://api.coingecko.com/api/v3/coins/markets?category=decentralized-exchange&vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false", { headers: { Accept: "application/json" } });
    if (defiResp.ok) {
      const coins: any[] = await defiResp.json();
      for (const c of coins) if (c.market_cap) {
        result.defiMcByName[c.name.toLowerCase().replace(/[^a-z0-9 ]/g, "")] = c.market_cap;
        result.defiMcById[c.id.toLowerCase().replace(/[^a-z0-9]/g, "")] = c.market_cap;
        result.defiTotal += c.market_cap;
      }
    }
    await delay(1200);
    const cefiResp = await fetch("https://api.coingecko.com/api/v3/coins/markets?ids=binancecoin,okb,crypto-com-chain,kucoin-shares,bitget-token,gatechain-token,leo-token,woo-network,mexc-token,huobi-token&vs_currency=usd&sparkline=false", { headers: { Accept: "application/json" } });
    if (cefiResp.ok) {
      const coins: any[] = await cefiResp.json();
      for (const c of coins) if (c.market_cap) {
        result.cefiMcByName[c.name.toLowerCase().replace(/[^a-z0-9 ]/g, "")] = c.market_cap;
        result.cefiMcById[c.id.toLowerCase().replace(/[^a-z0-9]/g, "")] = c.market_cap;
        result.cefiTotal += c.market_cap;
      }
    }
  } catch {}
  return result;
}

// Lightweight prices cache (60 s TTL)
let priceCache: { data: any; ts: number } | null = null;
const PRICE_CACHE_MS = 60 * 1000;

router.get("/dex/prices", async (_req, res) => {
  try {
    if (priceCache && Date.now() - priceCache.ts < PRICE_CACHE_MS) return res.json(priceCache.data);
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,bitcoin-cash-sv,tether&vs_currencies=usd&include_24hr_change=true",
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) throw new Error("CoinGecko price fetch failed");
    const raw = await resp.json();
    const data = {
      BTC:  { usd: raw?.bitcoin?.usd ?? 65000,         change24h: raw?.bitcoin?.usd_24h_change ?? 0 },
      ETH:  { usd: raw?.ethereum?.usd ?? 3200,          change24h: raw?.ethereum?.usd_24h_change ?? 0 },
      BSV:  { usd: raw?.["bitcoin-cash-sv"]?.usd ?? 55, change24h: raw?.["bitcoin-cash-sv"]?.usd_24h_change ?? 0 },
      USDT: { usd: 1,                                   change24h: 0 },
    };
    priceCache = { data, ts: Date.now() };
    res.json(data);
  } catch {
    // Return last cached data or fallback
    if (priceCache) return res.json(priceCache.data);
    res.json({
      BTC:  { usd: 65000, change24h: 0 },
      ETH:  { usd: 3200,  change24h: 0 },
      BSV:  { usd: 55,    change24h: 0 },
      USDT: { usd: 1,     change24h: 0 },
    });
  }
});

router.get("/dex/exchanges", async (req, res) => {
  try {
    if (cache && Date.now() - cache.ts < CACHE_MS) return res.json(cache.data);

    // Refresh coin market caps if stale (30 min TTL — separate from exchange cache)
    if (!mcCache || Date.now() - mcCache.ts > MC_CACHE_MS) {
      const mc = await fetchCoinMarketCaps();
      mcCache = { ...mc, ts: Date.now() };
    }
    const { defiMcByName, defiMcById, cefiMcByName, cefiMcById, defiTotal: defiMarketCap, cefiTotal: cefiMarketCap } = mcCache!;

    // Fetch exchange list + BTC price in parallel (both are lightweight)
    const [exRes, btcRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/exchanges?per_page=250&page=1", { headers: { Accept: "application/json" } }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", { headers: { Accept: "application/json" } }),
    ]);

    if (exRes.status === "rejected" || !(exRes.value as Response).ok) {
      throw new Error("CoinGecko exchanges fetch failed");
    }

    const allExchanges: any[] = await (exRes.value as Response).json();

    let btcPrice = 65000;
    if (btcRes.status === "fulfilled" && (btcRes.value as Response).ok) {
      const p = await (btcRes.value as Response).json();
      btcPrice = p?.bitcoin?.usd ?? btcPrice;
    }

    // Determine if an exchange is a DEX
    const DEX_KEYWORDS = [
      "uniswap", "pancake", "sushi", "curve", "balancer", "dydx", "gmx",
      "velodrome", "aerodrome", "camelot", "traderjoe", "trader joe", "quickswap",
      "spookyswap", "apeswap", "biswap", "osmosis", "raydium", "orca", "dodo",
      "1inch", "kyber", "loopring", "hashflow", "clipper", "paraswap", "woofi",
      "thorswap", "zigzag", "maverick", "swap", "dex", "defi",
    ];
    function isDex(e: any): boolean {
      if (e.centralized === false) return true;
      if (e.centralized === true) return false;
      const s = ((e.name ?? "") + " " + (e.id ?? "")).toLowerCase();
      return DEX_KEYWORDS.some(kw => s.includes(kw));
    }

    const exchanges = allExchanges.map((e) => {
      const dex = isDex(e);
      const mcByName = dex ? defiMcByName : cefiMcByName;
      const mcById = dex ? defiMcById : cefiMcById;
      const vol = (parseFloat(e.trade_volume_24h_btc) || 0) * btcPrice;
      return {
        id: e.id,
        name: e.name,
        url: e.url,
        image: e.image,
        country: e.country ?? null,
        yearEstablished: e.year_established ?? null,
        type: dex ? "dex" : "cex",
        chain: dex ? getChain(e.id, e.name) : null,
        trustScore: e.trust_score ?? 0,
        tradeVolume24hBtc: parseFloat(e.trade_volume_24h_btc) || 0,
        tradeVolume24hUsd: vol,
        marketCap: matchMarketCap(e.id, e.name, mcByName, mcById, !dex),
      };
    });

    // Inject OrahDEX as a pinned DEX entry (always first in DEX list)
    const orahVolBtc = 120;
    exchanges.unshift({
      id: "orahdex",
      name: "OrahDEX",
      url: "https://orahdex.org",
      image: null,
      country: null,
      yearEstablished: 2026,
      type: "dex",
      chain: "BSV",
      trustScore: 9,
      tradeVolume24hBtc: orahVolBtc,
      tradeVolume24hUsd: orahVolBtc * btcPrice,
      marketCap: 28000000,
    });

    const totalVolumeBtc = exchanges.reduce((s, e) => s + e.tradeVolume24hBtc, 0);
    const dexCount = exchanges.filter(e => e.type === "dex").length;
    const cexCount = exchanges.filter(e => e.type === "cex").length;

    const result = {
      btcPrice,
      totalVolumeBtc,
      totalVolumeUsd: totalVolumeBtc * btcPrice,
      defiMarketCap,
      cefiMarketCap,
      totalMarketCap: defiMarketCap + cefiMarketCap,
      exchangeCount: exchanges.length,
      dexCount,
      cexCount,
      exchanges,
    };

    cache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch exchanges");
    if (cache) return res.json(cache.data);
    res.status(502).json({ error: "Failed to fetch exchange data" });
  }
});

export default router;
