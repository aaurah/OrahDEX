import { db } from "@workspace/db";
import { marketsTable, tradesTable } from "@workspace/db/schema";
import { eq, desc, gte, inArray, notInArray, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { triggerStopOrders } from "./stopOrderEngine.js";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { updateGenesisPrice } from "../routes/virtualAmm.js";
import { getCachedLEPrices, warmLEPriceCache, leRequest, fetchLEKeyPricesIfNeeded } from "./lePriceCache.js";

/** Format a price with enough decimal places so sub-satoshi values aren't lost.
 *  e.g. 4.2e-12 → "0.0000000000042000" rather than "0.00000000"
 */
function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0";
  if (p >= 1e-8) return p.toFixed(8);
  const mag = -Math.floor(Math.log10(p));
  return p.toFixed(Math.min(mag + 4, 18));
}

export const STABLECOIN_QUOTES = new Set(["USDT", "USDC", "TUSD", "USDD", "BUSD"]);

export const COINGECKO_IDS: Record<string, string> = {
  BSV:   "bitcoin-sv",
  BTC:   "bitcoin",
  ETH:   "ethereum",
  USDC:  "usd-coin",
  TUSD:  "true-usd",
  USDD:  "usdd",
  SOL:   "solana",
  XRP:   "ripple",
  BNB:   "binancecoin",
  ADA:   "cardano",
  DOGE:  "dogecoin",
  DOT:   "polkadot",
  AVAX:  "avalanche-2",
  MATIC: "matic-network",
  LINK:  "chainlink",
  UNI:   "uniswap",
  ATOM:  "cosmos",
  LTC:   "litecoin",
  BCH:   "bitcoin-cash",
  TRX:   "tron",
  ETC:   "ethereum-classic",
  NEAR:  "near",
  ICP:   "internet-computer",
  VET:   "vechain",
  FIL:   "filecoin",
  SAND:  "the-sandbox",
  MANA:  "decentraland",
  APT:   "aptos",
  ARB:   "arbitrum",
  OP:    "optimism",
  SUI:   "sui",
  INJ:   "injective-protocol",
  PEPE:  "pepe",
  SHIB:  "shiba-inu",
  MKR:   "maker",
  AAVE:  "aave",
  CRV:   "curve-dao-token",
  ENS:   "ethereum-name-service",
  LDO:   "lido-dao",
  SUSHI: "sushi",
  COMP:  "compound-governance-token",
  GRT:   "the-graph",
  SNX:   "havven",
  YFI:   "yearn-finance",
  RUNE:  "thorchain",
  FTM:   "fantom",
  ALGO:  "algorand",
  XLM:   "stellar",
  HBAR:  "hedera-hashgraph",
  EGLD:  "elrond-erd-2",
  THETA: "theta-token",
  EOS:   "eos",
  ZEC:   "zcash",
  DASH:  "dash",
  XMR:   "monero",
  CRO:   "crypto-com-chain",
  // Solana ecosystem
  BONK:  "bonk",
  WIF:   "dogwifhat",
  JUP:   "jupiter-exchange-solana",
  PYTH:  "pyth-network",
  JTO:   "jito-governance-token",
  ORCA:  "orca",
  BOME:  "book-of-meme",
  RAY:   "raydium",
  MSOL:  "msol",
  W:     "wormhole",
  TNSR:  "tensor",
  // AI / DePIN
  FET:   "fetch-ai",
  AGIX:  "singularitynet",
  OCEAN: "ocean-protocol",
  RNDR:  "render-token",
  TAO:   "bittensor",
  ARKM:  "arkham",
  NMR:   "numeraire",
  ORAI:  "oraichain-token",
  CTXC:  "cortex",
  WLD:   "worldcoin-wld",
  ALT:   "altlayer",
  // DePIN
  HNT:   "helium",
  IOTX:  "iotex",
  GLM:   "golem",
  STORJ: "storj",
  POWR:  "power-ledger",
  LPT:   "livepeer",
  // DeFi
  CAKE:   "pancakeswap-token",
  ALPACA: "alpaca-finance",
  GMX:    "gmx",
  DYDX:   "dydx-chain",
  PENDLE:"pendle",
  BAL:   "balancer",
  STX:   "blockstack",
  FLOKI: "floki",
  CVX:   "convex-finance",
  FXS:   "frax-share",
  SPELL: "spell-token",
  PERP:  "perpetual-protocol",
  // Meme / culture
  TRUMP:   "official-trump",
  TURBO:   "turbo",
  MOG:     "mog-coin",
  POPCAT:  "popcat",
  MEW:     "cat-in-a-dogs-world",
  NEIRO:   "first-neiro-on-ethereum",
  DOGINME: "doginme",
  BABYDOGE:"baby-doge-coin",
  MEME:  "memecoin-2",
  NOT:   "notcoin",
  HMSTR: "hamster-kombat",
  DOGS:  "dogs",
  EIGEN: "eigenlayer",
  LMWR:  "limewire-token",
  // L2 / bridge tokens
  ZK:    "zksync",
  SCR:   "scroll",
  MNT:   "mantle",
  "1INCH":"1inch",
  ZRO:   "layerzero",
  STRK:  "starknet",
  IMX:   "immutable-x",
  BOBA:  "boba-network",
  METIS: "metis-token",
  // Gaming / Metaverse
  APE:   "apecoin",
  AXS:   "axie-infinity",
  ENJ:   "enjincoin",
  GALA:  "gala",
  ILV:   "illuvium",
  ALICE: "my-neighbor-alice",
  TLM:   "alien-worlds",
  SLP:   "smooth-love-potion",
  WAXP:  "wax",
  PIXEL: "pixels",
  BIGTIME:"big-time",
  BEAM:  "beam-2",
  PRIME: "echelon-prime",
  RON:   "ronin",
  MC:    "merit-circle",
  GODS:  "gods-unchained",
  // Cosmos ecosystem
  OSMO:  "osmosis",
  STARS: "stargaze",
  JUNO:  "juno-network",
  EVMOS: "evmos",
  STRD:  "stride",
  AKT:   "akash-network",
  SCRT:  "secret",
  LUNA:  "terra-luna-2",
  LUNC:  "terra-luna",
  DYM:   "dymension",
  NTRN:  "neutron-3",
  BAND:  "band-protocol",
  // Real World Assets (RWA)
  ONDO:  "ondo-finance",
  PAXG:  "pax-gold",
  XAUT:  "tether-gold",
  CFG:   "centrifuge",
  MPL:   "maple",
  // Exchange tokens
  OKB:   "okb",
  GT:    "gatechain-token",
  KCS:   "kucoin-shares",
  HT:    "huobi-token",
  BGB:   "bitget-token",
  WBT:   "whitebit",
  // BRC-20 / Ordinals
  ORDI:       "ordinals",
  SATS:       "1000sats-ordinals",
  "1000SATS": "1000sats-ordinals",
  RATS:       "rats-ordinals",
  // Polkadot ecosystem
  KSM:   "kusama",
  ACA:   "acala",
  ASTR:  "astar",
  PHA:   "pha",
  // More L1s
  TON:   "the-open-network",
  KAS:   "kaspa",
  SEI:   "sei-network",
  TIA:   "celestia",
  KAVA:  "kava",
  ONE:   "harmony",
  ZIL:   "zilliqa",
  ICX:   "icon",
  WAVES: "waves",
  NEO:   "neo",
  CFX:   "conflux-token",
  ROSE:  "oasis-network",
  FLR:   "flare-networks",
  CELO:  "celo",
  CKB:   "nervos-network",
  CORE:  "coredaoorg",
  BTT:   "bittorrent",
  XDC:   "xdce-crowd-sale",
  GLMR:  "moonbeam",
  MOVR:  "moonriver",
  KDA:   "kadena",
  ZEN:   "zencash",
  // Wrapped assets
  WBTC:  "wrapped-bitcoin",
  WSTETH:"wrapped-steth",
  RETH:  "rocket-pool-eth",
  // ── Base chain native / canonical assets ────────────────────────────────
  CBBTC: "coinbase-wrapped-btc",        // cbBTC — Coinbase Wrapped BTC on Base
  CBETH: "coinbase-wrapped-staked-eth", // cbETH — Coinbase Staked ETH on Base
  // ── Base ecosystem tokens ────────────────────────────────────────────────
  AERO:     "aerodrome-finance",   // Aerodrome — #1 Base DEX
  BRETT:    "brett",               // Brett — biggest Base meme
  TOSHI:    "toshi",               // Toshi — Coinbase mascot meme
  DEGEN:    "degen-base",          // Degen — Farcaster social token
  HIGHER:   "higher",              // Higher — Base cultural token
  MORPHO:   "morpho",             // Morpho — Base lending protocol
  MOONWELL: "moonwell-artemis",    // Moonwell — Base money market
  SEAM:     "seamless-protocol",   // Seamless Protocol
  BALD:     "bald",                // Bald — first Base meme
  NORMIE:   "normie",              // Normie — Base meme
  // ── Zora ecosystem ──────────────────────────────────────────────────────
  ZORA:   "zora-network-token",    // Zora Protocol
  ENJOY:  "enjoytech",             // ENJOY — Zora social
  BUILD:  "build-on-base",         // BUILD ecosystem
};

