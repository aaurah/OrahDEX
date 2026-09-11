/**
 * Comprehensive mobile market data — mirrors the web app's mock-data.ts
 * but self-contained for the Expo/React-Native bundle.
 */

export interface MobileMarket {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  change: number;
  volume: string;
  high: number;
  low: number;
  type: "spot" | "futures";
}

// USD prices for 70+ coins (rough market prices)
const USD: Record<string, number> = {
  BTC: 68310, ETH: 3415, BNB: 608, SOL: 185, XRP: 0.582,
  ADA: 0.442, DOGE: 0.165, TRX: 0.121, LINK: 18.4, DOT: 7.8,
  MATIC: 0.88, AVAX: 38.5, UNI: 9.42, ATOM: 9.18, LTC: 82.4,
  BCH: 488, BSV: 55.42, USDT: 1, USDC: 1, TUSD: 1, BUSD: 1,
  ARB: 1.24, OP: 2.65, FTM: 0.88, CRO: 0.092, MNT: 0.862,
  ZK: 0.185, SCR: 0.76, LINEA: 0.0, ZORA: 0.88,
  GMX: 54.35, PENDLE: 7.28, MAGIC: 1.18, RDNT: 0.089,
  QUICK: 0.082, GHST: 0.78, SAND: 0.42, MANA: 0.42,
  WETH: 3415, CBETH: 3596, WBTC: 68310, WSTETH: 3981, RETH: 3782,
  DAI: 1, AERO: 1.21, BRETT: 0.158,
  DEGEN: 0.0182, TOSHI: 0.000948, BALD: 0.00082, RENZO: 0.58,
  JOE: 0.52, PANGOLIN: 0.082, BENQI: 0.012, YAK: 4.2,
  AAVE: 178, MKR: 2840, CRV: 0.548, LDO: 1.84, SNX: 3.12,
  COMP: 58.4, BAL: 3.28, SUSHI: 1.42, CAKE: 2.82, RAY: 2.2,
  FET: 2.18, AGIX: 0.82, OCEAN: 0.98, RNDR: 8.42, TAO: 418,
  WLD: 4.82, NMR: 18.4, AIOZ: 0.48, ALT: 0.28, ARKM: 1.82,
  PEPE: 0.00000962, SHIB: 0.0000248, BONK: 0.0000248,
  WIF: 2.84, POPCAT: 0.82, FLOKI: 0.000182, TURBO: 0.0082,
  TRUMP: 11.5, FARTCOIN: 0.42, DOGE2: 0.00082,
  AXS: 7.42, GALA: 0.038, IMX: 1.82, APE: 1.28, BEAM: 0.022,
  ATLAS: 0.0092, ATLAS2: 0.0092,
  ATOM2: 9.18, OSMO: 0.98, INJ: 24.5, KAVA: 0.78, JUNO: 0.32,
  BTC2: 68310, MINA: 0.72, NEAR: 6.55, APT: 10.5,
  ORDI: 42.5, SATS: 0.000000482, RATS: 0.000000082,
  ONDO: 1.28, TBY: 1.002, TSLA: 0.00282, AAPL: 0.00182,
  OKB: 42.8, KCS: 11.5, BGB: 0.82, GT: 4.82,
  IOTX: 0.042, HNT: 7.5, MOBILE: 0.00048, WIFI: 0.0028,
  PYTH: 0.48, JTO: 2.84, JITO: 2.84, BOME: 0.00982,
  NEW1: 0.42, NEW2: 0.182, NEW3: 0.082,
  JUP: 1.28, ORCA: 3.82, SLERF: 0.48, CORE: 2.82,
};

function priceOf(sym: string): number {
  return USD[sym] ?? 1;
}

function vol(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}

// Deterministic seeded change %, stablecoins = 0
function chg(base: string, quote: string): number {
  if (["USDT", "USDC", "TUSD", "BUSD", "USDD"].includes(base)) return 0;
  const seed = (base + quote).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const bucket = Math.floor(Date.now() / 3_600_000);
  const h = ((bucket * 2654435761) ^ seed) >>> 0;
  return ((h % 1200) - 600) / 100; // -6% to +6%
}

function mkSpot(base: string, quote: string, volUsd: number): MobileMarket {
  const baseUsd = priceOf(base);
  const quoteUsd = priceOf(quote);
  const price = quoteUsd > 0 ? baseUsd / quoteUsd : baseUsd;
  const c = chg(base, quote);
  return {
    symbol: `${base}/${quote}`,
    base, quote,
    price,
    change: c,
    volume: vol(volUsd),
    high: price * (1 + Math.abs(c) / 100 + 0.01),
    low: price * (1 - Math.abs(c) / 100 - 0.01),
    type: "spot",
  };
}

