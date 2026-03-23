import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { cmcFetchPrices } from "./cmcFallback.js";

export const STABLECOIN_QUOTES = new Set(["USDT", "USDC", "TUSD", "USDD", "BUSD"]);

export const COINGECKO_IDS: Record<string, string> = {
  BSV:  "bitcoin-sv",
  BTC:  "bitcoin",
  ETH:  "ethereum",
  USDC: "usd-coin",
  TUSD: "true-usd",
  USDD: "usdd",
  SOL:  "solana",
  XRP:  "ripple",
  BNB:  "binancecoin",
  ADA:  "cardano",
  DOGE: "dogecoin",
  DOT:  "polkadot",
  AVAX: "avalanche-2",
  MATIC:"matic-network",
  LINK: "chainlink",
  UNI:  "uniswap",
  ATOM: "cosmos",
  LTC:  "litecoin",
  BCH:  "bitcoin-cash",
  TRX:  "tron",
  ETC:  "ethereum-classic",
  NEAR: "near",
  ICP:  "internet-computer",
  VET:  "vechain",
  FIL:  "filecoin",
  SAND: "the-sandbox",
  MANA: "decentraland",
  APT:  "aptos",
  ARB:  "arbitrum",
  OP:   "optimism",
  SUI:  "sui",
  INJ:  "injective-protocol",
  PEPE: "pepe",
  SHIB: "shiba-inu",
  MKR:  "maker",
  AAVE: "aave",
  CRV:  "curve-dao-token",
  ENS:  "ethereum-name-service",
  LDO:  "lido-dao",
  SUSHI:"sushi",
  COMP: "compound-governance-token",
  GRT:  "the-graph",
  SNX:  "havven",
  YFI:  "yearn-finance",
  RUNE: "thorchain",
  FTM:  "fantom",
  ALGO: "algorand",
  XLM:  "stellar",
  HBAR: "hedera-hashgraph",
  EGLD: "elrond-erd-2",
  THETA:"theta-token",
  EOS:  "eos",
  ZEC:  "zcash",
  DASH: "dash",
  XMR:  "monero",
  CRO:  "crypto-com-chain",
};

// USDT pairs — all major coins
export const USDT_PAIRS = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP",
  "VET","FIL","SAND","MANA","APT","ARB","OP","SUI","INJ","PEPE",
  "SHIB","MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX",
  "YFI","RUNE","FTM","ALGO","XLM","HBAR","EGLD","THETA","EOS","ZEC",
  "DASH","XMR",
];

// BTC pairs — major coins vs BTC
export const BTC_PAIRS = [
  "ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","NEAR","APT","ARB","OP","SUI","INJ",
];

// ETH pairs — top coins vs ETH
export const ETH_PAIRS = [
  "BTC","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","NEAR","APT","ARB","OP","SUI","INJ",
];

// Stablecoin pairs — USDC, TUSD, USDD quote assets
const STABLE_BASE_PAIRS = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","UNI","ATOM","LTC","BCH","NEAR","APT","ARB","OP","SUI","INJ",
];
export const USDC_PAIRS = STABLE_BASE_PAIRS;
export const TUSD_PAIRS = STABLE_BASE_PAIRS;
export const USDD_PAIRS = STABLE_BASE_PAIRS;

// BCH pairs — top coins vs Bitcoin Cash
export const BCH_PAIRS = [
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","LTC","NEAR","APT","ARB","OP","SUI","INJ",
];

// BNB pairs — top coins vs BNB
export const BNB_PAIRS = [
  "BTC","ETH","SOL","XRP","ADA","DOGE","DOT","AVAX","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","BSV","TRX","NEAR","APT","ARB","OP",
  "SUI","INJ","PEPE","SHIB","AAVE","CRV","MKR","FIL","ALGO","XLM",
];

// ── EVM chain quote markets ────────────────────────────────────────────────

// MATIC (Polygon) pairs
export const MATIC_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","AVAX","LINK",
  "UNI","ATOM","LTC","BCH","BSV","TRX","NEAR","APT","ARB","OP","SUI","INJ",
];

// AVAX (Avalanche) pairs
export const AVAX_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","BSV","NEAR","APT","ARB","OP","SUI","INJ",
];

// ARB (Arbitrum) pairs
export const ARB_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","NEAR","OP","SUI","INJ","AAVE","CRV",
];