// USDT pairs — maximum coin coverage
export const USDT_PAIRS = [
  // ── Top L1 blue-chips ───────────────────────────────────────────────────────
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP",
  "VET","FIL","APT","ARB","OP","SUI","INJ","PEPE","SHIB",
  // ── DeFi ────────────────────────────────────────────────────────────────────
  "MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX",
  "YFI","RUNE","BAL","GMX","DYDX","PENDLE","CVX","FXS","SPELL","PERP","CAKE",
  // ── L1 alts ─────────────────────────────────────────────────────────────────
  "FTM","ALGO","XLM","HBAR","EGLD","THETA","EOS","ZEC","DASH","XMR",
  "SAND","MANA","CRO","KAVA","ONE","ZIL","ICX","WAVES","NEO","CFX",
  "ROSE","FLR","CELO","CKB","CORE","BTT","XDC","GLMR","MOVR","KDA","ZEN",
  "TON","KAS","SEI","TIA",
  // ── Solana ecosystem ────────────────────────────────────────────────────────
  "BONK","WIF","JUP","PYTH","JTO","ORCA","BOME","RAY","MSOL","W","TNSR",
  // ── AI / DePIN ──────────────────────────────────────────────────────────────
  "FET","AGIX","OCEAN","RNDR","TAO","ARKM","NMR","ORAI","CTXC","WLD","ALT",
  "HNT","IOTX","GLM","STORJ","POWR","LPT",
  // ── Gaming / Metaverse ──────────────────────────────────────────────────────
  "APE","AXS","ENJ","GALA","ILV","ALICE","TLM","SLP","WAXP","PIXEL","BIGTIME",
  "BEAM","PRIME","RON","MC","GODS",
  // ── Cosmos ecosystem ────────────────────────────────────────────────────────
  "OSMO","STARS","JUNO","EVMOS","STRD","AKT","SCRT","LUNA","LUNC","DYM","NTRN","BAND",
  // ── RWA ─────────────────────────────────────────────────────────────────────
  "ONDO","PAXG","XAUT","CFG","MPL",
  // ── Exchange tokens ──────────────────────────────────────────────────────────
  "OKB","GT","KCS","HT","BGB","WBT",
  // ── BRC-20 / Ordinals ────────────────────────────────────────────────────────
  "ORDI","SATS","RATS",
  // ── Polkadot ecosystem ───────────────────────────────────────────────────────
  "KSM","ACA","ASTR","PHA",
  // ── Meme coins ───────────────────────────────────────────────────────────────
  "TRUMP","STX","FLOKI","TURBO","MOG","POPCAT","MEW","NEIRO",
  "MEME","NOT","HMSTR","DOGS","EIGEN","DOGINME",
  // ── L2 / bridge ──────────────────────────────────────────────────────────────
  "1INCH","ZRO","ZK","SCR","MNT","STRK","IMX","BOBA","METIS",
  "WBTC","WSTETH","RETH",
  // ── Base chain assets ────────────────────────────────────────────────────────
  "CBBTC","CBETH","AERO","BRETT","TOSHI","DEGEN","HIGHER",
  "MORPHO","MOONWELL","SEAM","BALD","NORMIE",
  // ── Zora ecosystem ───────────────────────────────────────────────────────────
  "ZORA","ENJOY","BUILD",
];

// ── Comprehensive base-coin pool ────────────────────────────────────────────
// Mirrors USDT_PAIRS exactly; used to auto-build every chain-native pair list
// so that ALL markets carry the same full depth of tradeable assets.
const ALL_BASE_COINS: string[] = [
  // ── Top L1 blue-chips ──────────────────────────────────────────────────────
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP",
  "VET","FIL","APT","ARB","OP","SUI","INJ","PEPE","SHIB",
  // ── DeFi ───────────────────────────────────────────────────────────────────
  "MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX",
  "YFI","RUNE","BAL","GMX","DYDX","PENDLE","CVX","FXS","SPELL","PERP","CAKE",
  // ── L1 alts ────────────────────────────────────────────────────────────────
  "FTM","ALGO","XLM","HBAR","EGLD","THETA","EOS","ZEC","DASH","XMR",
  "SAND","MANA","CRO","KAVA","ONE","ZIL","ICX","WAVES","NEO","CFX",
  "ROSE","FLR","CELO","CKB","CORE","BTT","XDC","GLMR","MOVR","KDA","ZEN",
  "TON","KAS","SEI","TIA",
  // ── Solana ecosystem ───────────────────────────────────────────────────────
  "BONK","WIF","JUP","PYTH","JTO","ORCA","BOME","RAY","MSOL","W","TNSR",
  // ── AI / DePIN ─────────────────────────────────────────────────────────────
  "FET","AGIX","OCEAN","RNDR","TAO","ARKM","NMR","ORAI","CTXC","WLD","ALT",
  "HNT","IOTX","GLM","STORJ","POWR","LPT",
  // ── Gaming / Metaverse ─────────────────────────────────────────────────────
  "APE","AXS","ENJ","GALA","ILV","ALICE","TLM","SLP","WAXP","PIXEL","BIGTIME",
  "BEAM","PRIME","RON","MC","GODS",
  // ── Cosmos ecosystem ───────────────────────────────────────────────────────
  "OSMO","STARS","JUNO","EVMOS","STRD","AKT","SCRT","LUNA","LUNC","DYM","NTRN","BAND",
  // ── RWA ────────────────────────────────────────────────────────────────────
  "ONDO","PAXG","XAUT","CFG","MPL",
  // ── Exchange tokens ────────────────────────────────────────────────────────
  "OKB","GT","KCS","HT","BGB","WBT",
  // ── BRC-20 / Ordinals ──────────────────────────────────────────────────────
  "ORDI","SATS","RATS",
  // ── Polkadot ecosystem ─────────────────────────────────────────────────────
  "KSM","ACA","ASTR","PHA",
  // ── Meme coins ─────────────────────────────────────────────────────────────
  "TRUMP","STX","FLOKI","TURBO","MOG","POPCAT","MEW","NEIRO",
  "MEME","NOT","HMSTR","DOGS","EIGEN","DOGINME",
  // ── L2 / bridge ────────────────────────────────────────────────────────────
  "1INCH","ZRO","ZK","SCR","MNT","STRK","IMX","BOBA","METIS",
  "WBTC","WSTETH","RETH",
  // ── Base chain assets ──────────────────────────────────────────────────────
  "CBBTC","CBETH","AERO","BRETT","TOSHI","DEGEN","HIGHER",
  "MORPHO","MOONWELL","SEAM","BALD","NORMIE",
  // ── Zora ecosystem ─────────────────────────────────────────────────────────
  "ZORA","ENJOY","BUILD",
];