function mkFut(base: string, price: number, c: number, volUsd: number): MobileMarket {
  return {
    symbol: `${base}/USDT-PERP`, base, quote: "USDT",
    price, change: c,
    volume: vol(volUsd),
    high: price * 1.03, low: price * 0.97,
    type: "futures",
  };
}

// ── USDT spot pairs ──────────────────────────────────────────────────────────
const USDT_BASES = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","TRX","LINK","DOT",
  "MATIC","AVAX","UNI","ATOM","LTC","BCH","AAVE","MKR","CRV","LDO","SNX",
  "COMP","BAL","SUSHI","FET","AGIX","OCEAN","RNDR","TAO","WLD","NMR","AIOZ",
  "ALT","ARKM","PEPE","SHIB","BONK","WIF","POPCAT","FLOKI","TURBO","TRUMP",
  "AXS","GALA","IMX","APE","BEAM","ATOM2","OSMO","INJ","KAVA","NEAR","APT",
  "ORDI","SATS","RATS","ONDO","OKB","KCS","BGB","GT","IOTX","HNT","PYTH","JTO",
];

// ── USDC pairs (Base + general) ──────────────────────────────────────────────
const USDC_BASES = [
  "WETH","CBETH","AERO","BRETT","DEGEN","TOSHI","BALD","RENZO",
  "BTC","ETH","SOL","BNB","XRP","ADA","AVAX","LINK","DOT","UNI","AAVE","CRV",
  "MATIC","ARB","OP","FTM","GMX","PENDLE","MAGIC","RDNT","CAKE","RAY","JOE",
];

// ── BTC pairs ────────────────────────────────────────────────────────────────
const BTC_BASES = [
  "BSV","ETH","SOL","XRP","BNB","ADA","DOGE","TRX","LINK","DOT",
  "MATIC","AVAX","UNI","ATOM","LTC","BCH","AAVE","FET","PEPE","SHIB",
];

// ── ETH pairs ────────────────────────────────────────────────────────────────
const ETH_BASES = [
  "BSV","BTC","SOL","XRP","BNB","ADA","DOGE","LINK","DOT","MATIC",
  "AVAX","UNI","ATOM","LTC","BCH","AAVE","ARB","OP","PEPE",
];

// ── BSV pairs ────────────────────────────────────────────────────────────────
const BSV_BASES = [
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","TRX","LINK","DOT",
  "MATIC","AVAX","UNI","ATOM","LTC","BCH","AAVE","FET","PEPE",
];

// ── BCH pairs ────────────────────────────────────────────────────────────────
const BCH_BASES = [
  "BTC","ETH","SOL","XRP","BNB","ADA","DOGE","LTC","BSV","LINK","AAVE",
];

// ── BNB pairs ────────────────────────────────────────────────────────────────
const BNB_BASES = [
  "BTC","ETH","BSV","SOL","XRP","ADA","DOGE","TRX","LINK","DOT",
  "MATIC","AVAX","UNI","ATOM","AAVE","PEPE","CAKE",
];

// ── ARB pairs ────────────────────────────────────────────────────────────────
const ARB_BASES = ["ETH","BTC","GMX","PENDLE","MAGIC","RDNT","AAVE","UNI","LINK"];

// ── OP pairs ─────────────────────────────────────────────────────────────────
const OP_BASES = ["ETH","BTC","AAVE","SNX","UNI","LINK","WETH"];

// ── MATIC pairs ──────────────────────────────────────────────────────────────
const MATIC_BASES = ["ETH","BTC","AAVE","QUICK","GHST","SAND","LINK","UNI"];

// ── AVAX pairs ───────────────────────────────────────────────────────────────
const AVAX_BASES = ["ETH","BTC","JOE","PANGOLIN","BENQI","YAK","LINK","AAVE"];

// ── SOL pairs ────────────────────────────────────────────────────────────────
const SOL_BASES = ["BTC","ETH","RAY","PYTH","JTO","BONK","WIF","BOME","JITO"];

// ── FTM pairs ────────────────────────────────────────────────────────────────
const FTM_BASES = ["ETH","BTC","AAVE","CRV","LINK","SNX","UNI"];

// ── CRO pairs ────────────────────────────────────────────────────────────────
const CRO_BASES = ["ETH","BTC","ADA","XRP","DOGE","LINK","AAVE"];

// ── MNT pairs (Mantle) ───────────────────────────────────────────────────────
const MNT_BASES = [
  "ETH","BTC","USDC","USDT","DAI","WBTC","WSTETH","LINK","UNI",
  "AAVE","WLD","ARB","OP","CRV","LDO","PENDLE","SNX","GRT","ZK","COMP",
];

