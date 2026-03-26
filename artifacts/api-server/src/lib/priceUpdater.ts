import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { cmcFetchPrices } from "./cmcFallback.js";

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
  GMX:   "gmx",
  DYDX:  "dydx-chain",
  PENDLE:"pendle",
  BAL:   "balancer",
  STX:   "blockstack",
  FLOKI: "floki",
  CVX:   "convex-finance",
  FXS:   "frax-share",
  SPELL: "spell-token",
  PERP:  "perpetual-protocol",
  // Meme / culture
  TRUMP: "official-trump",
  TURBO: "turbo",
  MOG:   "mog-coin",
  POPCAT:"popcat",
  MEW:   "cat-in-a-dogs-world",
  NEIRO: "first-neiro-on-ethereum",
  BABYDOGE:"baby-doge-coin",
  MEME:  "memecoin-2",
  NOT:   "notcoin",
  HMSTR: "hamster-kombat",
  DOGS:  "dogs",
  EIGEN: "eigenlayer",
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
  ORDI:  "ordinals",
  SATS:  "1000sats-ordinals",
  RATS:  "rats-ordinals",
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
  "YFI","RUNE","BAL","GMX","DYDX","PENDLE","CVX","FXS","SPELL","PERP",
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
  "AXS","ENJ","GALA","ILV","ALICE","TLM","SLP","WAXP","PIXEL","BIGTIME",
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
  "BABYDOGE","MEME","NOT","HMSTR","DOGS","EIGEN",
  // ── L2 / bridge ──────────────────────────────────────────────────────────────
  "1INCH","ZRO","ZK","SCR","MNT","STRK","IMX","BOBA","METIS",
  "WBTC","WSTETH","RETH",
  // ── Base chain assets ────────────────────────────────────────────────────────
  "CBBTC","CBETH","AERO","BRETT","TOSHI","DEGEN","HIGHER",
  "MORPHO","MOONWELL","SEAM","BALD","NORMIE",
  // ── Zora ecosystem ───────────────────────────────────────────────────────────
  "ZORA","ENJOY","BUILD",
];

// BTC pairs — wide coverage vs BTC
export const BTC_PAIRS = [
  "ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","NEAR","APT","ARB","OP","SUI","INJ",
  "AAVE","DASH","XMR","ZEC","PEPE","SHIB","MKR","CRV","RUNE","YFI",
  "COMP","SNX","GRT","SUSHI","LDO","FIL","ALGO","XLM","HBAR","TRX",
  "ETC","FTM","EOS","THETA","VET","BSV","BCH",
  "TON","KAS","SEI","TIA","KAVA","ONE","ZIL","AXS","GALA","ENJ",
  "SAND","MANA","IMX","OSMO","ATOM","INJ","ONDO","ORDI","SATS",
  "STX","GMX","DYDX","PENDLE","FET","RNDR","TAO","WLD",
  "BONK","WIF","JUP","PYTH","RON","AKT","LUNA",
];

// ETH pairs — top coins vs ETH
export const ETH_PAIRS = [
  "BTC","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX","MATIC","LINK",
  "UNI","ATOM","LTC","BCH","NEAR","APT","ARB","OP","SUI","INJ",
  "AAVE","MKR","CRV","LDO","COMP","SNX","GRT","RUNE","YFI",
  "TON","SEI","TIA","AXS","GALA","ENJ","IMX","SAND","MANA",
  "OSMO","ONDO","ORDI","STX","FET","RNDR","TAO","BONK","WIF",
];

// Stablecoin pairs — USDC, TUSD, USDD quote assets (same as USDT, minus niche tokens)
const STABLE_BASE_PAIRS = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","DOT","AVAX",
  "MATIC","LINK","UNI","ATOM","LTC","BCH","TRX","ETC","NEAR","ICP",
  "VET","FIL","APT","ARB","OP","SUI","INJ","PEPE","SHIB",
  "MKR","AAVE","CRV","ENS","LDO","SUSHI","COMP","GRT","SNX","RUNE",
  "FTM","ALGO","XLM","HBAR","EGLD","EOS","ZEC","DASH","XMR","SAND","MANA",
  "TON","KAS","SEI","TIA","KAVA","AXS","ENJ","GALA","IMX","RON",
  "OSMO","ATOM","ONDO","PAXG","OKB","KCS","ORDI","SATS",
  "BONK","WIF","JUP","PYTH","FET","RNDR","TAO","WLD","STX","GMX","DYDX",
];
export const USDC_PAIRS = [
  ...STABLE_BASE_PAIRS,
  // ── Base chain assets vs USDC ────────────────────────────────────────────
  "CBBTC","CBETH","AERO","BRETT","TOSHI","DEGEN","HIGHER",
  "MORPHO","MOONWELL","SEAM","BALD","NORMIE",
  // ── Zora ecosystem vs USDC ──────────────────────────────────────────────
  "ZORA","ENJOY","BUILD",
];
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

