import { db, pool, withDbRetry } from "@workspace/db";
import { marketsTable, tradesTable } from "@workspace/db/schema";
import { eq, desc, gte, inArray, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { guardedInterval, withRetry } from "./selfHealing.js";
import { triggerStopOrders } from "./stopOrderEngine.js";
import { serviceState } from "./serviceState.js";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { updateGenesisPrice } from "../routes/virtualAmm.js";
import { getCachedLEPrices, warmLEPriceCache, leRequest, fetchLEKeyPricesIfNeeded } from "./lePriceCache.js";
import { fetchSSCurrencies, isSimpleSwapConfigured } from "./simpleswap.js";

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
  MATIC: "polygon-ecosystem-token", // renamed from matic-network after POL rebrand
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
  DOGS:  "dogs-2", // CoinGecko canonical ID post-rebrand
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
  A8:    "ancient8",
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

/* ── CoinGecko free-tier batch price fetch ─────────────────────────────────
 * Works in all cloud environments including Replit (unlike Binance).
 * Fetches prices + real 24h change for every symbol in COINGECKO_IDS in one
 * HTTP call. Results cached for 55 s so concurrent callers share the response.
 */
let _cgCacheTs = 0;
let _cgCache: Record<string, CoinGeckoPrice> = {};
const CG_CACHE_MS = 55_000;

/** Market cap (USD) per symbol — populated on each successful CG simple/price call. */
export const cgMarketCapCache = new Map<string, number>();

export async function fetchCoinGeckoPrices(): Promise<Record<string, CoinGeckoPrice>> {
  if (Date.now() - _cgCacheTs < CG_CACHE_MS && Object.keys(_cgCache).length > 0) {
    return _cgCache;
  }
  const ids = Object.values(COINGECKO_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  const data = await res.json() as Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number }>;

  // Reverse-map: geckoId → our symbol
  const idToSym: Record<string, string> = {};
  for (const [sym, id] of Object.entries(COINGECKO_IDS)) idToSym[id] = sym;

  const out: Record<string, CoinGeckoPrice> = {};
  for (const [id, v] of Object.entries(data)) {
    const sym = idToSym[id];
    if (!sym || !v.usd || v.usd <= 0) continue;
    const cap = v.usd_market_cap ?? 0;
    out[sym] = {
      usd:            v.usd,
      usd_24h_change: v.usd_24h_change ?? 0,
      usd_24h_vol:    v.usd_24h_vol   ?? v.usd * 500_000,
      usd_market_cap: cap,
    };
    if (cap > 0) cgMarketCapCache.set(sym, cap);
  }
  _cgCache = out;
  _cgCacheTs = Date.now();
  return out;
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
  // Retried once on timeout before falling through to the LetsExchange fallback.
  try {
    // Single attempt with a 5 s timeout.
    // In the Replit environment Binance is network-blocked so a connection
    // error is immediate; a short timeout burns minimal time before the LE
    // fallback path runs.  In production Binance responds in < 2 s so the
    // cap never triggers.  Two attempts (the old setting) wasted ~25 s per
    // cycle in dev and caused the price-updater to reliably exceed its 55 s
    // timeout, marking it Dead after every run.
    const res = await withRetry(
      () => fetch("https://api.binance.com/api/v3/ticker/24hr", {
        // 2 s: Binance responds in <2 s when reachable; anything longer means
        // the host is blocked or dropping packets, so cut losses and fall through
        // to the LetsExchange fallback instead of burning 5 s per cycle.
        signal: AbortSignal.timeout(2_000),
      }),
      { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 },
    );
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

  // ── 1c. CoinGecko — live prices + real 24h change for 150+ coins ─────────
  // Works in all cloud environments (Binance blocked in Replit).
  // Fills symbols that LE didn't cover and upgrades zero-change entries.
  try {
    const cgPrices = await fetchCoinGeckoPrices();
    let cgNew = 0;
    for (const [sym, data] of Object.entries(cgPrices)) {
      if (!out[sym]) {
        out[sym] = data;
        cgNew++;
      } else if (out[sym].usd_24h_change === 0 && data.usd_24h_change !== 0) {
        out[sym].usd_24h_change = data.usd_24h_change;
        if (out[sym].usd <= 0 && data.usd > 0) out[sym].usd = data.usd;
      }
    }
    logger.info({ new: cgNew, total: Object.keys(cgPrices).length }, "CoinGecko prices loaded");
  } catch (err) {
    logger.warn({ err }, "CoinGecko price fetch failed — continuing with LE + FALLBACK");
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
  // Guarded with a 5 s Promise.race: withDbRetry can wait up to 63 s under
  // pool exhaustion (4 attempts × 15 s connectionTimeoutMillis); bailing out
  // early keeps fetchSovereignPrices() well under the 120 s tick budget.
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000); // last 1 hour
    const recentTrades = await Promise.race([
      db
        .select({
          symbol:    tradesTable.symbol,
          price:     tradesTable.price,
          total:     tradesTable.total,
          timestamp: tradesTable.timestamp,
        })
        .from(tradesTable)
        .where(gte(tradesTable.timestamp, since))
        .orderBy(desc(tradesTable.timestamp)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("own-trades overlay timed out after 5s")), 5_000)
      ),
    ]);

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
export function simulateDailyChange(symbol: string): number {
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

// Default fallback prices — last resort when all live APIs are unavailable.
// Updated Jun 2026. CoinGecko / LE / WhatsOnChain take priority at runtime.
export const FALLBACK_PRICES: Record<string, number> = {
  // ── Top L1s ─────────────────────────────────────────────────────────────────
  BSV:12,BTC:59000,ETH:1577,SOL:73,XRP:1.04,BNB:547,ADA:0.144,
  DOGE:0.072,DOT:0.81,AVAX:6.55,MATIC:0.14,LINK:7.24,UNI:3.80,ATOM:1.51,
  LTC:42,BCH:200,TRX:0.11,ETC:6.98,NEAR:1.84,ICP:2.12,VET:0.0044,FIL:0.72,
  SAND:0.047,MANA:0.062,APT:0.565,ARB:0.074,OP:0.40,SUI:1.50,INJ:4.59,
  PEPE:0.0000068,SHIB:0.0000088,
  // ── DeFi ─────────────────────────────────────────────────────────────────────
  MKR:1236,AAVE:89,CRV:0.187,ENS:12,LDO:0.248,SUSHI:0.45,COMP:15.52,
  GRT:0.0177,SNX:0.209,YFI:1614,RUNE:1.20,BAL:0.089,GMX:5.51,DYDX:0.162,
  PENDLE:1.31,CVX:1.07,FXS:0.233,SPELL:0.00055,PERP:0.30,CAKE:1.30,ALPACA:0.00030,
  // ── L1 alts ──────────────────────────────────────────────────────────────────
  FTM:0.0275,ALGO:0.085,XLM:0.178,HBAR:0.070,EGLD:2.55,THETA:0.129,EOS:0.061,
  ZEC:390,DASH:33,XMR:308,CRO:0.054,AERO:0.60,
  KAVA:0.32,ONE:0.009,ZIL:0.009,ICX:0.10,WAVES:0.80,NEO:5.0,
  CFX:0.07,ROSE:0.030,FLR:0.009,CELO:0.35,CKB:0.008,CORE:0.50,
  BTT:0.00000060,XDC:0.030,GLMR:0.08,MOVR:4.0,KDA:0.40,ZEN:7.0,
  TON:2.60,KAS:0.031,SEI:0.049,TIA:0.368,
  // ── L2 / Scaling ─────────────────────────────────────────────────────────────
  BASE:0.50,LINEA:0.03,ZK:0.08,SCR:0.027,MNT:0.421,
  STRK:0.029,IMX:0.117,BOBA:0.020,METIS:2.65,
  "1INCH":0.067,ZRO:0.794,RETH:1690,
  DAI:1.00,WBTC:59000,WSTETH:1845,
  // ── Solana ecosystem ─────────────────────────────────────────────────────────
  BONK:0.0000145,WIF:0.50,JUP:0.45,PYTH:0.20,JTO:1.20,ORCA:1.40,
  BOME:0.0040,RAY:1.20,MSOL:80,W:0.12,TNSR:0.18,
  // ── AI / DePIN ───────────────────────────────────────────────────────────────
  FET:0.170,AGIX:0.45,OCEAN:0.30,RNDR:2.80,TAO:203,ARKM:0.90,NMR:10,
  ORAI:2.40,CTXC:0.07,WLD:1.00,ALT:0.09,
  HNT:4.0,IOTX:0.020,GLM:0.14,STORJ:0.20,POWR:0.10,LPT:3.50,
  // ── Gaming / Metaverse ───────────────────────────────────────────────────────
  APE:0.145,A8:0.06,AXS:0.965,ENJ:0.09,GALA:0.012,ILV:2.93,ALICE:0.119,TLM:0.006,SLP:0.000456,
  WAXP:0.025,PIXEL:0.0046,BIGTIME:0.035,BEAM:0.008,PRIME:0.238,RON:1.20,
  MC:0.012,GODS:0.040,
  // ── Cosmos ecosystem ─────────────────────────────────────────────────────────
  OSMO:0.036,STARS:0.000069,JUNO:0.024,EVMOS:0.008,STRD:0.30,
  AKT:1.20,SCRT:0.20,LUNA:0.047,LUNC:0.0000592,DYM:0.015,NTRN:0.00098,BAND:0.140,
  // ── RWA ──────────────────────────────────────────────────────────────────────
  ONDO:0.309,PAXG:4023,XAUT:4019,CFG:0.20,MPL:8.0,
  // ── Exchange tokens ──────────────────────────────────────────────────────────
  OKB:78,GT:6.45,KCS:6.92,HT:0.081,BGB:1.61,WBT:47,
  // ── BRC-20 / Ordinals ────────────────────────────────────────────────────────
  ORDI:3.65,SATS:0.00000020,"1000SATS":0.00000020,RATS:0.00000025,
  // ── Polkadot ecosystem ───────────────────────────────────────────────────────
  KSM:12,ACA:0.030,ASTR:0.025,PHA:0.040,
  // ── Meme / culture ───────────────────────────────────────────────────────────
  TRUMP:8,STX:0.60,FLOKI:0.0000850,TURBO:0.0040,MOG:0.0000042,
  POPCAT:0.35,MEW:0.0030,NEIRO:0.00022,BABYDOGE:0.0000000010,
  MEME:0.005,NOT:0.0035,HMSTR:0.00060,DOGS:0.00020,EIGEN:1.10,LMWR:0.010,
  // ── Polygon ecosystem tokens ─────────────────────────────────────────────────
  GHST:0.60,QUICK:0.020,DFYN:0.020,DQUICK:45,
  // ── Stablecoins / other ──────────────────────────────────────────────────────
  USDT:1,USDC:1,TUSD:1,USDD:1,BUSD:1,
  // ── Base chain assets ────────────────────────────────────────────────────────
  CBBTC:59000,CBETH:1577,BRETT:0.060,TOSHI:0.000090,DEGEN:0.0040,
  HIGHER:0.00100,MORPHO:0.80,MOONWELL:0.080,SEAM:2.00,
  BALD:0.00120,NORMIE:0.00080,
  // ── Zora ecosystem ───────────────────────────────────────────────────────────
  ZORA:0.00090,ENJOY:0.000020,BUILD:0.000140,
};

export async function seedMarketsIfNeeded() {
  try {
    // ── Cleanup: remove legacy dash-separator symbols (e.g. "AAVE-USDT") ───
    // Fetch only the symbol column (not all columns) to keep memory usage low
    // even when the table has 36K+ rows from a previous LE sync.
    const dashFormat = await db
      .select({ symbol: marketsTable.symbol })
      .from(marketsTable)
      .where(sql`symbol LIKE '%-%' AND symbol NOT LIKE '%-PERP'`);
    if (dashFormat.length > 0) {
      logger.info({ count: dashFormat.length }, "Removing legacy dash-format market symbols");
      for (const m of dashFormat) {
        await db.delete(marketsTable).where(eq(marketsTable.symbol, m.symbol)).catch(() => {});
      }
    }

    // Fetch only the symbol column so we don't load full rows for 36K+ LE pairs
    const existingRows = await withDbRetry(() =>
      db.select({ symbol: marketsTable.symbol }).from(marketsTable)
    );
    const existingSymbols = new Set(existingRows.map(m => m.symbol));

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
    const existing = await withDbRetry(() =>
      db.select({ symbol: marketsTable.symbol }).from(marketsTable)
    );
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
export async function syncAllLEPairs(): Promise<{ coins: number; inserted: number; updated: number; deleted: number; quotes: number }> {
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
        .values(chunk as any[])
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

  // ── Tombstone: remove LE markets whose base or quote coin was dropped from LE ─
  // Pass the live coin ticker list as a PostgreSQL text[] array so PostgreSQL can
  // evaluate != ALL(array) inline without a gigantic IN(...) clause.
  const delResult = await pool.query<{ rowcount: number }>(
    `DELETE FROM markets
     WHERE type = 'letsexchange'
       AND (base_asset != ALL($1::text[]) OR quote_asset != ALL($1::text[]))`,
    [coinTickers],
  );
  const deleted = delResult.rowCount ?? 0;

  logger.info(
    { coins: coinTickers.length, totalPairs, inserted, deleted, source },
    "LE all-to-all pairs sync complete",
  );
  return { coins: coinTickers.length, inserted, updated, deleted, quotes: coinTickers.length - 1 };
}

/**
 * syncNewLECoins — lightweight incremental sync for newly-listed LE coins.
 *
 * Runs every 4 hours automatically. Fetches the live LE /v2/coins list,
 * compares it with coins already in the DB, and only inserts pairs for
 * genuinely new coins. This means:
 *   - New LetsExchange coins are permanently added within 4 hours automatically
 *   - No manual admin le-sync required for new listings
 *   - Much cheaper than full syncAllLEPairs (only N×new_coins rows, not N²)
 *   - onConflictDoNothing — safe to run at any time, never clobbers live prices
 */
export async function syncNewLECoins(): Promise<{ newCoins: number; inserted: number }> {
  // 1. Fetch live LE coin list
  let liveCoins: string[] = [];
  try {
    const res = await leRequest("/v2/coins");
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      const seen = new Set<string>();
      for (const item of res.data as Record<string, unknown>[]) {
        const code = ((item.code ?? item.ticker ?? item.symbol ?? "") as string).toUpperCase().trim();
        if (code && !seen.has(code)) { seen.add(code); liveCoins.push(code); }
      }
    }
  } catch (err) {
    logger.warn({ err }, "syncNewLECoins: failed to fetch LE coins (skipping cycle)");
    return { newCoins: 0, inserted: 0 };
  }
  if (liveCoins.length === 0) return { newCoins: 0, inserted: 0 };

  // 2. Get coins already in the DB as base assets
  const dbResult = await pool.query<{ base_asset: string }>(
    `SELECT DISTINCT base_asset FROM markets WHERE type = 'letsexchange'`,
  );
  const dbCoins = new Set(dbResult.rows.map(r => r.base_asset));

  // 3. Find genuinely new coins not yet in the DB
  const newCoins = liveCoins.filter(c => !dbCoins.has(c));
  if (newCoins.length === 0) {
    logger.debug({ total: liveCoins.length }, "syncNewLECoins: no new coins detected");
    return { newCoins: 0, inserted: 0 };
  }

  logger.info(
    { count: newCoins.length, sample: newCoins.slice(0, 10) },
    "syncNewLECoins: new LE coins detected — inserting pairs",
  );

  // 4. Fetch sovereign prices for cross-rate math
  const prices = await fetchSovereignPrices();
  const usdOf = (sym: string): number => prices[sym]?.usd || FALLBACK_PRICES[sym] || 0;

  const CHUNK = 500;
  let inserted = 0;

  for (const newCoin of newCoins) {
    const newUSD = usdOf(newCoin);
    const rows: (typeof marketsTable.$inferInsert)[] = [];

    // newCoin as base paired with every other live coin as quote
    for (const quote of liveCoins) {
      if (quote === newCoin) continue;
      const quoteUSD = usdOf(quote);
      const p = (newUSD > 0 && quoteUSD > 0) ? fmtPrice(newUSD / quoteUSD) : "0";
      rows.push({
        symbol: `${newCoin}/${quote}`, baseAsset: newCoin, quoteAsset: quote,
        lastPrice: p, priceChange24h: "0", priceChangePercent24h: "0",
        volume24h: "0", high24h: p, low24h: p,
        status: "active", type: "letsexchange",
      });
    }

    // Every other live coin as base paired with newCoin as quote (reverse direction)
    for (const base of liveCoins) {
      if (base === newCoin) continue;
      const baseUSD = usdOf(base);
      const p = (baseUSD > 0 && newUSD > 0) ? fmtPrice(baseUSD / newUSD) : "0";
      rows.push({
        symbol: `${base}/${newCoin}`, baseAsset: base, quoteAsset: newCoin,
        lastPrice: p, priceChange24h: "0", priceChangePercent24h: "0",
        volume24h: "0", high24h: p, low24h: p,
        status: "active", type: "letsexchange",
      });
    }

    // Insert in chunks — onConflictDoNothing preserves any live prices already present
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const result = await db.insert(marketsTable).values(chunk).onConflictDoNothing();
      inserted += (result as any).rowCount ?? 0;
    }
  }

  logger.info({ newCoins: newCoins.length, inserted }, "syncNewLECoins: complete");
  return { newCoins: newCoins.length, inserted };
}

// ── SimpleSwap pair sync ──────────────────────────────────────────────────────

// Same quote set used by the /simpleswap/pairs route
const SS_QUOTE_ASSETS = [
  "BSV", "BTC", "ETH", "USDT", "USDC", "BNB",
  "SOL", "XRP", "TRX", "DOGE",
  "LTC", "BCH", "AVAX", "MATIC",
  "ARB", "OP", "FTM", "CRO", "MNT", "ZK", "SCR", "LINEA",
];

// SS network-specific tickers → canonical OrahDEX symbols
const SS_TO_SYMBOL: Record<string, string> = {
  usdterc20: "USDT",  usdttrc20: "USDT",  usdtbsc:   "USDT",  usdtsol:   "USDT",
  usdtmatic: "USDT",  usdtton:   "USDT",  usdtop:    "USDT",  usdtarb:   "USDT",
  usdtavax:  "USDT",  usdtalgo:  "USDT",  usdtkava:  "USDT",  usdtcelo:  "USDT",
  usdcerc20: "USDC",  usdcbsc:   "USDC",  usdcsol:   "USDC",  usdcmatic: "USDC",
  usdcop:    "USDC",  usdcarb:   "USDC",  usdcbase:  "USDC",  usdcavax:  "USDC",
  usdcton:   "USDC",
  "bnb-bsc": "BNB",   bnbbsc:    "BNB",
  pol:       "MATIC",
  avaxc:     "AVAX",
  etharb:    "ETH",   ethop:     "ETH",   ethbase:   "ETH",   ethlinea:  "ETH",
  ethscroll: "ETH",   ethbsc:    "ETH",
  wbtcerc20: "WBTC",  wbtcbsc:   "WBTC",
  daierc20:  "DAI",   daibsc:    "DAI",   daimatic:  "DAI",   daiarb:    "DAI",
  linkbsc:   "LINK",  unibsc:    "UNI",
};

function normalizeSsTicker(ticker: string): string | null {
  if (!ticker) return null;
  const mapped = SS_TO_SYMBOL[ticker.toLowerCase()];
  if (mapped) return mapped;
  const cleaned = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 1 || cleaned.length > 12) return null;
  return cleaned;
}

/**
 * syncSSPairs — seed and sync SimpleSwap pairs into the DB.
 *
 * Fetches the live SS currency catalog, deduplicates by normalized symbol,
 * then upserts coin × SS_QUOTE_ASSETS rows as type='simpleswap'.
 *
 *   - First run: full seed — inserts all ~3 000 coins × 22 quotes (~66 K rows)
 *   - Subsequent runs: onConflictDoNothing makes repeat runs safe and fast
 *   - New SS coins appear in DB within 4 hours — no manual admin action needed
 *   - Skips silently when SIMPLESWAP_API_KEY is not configured
 */
export async function syncSSPairs(): Promise<{ coins: number; inserted: number }> {
  if (!isSimpleSwapConfigured()) {
    logger.debug("syncSSPairs: SIMPLESWAP_API_KEY not configured — skipping");
    return { coins: 0, inserted: 0 };
  }

  const currencies = await fetchSSCurrencies();
  if (currencies.length === 0) {
    logger.warn("syncSSPairs: fetchSSCurrencies returned empty — skipping cycle");
    return { coins: 0, inserted: 0 };
  }

  // Deduplicate by normalised symbol (first network variant wins)
  const seenSymbols = new Set<string>();
  const uniqueSymbols: string[] = [];
  for (const c of currencies) {
    const sym = normalizeSsTicker(c.symbol);
    if (!sym || seenSymbols.has(sym)) continue;
    seenSymbols.add(sym);
    uniqueSymbols.push(sym);
  }

  logger.info({ coins: uniqueSymbols.length }, "syncSSPairs: building pairs");

  // Get sovereign prices for cross-rate math
  const prices = await fetchSovereignPrices();
  const usdOf = (sym: string): number => prices[sym]?.usd || FALLBACK_PRICES[sym] || 0;

  const QUOTES_SET = new Set(SS_QUOTE_ASSETS);
  const CHUNK = 500;
  let inserted = 0;
  const rows: (typeof marketsTable.$inferInsert)[] = [];

  for (const base of uniqueSymbols) {
    if (QUOTES_SET.has(base)) continue; // pure quote asset — skip as base
    const baseUSD = usdOf(base);

    for (const quote of SS_QUOTE_ASSETS) {
      if (base === quote) continue;
      const quoteUSD = usdOf(quote);
      const p = (baseUSD > 0 && quoteUSD > 0) ? fmtPrice(baseUSD / quoteUSD) : "0";
      rows.push({
        symbol: `${base}/${quote}`, baseAsset: base, quoteAsset: quote,
        lastPrice: p, priceChange24h: "0", priceChangePercent24h: "0",
        volume24h: "0", high24h: p, low24h: p,
        status: "active", type: "simpleswap",
      });
    }
  }

  // Upsert in chunks — onConflictDoNothing preserves any live prices already stored
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db.insert(marketsTable).values(chunk).onConflictDoNothing();
    inserted += (result as any).rowCount ?? 0;
  }

  logger.info({ coins: uniqueSymbols.length, pairs: rows.length, inserted }, "syncSSPairs: complete");
  return { coins: uniqueSymbols.length, inserted };
}

