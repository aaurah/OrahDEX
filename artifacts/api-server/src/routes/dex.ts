import { Router, type IRouter } from "express";

const router: IRouter = Router();

let dexCache: { data: any; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

// Chain mapping indexed by CoinGecko exchange id fragments
const CHAIN_MAP: Array<[string[], string]> = [
  [["raydium", "orca", "serum", "lifinity", "saber", "cropper", "aldrin", "marinade"], "Solana"],
  [["pancakeswap", "pancake", "biswap", "apeswap", "babyswap", "nomiswap"], "BSC"],
  [["quickswap", "swapr", "dfyn", "polydex", "polycat"], "Polygon"],
  [["gmx", "camelot", "zyberswap", "arbswap", "sushiswap_arbitrum"], "Arbitrum"],
  [["velodrome", "aerodrome"], "Base/Optimism"],
  [["traderjoe", "trader_joe", "pangolin", "platypus", "lydia"], "Avalanche"],
  [["osmosis", "junoswap", "terraswap", "astroport", "loop", "prism"], "Cosmos"],
  [["thorswap", "thorchain"], "THORChain"],
  [["loopring", "zigzag"], "Ethereum L2"],
  [["spookyswap", "spiritswap", "beethoven_x"], "Fantom"],
  [["uniswap", "sushiswap", "curve", "balancer", "dydx", "bancor", "kyber", "1inch", "paraswap",
    "dodo", "hashflow", "clipper", "maverick", "woofi", "openocean"], "Ethereum"],
];

function getChain(id: string, name: string): string {
  const s = (id + " " + name).toLowerCase();
  for (const [keys, chain] of CHAIN_MAP) {
    if (keys.some(k => s.includes(k))) return chain;
  }
  if (s.includes("solana") || s.includes("sol")) return "Solana";
  if (s.includes("polygon") || s.includes("matic")) return "Polygon";
  if (s.includes("arbitrum") || s.includes("arb")) return "Arbitrum";
  if (s.includes("optimis")) return "Optimism";
  if (s.includes("avalanche") || s.includes("avax")) return "Avalanche";
  if (s.includes("bsc") || s.includes("binance")) return "BSC";
  if (s.includes("cosmos") || s.includes("atom")) return "Cosmos";
  if (s.includes("base")) return "Base";
  if (s.includes("near")) return "NEAR";
  if (s.includes("tron")) return "Tron";
  if (s.includes("swap") || s.includes("dex") || s.includes("defi")) return "Ethereum";
  return "Multi-chain";
}

router.get("/dex/exchanges", async (req, res) => {
  try {
    if (dexCache && Date.now() - dexCache.ts < CACHE_MS) {
      return res.json(dexCache.data);
    }

    const [exchangesResult, defiResult, btcResult] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/exchanges?per_page=250&page=1", {
        headers: { Accept: "application/json" },
      }),
      fetch(
        "https://api.coingecko.com/api/v3/coins/markets?category=decentralized-exchange&vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false",
        { headers: { Accept: "application/json" } }
      ),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
        headers: { Accept: "application/json" },
      }),
    ]);

    if (exchangesResult.status === "rejected" || !(exchangesResult.value as Response).ok) {
      throw new Error("CoinGecko exchanges fetch failed");
    }

    const all: any[] = await (exchangesResult.value as Response).json();

    // Build market-cap lookup from DeFi category coins
    const mcByName: Record<string, number> = {};
    const mcById: Record<string, number> = {};
    let totalMarketCap = 0;
    if (defiResult.status === "fulfilled" && (defiResult.value as Response).ok) {
      const coins: any[] = await (defiResult.value as Response).json();
      for (const c of coins) {
        if (c.market_cap) {
          mcByName[c.name.toLowerCase()] = c.market_cap;
          mcById[c.id.toLowerCase()] = c.market_cap;
          totalMarketCap += c.market_cap;
        }
      }
    }

    let btcPrice = 65000;
    if (btcResult.status === "fulfilled" && (btcResult.value as Response).ok) {
      const p = await (btcResult.value as Response).json();
      btcPrice = p?.bitcoin?.usd ?? btcPrice;
    }

    // Resolve market cap for an exchange by fuzzy-matching against DeFi coins list
    function resolveMarketCap(id: string, name: string): number {
      const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      if (mcByName[n]) return mcByName[n];
      const primary = n.split(" ")[0];
      for (const [key, val] of Object.entries(mcByName)) {
        const k = key.split(" ")[0];
        if (primary && k && (primary === k || primary.startsWith(k) || k.startsWith(primary))) {
          return val;
        }
      }
      return 0;
    }

    // Identify DEX — prefer CoinGecko's centralized field, fallback to keyword match
    const DEX_KEYWORDS = [
      "uniswap", "pancake", "sushi", "curve", "balancer", "dydx", "gmx",
      "velodrome", "aerodrome", "camelot", "trader joe", "traderjoe", "quickswap",
      "spookyswap", "spiritswap", "apeswap", "biswap", "osmosis", "raydium",
      "orca", "dodo", "1inch", "kyber", "loopring", "hashflow", "clipper",
      "paraswap", "woofi", "openocean", "thorswap", "zigzag", "maverick",
      "swap", "dex", "defi",
    ];
    function isDex(e: any): boolean {
      if (e.centralized === false) return true;
      if (e.centralized === true) return false;
      const s = ((e.name ?? "") + " " + (e.id ?? "")).toLowerCase();
      return DEX_KEYWORDS.some(kw => s.includes(kw));
    }

    const dexes = all
      .filter(isDex)
      .map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        image: e.image,
        country: e.country ?? null,
        yearEstablished: e.year_established ?? null,
        chain: getChain(e.id, e.name),
        trustScore: e.trust_score ?? 0,
        trustScoreRank: e.trust_score_rank ?? null,
        tradeVolume24hBtc: parseFloat(e.trade_volume_24h_btc) || 0,
        tradeVolume24hUsd: (parseFloat(e.trade_volume_24h_btc) || 0) * btcPrice,
        marketCap: resolveMarketCap(e.id, e.name),
      }))
      .sort((a, b) => b.tradeVolume24hUsd - a.tradeVolume24hUsd);

    const totalVolumeBtc = dexes.reduce((s, e) => s + e.tradeVolume24hBtc, 0);

    const result = {
      btcPrice,
      totalVolumeBtc,
      totalVolumeUsd: totalVolumeBtc * btcPrice,
      totalMarketCap,
      exchangeCount: dexes.length,
      exchanges: dexes,
    };

    dexCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to fetch DEX exchanges");
    if (dexCache) return res.json(dexCache.data);
    res.status(502).json({ error: "Failed to fetch DEX exchange data" });
  }
});

export default router;
