import { Router, type IRouter } from "express";

const router: IRouter = Router();

// In-memory cache
let dexCache: { data: any; ts: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 minutes

router.get("/dex/exchanges", async (req, res) => {
  try {
    if (dexCache && Date.now() - dexCache.ts < CACHE_MS) {
      return res.json(dexCache.data);
    }

    // CoinGecko free public API — no key required
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/exchanges?per_page=250&page=1",
      { headers: { Accept: "application/json" } }
    );

    if (!resp.ok) throw new Error(`CoinGecko status ${resp.status}`);

    const all: any[] = await resp.json();

    // Known DEX keywords to identify decentralized exchanges
    const DEX_KEYWORDS = [
      "uniswap", "pancake", "sushi", "curve", "balancer", "dydx", "gmx",
      "velodrome", "aerodrome", "camelot", "trader joe", "quickswap",
      "spookyswap", "spiritswap", "dfyn", "apeswap", "biswap", "mdex",
      "osmosis", "terraswap", "astroport", "loop", "prism", "junoswap",
      "raydium", "serum", "orca", "saber", "cropper", "lifinity",
      "dodo", "1inch", "paraswap", "kyber", "bancor", "loopring",
      "zkswap", "zigzag", "hashflow", "clipper", "defi", "swap",
    ];
    function isDex(e: any): boolean {
      if (e.centralized === false) return true;
      if (e.centralized === true) return false;
      // If centralized field is absent, use name heuristics
      const name = (e.name ?? "").toLowerCase();
      const id = (e.id ?? "").toLowerCase();
      return DEX_KEYWORDS.some((kw) => name.includes(kw) || id.includes(kw));
    }

    // Filter decentralized exchanges only
    const dexes = all
      .filter(isDex)
      .map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        image: e.image,
        country: e.country ?? null,
        yearEstablished: e.year_established ?? null,
        trustScore: e.trust_score ?? 0,
        trustScoreRank: e.trust_score_rank ?? null,
        tradeVolume24hBtc: parseFloat(e.trade_volume_24h_btc) || 0,
        tradeVolume24hBtcNormalized: parseFloat(e.trade_volume_24h_btc_normalized) || 0,
      }))
      .sort((a, b) => b.tradeVolume24hBtc - a.tradeVolume24hBtc);

    // Fetch BTC price to convert volumes to USD
    let btcPrice = 65000;
    try {
      const priceResp = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        { headers: { Accept: "application/json" } }
      );
      const priceData = await priceResp.json();
      btcPrice = priceData?.bitcoin?.usd ?? btcPrice;
    } catch {}

    const totalVolumeBtc = dexes.reduce((s, e) => s + e.tradeVolume24hBtc, 0);

    const result = {
      btcPrice,
      totalVolumeBtc,
      totalVolumeUsd: totalVolumeBtc * btcPrice,
      exchangeCount: dexes.length,
      exchanges: dexes.map((e) => ({
        ...e,
        tradeVolume24hUsd: e.tradeVolume24hBtc * btcPrice,
      })),
    };

    dexCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch DEX exchanges");
    // Return stale cache if available
    if (dexCache) return res.json(dexCache.data);
    res.status(502).json({ error: "Failed to fetch DEX exchange data" });
  }
});

export default router;