// ── ZK pairs (zkSync Era) ────────────────────────────────────────────────────
const ZK_BASES = [
  "ETH","BTC","USDC","USDT","DAI","WSTETH","ARB","OP","MNT",
  "LINK","UNI","AAVE","PENDLE","CRV","LDO","GRT","SNX","BAL","COMP",
];

// ── SCR pairs (Scroll) ───────────────────────────────────────────────────────
const SCR_BASES = [
  "ETH","BTC","USDC","USDT","DAI","WSTETH","LINK","UNI","AAVE",
  "LDO","CRV","MKR","ZK","SNX","COMP","GRT","BAL","PENDLE","SUSHI",
];

// ── LINEA pairs (Linea) ──────────────────────────────────────────────────────
const LINEA_BASES = [
  "ETH","BTC","USDC","DAI","WSTETH","LINK","UNI","AAVE","SNX",
  "CRV","BAL","COMP","LDO","RETH","SUSHI","MKR","GRT","ZK","PENDLE",
];

// ── AI / ML tokens (vs USDT) ─────────────────────────────────────────────────
const AI_BASES = [
  "FET","AGIX","RNDR","TAO","WLD","NMR","OCEAN","AIOZ","ALT","ARKM",
  "GRT","PYTH","CORE","INJ","NEAR","APT",
];

// ── Solana ecosystem (vs USDT) ────────────────────────────────────────────────
const SOL_ECO_BASES = [
  "SOL","RAY","JTO","PYTH","BONK","WIF","BOME","POPCAT",
  "FARTCOIN","JUP","ORCA","SLERF","JITO",
];

// ── Meme tokens (vs USDT) ─────────────────────────────────────────────────────
const MEME_BASES = [
  "DOGE","SHIB","PEPE","FLOKI","WIF","BONK","TURBO","TRUMP",
  "POPCAT","FARTCOIN","BRETT","DEGEN","BOME","TOSHI",
];

// ── DeFi protocols (vs USDT) ──────────────────────────────────────────────────
const DEFI_BASES = [
  "UNI","AAVE","CRV","COMP","MKR","SNX","BAL","SUSHI","CAKE","RAY",
  "LDO","PENDLE","GMX","RDNT","MAGIC","JOE","OSMO","INJ",
];

// ── NEW / Trending pairs ───────────────────────────────────────────────────────
const NEW_MARKETS: MobileMarket[] = [
  mkSpot("PEPE",     "USDT", 120_000_000),
  mkSpot("TRUMP",    "USDT",  80_000_000),
  mkSpot("BONK",     "USDT",  60_000_000),
  mkSpot("WIF",      "USDT",  50_000_000),
  mkSpot("POPCAT",   "USDT",  45_000_000),
  mkSpot("BRETT",    "USDT",  38_000_000),
  mkSpot("RNDR",     "USDT",  40_000_000),
  mkSpot("TAO",      "USDT",  25_000_000),
  mkSpot("JTO",      "USDT",  35_000_000),
  mkSpot("PYTH",     "USDT",  30_000_000),
  mkSpot("FARTCOIN", "USDT",  32_000_000),
  mkSpot("BOME",     "USDT",  22_000_000),
  mkSpot("SLERF",    "USDT",  18_000_000),
  mkSpot("WLD",      "USDT",  28_000_000),
  mkSpot("ARKM",     "USDT",  22_000_000),
];

// ── Futures ──────────────────────────────────────────────────────────────────
const FUTURES_RAW = [
  ["BSV", 55.85, 4.12, 8_200_000],
  ["BTC", 65180, -1.9, 980_000_000],
  ["ETH", 3195, 1.48, 340_000_000],
  ["SOL", 185.4, 2.84, 58_000_000],
  ["XRP", 0.584, -0.64, 28_000_000],
  ["BNB", 608, 0.88, 95_000_000],
  ["DOGE", 0.166, -1.2, 18_000_000],
  ["MATIC", 0.882, 3.21, 12_000_000],
  ["AVAX", 38.6, 4.82, 18_000_000],
  ["LINK", 18.5, 2.15, 14_000_000],
  ["ARB", 1.25, 5.42, 28_000_000],
  ["OP", 2.66, 3.84, 22_000_000],
] as [string, number, number, number][];