// BASE (Coinbase L2) pairs
export const BASE_PAIRS = [
  "ETH","BTC","USDC","DAI","LINK","UNI","AAVE","ARB","OP","DOGE",
  "SHIB","PEPE","MKR","CRV","LDO","COMP","GRT","SNX","RUNE","SUSHI",
];

// LINEA (MetaMask L2) pairs
export const LINEA_PAIRS = [
  "ETH","BTC","USDC","DAI","LINK","UNI","AAVE","SNX","CRV","LDO",
  "COMP","GRT","MKR","SUSHI","RUNE","ZEC","INJ","NEAR","DOT","SOL",
];

// ZK (zkSync Era) pairs
export const ZK_PAIRS = [
  "ETH","BTC","USDC","USDT","DAI","ARB","OP","LINK","UNI","AAVE",
  "COMP","CRV","LDO","GRT","SNX","NEAR","INJ","APT","SUI","DOT",
];

// SCR (Scroll L2) pairs
export const SCR_PAIRS = [
  "ETH","BTC","USDC","USDT","DAI","LINK","UNI","AAVE","LDO","CRV",
  "MKR","SNX","COMP","GRT","RUNE","SUSHI","INJ","NEAR","DOT","SOL",
];

// MNT (Mantle L2) pairs
export const MNT_PAIRS = [
  "ETH","BTC","USDC","USDT","DAI","LINK","UNI","AAVE","ARB","OP",
  "CRV","LDO","COMP","GRT","SNX","NEAR","INJ","APT","SUI","DOT",
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
    signal: AbortSignal.timeout(6000),
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

// Default fallback prices (approximate) when CoinGecko is down — updated Mar 2026
const FALLBACK_PRICES: Record<string, number> = {
  // ── Top L1s ─────────────────────────────────────────────────────────────────
  BSV:14.35,BTC:70725,ETH:2152,SOL:91.44,XRP:1.43,BNB:638,ADA:0.75,
  DOGE:0.094,DOT:1.41,AVAX:9.55,MATIC:0.40,LINK:13.0,UNI:6.5,ATOM:4.5,
  LTC:85,BCH:477,TRX:0.23,ETC:20,NEAR:2.5,ICP:8.0,VET:0.025,FIL:4.0,
  SAND:0.30,MANA:0.30,APT:5.5,ARB:0.46,OP:0.75,SUI:2.5,INJ:18,
  PEPE:0.0000090,SHIB:0.0000120,
  // ── DeFi ─────────────────────────────────────────────────────────────────────
  MKR:1800,AAVE:130,CRV:0.27,ENS:17,LDO:0.90,SUSHI:0.60,COMP:43,
  GRT:0.12,SNX:1.5,YFI:5500,RUNE:1.5,BAL:3.2,GMX:25,DYDX:1.24,
  PENDLE:3.5,CVX:2.8,FXS:2.1,SPELL:0.00082,PERP:0.42,
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
  DAI:1.00,WBTC:70215,WSTETH:3981,
  // ── Solana ecosystem ─────────────────────────────────────────────────────────
  BONK:0.0000248,WIF:0.892,JUP:0.842,PYTH:0.382,JTO:2.42,ORCA:2.84,
  BOME:0.00842,RAY:2.12,MSOL:172,W:0.24,TNSR:0.35,
  // ── AI / DePIN ───────────────────────────────────────────────────────────────
  FET:1.82,AGIX:0.892,OCEAN:0.612,RNDR:7.42,TAO:482,ARKM:1.84,NMR:18.2,
  ORAI:4.82,CTXC:0.142,WLD:2.84,ALT:0.18,
  HNT:8.42,IOTX:0.042,GLM:0.28,STORJ:0.45,POWR:0.22,LPT:7.5,
  // ── Gaming / Metaverse ───────────────────────────────────────────────────────
  AXS:6.82,ENJ:0.18,GALA:0.022,ILV:35,ALICE:0.82,TLM:0.012,SLP:0.0028,
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
  ORDI:28,SATS:0.00000035,RATS:0.00000042,
  // ── Polkadot ecosystem ───────────────────────────────────────────────────────
  KSM:22,ACA:0.052,ASTR:0.042,PHA:0.082,
  // ── Meme / culture ───────────────────────────────────────────────────────────
  TRUMP:15,STX:1.52,FLOKI:0.000152,TURBO:0.0082,MOG:0.0000082,
  POPCAT:0.84,MEW:0.0058,NEIRO:0.00048,BABYDOGE:0.0000000018,
  MEME:0.012,NOT:0.0082,HMSTR:0.0014,DOGS:0.00048,EIGEN:2.42,
  // ── Stablecoins / other ──────────────────────────────────────────────────────
  USDT:1,USDC:1,TUSD:1,USDD:1,BUSD:1,
  // ── Base chain assets ────────────────────────────────────────────────────────
  CBBTC:70725,CBETH:3400,BRETT:0.114,TOSHI:0.000185,DEGEN:0.0084,
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
          lastPrice: fp.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (fp*1.02).toFixed(8), low24h: (fp*0.98).toFixed(8),
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
            lastPrice: fp.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: (fp*1.02).toFixed(8), low24h: (fp*0.98).toFixed(8),
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
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
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
        const sym = `${base}/${quote}`;
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
            lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
            volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
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
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
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
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
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
          lastPrice: crossPrice.toFixed(8), priceChange24h: "0", priceChangePercent24h: "0",
          volume24h: "0", high24h: (crossPrice*1.02).toFixed(8), low24h: (crossPrice*0.98).toFixed(8),
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
    let priceSource = "hardcoded-fallback";
    try {
      prices = await fetchLivePrices();
      priceSource = "CoinGecko";
    } catch (cgErr: any) {
      logger.warn({ err: cgErr }, "CoinGecko price fetch failed — trying CoinMarketCap fallback");
      try {
        const cmcPrices = await fetchLivePricesCMC();
        if (cmcPrices) { prices = cmcPrices; priceSource = "CoinMarketCap"; }
        else throw new Error("CMC returned null");
      } catch {
        // Both external APIs failed — build a synthetic prices map from FALLBACK_PRICES
        // so the bot always has current-ish data to seed order books with.
        logger.warn("Both APIs failed — using hardcoded fallback prices for bot continuity");
        const fallback: Record<string, CoinGeckoPrice> = {};
        for (const [sym, cgId] of Object.entries(COINGECKO_IDS)) {
          const usd = FALLBACK_PRICES[sym];
          if (usd) fallback[cgId] = { usd, usd_24h_change: 0, usd_24h_vol: usd * 1_000_000, usd_market_cap: usd * 10_000_000 };
        }
        prices = fallback;
      }
    }
    logger.info({ source: priceSource }, "Market prices updated");
    const markets = await db.select().from(marketsTable);

    for (const market of markets) {
      const cgId = COINGECKO_IDS[market.baseAsset];
      if (!cgId) continue;

      const data = prices[cgId];
      // Use live price if available; fall back to hardcoded price so tokens
      // not returned by CoinGecko (e.g. BSV) still get a consistent update
      // across ALL their quote pairs (USDT, USDC, TUSD, USDD, PERP…).
      const baseUSD = data?.usd ?? FALLBACK_PRICES[market.baseAsset] ?? 0;
      if (!baseUSD || baseUSD <= 0) continue;

      const changePercent = data?.usd_24h_change ?? 0;
      const change = (baseUSD / (1 + changePercent / 100)) * (changePercent / 100);
      const openPrice = baseUSD - change;
      const volatility = Math.abs(change) * 1.5 || baseUSD * 0.01;
      const high24h = openPrice + volatility;
      const low24h = openPrice - volatility;

      let lastPrice = baseUSD;
      let vol = data?.usd_24h_vol ?? baseUSD * 1_000_000;

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

      // Skip markets with invalid prices (Infinity / NaN) to avoid DB overflow
      const safePrice = (n: number) => Number.isFinite(n) && n > 0;
      if (!safePrice(lastPrice)) {
        logger.warn({ symbol: market.symbol, lastPrice }, "Skipping market update — price is Infinity or NaN");
        continue;
      }

      await db.update(marketsTable).set({
        lastPrice: lastPrice.toFixed(8),
        priceChange24h: change.toFixed(8),
        priceChangePercent24h: changePercent.toFixed(4),
        volume24h: (safePrice(vol) ? vol : 0).toFixed(2),
        high24h: (safePrice(high24h) ? high24h : lastPrice * 1.01).toFixed(8),
        low24h: Math.max(safePrice(low24h) ? low24h : lastPrice * 0.99, 0.00000001).toFixed(8),
        marketCap: data?.usd_market_cap ? data.usd_market_cap.toFixed(2) : null,
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