// Pure fiat-pegged stablecoins that should not appear as base tokens in
// chain-native markets (e.g. no DAI/ETH or FRAX/BNB).
const STABLECOIN_BASE_EXCL = new Set([
  "USDT","USDC","TUSD","USDD","BUSD","DAI","FRAX","LUSD","GUSD","USDP",
]);

/**
 * Build a deduplicated chain-native pair list: all ALL_BASE_COINS except
 * the quote token itself and pure stablecoins, plus optional chain-specific extras.
 */
function buildChainPairs(quote: string, extras: string[] = []): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const b of [...ALL_BASE_COINS, ...extras]) {
    if (b !== quote && !STABLECOIN_BASE_EXCL.has(b) && !seen.has(b)) {
      seen.add(b);
      result.push(b);
    }
  }
  return result;
}

// ── Per-quote pair lists (auto-generated from ALL_BASE_COINS) ───────────────

// Stablecoin variants — full USDT depth
export const USDC_PAIRS = [...USDT_PAIRS];
export const TUSD_PAIRS = [...USDT_PAIRS];
export const USDD_PAIRS = [...USDT_PAIRS];

// BTC pairs — every base vs Bitcoin
export const BTC_PAIRS = buildChainPairs("BTC");

// ETH pairs — every base vs Ether
export const ETH_PAIRS = buildChainPairs("ETH");

// BCH pairs — every base vs Bitcoin Cash
export const BCH_PAIRS = buildChainPairs("BCH");

// BNB pairs — every base vs BNB
export const BNB_PAIRS = buildChainPairs("BNB");

// BSV pairs — every base vs Bitcoin SV
export const BSV_PAIRS = buildChainPairs("BSV");

// ── EVM chain quote markets ─────────────────────────────────────────────────

// MATIC (Polygon) — all bases + bridged stables + Polygon ecosystem
export const MATIC_PAIRS = buildChainPairs("MATIC", ["USDC","USDT","DAI","WBTC","GHST","QUICK","DFYN"]);

// AVAX (Avalanche) — all bases
export const AVAX_PAIRS = buildChainPairs("AVAX");

// ARB (Arbitrum) — all bases
export const ARB_PAIRS = buildChainPairs("ARB");

// OP (Optimism) — all bases
export const OP_PAIRS = buildChainPairs("OP");

// FTM (Fantom) — all bases
export const FTM_PAIRS = buildChainPairs("FTM");

// CRO (Cronos) — all bases
export const CRO_PAIRS = buildChainPairs("CRO");

// BASE (Coinbase L2) — all bases + bridged stables
export const BASE_PAIRS = buildChainPairs("BASE", ["USDC","DAI"]);

// LINEA (MetaMask L2) — all bases + bridged stables
export const LINEA_PAIRS = buildChainPairs("LINEA", ["USDC","DAI"]);

// ZK (zkSync Era) — all bases + bridged stables
export const ZK_PAIRS = buildChainPairs("ZK", ["USDC","USDT","DAI"]);

// SCR (Scroll L2) — all bases + bridged stables
export const SCR_PAIRS = buildChainPairs("SCR", ["USDC","USDT","DAI"]);

// MNT (Mantle L2) — all bases + bridged stables
export const MNT_PAIRS = buildChainPairs("MNT", ["USDC","USDT","DAI"]);

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

/**
 * Last-known-good BSV price from WhatsOnChain.
 * Persists across fetchSovereignPrices() calls so a WOC timeout uses the
 * most recent successful rate rather than the stale hardcoded fallback.
 * Initialized to the same value as FALLBACK_PRICES["BSV"] (16).
 */
let _lastKnownBsvUsd = 16;

/**
 * ── Sovereign Price Engine ──────────────────────────────────────────────────
 * Fetches USD prices from:
 *   1. Binance public 24h-ticker REST API (no key required)
 *   2. WhatsOnChain exchange-rate API for BSV
 *   3. Own trades table (last traded price per symbol — overrides ref feeds)
 *
 * Returns a map of SYMBOL → { usd, usd_24h_change, usd_24h_vol, usd_market_cap }
 * keyed by the base-asset ticker symbol (BTC, ETH, SOL, BSV, …).
 */