export const USDT_MARKETS  = USDT_BASES.map(b => mkSpot(b, "USDT", priceOf(b) * 1_000_000));
export const USDC_MARKETS  = USDC_BASES.map(b => mkSpot(b, "USDC", priceOf(b) * 500_000));
export const BTC_MARKETS   = BTC_BASES.map(b  => mkSpot(b, "BTC",  priceOf(b) * 200_000));
export const ETH_MARKETS   = ETH_BASES.map(b  => mkSpot(b, "ETH",  priceOf(b) * 400_000));
export const BSV_MARKETS   = BSV_BASES.map(b  => mkSpot(b, "BSV",  priceOf(b) * 150_000));
export const BCH_MARKETS   = BCH_BASES.map(b  => mkSpot(b, "BCH",  priceOf(b) * 80_000));
export const BNB_MARKETS   = BNB_BASES.map(b  => mkSpot(b, "BNB",  priceOf(b) * 200_000));
export const ARB_MARKETS   = ARB_BASES.map(b  => mkSpot(b, "ARB",  priceOf(b) * 120_000));
export const OP_MARKETS    = OP_BASES.map(b   => mkSpot(b, "OP",   priceOf(b) * 100_000));
export const MATIC_MARKETS = MATIC_BASES.map(b=> mkSpot(b, "MATIC",priceOf(b) * 90_000));
export const AVAX_MARKETS  = AVAX_BASES.map(b => mkSpot(b, "AVAX", priceOf(b) * 80_000));
export const SOL_MARKETS   = SOL_BASES.map(b  => mkSpot(b, "SOL",  priceOf(b) * 100_000));
export const FTM_MARKETS   = FTM_BASES.map(b  => mkSpot(b, "FTM",  priceOf(b) * 50_000));
export const CRO_MARKETS   = CRO_BASES.map(b  => mkSpot(b, "CRO",  priceOf(b) * 40_000));
export const MNT_MARKETS     = MNT_BASES.map(b     => mkSpot(b, "MNT",   priceOf(b) * 40_000));
export const ZK_MARKETS      = ZK_BASES.map(b      => mkSpot(b, "ZK",    priceOf(b) * 35_000));
export const SCR_MARKETS     = SCR_BASES.map(b     => mkSpot(b, "SCR",   priceOf(b) * 30_000));
export const LINEA_MARKETS   = LINEA_BASES.map(b   => mkSpot(b, "LINEA", priceOf(b) * 28_000));
export const AI_MARKETS      = AI_BASES.map(b      => mkSpot(b, "USDT",  priceOf(b) * 2_000_000));
export const SOL_ECO_MARKETS = SOL_ECO_BASES.map(b => mkSpot(b, "USDT",  priceOf(b) * 5_000_000));
export const MEME_MARKETS    = MEME_BASES.map(b    => mkSpot(b, "USDT",  priceOf(b) * 3_000_000));
export const DEFI_MARKETS    = DEFI_BASES.map(b    => mkSpot(b, "USDT",  priceOf(b) * 2_500_000));
export { NEW_MARKETS };
export const FUTURES_MARKETS = FUTURES_RAW.map(([b, p, c, v]) => mkFut(b, p, c, v));

// ── Category tab type (matches web Markets page) ──────────────────────────────
export type CategoryTab =
  "usd"|"new"|"btc"|"eth"|"bnb"|"matic"|"avax"|"arb"|"op"|
  "ftm"|"cro"|"bch"|"bsv"|"ai"|"sol"|"meme"|"defi"|
  "mnt"|"zk"|"scr"|"linea"|"futures";

export const CATEGORY_TABS: { id: CategoryTab; label: string }[] = [
  { id: "usd",     label: "USD"     },
  { id: "new",     label: "NEW"     },
  { id: "btc",     label: "BTC"     },
  { id: "eth",     label: "ETH"     },
  { id: "bnb",     label: "BNB"     },
  { id: "matic",   label: "MATIC"   },
  { id: "avax",    label: "AVAX"    },
  { id: "arb",     label: "ARB"     },
  { id: "op",      label: "OP"      },
  { id: "ftm",     label: "FTM"     },
  { id: "cro",     label: "CRO"     },
  { id: "bch",     label: "BCH"     },
  { id: "bsv",     label: "⚡BSV"   },
  { id: "ai",      label: "AI"      },
  { id: "sol",     label: "SOL"     },
  { id: "meme",    label: "MEME"    },
  { id: "defi",    label: "DEFI"    },
  { id: "mnt",     label: "MNT"     },
  { id: "zk",      label: "ZK"      },
  { id: "scr",     label: "SCR"     },
  { id: "linea",   label: "LINEA"   },
  { id: "futures", label: "Futures" },
];