// OP (Optimism) pairs
export const OP_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","NEAR","ARB","SUI","INJ","AAVE","CRV",
];

// FTM (Fantom) pairs
export const FTM_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","NEAR","ARB","OP","AAVE",
];

// CRO (Cronos) pairs
export const CRO_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","NEAR",
];

// BSV pairs — top coins vs BSV
export const BSV_PAIRS = [
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC",
  "LINK","UNI","ATOM","LTC","BCH","TRX","NEAR","PEPE","SHIB","APT",
  "ARB","OP","SUI","INJ","FIL","ALGO","XLM","HBAR","FTM","ZEC",
];

// Futures PERP pairs
export const FUTURES_PAIRS = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","ARB","OP","SUI","INJ","NEAR","APT",
];

interface CoinGeckoPrice {
  usd: number;
  usd_24h_change: number;
  usd_24h_vol: number;
  usd_market_cap: number;
}

async function fetchLivePrices(): Promise<Record<string, CoinGeckoPrice>> {
  const ids = Object.values(COINGECKO_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json() as Promise<Record<string, CoinGeckoPrice>>;
}

/**
 * Fetch prices from CoinMarketCap and remap to the same shape as CoinGecko.
 * COINGECKO_IDS keys are ticker symbols (BTC, ETH, …) so we pass symbols directly.
 */
async function fetchLivePricesCMC(): Promise<Record<string, CoinGeckoPrice> | null> {
  const symbols = Object.keys(COINGECKO_IDS); // BTC, ETH, SOL, …
  const cmcMap = await cmcFetchPrices(symbols);
  if (!cmcMap) return null;

  // Remap: COINGECKO_IDS maps SYMBOL → cgId; we need cgId → CoinGeckoPrice
  // for the updateMarketPrices fn which looks up by cgId.
  // Build a reverse symbol→cgId map.
  const out: Record<string, CoinGeckoPrice> = {};
  for (const [sym, cgId] of Object.entries(COINGECKO_IDS)) {
    const d = cmcMap[sym.toUpperCase()];
    if (d) out[cgId] = d;
  }
  return out;
}

// Default fallback prices (approximate) when CoinGecko is down
const FALLBACK_PRICES: Record<string, number> = {
  BSV:0.055,BTC:68000,ETH:3400,SOL:145,XRP:0.52,BNB:380,ADA:0.43,
  DOGE:0.12,DOT:6.8,AVAX:35,MATIC:0.72,LINK:14.5,UNI:9.8,ATOM:8.5,
  LTC:78,BCH:380,TRX:0.12,ETC:26,NEAR:6.5,ICP:11,VET:0.04,FIL:5.8,
  SAND:0.43,MANA:0.42,APT:10.5,ARB:1.1,OP:2.4,SUI:1.2,INJ:28,
  PEPE:0.0000082,SHIB:0.0000235,MKR:2900,AAVE:95,CRV:0.38,ENS:16,
  LDO:2.1,SUSHI:1.2,COMP:52,GRT:0.19,SNX:2.8,YFI:6800,RUNE:5.5,
  FTM:0.65,ALGO:0.18,XLM:0.11,HBAR:0.095,EGLD:42,THETA:1.4,EOS:0.72,
  ZEC:28,DASH:28,XMR:125,CRO:0.13,
};

export async function seedMarketsIfNeeded() {
  try {
    const existing = await db.select().from(marketsTable);
    const existingSymbols = new Set(existing.map(m => m.symbol));

    const toInsert: any[] = [];

    // USDT pairs
    for (const base of USDT_PAIRS) {
      const sym = `${base}-USDT`;
      if (!existingSymbols.has(sym)) {
        const fp = (FALLBACK_PRICES[base] ?? 1);
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "USDT",
          lastPrice: fp.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (fp*1.02).toFixed(8), low24h: (fp*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // Stablecoin pairs (USDC, TUSD, USDD)
    for (const [pairs, quote] of [[USDC_PAIRS,"USDC"],[TUSD_PAIRS,"TUSD"],[USDD_PAIRS,"USDD"]] as [string[],string][]) {
      for (const base of pairs) {
        const sym = `${base}-${quote}`;
        if (!existingSymbols.has(sym)) {
          const fp = FALLBACK_PRICES[base] ?? 1;
          toInsert.push({
            symbol: sym, baseAsset: base, quoteAsset: quote,
            lastPrice: fp.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: (fp*1.02).toFixed(8), low24h: (fp*0.98).toFixed(8),
            status: "active", type: "spot",
          });
        }
      }
    }

    // ETH pairs
    for (const base of ETH_PAIRS) {
      const sym = `${base}-ETH`;
      if (!existingSymbols.has(sym)) {
        const ethPrice = FALLBACK_PRICES["ETH"] ?? 3400;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / ethPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "ETH",
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // BNB pairs
    for (const base of BNB_PAIRS) {
      const sym = `${base}-BNB`;
      if (!existingSymbols.has(sym)) {
        const bnbPrice = FALLBACK_PRICES["BNB"] ?? 380;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bnbPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BNB",
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // EVM chain quote pairs (MATIC, AVAX, ARB, OP, FTM, CRO)
    const EVM_QUOTE_CHAINS: [string[], string, number][] = [
      [MATIC_PAIRS, "MATIC", FALLBACK_PRICES["MATIC"] ?? 0.72],
      [AVAX_PAIRS,  "AVAX",  FALLBACK_PRICES["AVAX"]  ?? 35],
      [ARB_PAIRS,   "ARB",   FALLBACK_PRICES["ARB"]   ?? 1.1],
      [OP_PAIRS,    "OP",    FALLBACK_PRICES["OP"]    ?? 2.4],
      [FTM_PAIRS,   "FTM",   FALLBACK_PRICES["FTM"]   ?? 0.65],
      [CRO_PAIRS,   "CRO",   FALLBACK_PRICES["CRO"]   ?? 0.13],
    ];
    for (const [pairs, quote, quotePrice] of EVM_QUOTE_CHAINS) {
      for (const base of pairs) {
        const sym = `${base}-${quote}`;
        if (!existingSymbols.has(sym)) {
          const basePrice = FALLBACK_PRICES[base] ?? 1;
          const crossPrice = basePrice / quotePrice;
          toInsert.push({
            symbol: sym, baseAsset: base, quoteAsset: quote,
            lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
            status: "active", type: "spot",
          });
        }
      }
    }

    // BCH pairs
    for (const base of BCH_PAIRS) {
      const sym = `${base}-BCH`;
      if (!existingSymbols.has(sym)) {
        const bchPrice = FALLBACK_PRICES["BCH"] ?? 380;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bchPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BCH",
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // BTC pairs
    for (const base of BTC_PAIRS) {
      const sym = `${base}-BTC`;
      if (!existingSymbols.has(sym)) {
        const btcPrice = FALLBACK_PRICES["BTC"] ?? 68000;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / btcPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BTC",
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // BSV pairs
    for (const base of BSV_PAIRS) {
      const sym = `${base}-BSV`;
      if (!existingSymbols.has(sym)) {
        const bsvPrice = FALLBACK_PRICES["BSV"] ?? 0.055;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bsvPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BSV",
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
          status: "active", type: "spot",
        });
      }
    }

    // Futures PERP pairs
    for (const base of FUTURES_PAIRS) {
      const sym = `${base}-USDT-PERP`;
      if (!existingSymbols.has(sym)) {
        const fp = (FALLBACK_PRICES[base] ?? 1);
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "USDT",
          lastPrice: fp.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (fp*1.02).toFixed(8), low24h: (fp*0.98).toFixed(8),
          status: "active", type: "futures",
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(marketsTable).values(toInsert).onConflictDoNothing();
      logger.info(`Seeded ${toInsert.length} new markets`);
    }
  } catch (err) {
    logger.warn({ err }, "Failed to seed markets");
  }
}

export async function updateMarketPrices() {
  try {
    let prices: Record<string, CoinGeckoPrice>;
    try {
      prices = await fetchLivePrices();
      logger.info("Market prices updated from CoinGecko");
    } catch (cgErr: any) {
      logger.warn({ err: cgErr }, "CoinGecko price fetch failed — trying CoinMarketCap fallback");
      const cmcPrices = await fetchLivePricesCMC();
      if (!cmcPrices) throw new Error("Both CoinGecko and CoinMarketCap price fetches failed");
      prices = cmcPrices;
      logger.info("Market prices updated from CoinMarketCap (fallback)");
    }
    const markets = await db.select().from(marketsTable);

    for (const market of markets) {
      const cgId = COINGECKO_IDS[market.baseAsset];
      if (!cgId) continue;

      const data = prices[cgId];
      if (!data || !data.usd) continue;

      const baseUSD = data.usd;
      const changePercent = data.usd_24h_change ?? 0;
      const change = (baseUSD / (1 + changePercent / 100)) * (changePercent / 100);
      const openPrice = baseUSD - change;
      const volatility = Math.abs(change) * 1.5 || baseUSD * 0.01;
      const high24h = openPrice + volatility;
      const low24h = openPrice - volatility;

      let lastPrice = baseUSD;
      let vol = data.usd_24h_vol;

      // Stablecoin quote (USDC/TUSD/USDD) — price ≈ same as USD value
      if (STABLECOIN_QUOTES.has(market.quoteAsset) && market.quoteAsset !== "USDT") {
        const stableCgId = COINGECKO_IDS[market.quoteAsset];
        const stableUSD  = stableCgId ? (prices[stableCgId]?.usd ?? 1) : 1;
        lastPrice = baseUSD / stableUSD;
        vol = vol / stableUSD;
      }

      // ETH quote — compute cross rate
      if (market.quoteAsset === "ETH") {
        const ethUSD = prices[COINGECKO_IDS["ETH"]]?.usd ?? FALLBACK_PRICES["ETH"] ?? 3400;
        lastPrice = baseUSD / ethUSD;
        vol = vol / ethUSD;
      }

      // BNB quote — compute cross rate
      if (market.quoteAsset === "BNB") {
        const bnbUSD = prices[COINGECKO_IDS["BNB"]]?.usd ?? FALLBACK_PRICES["BNB"] ?? 380;
        lastPrice = baseUSD / bnbUSD;
        vol = vol / bnbUSD;
      }

      // EVM chain quote — generic cross rate handler (MATIC, AVAX, ARB, OP, FTM, CRO)
      const EVM_QUOTE_ASSETS = ["MATIC","AVAX","ARB","OP","FTM","CRO"];
      if (EVM_QUOTE_ASSETS.includes(market.quoteAsset)) {
        const cgId = COINGECKO_IDS[market.quoteAsset];
        const quoteUSD = cgId ? (prices[cgId]?.usd ?? FALLBACK_PRICES[market.quoteAsset] ?? 1) : (FALLBACK_PRICES[market.quoteAsset] ?? 1);
        lastPrice = baseUSD / quoteUSD;
        vol = vol / quoteUSD;
      }

      // BCH quote — compute cross rate
      if (market.quoteAsset === "BCH") {
        const bchUSD = prices[COINGECKO_IDS["BCH"]]?.usd ?? FALLBACK_PRICES["BCH"] ?? 380;
        lastPrice = baseUSD / bchUSD;
        vol = vol / bchUSD;
      }

      // BTC quote — compute cross rate
      if (market.quoteAsset === "BTC") {
        const btcUSD = prices[COINGECKO_IDS["BTC"]]?.usd ?? FALLBACK_PRICES["BTC"] ?? 68000;
        lastPrice = baseUSD / btcUSD;
        vol = vol / btcUSD;
      }

      // BSV quote — compute cross rate
      if (market.quoteAsset === "BSV") {
        const bsvUSD = prices[COINGECKO_IDS["BSV"]]?.usd ?? FALLBACK_PRICES["BSV"] ?? 0.055;
        lastPrice = baseUSD / bsvUSD;
        vol = vol / bsvUSD;
      }

      // Futures slight discount
      if (market.type === "futures") {
        lastPrice = lastPrice * (1 - 0.0001);
        vol = vol / 10;
      }

      await db.update(marketsTable).set({
        lastPrice: lastPrice.toFixed(8),
        priceChange24h: change.toFixed(8),
        priceChangePercent24h: changePercent.toFixed(4),
        volume24h: vol.toFixed(2),
        high24h: high24h.toFixed(8),
        low24h: Math.max(low24h, 0.00000001).toFixed(8),
        marketCap: data.usd_market_cap ? data.usd_market_cap.toFixed(2) : null,
      }).where(eq(marketsTable.symbol, market.symbol));
    }

  } catch (err) {
    logger.warn({ err }, "Failed to update prices from CoinGecko and CoinMarketCap");
  }
}

let updateInterval: NodeJS.Timeout | null = null;

export function startPriceUpdater() {
  seedMarketsIfNeeded().then(() => updateMarketPrices());
  updateInterval = setInterval(updateMarketPrices, 60_000);
  logger.info("Live price updater started (interval: 60s)");
}

export function stopPriceUpdater() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}