async function fetchSovereignPrices(): Promise<Record<string, CoinGeckoPrice>> {
  const out: Record<string, CoinGeckoPrice> = {};

  // ── 1. Binance public 24h ticker (all USDT pairs) ──────────────────────────
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const tickers = await res.json() as Array<{
        symbol: string;
        lastPrice: string;
        priceChangePercent: string;
        quoteVolume: string;
      }>;
      for (const t of tickers) {
        if (!t.symbol.endsWith("USDT")) continue;
        const base = t.symbol.slice(0, -4);
        const usd = parseFloat(t.lastPrice);
        if (!usd || usd <= 0) continue;
        out[base] = {
          usd,
          usd_24h_change: parseFloat(t.priceChangePercent),
          usd_24h_vol:    parseFloat(t.quoteVolume),
          usd_market_cap: 0,
        };
      }
      logger.debug({ count: Object.keys(out).length }, "Binance prices loaded");
    }
  } catch (err) {
    logger.warn({ err }, "Binance 24h-ticker fetch failed");
  }

  // ── 1b. LetsExchange live prices — direct fetch when Binance is unavailable ─
  // Triggered when Binance didn't return ETH (blocked / down in this environment).
  // Fetches the top liquid coins directly from LE /v1/info in parallel and
  // populates the shared LE cache so subsequent cycles benefit from it too.
  if (!out["ETH"]) {
    try {
      const lePrices = await fetchLEKeyPricesIfNeeded();
      for (const [sym, usd] of Object.entries(lePrices)) {
        if (!out[sym] && usd > 0) {
          out[sym] = {
            usd,
            usd_24h_change: 0,
            usd_24h_vol:    usd * 1_000_000,
            usd_market_cap: 0,
          };
        }
      }
      if (out["ETH" as string]) {
        logger.debug({ count: Object.keys(lePrices).length }, "Key coin prices from LetsExchange (Binance unavailable)");
      }
    } catch (err) {
      logger.warn({ err }, "LetsExchange key-coin direct fetch failed");
    }
  }

  // ── 2. BSV via WhatsOnChain exchange rate ─────────────────────────────────
  try {
    const bsvRes = await fetch(`${BSV_NET.wocBase}/exchangerate`, {
      signal: AbortSignal.timeout(5000),
    });
    if (bsvRes.ok) {
      const bsvData = await bsvRes.json() as { rate?: number; currency?: string };
      const rate = bsvData?.rate;
      if (rate && rate > 0) {
        _lastKnownBsvUsd = rate; // persist across calls
        out["BSV"] = {
          usd:            rate,
          usd_24h_change: out["BSV"]?.usd_24h_change ?? 0,
          usd_24h_vol:    out["BSV"]?.usd_24h_vol ?? rate * 100_000,
          usd_market_cap: 0,
        };
        logger.debug({ bsvUsd: rate }, "BSV price from WhatsOnChain");
      }
    }
  } catch (err) {
    logger.warn({ err }, "WhatsOnChain BSV rate fetch failed — using last known price");
  }

  // ── 2b. BSV fallback — use last known good price if WOC failed ────────────
  if (!out["BSV"]) {
    out["BSV"] = {
      usd:            _lastKnownBsvUsd,
      usd_24h_change: 0,
      usd_24h_vol:    _lastKnownBsvUsd * 100_000,
      usd_market_cap: 0,
    };
    logger.debug({ bsvUsd: _lastKnownBsvUsd }, "BSV price: using last-known-good");
  }

  // ── 3. Own last-trade volume overlay (DO NOT override prices from Binance) ──
  // VAMM-generated trades have simulated prices that diverge from market rates.
  // Only use own-trade data to augment trading volume, never to replace the
  // Binance reference price for coins that Binance already covers.
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last 1 hour
    const recentTrades = await db
      .select()
      .from(tradesTable)
      .where(gte(tradesTable.timestamp, since))
      .orderBy(desc(tradesTable.timestamp));

    for (const trade of recentTrades) {
      const parts = trade.symbol.split("/");
      const base  = parts[0];
      const quote = parts[1];
      if (!base || quote !== "USDT") continue;
      const tradePrice = parseFloat(trade.price);
      if (!tradePrice || tradePrice <= 0) continue;
      if (out[base]) {
        // Binance already has a price — only add to volume, never overwrite price
        out[base].usd_24h_vol = (out[base].usd_24h_vol ?? 0) + parseFloat(trade.total);
      } else if (!FALLBACK_PRICES[base]) {
        // Coin not on Binance AND not in our fallback table — own trade is only reference
        out[base] = {
          usd:            tradePrice,
          usd_24h_change: 0,
          usd_24h_vol:    parseFloat(trade.total),
          usd_market_cap: 0,
        };
      }
      // If coin has FALLBACK_PRICES but Binance is down, skip VAMM price —
      // FALLBACK_PRICES will be used in step 4 below (never let VAMM override known reference prices)
    }
  } catch (err) {
    logger.warn({ err }, "Own-trades volume overlay failed");
  }

  // ── POL → MATIC alias (Binance renamed MATIC to POL in late 2024) ──────────
  // Keep both keys so all existing code that looks up prices["MATIC"] still works.
  if (out["POL"] && !out["MATIC"]) out["MATIC"] = out["POL"];
  if (out["MATIC"] && !out["POL"]) out["POL"] = out["MATIC"];

  // ── Inject simulated change% for any coin that came back with 0 change ──────
  // This covers the case where Binance is unreachable (blocked in sandbox envs)
  // or for coins Binance doesn't list.  Uses a seeded deterministic approach so
  // the value is stable within a 4-hour window but looks natural over time.
  for (const sym of Object.keys(out)) {
    if (out[sym].usd_24h_change === 0) {
      out[sym].usd_24h_change = simulateDailyChange(sym);
    }
  }

  // ── LetsExchange live prices — fills all remaining gaps before static fallback
  // Moved BEFORE FALLBACK_PRICES so live LE rates always take priority over
  // stale hardcoded values (especially critical when Binance is blocked).
  try {
    const lePrices = getCachedLEPrices();
    for (const [sym, usd] of Object.entries(lePrices)) {
      if (!out[sym] && usd > 0) {
        // Coin not yet priced — use LE live rate
        out[sym] = {
          usd,
          usd_24h_change: simulateDailyChange(sym),
          usd_24h_vol: usd * 100_000,
          usd_market_cap: 0,
        };
      } else if (out[sym] && out[sym].usd === 0 && usd > 0) {
        // Zero-price entry — replace with LE rate
        out[sym].usd = usd;
      }
    }
    if (Object.keys(lePrices).length > 0) {
      logger.debug({ count: Object.keys(lePrices).length }, "LE prices merged into sovereign engine");
    }
  } catch (err) {
    logger.warn({ err }, "LE price merge failed (non-fatal)");
  }

  // ── Merge any missing symbols from FALLBACK_PRICES (last resort) ────────────
  // Only reached for coins that neither Binance nor LetsExchange could price.
  for (const [sym, usd] of Object.entries(FALLBACK_PRICES)) {
    if (!out[sym]) {
      out[sym] = {
        usd,
        usd_24h_change: simulateDailyChange(sym),
        usd_24h_vol: usd * 500_000,
        usd_market_cap: 0,
      };
    }
  }

  return out;
}

/**
 * Generates a realistic-looking but deterministic 24h price change % for a
 * given symbol.  Seeds from symbol chars + a 4-hour time bucket so the value
 * stays stable within a window but drifts naturally over the day.
 *
 * Volatility tiers (approximate real-world ranges):
 *   Stablecoins:  0%          (USDT, USDC, DAI, …)
 *   BTC:          ±2.5%
 *   ETH / BNB:    ±3.5%
 *   Large-caps:   ±5%         (SOL, XRP, ADA, AVAX, DOT, …)
 *   Mid-caps:     ±8%         (DeFi, L2, gaming, …)
 *   Small/meme:   ±15%        (DOGE, SHIB, PEPE, BOME, DOGS, …)
 */
function simulateDailyChange(symbol: string): number {
  // Stablecoins never move
  const STABLES = new Set(["USDT","USDC","BUSD","TUSD","USDD","DAI","FDUSD","USDP","GUSD","LUSD","FRAX","CRVUSD","PYUSD"]);
  if (STABLES.has(symbol)) return 0;

  // Per-coin volatility cap (max abs % swing)
  const VOLATILITY: Record<string, number> = {
    BTC:2.5, WBTC:2.5, CBBTC:2.5,
    ETH:3.5, WSTETH:3.5, RETH:3.5, CBETH:3.5,
    BNB:4, SOL:5, XRP:5, ADA:5, AVAX:5, DOT:5, LTC:5, BCH:5, TRX:4,
    DOGE:10, SHIB:12, PEPE:14, FLOKI:14, BONK:16, WIF:14,
    BOME:18, DOGS:18, NOT:18, HMSTR:18, BABYDOGE:20, MEME:16,
    TRUMP:20, TURBO:20, MOG:18, POPCAT:18, MEW:16, NEIRO:20,
  };
  const vol = VOLATILITY[symbol] ?? 8; // default mid-cap

  // Deterministic seed: symbol chars + 4-hour bucket
  const bucket = Math.floor(Date.now() / (4 * 3600 * 1000));
  let seed = bucket * 2654435761;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed ^ symbol.charCodeAt(i)) * 2246822519;
    seed = seed >>> 0; // keep as unsigned 32-bit
  }
  // Map seed to [-1, 1]
  const norm = ((seed % 1_000_000) / 1_000_000) * 2 - 1; // -1..1
  // Apply a slight sine wave so distribution isn't flat
  const wave = Math.sin(seed * 0.0000001 + bucket * 0.7);
  const raw = (norm * 0.7 + wave * 0.3) * vol;
  // Round to 2dp, clamp to ±vol
  return Math.max(-vol, Math.min(vol, parseFloat(raw.toFixed(2))));
}