export const MARKETS_BY_CATEGORY: Record<CategoryTab, MobileMarket[]> = {
  usd:     [...USDT_MARKETS, ...USDC_MARKETS],
  new:     NEW_MARKETS,
  btc:     BTC_MARKETS,
  eth:     ETH_MARKETS,
  bnb:     BNB_MARKETS,
  matic:   MATIC_MARKETS,
  avax:    AVAX_MARKETS,
  arb:     ARB_MARKETS,
  op:      OP_MARKETS,
  ftm:     FTM_MARKETS,
  cro:     CRO_MARKETS,
  bch:     BCH_MARKETS,
  bsv:     BSV_MARKETS,
  ai:      AI_MARKETS,
  sol:     SOL_ECO_MARKETS,
  meme:    MEME_MARKETS,
  defi:    DEFI_MARKETS,
  mnt:     MNT_MARKETS,
  zk:      ZK_MARKETS,
  scr:     SCR_MARKETS,
  linea:   LINEA_MARKETS,
  futures: FUTURES_MARKETS,
};

// ── Legacy quote-tab exports (used by trade/[symbol].tsx getMockMarket) ────────
export type QuoteId =
  "USDT"|"USDC"|"BTC"|"ETH"|"BSV"|"BCH"|"BNB"|"ARB"|"OP"|
  "MATIC"|"AVAX"|"SOL"|"FTM"|"CRO"|"MNT"|"ZK"|"SCR"|"LINEA";

export const QUOTE_TABS: { id: QuoteId; label: string }[] = [
  { id: "USDT",  label: "USDT"  }, { id: "USDC",  label: "USDC"  },
  { id: "BTC",   label: "BTC"   }, { id: "ETH",   label: "ETH"   },
  { id: "BSV",   label: "⚡BSV" }, { id: "BCH",   label: "BCH"   },
  { id: "BNB",   label: "BNB"   }, { id: "ARB",   label: "ARB"   },
  { id: "OP",    label: "OP"    }, { id: "MATIC", label: "MATIC" },
  { id: "AVAX",  label: "AVAX"  }, { id: "SOL",   label: "SOL"   },
  { id: "FTM",   label: "FTM"   }, { id: "CRO",   label: "CRO"   },
  { id: "MNT",   label: "MNT"   }, { id: "ZK",    label: "ZK"    },
  { id: "SCR",   label: "SCR"   }, { id: "LINEA", label: "LINEA" },
];

export const ALL_SPOT_MARKETS: MobileMarket[] = [
  ...USDT_MARKETS, ...USDC_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS,
  ...BSV_MARKETS,  ...BCH_MARKETS,  ...BNB_MARKETS, ...ARB_MARKETS,
  ...OP_MARKETS,   ...MATIC_MARKETS,...AVAX_MARKETS, ...SOL_MARKETS,
  ...FTM_MARKETS,  ...CRO_MARKETS,  ...MNT_MARKETS,
  ...ZK_MARKETS,   ...SCR_MARKETS,  ...LINEA_MARKETS,
  ...AI_MARKETS,   ...MEME_MARKETS, ...DEFI_MARKETS,
];

/** Lookup or generate a market for any symbol like "AERO/USDC" or "GMX-ARB" */
export function getMockMarket(symbolRaw: string): MobileMarket {
  const sym = symbolRaw.replace(/-/g, "/");
  const found = ALL_SPOT_MARKETS.find(m => m.symbol === sym)
    ?? FUTURES_MARKETS.find(m => m.symbol === sym);
  if (found) return found;
  // Generate on-the-fly
  const [base = "BSV", quote = "USDT"] = sym.split("/");
  return mkSpot(base, quote, priceOf(base) * 200_000);
}

/** Generate a realistic order book around a given price */
export function genOrderBook(price: number, quote: string) {
  const tick = price < 0.001 ? price * 0.001
    : price < 1 ? 0.0001
    : price < 10 ? 0.001
    : price < 1000 ? 0.01
    : 0.1;
  const asks = Array.from({ length: 8 }, (_, i) => {
    const p = price + tick * (i + 1);
    const q = parseFloat((Math.random() * 300 + 20).toFixed(2));
    return [parseFloat(p.toFixed(8)), q] as [number, number];
  });
  const bids = Array.from({ length: 8 }, (_, i) => {
    const p = price - tick * (i + 1);
    const q = parseFloat((Math.random() * 300 + 20).toFixed(2));
    return [parseFloat(p.toFixed(8)), q] as [number, number];
  });
  return { asks, bids };
}

/** Format a price nicely (handle tiny meme-coin prices) */
export function fmtPrice(price: number): string {
  if (price === 0) return "0.00";
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.001) return price.toFixed(6);
  return price.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}