// Shared in-memory map of coin → 24h change percent (populated each sovereign cycle)
const _coinChangeMap: Record<string, number> = {};
export function getCoinChangeMap(): Record<string, number> { return _coinChangeMap; }

export async function updateMarketPrices() {
  try {
    // ── Sovereign price engine: Binance + WhatsOnChain + own trades ───────────
    const prices = await fetchSovereignPrices();
    serviceState.priceEngineLastRunAt = Date.now();
    serviceState.priceEngineRuns++;
    const priceCount = Object.keys(prices).length;
    logger.info({ symbols: priceCount }, "Market prices updated (sovereign engine)");
    // Notify the subsystem probe so the Price Engine health check shows OK
    import("./subsystemProbe.js")
      .then(m => m.recordPriceEngineRun(priceCount))
      .catch(() => {});

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

    // Only update types where the sovereign price engine has data.
    // "spot" and "futures" are our internally-managed market rows (~4 K rows).
    // "letsexchange" and "simpleswap" are external pair catalogs whose prices
    // are computed on-the-fly from sovereign data at swap/quote time — they
    // don't need periodic DB price writes.
    // Guarded with a 12 s Promise.race: withDbRetry can wait up to 63 s under
    // pool exhaustion; bailing out early lets the tick finish or retry quickly
    // instead of burning the full 120 s timeout budget on a stuck connection.
    const markets = await Promise.race([
      db.select({
        symbol:     marketsTable.symbol,
        baseAsset:  marketsTable.baseAsset,
        quoteAsset: marketsTable.quoteAsset,
        type:       marketsTable.type,
      }).from(marketsTable)
        .where(inArray(marketsTable.type, ["spot", "futures"])),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("markets SELECT timed out after 12s")), 12_000)
      ),
    ]);

    const pendingUpdates: Array<{
      symbol: string; lastPrice: string; priceChange24h: string;
      priceChangePercent24h: string; volume24h: string;
      high24h: string; low24h: string; marketCap: string | null;
    }> = [];

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

      pendingUpdates.push({
        symbol:               market.symbol,
        lastPrice:            fmtPrice(lastPrice),
        priceChange24h:       fmtPrice(Math.abs(change)) === "0" ? "0" : change.toFixed(18).replace(/0+$/, "").replace(/\.$/, "0"),
        priceChangePercent24h: changePercent.toFixed(4),
        volume24h:            (safePrice(vol) ? vol : 0).toFixed(2),
        high24h:              fmtPrice(safePrice(high24h) ? high24h : lastPrice * 1.01),
        low24h:               fmtPrice(safePrice(low24h)  ? low24h  : lastPrice * 0.99),
        marketCap:            data?.usd_market_cap ? data.usd_market_cap.toFixed(2) : null,
      });
    }

    // Flush all price updates in a single bulk UPDATE per chunk — uses exactly
    // 1 DB connection instead of N concurrent ones, eliminating the pool
    // exhaustion that caused the 15 May 2026 production outage.
    // 8 params per row × 4000 rows = 32000 — well within PostgreSQL's 65535 limit.
    // CHUNK SIZE: 4000 → ~1 chunk for all spot/futures markets (~4K rows).
    // Old value of 500 produced 8 chunks; under pool exhaustion each chunk waited
    // connectionTimeoutMillis (15 s) before failing, so 8 × 15 s = 120 s burned
    // the full guardedInterval budget every cycle and kept price-updater DEAD.
    const BULK_CHUNK = 4_000;
    for (let i = 0; i < pendingUpdates.length; i += BULK_CHUNK) {
      const chunk = pendingUpdates.slice(i, i + BULK_CHUNK);
      const placeholders = chunk
        .map((_, j) => {
          const b = j * 8;
          return `($${b+1}, $${b+2}::numeric, $${b+3}::numeric, $${b+4}::numeric, $${b+5}::numeric, $${b+6}::numeric, $${b+7}::numeric, $${b+8}::numeric)`;
        })
        .join(", ");
      const params = chunk.flatMap(u => [
        u.symbol,
        u.lastPrice,
        u.priceChange24h,
        u.priceChangePercent24h,
        u.volume24h,
        u.high24h,
        u.low24h,
        u.marketCap ?? null,
      ]);
      const updateFailed = await withRetry(() => pool.query(
          `UPDATE markets AS m
             SET last_price              = v.lp,
                 price_change_24h        = v.pc,
                 price_change_percent_24h = v.pcp,
                 volume_24h              = v.vol,
                 high_24h                = v.hi,
                 low_24h                 = v.lo,
                 market_cap              = v.mc
           FROM (VALUES ${placeholders})
             AS v(sym, lp, pc, pcp, vol, hi, lo, mc)
           WHERE m.symbol = v.sym
             AND m.type IN ('spot', 'futures')`,
          params,
        ), { maxAttempts: 1, baseDelayMs: 0 })
        .then(() => false)
        .catch(err => {
          logger.warn({ err }, "priceUpdater: bulk UPDATE failed — aborting remaining chunks");
          return true;
        });
      if (updateFailed) break; // pool exhausted — don't burn 15 s × N on doomed chunks
    }
    pendingUpdates.length = 0;
    // Release the large markets query result before proceeding
    (markets as unknown[]).length = 0;

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
  // Notify the subsystem probe immediately so it shows "warming up" instead of
  // "No price run recorded" during the 35-second initial delay.
  import("./subsystemProbe.js")
    .then(m => m.notifyPriceEngineStarted())
    .catch(() => { /* non-critical */ });

  // Warm the LE price cache at 90 s (price lookups only — no pair sync).
  // syncAllLEPairs() is intentionally NOT called at startup: the DB already
  // holds 36K+ LE pairs from a previous run, and inserting them again while
  // the markets endpoint is live causes JSON.stringify OOM on the full table.
  // The /api/letsexchange/pairs route serves from the DB when ≥100 rows exist.
  setTimeout(() => {
    warmLEPriceCache()
      .catch(err => logger.warn({ err }, "Startup: LE price cache warm failed"));
  }, 90_000);

  // Seed any missing market rows at 15 s (lightweight DB write, no network).
  // Do NOT call updateMarketPrices() here — the guarded interval below owns that.
  setTimeout(() => {
    seedMarketsIfNeeded().catch(err => logger.warn({ err }, "seedMarketsIfNeeded failed"));
  }, 15_000);

  // Incremental LE coin sync — automatically picks up new coins added by LetsExchange.
  // First run at 5 min (server fully warmed up), then every 4 hours.
  // onConflictDoNothing makes it safe to run at any time; no-op when DB is current.
  guardedInterval(
    "le-coin-sync", () => syncNewLECoins().then(() => {}), 4 * 60 * 60 * 1000,
    { timeoutMs: 5 * 60 * 1000, initialDelayMs: 5 * 60 * 1000 },
  );

  // SS pairs seed/sync — first boot seeds all ~66K rows, then picks up new SS coins every 4 h.
  guardedInterval(
    "ss-pairs-sync", () => syncSSPairs().then(() => {}), 4 * 60 * 60 * 1000,
    { timeoutMs: 3 * 60 * 1000, initialDelayMs: 3 * 60 * 1000 },
  );

  // Universal market catalog — N×(N-1) cross-product of all tradeable assets → type="catalog".
  // Deferred 20 min so LE + SS syncs can run first, then refreshed daily.
  // Timeout: 30 min — expected runtime is 2–5 min for 1.24 M rows.
  guardedInterval(
    "universal-markets",
    () => import("./universalMarkets.js").then(m => m.generateUniversalMarkets()),
    24 * 60 * 60 * 1000,
    { timeoutMs: 30 * 60 * 1000, initialDelayMs: 20 * 60 * 1000 },
  );

  // First Binance price fetch deferred to 35 s so the server is fully settled
  // before the large ticker-24hr response (~5 MB / 2000+ objects) is parsed.
  // After the first run, the guarded interval takes over every 60 s.
  _stopPriceUpdater = guardedInterval(
    "price-updater", updateMarketPrices, 60_000,
    // 120 s timeout: bulk UPDATE now uses maxAttempts:1 so the retry overhead is
    // gone, but on a loaded DB the single attempt can still take 30–40 s.
    // Network fetches (LE + CoinGecko + WoC) add another 15–20 s.
    // 120 s gives headroom for slow-DB environments without being so long
    // that stale prices go undetected for more than 2 price cycles.
    { timeoutMs: 120_000, initialDelayMs: 35_000 },
  );
  logger.info("Live price updater started (interval: 60s, self-healing)");
}

export function stopPriceUpdater() {
  if (_stopPriceUpdater) {
    _stopPriceUpdater();
    _stopPriceUpdater = null;
  }
}