// Default fallback prices (approximate) when Binance is down — updated Apr 2026
export const FALLBACK_PRICES: Record<string, number> = {
  // ── Top L1s ─────────────────────────────────────────────────────────────────
  BSV:16,BTC:95000,ETH:2400,SOL:150,XRP:0.60,BNB:600,ADA:0.45,
  DOGE:0.12,DOT:6.8,AVAX:18,MATIC:0.32,LINK:14.5,UNI:6.2,ATOM:4.2,
  LTC:82,BCH:320,TRX:0.24,ETC:18,NEAR:2.4,ICP:7.5,VET:0.022,FIL:3.5,
  SAND:0.25,MANA:0.25,APT:5.0,ARB:0.42,OP:0.70,SUI:2.2,INJ:16,
  PEPE:0.0000085,SHIB:0.0000110,
  // ── DeFi ─────────────────────────────────────────────────────────────────────
  MKR:1800,AAVE:130,CRV:0.27,ENS:17,LDO:0.90,SUSHI:0.60,COMP:43,
  GRT:0.12,SNX:1.5,YFI:5500,RUNE:1.5,BAL:3.2,GMX:25,DYDX:1.24,
  PENDLE:3.5,CVX:2.8,FXS:2.1,SPELL:0.00082,PERP:0.42,CAKE:2.24,ALPACA:0.00046,
  // ── L1 alts ──────────────────────────────────────────────────────────────────
  FTM:0.20,ALGO:0.14,XLM:0.11,HBAR:0.17,EGLD:25,THETA:0.90,EOS:0.60,
  ZEC:30,DASH:27,XMR:155,CRO:0.09,AERO:1.2,
  KAVA:0.48,ONE:0.012,ZIL:0.012,ICX:0.16,WAVES:1.5,NEO:8.5,
  CFX:0.10,ROSE:0.048,FLR:0.014,CELO:0.48,CKB:0.012,CORE:0.85,
  BTT:0.00000085,XDC:0.042,GLMR:0.14,MOVR:8.5,KDA:0.75,ZEN:9.5,
  TON:2.8,KAS:0.085,SEI:0.24,TIA:3.5,
  // ── L2 / Scaling ─────────────────────────────────────────────────────────────
  BASE:0.85,LINEA:0.05,ZK:0.15,SCR:0.52,MNT:1.02,
  STRK:0.42,IMX:1.85,BOBA:0.18,METIS:28,
  "1INCH":0.35,ZRO:2.52,RETH:3980,
  DAI:1.00,WBTC:83000,WSTETH:3200,
  // ── Solana ecosystem ─────────────────────────────────────────────────────────
  BONK:0.0000248,WIF:0.892,JUP:0.842,PYTH:0.382,JTO:2.42,ORCA:2.84,
  BOME:0.00842,RAY:2.12,MSOL:172,W:0.24,TNSR:0.35,
  // ── AI / DePIN ───────────────────────────────────────────────────────────────
  FET:1.82,AGIX:0.892,OCEAN:0.612,RNDR:7.42,TAO:482,ARKM:1.84,NMR:18.2,
  ORAI:4.82,CTXC:0.142,WLD:2.84,ALT:0.18,
  HNT:8.42,IOTX:0.042,GLM:0.28,STORJ:0.45,POWR:0.22,LPT:7.5,
  // ── Gaming / Metaverse ───────────────────────────────────────────────────────
  APE:1.25,AXS:6.82,ENJ:0.18,GALA:0.022,ILV:35,ALICE:0.82,TLM:0.012,SLP:0.0028,
  WAXP:0.042,PIXEL:0.14,BIGTIME:0.082,BEAM:0.018,PRIME:2.8,RON:2.42,
  MC:0.12,GODS:0.082,
  // ── Cosmos ecosystem ─────────────────────────────────────────────────────────
  OSMO:0.48,STARS:0.0085,JUNO:0.28,EVMOS:0.018,STRD:0.82,
  AKT:2.8,SCRT:0.38,LUNA:0.42,LUNC:0.000085,DYM:2.1,NTRN:0.42,BAND:1.2,
  // ── RWA ──────────────────────────────────────────────────────────────────────
  ONDO:0.85,PAXG:2182,XAUT:2182,CFG:0.42,MPL:14,
  // ── Exchange tokens ──────────────────────────────────────────────────────────
  OKB:42,GT:6.5,KCS:8.5,HT:2.8,BGB:3.5,WBT:22,
  // ── BRC-20 / Ordinals ────────────────────────────────────────────────────────
  ORDI:28,SATS:0.00000035,"1000SATS":0.00000035,RATS:0.00000042,
  // ── Polkadot ecosystem ───────────────────────────────────────────────────────
  KSM:22,ACA:0.052,ASTR:0.042,PHA:0.082,
  // ── Meme / culture ───────────────────────────────────────────────────────────
  TRUMP:15,STX:1.52,FLOKI:0.000152,TURBO:0.0082,MOG:0.0000082,
  POPCAT:0.84,MEW:0.0058,NEIRO:0.00048,BABYDOGE:0.0000000018,
  MEME:0.012,NOT:0.0082,HMSTR:0.0014,DOGS:0.00048,EIGEN:2.42,LMWR:0.021,
  // ── Polygon ecosystem tokens ─────────────────────────────────────────────────
  GHST:1.42,QUICK:0.042,DFYN:0.048,DQUICK:82.4,
  // ── Stablecoins / other ──────────────────────────────────────────────────────
  USDT:1,USDC:1,TUSD:1,USDD:1,BUSD:1,
  // ── Base chain assets ────────────────────────────────────────────────────────
  CBBTC:95000,CBETH:2400,BRETT:0.114,TOSHI:0.000185,DEGEN:0.0084,
  HIGHER:0.00215,MORPHO:1.82,MOONWELL:0.182,SEAM:4.82,
  BALD:0.00284,NORMIE:0.00182,
  // ── Zora ecosystem ───────────────────────────────────────────────────────────
  ZORA:0.00182,ENJOY:0.000042,BUILD:0.000285,
};

export async function seedMarketsIfNeeded() {
  try {
    // ── Cleanup: remove legacy dash-separator symbols (e.g. "AAVE-USDT") ───
    // These were created by an old seeder; only slash-format is canonical now.
    const allMarkets = await db.select().from(marketsTable);
    const dashFormat = allMarkets.filter(m => m.symbol.includes("-") && !m.symbol.endsWith("-PERP"));
    if (dashFormat.length > 0) {
      logger.info({ count: dashFormat.length }, "Removing legacy dash-format market symbols");
      for (const m of dashFormat) {
        await db.delete(marketsTable).where(eq(marketsTable.symbol, m.symbol)).catch(() => {});
      }
    }

    const existing = await db.select().from(marketsTable);
    const existingSymbols = new Set(existing.map(m => m.symbol));

    const toInsert: any[] = [];

    // USDT pairs
    for (const base of USDT_PAIRS) {
      const sym = `${base}/USDT`;
      if (!existingSymbols.has(sym)) {
        const fp = (FALLBACK_PRICES[base] ?? 1);
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "USDT",
          lastPrice: fmtPrice(fp), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(fp*1.02), low24h: fmtPrice(fp*0.98),
          status: "active", type: "spot",
        });
      }
    }

    // Stablecoin pairs (USDC, TUSD, USDD)
    for (const [pairs, quote] of [[USDC_PAIRS,"USDC"],[TUSD_PAIRS,"TUSD"],[USDD_PAIRS,"USDD"]] as [string[],string][]) {
      for (const base of pairs) {
        const sym = `${base}/${quote}`;
        if (!existingSymbols.has(sym)) {
          const fp = FALLBACK_PRICES[base] ?? 1;
          toInsert.push({
            symbol: sym, baseAsset: base, quoteAsset: quote,
            lastPrice: fmtPrice(fp), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: fmtPrice(fp*1.02), low24h: fmtPrice(fp*0.98),
            status: "active", type: "spot",
          });
        }
      }
    }

    // ETH pairs
    for (const base of ETH_PAIRS) {
      const sym = `${base}/ETH`;
      if (!existingSymbols.has(sym)) {
        const ethPrice = FALLBACK_PRICES["ETH"] ?? 3400;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / ethPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "ETH",
          lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
          status: "active", type: "spot",
        });
      }
    }

    // BNB pairs
    for (const base of BNB_PAIRS) {
      const sym = `${base}/BNB`;
      if (!existingSymbols.has(sym)) {
        const bnbPrice = FALLBACK_PRICES["BNB"] ?? 380;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bnbPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BNB",
          lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
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
        const sym = `${base}/${quote}`;
        if (!existingSymbols.has(sym)) {
          const basePrice = FALLBACK_PRICES[base] ?? 1;
          const crossPrice = basePrice / quotePrice;
          toInsert.push({
            symbol: sym, baseAsset: base, quoteAsset: quote,
            lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
            status: "active", type: "spot",
          });
        }
      }
    }

    // New L2 chain quote pairs (BASE, LINEA, ZK, SCR, MNT)
    const L2_QUOTE_CHAINS: [string[], string, number][] = [
      [BASE_PAIRS,  "BASE",  FALLBACK_PRICES["BASE"]  ?? 0.85],
      [LINEA_PAIRS, "LINEA", FALLBACK_PRICES["LINEA"] ?? 0.80],
      [ZK_PAIRS,    "ZK",   FALLBACK_PRICES["ZK"]    ?? 0.18],
      [SCR_PAIRS,   "SCR",  FALLBACK_PRICES["SCR"]   ?? 1.20],
      [MNT_PAIRS,   "MNT",  FALLBACK_PRICES["MNT"]   ?? 0.84],
    ];
    for (const [pairs, quote, quotePrice] of L2_QUOTE_CHAINS) {
      for (const base of pairs) {
        const sym = `${base}/${quote}`;
        if (!existingSymbols.has(sym)) {
          const basePrice = FALLBACK_PRICES[base] ?? 1;
          const crossPrice = basePrice / quotePrice;
          toInsert.push({
            symbol: sym, baseAsset: base, quoteAsset: quote,
            lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
            status: "active", type: "spot",
          });
        }
      }
    }

    // BCH pairs
    for (const base of BCH_PAIRS) {
      const sym = `${base}/BCH`;
      if (!existingSymbols.has(sym)) {
        const bchPrice = FALLBACK_PRICES["BCH"] ?? 380;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bchPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BCH",
          lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
          status: "active", type: "spot",
        });
      }
    }

    // BTC pairs
    for (const base of BTC_PAIRS) {
      const sym = `${base}/BTC`;
      if (!existingSymbols.has(sym)) {
        const btcPrice = FALLBACK_PRICES["BTC"] ?? 68000;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / btcPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BTC",
          lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
          status: "active", type: "spot",
        });
      }
    }

    // BSV pairs
    for (const base of BSV_PAIRS) {
      const sym = `${base}/BSV`;
      if (!existingSymbols.has(sym)) {
        const bsvPrice = FALLBACK_PRICES["BSV"] ?? 0.055;
        const basePrice = FALLBACK_PRICES[base] ?? 1;
        const crossPrice = basePrice / bsvPrice;
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "BSV",
          lastPrice: fmtPrice(crossPrice), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(crossPrice*1.02), low24h: fmtPrice(crossPrice*0.98),
          status: "active", type: "spot",
        });
      }
    }

    // Futures PERP pairs
    for (const base of FUTURES_PAIRS) {
      const sym = `${base}/USDT-PERP`;
      if (!existingSymbols.has(sym)) {
        const fp = (FALLBACK_PRICES[base] ?? 1);
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: "USDT",
          lastPrice: fmtPrice(fp), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: fmtPrice(fp*1.02), low24h: fmtPrice(fp*0.98),
          status: "active", type: "futures",
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(marketsTable).values(toInsert).onConflictDoNothing();
      logger.info(`Seeded ${toInsert.length} new markets`);
    }

    // Ensure all internal (non-LE) pairs are flagged as pinned.
    // This is idempotent and handles any rows seeded before this flag existed.
    await db
      .update(marketsTable)
      .set({ pinned: true, enabled: true })
      .where(and(
        inArray(marketsTable.type, ["spot", "futures"]),
        eq(marketsTable.pinned, false),
      ));
  } catch (err) {
    logger.warn({ err }, "Failed to seed markets");
  }
}

// ── Quote currencies to seed for every LE coin ────────────────────────────────
// Extended set of major quote currencies so every LE token gets full coverage.
const LE_SEED_QUOTES = [
  "USDT", "USDC", "BSV", "BTC", "ETH", "BNB", "SOL", "XRP", "TRX", "DOGE",
] as const;

export async function seedLEPairsIfNeeded() {
  try {
    // Fetch the canonical LE coin list — leRequest returns { ok, data }
    const res = await leRequest("/v2/coins");
    if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) return;
    const rawCoins = res.data as Record<string, unknown>[];

    // Deduplicate by ticker (same coin, multiple networks)
    const seen = new Set<string>();
    const coins: Array<{ code: string }> = [];
    for (const item of rawCoins) {
      const code = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      coins.push({ code });
    }

    // Current live LE USD prices (may be empty if warm-up still running)
    const lePrices = getCachedLEPrices();

    // Pull prices for the five quote coins so we can compute cross-rates
    const bsvUSD  = lePrices["BSV"]  ?? FALLBACK_PRICES["BSV"]  ?? 16;
    const btcUSD  = lePrices["BTC"]  ?? FALLBACK_PRICES["BTC"]  ?? 95000;
    const ethUSD  = lePrices["ETH"]  ?? FALLBACK_PRICES["ETH"]  ?? 3500;
    const bnbUSD  = lePrices["BNB"]  ?? FALLBACK_PRICES["BNB"]  ?? 600;

    // Existing DB symbols (to avoid duplicates)
    const existing = await db.select({ symbol: marketsTable.symbol }).from(marketsTable);
    const existingSymbols = new Set(existing.map(r => r.symbol));

    const toInsert: any[] = [];

    for (const coin of coins) {
      // LE /v2/coins uses "code" as the ticker symbol
      const base = (coin.code ?? "").toUpperCase().trim();
      if (!base) continue;

      // Base USD price from LE cache, then fallback map, then 0
      const baseUSD = lePrices[base] ?? FALLBACK_PRICES[base] ?? 0;

      for (const quote of LE_SEED_QUOTES) {
        if (base === quote) continue;                 // skip e.g. USDT/USDT
        const sym = `${base}/${quote}`;
        if (existingSymbols.has(sym)) continue;       // already seeded

        let price = 0;
        if (quote === "USDT") {
          price = baseUSD;
        } else if (quote === "BSV" && bsvUSD > 0) {
          price = baseUSD / bsvUSD;
        } else if (quote === "BTC" && btcUSD > 0) {
          price = baseUSD / btcUSD;
        } else if (quote === "ETH" && ethUSD > 0) {
          price = baseUSD / ethUSD;
        } else if (quote === "BNB" && bnbUSD > 0) {
          price = baseUSD / bnbUSD;
        }

        const p = price > 0 ? price.toFixed(price < 0.0001 ? 10 : 8) : "0";
        toInsert.push({
          symbol: sym, baseAsset: base, quoteAsset: quote,
          lastPrice: p, priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: p, low24h: p,
          status: "active", type: "letsexchange",
        });
        existingSymbols.add(sym); // prevent duplicates within this batch
      }
    }

    if (toInsert.length > 0) {
      // Insert in chunks to avoid giant DB transactions
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        await db.insert(marketsTable).values(toInsert.slice(i, i + CHUNK)).onConflictDoNothing();
      }
      logger.info({ count: toInsert.length, coins: coins.length }, "LE pairs seeded into DB");
    } else {
      logger.info("LE pairs: all already present in DB");
    }

    // ── One-time migration: reclassify existing LE-seeded pairs ──────────────
    // Any "spot" pair whose quote is one of the 5 LE quotes AND whose base is
    // NOT in the pre-LE original static list gets marked "letsexchange" so the
    // frontend knows to route trades through the LE swap panel.
    try {
      const leCodes = new Set(coins.map(c => c.code));
      // Original coins seeded before LE — keep as "spot" (internal order book)
      const originalBases = new Set(USDT_PAIRS);
      // LE-only = in LE coin list AND not in the original Binance seeded list
      const leBases = [...leCodes].filter(s => !originalBases.has(s));
      if (leBases.length > 0) {
        const MCHUNK = 500;
        let migrated = 0;
        for (let i = 0; i < leBases.length; i += MCHUNK) {
          const chunk = leBases.slice(i, i + MCHUNK);
          const res = await db.update(marketsTable)
            .set({ type: "letsexchange" })
            .where(and(
              eq(marketsTable.type, "spot"),
              inArray(marketsTable.quoteAsset, [...LE_SEED_QUOTES]),
              inArray(marketsTable.baseAsset, chunk),
            ));
          migrated += ((res as any).rowsAffected ?? (res as any).changes ?? 0);
        }
        if (migrated > 0) {
          logger.info({ migrated }, "Migrated existing LE pairs → type:letsexchange");
        }
      }
    } catch (migErr) {
      logger.warn({ migErr }, "LE type migration failed (non-fatal)");
    }
  } catch (err) {
    logger.warn({ err }, "seedLEPairsIfNeeded failed (non-fatal)");
  }
}

/**
 * syncAllLEPairs — Full forced resync of ALL LetsExchange pairs in the DB.
 *
 * Unlike seedLEPairsIfNeeded (onConflictDoNothing), this function:
 *   1. Fetches the full LE coin list from the API
 *   2. Runs a fresh sovereign price pass (Binance + LE cache + fallbacks)
 *   3. UPSERTS every coin × every quote — updating zero-price rows with real prices
 *   4. Returns { coins, inserted, updated } for the admin endpoint
 *
 * Called by POST /api/admin/le-sync (admin panel) and at startup after warm-up.
 */
/**
 * syncAllLEPairs — Full all-to-all LetsExchange pair sync.
 *
 * Generates every coin×coin combination (excluding self-pairs) from the
 * LetsExchange coin catalog — producing ~36,099+ pairs depending on the
 * live LE coin list. Falls back to the built-in catalog when the API key
 * is not configured.
 *
 * Strategy:
 *   1. Try LE /v2/coins (needs API key). If 403/unavailable → use built-in list.
 *   2. Fetch sovereign prices for cross-rate math.
 *   3. For every (base, quote) pair where base ≠ quote, compute price = baseUSD / quoteUSD.
 *   4. Upsert in 500-row DB chunks (no giant transactions).
 */
export async function syncAllLEPairs(): Promise<{ coins: number; inserted: number; updated: number; quotes: number }> {
  const { getBuiltInLeCoins } = await import("./leAllCoins.js");

  // 1. Determine coin list — live API preferred, built-in fallback
  let coinTickers: string[] = [];
  let source = "api";

  try {
    const res = await leRequest("/v2/coins");
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      const seen = new Set<string>();
      for (const item of res.data as Record<string, unknown>[]) {
        const code = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase().trim();
        if (code && !seen.has(code)) { seen.add(code); coinTickers.push(code); }
      }
    } else {
      source = "builtin";
      coinTickers = getBuiltInLeCoins();
    }
  } catch {
    source = "builtin";
    coinTickers = getBuiltInLeCoins();
  }

  if (coinTickers.length === 0) throw new Error("LE sync: no coins available from API or built-in list");

  logger.info({ coins: coinTickers.length, source }, "LE sync: coin list loaded");

  // 2. Get sovereign prices for cross-rate computation
  const prices = await fetchSovereignPrices();

  // Build a USD price lookup (sovereign engine → FALLBACK_PRICES → 0)
  const usdOf = (sym: string): number =>
    prices[sym]?.usd || FALLBACK_PRICES[sym] || 0;

  // 3. All-to-all: every base paired with every other coin as quote
  const CHUNK = 500;
  let inserted = 0;
  let updated  = 0;
  let totalPairs = 0;

  // Process base coins in batches of 20 to keep memory bounded
  // Each batch of 20 bases produces up to 20 × (N-1) rows
  const BASE_BATCH = 20;

  for (let bi = 0; bi < coinTickers.length; bi += BASE_BATCH) {
    const baseBatch = coinTickers.slice(bi, bi + BASE_BATCH);
    const rows: Record<string, unknown>[] = [];

    for (const base of baseBatch) {
      const baseUSD = usdOf(base);

      for (const quote of coinTickers) {
        if (base === quote) continue; // skip self-pair
        const quoteUSD = usdOf(quote);

        let price = 0;
        if (baseUSD > 0 && quoteUSD > 0) {
          price = baseUSD / quoteUSD;
        }

        const p = fmtPrice(price);
        rows.push({
          symbol:               `${base}/${quote}`,
          baseAsset:            base,
          quoteAsset:           quote,
          lastPrice:            p,
          priceChange24h:       "0",
          priceChangePercent24h:"0",
          volume24h:            "0",
          high24h:              p,
          low24h:               p,
          status:               "active",
          type:                 "letsexchange",
        });
      }
    }

    totalPairs += rows.length;

    // Upsert in DB chunks — only update price fields, never touch type/status
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const result = await db.insert(marketsTable)
        .values(chunk as Parameters<typeof db.insert>[0]["values"])
        .onConflictDoUpdate({
          target: marketsTable.symbol,
          set: {
            lastPrice: sql`CASE WHEN ${marketsTable.type} = 'letsexchange' AND excluded.last_price != '0' THEN excluded.last_price ELSE ${marketsTable.lastPrice} END`,
            high24h:   sql`CASE WHEN ${marketsTable.type} = 'letsexchange' AND excluded.high_24h  != '0' THEN excluded.high_24h  ELSE ${marketsTable.high24h}  END`,
            low24h:    sql`CASE WHEN ${marketsTable.type} = 'letsexchange' AND excluded.low_24h   != '0' THEN excluded.low_24h   ELSE ${marketsTable.low24h}   END`,
          },
        });
      const affected = (result as any).rowCount ?? (result as any).rowsAffected ?? 0;
      inserted += affected;
    }
  }

  logger.info(
    { coins: coinTickers.length, totalPairs, inserted, source },
    "LE all-to-all pairs sync complete",
  );
  return { coins: coinTickers.length, inserted, updated, quotes: coinTickers.length - 1 };
}

// Shared in-memory map of coin → 24h change percent (populated each sovereign cycle)
const _coinChangeMap: Record<string, number> = {};
export function getCoinChangeMap(): Record<string, number> { return _coinChangeMap; }

export async function updateMarketPrices() {
  try {
    // ── Sovereign price engine: Binance + WhatsOnChain + own trades ───────────
    const prices = await fetchSovereignPrices();
    logger.info({ symbols: Object.keys(prices).length }, "Market prices updated (sovereign engine)");

    // Wrapped / synthetic BTC tokens should always track BTC 1:1.
    // If Binance / CoinGecko doesn't provide an independent price, copy BTC.
    const btcData = prices["BTC"];
    if (btcData) {
      for (const wrapper of ["WBTC", "CBBTC", "RBTC", "TBTC"]) {
        if (!prices[wrapper]) {
          prices[wrapper] = { ...btcData };
        }
      }
    }

    // Wrapped / synthetic ETH tokens track ETH 1:1 when no independent price.
    const ethData = prices["ETH"];
    if (ethData) {
      for (const wrapper of ["WETH", "CBETH", "RETH", "WSTETH"]) {
        if (!prices[wrapper] || prices[wrapper].usd < ethData.usd * 0.5) {
          prices[wrapper] = { ...ethData };
        }
      }
    }

    // Populate the shared change map so other modules (e.g. letsexchange route) can read it
    for (const [sym, data] of Object.entries(prices)) {
      _coinChangeMap[sym] = data.usd_24h_change ?? 0;
    }

    const markets = await db.select().from(marketsTable)
      .where(notInArray(marketsTable.type, ["letsexchange"]));

    for (const market of markets) {
      // Look up by base-asset symbol directly — no CoinGecko ID needed
      const data = prices[market.baseAsset];
      const baseUSD = data?.usd ?? FALLBACK_PRICES[market.baseAsset] ?? 0;
      if (!baseUSD || baseUSD <= 0) continue;

      const changePercent = data?.usd_24h_change ?? 0;
      // openPrice, high, low computed in USD first — then converted to quote currency below
      const changeUSD   = (baseUSD / (1 + changePercent / 100)) * (changePercent / 100);
      const openUSD     = baseUSD - changeUSD;
      const volatilityUSD = Math.abs(changeUSD) * 1.5 || baseUSD * 0.01;
      const high24h_usd = openUSD + volatilityUSD;
      const low24h_usd  = openUSD - volatilityUSD;

      let lastPrice = baseUSD;
      let vol = data?.usd_24h_vol ?? baseUSD * 1_000_000;
      // quoteUSD tracks divisor so high/low can be converted to quote currency at the end
      let quoteUSD = 1;

      // Helper: safely get USD price for a quote asset — prefers live sovereign
      // data, falls back to FALLBACK_PRICES, never returns 0.
      const getQuoteUSD = (sym: string, defaultVal: number): number => {
        const live = prices[sym]?.usd;
        return live || FALLBACK_PRICES[sym] || defaultVal;
      };

      // Stablecoin quote (USDC/TUSD/USDD) — price ≈ same as USD value
      if (STABLECOIN_QUOTES.has(market.quoteAsset) && market.quoteAsset !== "USDT") {
        quoteUSD  = getQuoteUSD(market.quoteAsset, 1);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // ETH quote — compute cross rate
      if (market.quoteAsset === "ETH") {
        quoteUSD  = getQuoteUSD("ETH", 3400);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // BNB quote — compute cross rate
      if (market.quoteAsset === "BNB") {
        quoteUSD  = getQuoteUSD("BNB", 380);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // SOL quote — compute cross rate
      if (market.quoteAsset === "SOL") {
        quoteUSD  = getQuoteUSD("SOL", 140);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // EVM chain quote — generic cross rate handler (MATIC/POL, AVAX, ARB, OP, FTM, CRO, MNT)
      const EVM_QUOTE_ASSETS = ["MATIC","POL","AVAX","ARB","OP","FTM","CRO","MNT"];
      if (EVM_QUOTE_ASSETS.includes(market.quoteAsset)) {
        // POL is the new name for MATIC — treat identically
        const lookupSym = market.quoteAsset === "POL" ? "MATIC" : market.quoteAsset;
        quoteUSD  = getQuoteUSD(lookupSym, 1);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // BCH quote — compute cross rate
      if (market.quoteAsset === "BCH") {
        quoteUSD  = getQuoteUSD("BCH", 380);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // BTC quote — compute cross rate
      if (market.quoteAsset === "BTC") {
        quoteUSD  = getQuoteUSD("BTC", 68000);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // BSV quote — compute cross rate
      if (market.quoteAsset === "BSV") {
        quoteUSD  = getQuoteUSD("BSV", _lastKnownBsvUsd);
        lastPrice = baseUSD / quoteUSD;
        vol       = vol / quoteUSD;
      }

      // Convert high/low from USD into quote currency (same divisor as lastPrice)
      const high24h = high24h_usd / quoteUSD;
      const low24h  = Math.max(low24h_usd / quoteUSD, 0.00000001);

      // Compute 24h change in quote currency terms
      const change        = changeUSD / quoteUSD;

      // Futures slight discount
      if (market.type === "futures") {
        lastPrice = lastPrice * (1 - 0.0001);
        vol = vol / 10;
      }

      // Skip markets with invalid prices (Infinity / NaN) to avoid DB overflow
      const safePrice = (n: number) => Number.isFinite(n) && n > 0;
      if (!safePrice(lastPrice)) {
        logger.warn({ symbol: market.symbol, lastPrice }, "Skipping market update — price is Infinity or NaN");
        continue;
      }

      await db.update(marketsTable).set({
        lastPrice:            fmtPrice(lastPrice),
        priceChange24h:       fmtPrice(Math.abs(change)) === "0" ? "0" : change.toFixed(18).replace(/0+$/, "").replace(/\.$/, "0"),
        priceChangePercent24h: changePercent.toFixed(4),
        volume24h:            (safePrice(vol) ? vol : 0).toFixed(2),
        high24h:              fmtPrice(safePrice(high24h) ? high24h : lastPrice * 1.01),
        low24h:               fmtPrice(safePrice(low24h)  ? low24h  : lastPrice * 0.99),
        marketCap:            data?.usd_market_cap ? data.usd_market_cap.toFixed(2) : null,
      }).where(eq(marketsTable.symbol, market.symbol));
    }

    // Push live USD prices into Genesis VAMM so it tracks the real market
    for (const [sym, data] of Object.entries(prices)) {
      const usd = data?.usd;
      if (usd && usd > 0) updateGenesisPrice(sym, usd);
    }

    // After prices update, check for any open stop orders that should trigger
    await triggerStopOrders();

  } catch (err) {
    logger.warn({ err }, "Failed to update prices from sovereign price engine");
  }
}

let _stopPriceUpdater: (() => void) | null = null;

export function startPriceUpdater() {
  // Warm the LE price cache, then full-sync ALL LE pairs into the DB with live prices.
  // syncAllLEPairs upserts (not just inserts) so zero-price rows get real prices.
  warmLEPriceCache()
    .then(() => syncAllLEPairs())
    .then(r => logger.info(r, "Startup: LE pairs synced"))
    .catch(err => {
      logger.warn({ err }, "Startup: LE full sync failed, falling back to seed");
      return seedLEPairsIfNeeded();
    });

  seedMarketsIfNeeded().then(() => updateMarketPrices());
  _stopPriceUpdater = guardedInterval("price-updater", updateMarketPrices, 60_000, { timeoutMs: 55_000 });
  logger.info("Live price updater started (interval: 60s, self-healing)");
}

export function stopPriceUpdater() {
  if (_stopPriceUpdater) {
    _stopPriceUpdater();
    _stopPriceUpdater = null;
  }
}
