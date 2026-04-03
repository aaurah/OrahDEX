import type { Market, Ticker, OrderBook, Trade, Order, Portfolio, AssetBalance, Candle } from "@workspace/api-client-react";

function spot(base: string, quote: string, price: number, chg: number, vol: number, cap?: number): any {
  return {
    symbol: `${base}/${quote}`, baseAsset: base, quoteAsset: quote,
    lastPrice: price, priceChange24h: price * chg / 100, priceChangePercent24h: chg,
    volume24h: vol, high24h: price * 1.02, low24h: price * 0.98,
    marketCap: cap, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001,
    minOrderSize: 0.00000001, maxOrderSize: 1000000, tickSize: 0.01,
  };
}

function fut(base: string, price: number, chg: number, vol: number): any {
  return {
    symbol: `${base}/USDT-PERP`, baseAsset: base, quoteAsset: "USDT",
    lastPrice: price * 0.9999, priceChange24h: price * chg / 100, priceChangePercent24h: chg,
    volume24h: vol / 10, high24h: price * 1.02, low24h: price * 0.98,
    status: "active", type: "futures", makerFee: 0.0002, takerFee: 0.0005,
    minOrderSize: 0.00000001, maxOrderSize: 1000000, tickSize: 0.01,
  };
}

// ─── USDT PAIRS ───────────────────────────────────────────────────────────────
export const USDT_MARKETS: any[] = [
  spot("BSV",  "USDT",  55.42,  4.41,  18_500_000,  1_050_000_000),
  spot("BTC",  "USDT",  68310,  -1.85, 2_450_000_000, 1_340_000_000_000),
  spot("ETH",  "USDT",  3415,   1.32,  950_000_000, 410_000_000_000),
  spot("SOL",  "USDT",  148.5,  3.21,  420_000_000,  64_000_000_000),
  spot("XRP",  "USDT",  0.5242, -0.64, 110_000_000,  28_000_000_000),
  spot("BNB",  "USDT",  392,    0.88,  320_000_000, 590_000_000_000),
  spot("ADA",  "USDT",  0.4421, -2.10,  45_000_000,  15_000_000_000),
  spot("DOGE", "USDT",  0.1185,  5.42,  78_000_000,  17_000_000_000),
  spot("DOT",  "USDT",  6.82,   -1.20,  38_000_000,   9_500_000_000),
  spot("AVAX", "USDT",  36.4,    2.15,  62_000_000,  15_000_000_000),
  spot("MATIC","USDT",  0.718,  -0.92,  54_000_000,   7_000_000_000),
  spot("LINK", "USDT",  14.52,   3.64,  48_000_000,   8_400_000_000),
  spot("UNI",  "USDT",  9.84,    1.55,  22_000_000,   5_900_000_000),
  spot("ATOM", "USDT",  8.42,   -0.78,  18_000_000,   3_300_000_000),
  spot("LTC",  "USDT",  78.2,    0.45,  32_000_000,   5_700_000_000),
  spot("BCH",  "USDT",  384,     1.10,  28_000_000,   7_500_000_000),
  spot("TRX",  "USDT",  0.1205,  2.31,  35_000_000,  10_500_000_000),
  spot("ETC",  "USDT",  26.8,   -1.45,  14_000_000,   3_600_000_000),
  spot("NEAR", "USDT",  6.55,    4.82,  24_000_000,   7_200_000_000),
  spot("ICP",  "USDT",  11.2,    0.95,  12_000_000,   5_200_000_000),
  spot("VET",  "USDT",  0.0398,  1.25,   8_000_000,   2_900_000_000),
  spot("FIL",  "USDT",  5.82,   -2.18,  10_000_000,   2_700_000_000),
  spot("SAND", "USDT",  0.432,   3.42,   9_500_000,   900_000_000),
  spot("MANA", "USDT",  0.421,   2.15,   7_800_000,   780_000_000),
  spot("APT",  "USDT",  10.5,    5.21,  18_000_000,   4_100_000_000),
  spot("ARB",  "USDT",  1.12,    2.85,  28_000_000,   2_900_000_000),
  spot("OP",   "USDT",  2.41,    3.10,  22_000_000,   3_200_000_000),
  spot("SUI",  "USDT",  1.22,    6.45,  35_000_000,   3_400_000_000),
  spot("INJ",  "USDT",  28.4,    4.21,  15_000_000,   2_400_000_000),
  spot("PEPE", "USDT",  0.0000082, 8.5, 185_000_000,  3_500_000_000),
  spot("SHIB", "USDT",  0.0000235, 6.1,  92_000_000,  13_800_000_000),
  spot("MKR",  "USDT",  2920,   -0.45,   8_000_000,   2_600_000_000),
  spot("AAVE", "USDT",  96.5,    1.82,  12_000_000,   1_400_000_000),
  spot("CRV",  "USDT",  0.382,  -1.15,  18_000_000,   530_000_000),
  spot("ENS",  "USDT",  16.2,    2.48,   6_000_000,   490_000_000),
  spot("LDO",  "USDT",  2.15,    1.95,  14_000_000,   1_960_000_000),
  spot("SUSHI","USDT",  1.22,   -0.85,   8_000_000,   300_000_000),
  spot("COMP", "USDT",  52.5,    0.62,   5_000_000,   430_000_000),
  spot("GRT",  "USDT",  0.192,   3.15,  12_000_000,   1_800_000_000),
  spot("SNX",  "USDT",  2.82,   -1.32,   6_000_000,   930_000_000),
  spot("YFI",  "USDT",  6820,    1.05,   4_000_000,   248_000_000),
  spot("RUNE", "USDT",  5.52,    4.85,  12_000_000,   1_860_000_000),
  spot("FTM",  "USDT",  0.652,   3.28,  18_000_000,   1_820_000_000),
  spot("ALGO", "USDT",  0.182,  -0.95,   8_000_000,   1_500_000_000),
  spot("XLM",  "USDT",  0.112,   1.42,  12_000_000,   3_200_000_000),
  spot("HBAR", "USDT",  0.0952,  2.18,   9_000_000,   3_700_000_000),
  spot("EGLD", "USDT",  42.5,    1.62,   5_000_000,   1_140_000_000),
  spot("THETA","USDT",  1.42,   -0.75,   4_000_000,   1_420_000_000),
  spot("EOS",  "USDT",  0.722,  -1.25,   6_000_000,   1_030_000_000),
  spot("ZEC",  "USDT",  28.2,    0.85,   3_000_000,   445_000_000),
  spot("DASH", "USDT",  28.5,    1.15,   3_500_000,   338_000_000),
  spot("XMR",  "USDT",  125.5,   0.42,   5_000_000,   2_300_000_000),
];

// ─── BSV PAIRS ────────────────────────────────────────────────────────────────
const BSV_PRICE = 55.42;
function bsvPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / BSV_PRICE;
  return spot(base, "BSV", p, chg, vol / BSV_PRICE);
}

export const BSV_MARKETS: any[] = [
  bsvPair("BTC",   68310,     -1.85, 2_450_000_000),
  bsvPair("ETH",   3415,       1.32,   950_000_000),
  bsvPair("SOL",   148.5,      3.21,   420_000_000),
  bsvPair("XRP",   0.5242,    -0.64,   110_000_000),
  bsvPair("BNB",   392,        0.88,   320_000_000),
  bsvPair("ADA",   0.4421,    -2.10,    45_000_000),
  bsvPair("DOGE",  0.1185,     5.42,    78_000_000),
  bsvPair("DOT",   6.82,      -1.20,    38_000_000),
  bsvPair("AVAX",  36.4,       2.15,    62_000_000),
  bsvPair("MATIC", 0.718,     -0.92,    54_000_000),
  bsvPair("LINK",  14.52,      3.64,    48_000_000),
  bsvPair("UNI",   9.84,       1.55,    22_000_000),
  bsvPair("ATOM",  8.42,      -0.78,    18_000_000),
  bsvPair("LTC",   78.2,       0.45,    32_000_000),
  bsvPair("BCH",   384,        1.10,    28_000_000),
  bsvPair("TRX",   0.1205,     2.31,    35_000_000),
  bsvPair("ETC",   26.8,      -1.45,    14_000_000),
  bsvPair("NEAR",  6.55,       4.82,    24_000_000),
  bsvPair("ICP",   11.2,       0.95,    12_000_000),
  bsvPair("VET",   0.0398,     1.25,     8_000_000),
  bsvPair("FIL",   5.82,      -2.18,    10_000_000),
  bsvPair("SAND",  0.432,      3.42,     9_500_000),
  bsvPair("MANA",  0.421,      2.15,     7_800_000),
  bsvPair("APT",   10.5,       5.21,    18_000_000),
  bsvPair("ARB",   1.12,       2.85,    28_000_000),
  bsvPair("OP",    2.41,       3.10,    22_000_000),
  bsvPair("SUI",   1.22,       6.45,    35_000_000),
  bsvPair("INJ",   28.4,       4.21,    15_000_000),
  bsvPair("PEPE",  0.0000082,  8.50,   185_000_000),
  bsvPair("SHIB",  0.0000235,  6.10,    92_000_000),
  bsvPair("MKR",   2920,      -0.45,     8_000_000),
  bsvPair("AAVE",  96.5,       1.82,    12_000_000),
  bsvPair("CRV",   0.382,     -1.15,    18_000_000),
  bsvPair("ENS",   16.2,       2.48,     6_000_000),
  bsvPair("LDO",   2.15,       1.95,    14_000_000),
  bsvPair("SUSHI", 1.22,      -0.85,     8_000_000),
  bsvPair("COMP",  52.5,       0.62,     5_000_000),
  bsvPair("GRT",   0.192,      3.15,    12_000_000),
  bsvPair("SNX",   2.82,      -1.32,     6_000_000),
  bsvPair("YFI",   6820,       1.05,     4_000_000),
  bsvPair("RUNE",  5.52,       4.85,    12_000_000),
  bsvPair("FTM",   0.652,      3.28,    18_000_000),
  bsvPair("ALGO",  0.182,     -0.95,     8_000_000),
  bsvPair("XLM",   0.112,      1.42,    12_000_000),
  bsvPair("HBAR",  0.0952,     2.18,     9_000_000),
  bsvPair("EGLD",  42.5,       1.62,     5_000_000),
  bsvPair("THETA", 1.42,      -0.75,     4_000_000),
  bsvPair("EOS",   0.722,     -1.25,     6_000_000),
  bsvPair("ZEC",   28.2,       0.85,     3_000_000),
  bsvPair("DASH",  28.5,       1.15,     3_500_000),
  bsvPair("XMR",   125.5,      0.42,     5_000_000),
];

// ─── BTC PAIRS ────────────────────────────────────────────────────────────────
const BTC_PRICE = 68310;
function btcPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / BTC_PRICE;
  return spot(base, "BTC", p, chg, vol / BTC_PRICE);
}
export const BTC_MARKETS: any[] = [
  btcPair("ETH",   3415,    1.32,  950_000_000),
  btcPair("XRP",   0.5242, -0.64,  110_000_000),
  btcPair("XMR",   125.5,   0.42,   5_000_000),
  btcPair("TRX",   0.1205,  2.31,  35_000_000),
  btcPair("DOGE",  0.1185,  5.42,  78_000_000),
  btcPair("LTC",   78.2,    0.45,  32_000_000),
  btcPair("ADA",   0.4421, -2.10,  45_000_000),
  btcPair("DOT",   6.82,   -1.20,  38_000_000),
  btcPair("DASH",  28.5,    1.15,   3_500_000),
  btcPair("BCH",   384,     1.10,  28_000_000),
  btcPair("ATOM",  8.42,   -0.78,  18_000_000),
  btcPair("ETC",   26.8,   -1.45,  14_000_000),
  btcPair("SOL",   148.5,   3.21,  420_000_000),
  btcPair("XLM",   0.112,   1.42,  12_000_000),
  btcPair("ZEC",   28.2,    0.85,   3_000_000),
  btcPair("LINK",  14.52,   3.64,  48_000_000),
  btcPair("UNI",   9.84,    1.55,  22_000_000),
  btcPair("AAVE",  96.5,    1.82,  12_000_000),
  btcPair("AVAX",  36.4,    2.15,  62_000_000),
  btcPair("NEAR",  6.55,    4.82,  24_000_000),
];

// ─── STABLECOIN PAIRS (USDC / TUSD / USDD) ───────────────────────────────────
const STABLE_BASES: [string,number,number,number][] = [
  ["BSV",  0.055, 4.41,  18_500_000],
  ["BTC",  68310, -1.85, 2_450_000_000],
  ["ETH",  3415,  1.32,  950_000_000],
  ["SOL",  148.5, 3.21,  420_000_000],
  ["XRP",  0.5242,-0.64, 110_000_000],
  ["BNB",  392,   0.88,  320_000_000],
  ["ADA",  0.4421,-2.10,  45_000_000],
  ["DOGE", 0.1185, 5.42,  78_000_000],
  ["DOT",  6.82,  -1.20,  38_000_000],
  ["AVAX", 36.4,   2.15,  62_000_000],
  ["MATIC",0.718, -0.92,  54_000_000],
  ["LINK", 14.52,  3.64,  48_000_000],
  ["UNI",  9.84,   1.55,  22_000_000],
  ["ATOM", 8.42,  -0.78,  18_000_000],
  ["LTC",  78.2,   0.45,  32_000_000],
  ["BCH",  384,    1.10,  28_000_000],
  ["NEAR", 6.55,   4.82,  24_000_000],
  ["APT",  10.5,   5.21,  18_000_000],
  ["ARB",  1.12,   2.85,  28_000_000],
  ["OP",   2.41,   3.10,  22_000_000],
  ["SUI",  1.22,   6.45,  35_000_000],
  ["INJ",  28.4,   4.21,  15_000_000],
];
export const USDC_MARKETS: any[] = STABLE_BASES.map(([b,p,c,v]) => spot(b,"USDC",p,c,v));
export const TUSD_MARKETS: any[] = STABLE_BASES.map(([b,p,c,v]) => spot(b,"TUSD",p,c,v));
export const USDD_MARKETS: any[] = STABLE_BASES.map(([b,p,c,v]) => spot(b,"USDD",p,c,v));

// ─── BCH PAIRS ────────────────────────────────────────────────────────────────
const BCH_PRICE = 450;
function bchPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / BCH_PRICE;
  return spot(base, "BCH", p, chg, vol / BCH_PRICE);
}
export const BCH_MARKETS: any[] = [
  bchPair("BTC",   68310,  -1.85, 2_450_000_000),
  bchPair("ETH",   3415,    1.32,  950_000_000),
  bchPair("SOL",   148.5,   3.21,  420_000_000),
  bchPair("XRP",   0.5242, -0.64,  110_000_000),
  bchPair("BNB",   392,     0.88,  320_000_000),
  bchPair("ADA",   0.4421, -2.10,   45_000_000),
  bchPair("DOGE",  0.1185,  5.42,   78_000_000),
  bchPair("DOT",   6.82,   -1.20,   38_000_000),
  bchPair("AVAX",  36.4,    2.15,   62_000_000),
  bchPair("MATIC", 0.718,  -0.92,   54_000_000),
  bchPair("LINK",  14.52,   3.64,   48_000_000),
  bchPair("UNI",   9.84,    1.55,   22_000_000),
  bchPair("ATOM",  8.42,   -0.78,   18_000_000),
  bchPair("LTC",   78.2,    0.45,   32_000_000),
  bchPair("NEAR",  6.55,    4.82,   24_000_000),
  bchPair("APT",   10.5,    5.21,   18_000_000),
  bchPair("ARB",   1.12,    2.85,   28_000_000),
  bchPair("OP",    2.41,    3.10,   22_000_000),
  bchPair("SUI",   1.22,    6.45,   35_000_000),
  bchPair("INJ",   28.4,    4.21,   15_000_000),
];

// ─── BNB PAIRS ────────────────────────────────────────────────────────────────
const BNB_PRICE = 392;
function bnbPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / BNB_PRICE;
  return spot(base, "BNB", p, chg, vol / BNB_PRICE);
}
export const BNB_MARKETS: any[] = [
  bnbPair("BTC",   68310,  -1.85, 2_450_000_000),
  bnbPair("ETH",   3415,    1.32,  950_000_000),
  bnbPair("SOL",   148.5,   3.21,  420_000_000),
  bnbPair("XRP",   0.5242, -0.64,  110_000_000),
  bnbPair("ADA",   0.4421, -2.10,   45_000_000),
  bnbPair("DOGE",  0.1185,  5.42,   78_000_000),
  bnbPair("DOT",   6.82,   -1.20,   38_000_000),
  bnbPair("AVAX",  36.4,    2.15,   62_000_000),
  bnbPair("MATIC", 0.718,  -0.92,   54_000_000),
  bnbPair("LINK",  14.52,   3.64,   48_000_000),
  bnbPair("UNI",   9.84,    1.55,   22_000_000),
  bnbPair("ATOM",  8.42,   -0.78,   18_000_000),
  bnbPair("LTC",   78.2,    0.45,   32_000_000),
  bnbPair("BCH",   384,     1.10,   28_000_000),
  bnbPair("BSV",   55.42,   4.41,   18_500_000),
  bnbPair("TRX",   0.1205,  2.31,   35_000_000),
  bnbPair("NEAR",  6.55,    4.82,   24_000_000),
  bnbPair("APT",   10.5,    5.21,   18_000_000),
  bnbPair("ARB",   1.12,    2.85,   28_000_000),
  bnbPair("OP",    2.41,    3.10,   22_000_000),
  bnbPair("SUI",   1.22,    6.45,   35_000_000),
  bnbPair("INJ",   28.4,    4.21,   15_000_000),
  bnbPair("PEPE",  0.0000082, 8.5, 185_000_000),
  bnbPair("SHIB",  0.0000235, 6.1,  92_000_000),
  bnbPair("AAVE",  96.5,    1.82,   12_000_000),
  bnbPair("CRV",   0.382,  -1.15,   18_000_000),
  bnbPair("MKR",   2920,   -0.45,    8_000_000),
  bnbPair("FIL",   5.82,   -2.18,   10_000_000),
  bnbPair("ALGO",  0.18,    1.85,    6_000_000),
  bnbPair("XLM",   0.11,    0.92,    8_000_000),
];

// ─── MATIC PAIRS (Polygon) ────────────────────────────────────────────────────
const MATIC_PRICE = 0.72;
function maticPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / MATIC_PRICE;
  return spot(base, "MATIC", p, chg, vol / MATIC_PRICE);
}
export const MATIC_MARKETS: any[] = [
  // Bridged blue-chips
  maticPair("ETH",   3415,    1.32,  950_000_000),
  maticPair("BTC",   68310,  -1.85, 2_450_000_000),
  maticPair("USDC",  1.00,    0.01,  840_000_000),
  maticPair("USDT",  1.00,    0.00,  620_000_000),
  maticPair("DAI",   0.9998,  0.02,  280_000_000),
  // Polygon-native ecosystem
  maticPair("QUICK", 0.042,   8.42,   22_000_000),  // QuickSwap DEX token
  maticPair("GHST",  1.42,    5.15,   18_000_000),  // Aavegotchi
  maticPair("SAND",  0.382,   3.84,   48_000_000),  // The Sandbox (Polygon)
  maticPair("MANA",  0.282,   2.15,   35_000_000),  // Decentraland
  maticPair("AXS",   6.82,    4.21,   28_000_000),  // Axie Infinity
  maticPair("IMX",   1.82,    6.45,   42_000_000),  // Immutable X
  maticPair("AAVE",  96.5,    1.82,   32_000_000),  // Aave (Polygon)
  maticPair("CRV",   0.382,  -1.15,   24_000_000),  // Curve (Polygon)
  maticPair("SUSHI", 1.22,   -0.85,   16_000_000),  // SushiSwap
  maticPair("LINK",  14.52,   3.64,   28_000_000),  // Chainlink (Polygon)
  maticPair("UNI",   9.84,    1.55,   18_000_000),  // Uniswap v3 (Polygon)
  maticPair("WBTC",  68215,  -1.92,   82_000_000),  // Wrapped BTC
  maticPair("stMATIC", 0.702, 0.85,   45_000_000),  // Lido staked MATIC
  maticPair("BAL",   4.82,    3.15,   12_000_000),  // Balancer (Polygon)
  maticPair("1INCH", 0.542,   5.21,   10_000_000),  // 1inch (Polygon)
  maticPair("DFYN",  0.0482,  7.84,    5_000_000),  // DFYN Exchange (Polygon-native)
  maticPair("DQUICK",82.4,    9.12,    8_000_000),  // Dragon's QUICK
];

// ─── AVAX PAIRS (Avalanche) ───────────────────────────────────────────────────
const AVAX_PRICE = 36;
function avaxPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / AVAX_PRICE;
  return spot(base, "AVAX", p, chg, vol / AVAX_PRICE);
}
export const AVAX_MARKETS: any[] = [
  avaxPair("BTC",   68310,  -1.85, 2_450_000_000),
  avaxPair("ETH",   3415,    1.32,  950_000_000),
  avaxPair("BNB",   392,     0.88,  320_000_000),
  avaxPair("SOL",   148.5,   3.21,  420_000_000),
  avaxPair("XRP",   0.5242, -0.64,  110_000_000),
  avaxPair("ADA",   0.4421, -2.10,   45_000_000),
  avaxPair("DOGE",  0.1185,  5.42,   78_000_000),
  avaxPair("DOT",   6.82,   -1.20,   38_000_000),
  avaxPair("MATIC", 0.718,  -0.92,   54_000_000),
  avaxPair("LINK",  14.52,   3.64,   48_000_000),
  avaxPair("UNI",   9.84,    1.55,   22_000_000),
  avaxPair("ATOM",  8.42,   -0.78,   18_000_000),
  avaxPair("LTC",   78.2,    0.45,   32_000_000),
  avaxPair("BCH",   384,     1.10,   28_000_000),
  avaxPair("BSV",   55.42,   4.41,   18_500_000),
  avaxPair("NEAR",  6.55,    4.82,   24_000_000),
  avaxPair("APT",   10.5,    5.21,   18_000_000),
  avaxPair("ARB",   1.12,    2.85,   28_000_000),
  avaxPair("OP",    2.41,    3.10,   22_000_000),
  avaxPair("SUI",   1.22,    6.45,   35_000_000),
  avaxPair("INJ",   28.4,    4.21,   15_000_000),
];

// ─── ARB PAIRS (Arbitrum) ─────────────────────────────────────────────────────
const ARB_PRICE = 1.1;
function arbPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / ARB_PRICE;
  return spot(base, "ARB", p, chg, vol / ARB_PRICE);
}
export const ARB_MARKETS: any[] = [
  // Bridged blue-chips
  arbPair("ETH",   3415,    1.32,  950_000_000),
  arbPair("BTC",   68310,  -1.85, 2_450_000_000),
  arbPair("USDC",  1.00,    0.01,  780_000_000),
  arbPair("USDT",  1.00,    0.00,  520_000_000),
  arbPair("DAI",   0.9998,  0.02,  220_000_000),
  arbPair("WBTC",  68215,  -1.92,  180_000_000),
  // Arbitrum-native ecosystem
  arbPair("GMX",   28.4,    4.21,  182_000_000),  // GMX perps — #1 Arb protocol
  arbPair("PENDLE",5.42,    9.12,  142_000_000),  // Pendle yield trading
  arbPair("MAGIC", 0.482,   6.84,   82_000_000),  // Treasure ecosystem
  arbPair("RDNT",  0.082,   8.42,   62_000_000),  // Radiant Capital
  arbPair("GNS",   1.82,    5.15,   48_000_000),  // Gains Network
  arbPair("GRAIL", 2124,    3.42,   38_000_000),  // Camelot DEX
  arbPair("JONES", 5.84,    7.21,   28_000_000),  // Jones DAO
  arbPair("UMAMI", 28.4,    4.85,   22_000_000),  // Umami Finance
  arbPair("VELA",  0.842,   6.42,   18_000_000),  // Vela Exchange
  arbPair("AEVO",  1.42,   11.84,   32_000_000),  // Aevo options
  arbPair("LYRA",  0.082,   4.21,   14_000_000),  // Lyra options
  arbPair("AAVE",  96.5,    1.82,   28_000_000),  // Aave (Arbitrum)
  arbPair("CRV",   0.382,  -1.15,   22_000_000),  // Curve (Arbitrum)
  arbPair("SUSHI", 1.22,   -0.85,   15_000_000),  // SushiSwap (Arbitrum)
  arbPair("LINK",  14.52,   3.64,   24_000_000),  // Chainlink
  arbPair("UNI",   9.84,    1.55,   18_000_000),  // Uniswap v3 (Arbitrum)
];

// ─── OP PAIRS (Optimism) ─────────────────────────────────────────────────────
const OP_PRICE = 2.4;
function opPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / OP_PRICE;
  return spot(base, "OP", p, chg, vol / OP_PRICE);
}
export const OP_MARKETS: any[] = [
  opPair("BTC",   68310,  -1.85, 2_450_000_000),
  opPair("ETH",   3415,    1.32,  950_000_000),
  opPair("BNB",   392,     0.88,  320_000_000),
  opPair("SOL",   148.5,   3.21,  420_000_000),
  opPair("XRP",   0.5242, -0.64,  110_000_000),
  opPair("ADA",   0.4421, -2.10,   45_000_000),
  opPair("DOGE",  0.1185,  5.42,   78_000_000),
  opPair("DOT",   6.82,   -1.20,   38_000_000),
  opPair("AVAX",  36.4,    2.15,   62_000_000),
  opPair("MATIC", 0.718,  -0.92,   54_000_000),
  opPair("LINK",  14.52,   3.64,   48_000_000),
  opPair("UNI",   9.84,    1.55,   22_000_000),
  opPair("ATOM",  8.42,   -0.78,   18_000_000),
  opPair("NEAR",  6.55,    4.82,   24_000_000),
  opPair("ARB",   1.12,    2.85,   28_000_000),
  opPair("SUI",   1.22,    6.45,   35_000_000),
  opPair("INJ",   28.4,    4.21,   15_000_000),
  opPair("AAVE",  96.5,    1.82,   12_000_000),
  opPair("CRV",   0.382,  -1.15,   18_000_000),
];

// ─── FTM PAIRS (Fantom) ───────────────────────────────────────────────────────
const FTM_PRICE = 0.65;
function ftmPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / FTM_PRICE;
  return spot(base, "FTM", p, chg, vol / FTM_PRICE);
}
export const FTM_MARKETS: any[] = [
  ftmPair("BTC",   68310,  -1.85, 2_450_000_000),
  ftmPair("ETH",   3415,    1.32,  950_000_000),
  ftmPair("BNB",   392,     0.88,  320_000_000),
  ftmPair("SOL",   148.5,   3.21,  420_000_000),
  ftmPair("XRP",   0.5242, -0.64,  110_000_000),
  ftmPair("ADA",   0.4421, -2.10,   45_000_000),
  ftmPair("DOGE",  0.1185,  5.42,   78_000_000),
  ftmPair("DOT",   6.82,   -1.20,   38_000_000),
  ftmPair("AVAX",  36.4,    2.15,   62_000_000),
  ftmPair("MATIC", 0.718,  -0.92,   54_000_000),
  ftmPair("LINK",  14.52,   3.64,   48_000_000),
  ftmPair("UNI",   9.84,    1.55,   22_000_000),
  ftmPair("ATOM",  8.42,   -0.78,   18_000_000),
  ftmPair("NEAR",  6.55,    4.82,   24_000_000),
  ftmPair("ARB",   1.12,    2.85,   28_000_000),
  ftmPair("OP",    2.41,    3.10,   22_000_000),
  ftmPair("AAVE",  96.5,    1.82,   12_000_000),
];

// ─── BASE PAIRS (Base L2 · Coinbase) — curated, excludes Zora social coins ───
// Only Base-native blue-chips + established bridged assets. Creator coins → ZORA tab.
export const BASE_MARKETS: any[] = [
  spot("WETH",   "USDC",  3415,       2.15, 2_100_000_000), // wrapped ETH on Base
  spot("CBETH",  "USDC",  3596,       2.04,   420_000_000), // Coinbase staked ETH
  spot("USDC",   "USDT",  1.0001,     0.01, 1_820_000_000), // native USDC on Base
  spot("DAI",    "USDC",  0.9998,     0.02,   480_000_000),
  spot("AERO",   "USDC",  2.84,      12.45,   285_000_000), // Aerodrome — #1 Base DEX
  spot("BRETT",  "USDC",  0.1142,    18.42,   242_000_000), // biggest Base meme coin
  spot("TOSHI",  "USDC",  0.000185,  22.15,   168_000_000), // Coinbase mascot meme
  spot("DEGEN",  "USDC",  0.00842,   14.82,   138_000_000), // Farcaster social token
  spot("HIGHER", "USDC",  0.00215,    9.64,    82_000_000), // Base cultural token
  spot("MOCHI",  "USDC",  0.00142,   11.25,    58_000_000), // Base cat meme
  spot("DOGINME","USDC",  0.000428,  16.84,    52_000_000), // Base dog meme
  spot("BALD",   "USDC",  0.00284,    8.42,    42_000_000), // first Base meme coin
  spot("NORMIE", "USDC",  0.00182,   13.10,    38_000_000), // Base meme
  spot("MORPHO", "USDC",  1.82,       5.21,    48_000_000), // Morpho lending on Base
  spot("MOONWELL","USDC", 0.182,      4.85,    28_000_000), // Moonwell lending
  spot("SEAM",   "USDC",  4.82,       7.42,    22_000_000), // Seamless Protocol
  spot("WELL",   "USDC",  0.082,      3.15,    18_000_000), // Moonwell governance
  spot("COMP",   "USDC",  52.5,       0.62,    15_000_000), // Compound on Base
  spot("SNX",    "USDC",  2.82,      -1.32,    12_000_000), // Synthetix on Base
];

// ─── ZORA MARKETS — creator / social coins (Zora Network + Base social layer) ─
// On Zora, every post creates a tradeable ERC-20. Sorted by 24h volume.
export const ZORA_MARKETS: any[] = [
  spot("ZORA",   "USDC",  0.00182,   24.82,   142_000_000), // Zora Protocol token
  spot("ENJOY",  "USDC",  0.000042,  31.50,    62_000_000), // ENJOY — Zora OG social
  spot("BUILD",  "USDC",  0.000285,  42.15,    32_000_000), // BUILD ecosystem
  spot("IMAGINE","USDC",  0.0000182, 18.42,    28_000_000), // Zora creator coin
  spot("ONCHAIN","USDC",  0.0000842, 15.42,    24_000_000), // onchain culture
  spot("BASED",  "USDC",  0.000142,  19.10,    22_000_000), // Base culture token
  spot("FRIEND", "USDC",  0.00482,    6.84,    18_000_000), // friend.tech derivative
  spot("NOMAD",  "USDC",  0.000182,  22.84,    16_000_000), // Zora social coin
  spot("COINAGE","USDC",  0.00182,    8.42,    14_000_000), // Coinage media token
  spot("RAINBOW","USDC",  0.0000285, 11.25,    12_000_000), // Rainbow wallet social
  spot("ALFA",   "USDC",  0.000882,  28.42,    10_000_000), // Alfa social coin
  spot("NOTES",  "USDC",  0.0000482, 14.85,     8_500_000), // creator notes coin
  spot("POST",   "USDC",  0.0000185,  9.42,     7_200_000), // post-as-coin
  spot("VIRAL",  "USDC",  0.000242,  35.84,     6_800_000), // viral post coin
  spot("MINT",   "USDC",  0.00142,    4.15,     5_400_000), // Zora Mint
];

// ─── CRO PAIRS (Cronos) ───────────────────────────────────────────────────────
const CRO_PRICE = 0.13;
function croPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / CRO_PRICE;
  return spot(base, "CRO", p, chg, vol / CRO_PRICE);
}
export const CRO_MARKETS: any[] = [
  croPair("BTC",   68310,  -1.85, 2_450_000_000),
  croPair("ETH",   3415,    1.32,  950_000_000),
  croPair("BNB",   392,     0.88,  320_000_000),
  croPair("SOL",   148.5,   3.21,  420_000_000),
  croPair("XRP",   0.5242, -0.64,  110_000_000),
  croPair("ADA",   0.4421, -2.10,   45_000_000),
  croPair("DOGE",  0.1185,  5.42,   78_000_000),
  croPair("DOT",   6.82,   -1.20,   38_000_000),
  croPair("AVAX",  36.4,    2.15,   62_000_000),
  croPair("MATIC", 0.718,  -0.92,   54_000_000),
  croPair("LINK",  14.52,   3.64,   48_000_000),
  croPair("UNI",   9.84,    1.55,   22_000_000),
  croPair("ATOM",  8.42,   -0.78,   18_000_000),
  croPair("NEAR",  6.55,    4.82,   24_000_000),
];

// ─── ETH PAIRS ────────────────────────────────────────────────────────────────
const ETH_PRICE = 3415;
function ethPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / ETH_PRICE;
  return spot(base, "ETH", p, chg, vol / ETH_PRICE);
}
export const ETH_MARKETS: any[] = [
  ethPair("BSV",   55.42,   4.41,   18_500_000),
  ethPair("BTC",   68310,  -1.85, 2_450_000_000),
  ethPair("SOL",   148.5,   3.21,  420_000_000),
  ethPair("XRP",   0.5242, -0.64,  110_000_000),
  ethPair("BNB",   392,     0.88,  320_000_000),
  ethPair("ADA",   0.4421, -2.10,   45_000_000),
  ethPair("DOGE",  0.1185,  5.42,   78_000_000),
  ethPair("DOT",   6.82,   -1.20,   38_000_000),
  ethPair("AVAX",  36.4,    2.15,   62_000_000),
  ethPair("MATIC", 0.718,  -0.92,   54_000_000),
  ethPair("LINK",  14.52,   3.64,   48_000_000),
  ethPair("UNI",   9.84,    1.55,   22_000_000),
  ethPair("ATOM",  8.42,   -0.78,   18_000_000),
  ethPair("LTC",   78.2,    0.45,   32_000_000),
  ethPair("BCH",   384,     1.10,   28_000_000),
  ethPair("NEAR",  6.55,    4.82,   24_000_000),
  ethPair("APT",   10.5,    5.21,   18_000_000),
  ethPair("ARB",   1.12,    2.85,   28_000_000),
  ethPair("OP",    2.41,    3.10,   22_000_000),
  ethPair("SUI",   1.22,    6.45,   35_000_000),
  ethPair("INJ",   28.4,    4.21,   15_000_000),
];

// ─── THEMED CATEGORIES ────────────────────────────────────────────────────────
export const AI_MARKETS: any[] = [
  spot("FET",   "USDT", 1.82,   8.45,  85_000_000),
  spot("AGIX",  "USDT", 0.892, -3.21,  42_000_000),
  spot("OCEAN", "USDT", 0.612,  5.14,  28_000_000),
  spot("RNDR",  "USDT", 7.42,   6.82,  62_000_000),
  spot("TAO",   "USDT", 482,    4.21, 320_000_000),
  spot("WLD",   "USDT", 2.84,  -1.45,  98_000_000),
  spot("GRT",   "USDT", 0.192,  3.15,  12_000_000),
  spot("ICP",   "USDT", 11.2,   0.95,  12_000_000),
  spot("ARKM",  "USDT", 1.84,  -2.18,  18_000_000),
  spot("CTXC",  "USDT", 0.142,  7.32,   4_000_000),
  spot("NMR",   "USDT", 18.2,   2.45,   3_000_000),
  spot("ORAI",  "USDT", 4.82,  11.24,   8_000_000),
  spot("ALT",   "USDT", 0.182, -5.42,  22_000_000),
];

// ─── SOL PAIRS (X/SOL — quoted in SOL, consistent with BTC/ETH/BNB tabs) ─────
const SOL_PRICE = 148.5;
function solPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / SOL_PRICE;
  return spot(base, "SOL", p, chg, vol / SOL_PRICE);
}
export const SOL_MARKETS: any[] = [
  solPair("BTC",    68310,    -1.85, 2_450_000_000),
  solPair("ETH",    3415,      1.32,   950_000_000),
  solPair("USDT",   1.00,      0.00,   420_000_000),
  solPair("USDC",   1.00,      0.00,   380_000_000),
  solPair("BNB",    392,       0.88,   320_000_000),
  solPair("XRP",    0.5242,   -0.64,   110_000_000),
  solPair("JUP",    0.842,    -2.18,    48_000_000),
  solPair("PYTH",   0.382,     4.85,    28_000_000),
  solPair("JTO",    2.42,     -1.82,    18_000_000),
  solPair("ORCA",   2.84,      3.42,    12_000_000),
  solPair("RAY",    2.12,      5.84,    38_000_000),
  solPair("RENDER", 7.82,      6.42,    82_000_000),
  solPair("HNT",    8.42,     -2.15,    22_000_000),
  solPair("MSOL",   172.5,     3.28,    18_000_000),
  solPair("GRASS",  0.282,     8.70,    18_000_000),
  solPair("ZEUS",   0.182,     6.15,     8_000_000),
  solPair("STEP",   0.0482,    4.21,     4_000_000),
  solPair("SAMO",   0.0182,    7.84,     6_000_000),
  solPair("MEAN",   0.0842,    3.42,     2_800_000),
  solPair("PORT",   0.242,    -1.84,     3_200_000),
];

export const LINEA_MARKETS: any[] = [
  spot("ETH",    "LINEA", 3420,   2.84,  95_000_000),
  spot("BTC",    "LINEA", 70818,  4.26,  72_000_000),
  spot("USDC",   "LINEA", 1.00,   0.01,  48_000_000),
  spot("DAI",    "LINEA", 0.9998, 0.02,  32_000_000),
  spot("WSTETH", "LINEA", 3981,   2.91,  28_000_000),
  spot("LINK",   "LINEA", 17.42,  5.12,  18_000_000),
  spot("UNI",    "LINEA", 10.28,  3.84,  12_000_000),
  spot("AAVE",   "LINEA", 182,    2.42,   8_000_000),
  spot("SNX",    "LINEA", 3.21,  -1.84,   5_000_000),
  spot("CRV",    "LINEA", 0.482,  6.12,   4_000_000),
  spot("BAL",    "LINEA", 4.82,   3.15,   3_500_000),
  spot("COMP",   "LINEA", 62,     1.84,   3_000_000),
  spot("LDO",    "LINEA", 2.42,   4.82,   6_000_000),
  spot("RETH",   "LINEA", 3782,   2.62,   4_200_000),
  spot("1INCH",  "LINEA", 0.542,  5.21,   2_800_000),
  spot("SUSHI",  "LINEA", 1.42,   3.82,   3_100_000),
  spot("MKR",    "LINEA", 2842,   1.92,   4_500_000),
  spot("GRT",    "LINEA", 0.282,  7.14,   5_200_000),
  spot("ZK",     "LINEA", 0.182,  8.42,   6_800_000),
  spot("PENDLE", "LINEA", 5.42,   9.12,   4_100_000),
];

export const ZK_MARKETS: any[] = [
  spot("ETH",    "ZK",  3420,   2.84, 112_000_000),
  spot("BTC",    "ZK",  70818,  4.26,  88_000_000),
  spot("USDC",   "ZK",  1.00,   0.01,  62_000_000),
  spot("USDT",   "ZK",  1.00,   0.00,  54_000_000),
  spot("DAI",    "ZK",  0.9998, 0.02,  38_000_000),
  spot("WSTETH", "ZK",  3981,   2.91,  24_000_000),
  spot("ARB",    "ZK",  1.42,   3.82,  18_000_000),
  spot("OP",     "ZK",  2.82,   4.15,  14_000_000),
  spot("MNT",    "ZK",  0.842,  2.82,  10_000_000),
  spot("LINK",   "ZK",  17.42,  5.12,  12_000_000),
  spot("UNI",    "ZK",  10.28,  3.84,   9_000_000),
  spot("AAVE",   "ZK",  182,    2.42,   7_500_000),
  spot("PENDLE", "ZK",  5.42,   9.12,   6_200_000),
  spot("CRV",    "ZK",  0.482,  6.12,   5_100_000),
  spot("LDO",    "ZK",  2.42,   4.82,   4_800_000),
  spot("GRT",    "ZK",  0.282,  7.14,   4_200_000),
  spot("STX",    "ZK",  2.82,   6.42,   3_800_000),
  spot("SNX",    "ZK",  3.21,  -1.84,   3_200_000),
  spot("BAL",    "ZK",  4.82,   3.15,   2_900_000),
  spot("COMP",   "ZK",  62,     1.84,   2_600_000),
];

export const SCR_MARKETS: any[] = [
  spot("ETH",    "SCR",  3420,   2.84,  78_000_000),
  spot("BTC",    "SCR",  70818,  4.26,  62_000_000),
  spot("USDC",   "SCR",  1.00,   0.01,  42_000_000),
  spot("USDT",   "SCR",  1.00,   0.00,  36_000_000),
  spot("DAI",    "SCR",  0.9998, 0.02,  28_000_000),
  spot("WSTETH", "SCR",  3981,   2.91,  18_000_000),
  spot("LINK",   "SCR",  17.42,  5.12,  12_000_000),
  spot("UNI",    "SCR",  10.28,  3.84,   9_000_000),
  spot("AAVE",   "SCR",  182,    2.42,   7_200_000),
  spot("LDO",    "SCR",  2.42,   4.82,   5_800_000),
  spot("CRV",    "SCR",  0.482,  6.12,   4_600_000),
  spot("MKR",    "SCR",  2842,   1.92,   4_100_000),
  spot("ZK",     "SCR",  0.182,  8.42,   3_800_000),
  spot("SNX",    "SCR",  3.21,  -1.84,   3_200_000),
  spot("COMP",   "SCR",  62,     1.84,   2_800_000),
  spot("GRT",    "SCR",  0.282,  7.14,   2_500_000),
  spot("BAL",    "SCR",  4.82,   3.15,   2_200_000),
  spot("PENDLE", "SCR",  5.42,   9.12,   4_400_000),
  spot("1INCH",  "SCR",  0.542,  5.21,   2_000_000),
  spot("SUSHI",  "SCR",  1.42,   3.82,   1_800_000),
];

export const MNT_MARKETS: any[] = [
  spot("ETH",    "MNT",  3420,   2.84,  92_000_000),
  spot("BTC",    "MNT",  70818,  4.26,  74_000_000),
  spot("USDC",   "MNT",  1.00,   0.01,  58_000_000),
  spot("USDT",   "MNT",  1.00,   0.00,  48_000_000),
  spot("DAI",    "MNT",  0.9998, 0.02,  32_000_000),
  spot("WBTC",   "MNT",  70215,  4.18,  22_000_000),
  spot("WSTETH", "MNT",  3981,   2.91,  18_000_000),
  spot("LINK",   "MNT",  17.42,  5.12,  14_000_000),
  spot("UNI",    "MNT",  10.28,  3.84,  10_000_000),
  spot("AAVE",   "MNT",  182,    2.42,   8_200_000),
  spot("WLD",    "MNT",  5.42,  12.84,   7_600_000),
  spot("ARB",    "MNT",  1.42,   3.82,   6_800_000),
  spot("OP",     "MNT",  2.82,   4.15,   5_900_000),
  spot("CRV",    "MNT",  0.482,  6.12,   5_100_000),
  spot("LDO",    "MNT",  2.42,   4.82,   4_800_000),
  spot("PENDLE", "MNT",  5.42,   9.12,   4_400_000),
  spot("SNX",    "MNT",  3.21,  -1.84,   3_600_000),
  spot("GRT",    "MNT",  0.282,  7.14,   3_200_000),
  spot("ZK",     "MNT",  0.182,  8.42,   2_800_000),
  spot("COMP",   "MNT",  62,     1.84,   2_400_000),
];

export const MEME_MARKETS: any[] = [
  /* ── Tier 1: blue-chip memes ── */
  spot("DOGE",    "USDT", 0.1185,    5.42,  780_000_000),
  spot("SHIB",    "USDT", 0.0000235, 6.10,  420_000_000),
  spot("PEPE",    "USDT", 0.0000082, 8.50,  385_000_000),
  spot("FLOKI",   "USDT", 0.000182,  9.84,  148_000_000),
  spot("TRUMP",   "USDT", 8.42,     -4.21,  482_000_000),
  /* ── Tier 2: established memes ── */
  spot("BONK",    "USDT", 0.0000248, 12.50, 185_000_000),
  spot("WIF",     "USDT", 0.892,      8.42,  82_000_000),
  spot("POPCAT",  "USDT", 0.842,     15.42,  62_000_000),
  spot("BRETT",   "USDT", 0.1142,    18.42,  42_000_000),
  spot("MOG",     "USDT", 0.0000082, 11.50,  22_000_000),
  spot("TURBO",   "USDT", 0.00842,   15.84,  18_000_000),
  spot("BOME",    "USDT", 0.00842,   18.50,  92_000_000),
  spot("MEW",     "USDT", 0.00582,    9.21,  45_000_000),
  /* ── Tier 3: rising memes ── */
  spot("NEIRO",   "USDT", 0.000482,  22.84,  38_000_000),
  spot("MAGA",    "USDT", 3.42,      -8.12,  28_000_000),
  spot("PONKE",   "USDT", 0.182,     14.21,  18_000_000),
  spot("SLERF",   "USDT", 0.00482,    4.82,  12_000_000),
  spot("FWOG",    "USDT", 0.0842,     7.45,  12_000_000),
  spot("GIGA",    "USDT", 0.0482,    11.32,   8_000_000),
  spot("MICHI",   "USDT", 0.382,      9.84,  14_000_000),
];

export const DEFI_MARKETS: any[] = [
  spot("UNI",   "USDT", 9.84,    1.55,  22_000_000),
  spot("AAVE",  "USDT", 96.5,    1.82,  12_000_000),
  spot("MKR",   "USDT", 2920,   -0.45,   8_000_000),
  spot("CRV",   "USDT", 0.382,  -1.15,  18_000_000),
  spot("LDO",   "USDT", 2.15,    1.95,  14_000_000),
  spot("COMP",  "USDT", 52.5,    0.62,   5_000_000),
  spot("SNX",   "USDT", 2.82,   -1.32,   6_000_000),
  spot("YFI",   "USDT", 6820,    1.05,   4_000_000),
  spot("SUSHI", "USDT", 1.22,   -0.85,   8_000_000),
  spot("BAL",   "USDT", 2.84,   -2.14,   4_000_000),
  spot("DYDX",  "USDT", 1.84,    3.42,  12_000_000),
  spot("GMX",   "USDT", 28.4,   -0.85,   8_000_000),
  spot("RUNE",  "USDT", 5.52,    4.85,  12_000_000),
  spot("PENDLE","USDT", 3.5,     9.12,  18_000_000),
  spot("CVX",   "USDT", 2.8,     2.84,   6_000_000),
  spot("FXS",   "USDT", 2.1,    -1.42,   4_000_000),
  spot("SPELL", "USDT", 0.00082, 5.82,   3_000_000),
  spot("PERP",  "USDT", 0.42,   -0.85,   2_500_000),
  spot("ENS",   "USDT", 17,      2.48,   6_000_000),
  spot("GRT",   "USDT", 0.12,    3.15,  12_000_000),
  spot("CAKE",  "USDT", 2.24,    3.85,  42_000_000),
];

// ─── UNISWAP — v2 & v3 pools (Ethereum mainnet + multi-chain) ─────────────────
// Pairs that are live on Uniswap protocol. Quoted in USDC to match Uniswap UI.
export const UNISWAP_MARKETS: any[] = [
  /* ── Uniswap v3 — Ethereum flagship pools ── */
  spot("WETH",  "USDC",  3415,      2.15, 1_850_000_000),  // ETH/USDC 0.05% pool — #1 by TVL
  spot("WBTC",  "USDC",  68310,    -1.85,   820_000_000),  // WBTC/USDC 0.3% pool
  spot("WBTC",  "WETH",  20.02,    -1.52,   480_000_000),  // WBTC/ETH pool (cross)
  spot("UNI",   "USDC",  9.84,      1.55,   185_000_000),  // UNI/USDC 0.3% pool
  spot("UNI",   "WETH",  0.00288,   1.35,    82_000_000),  // UNI/ETH pool
  spot("LINK",  "USDC",  14.82,     3.42,   145_000_000),  // LINK/USDC pool
  spot("LINK",  "WETH",  0.00434,   3.18,    62_000_000),  // LINK/ETH pool
  spot("AAVE",  "USDC",  96.5,      1.82,    98_000_000),  // AAVE/USDC pool
  spot("MKR",   "USDC",  2920,     -0.45,    72_000_000),  // MKR/USDC pool
  spot("CRV",   "USDC",  0.382,    -1.15,    58_000_000),  // CRV/USDC pool
  /* ── Uniswap v3 — stablecoin pools ── */
  spot("DAI",   "USDC",  0.9999,    0.01, 2_100_000_000),  // DAI/USDC 0.01% — stable pool
  spot("USDT",  "USDC",  1.0001,    0.01, 1_950_000_000),  // USDT/USDC 0.01%
  spot("FRAX",  "USDC",  0.9982,   -0.02,   420_000_000),  // FRAX/USDC stable pool
  /* ── Uniswap v3 — multi-chain pools (Arbitrum, Polygon, Optimism) ── */
  spot("ARB",   "USDC",  1.12,      4.85,   185_000_000),  // ARB/USDC on Arbitrum
  spot("OP",    "USDC",  2.41,      3.10,   125_000_000),  // OP/USDC on Optimism
  spot("MATIC", "USDC",  0.82,      2.48,   145_000_000),  // MATIC/USDC on Polygon
  spot("PEPE",  "WETH",  0.00000000412, 8.42, 385_000_000),// PEPE/WETH meme pool
  spot("SHIB",  "USDC",  0.0000198, 5.21,   285_000_000),  // SHIB/USDC
  spot("LDO",   "USDC",  2.15,      1.95,    62_000_000),  // Lido on Uniswap
  spot("GRT",   "USDC",  0.12,      3.15,    48_000_000),  // The Graph / USDC
  spot("ENS",   "USDC",  17,        2.48,    38_000_000),  // ENS/USDC pool
  spot("RPL",   "USDC",  14.5,      2.84,    28_000_000),  // Rocket Pool
  spot("SSV",   "USDC",  22.4,      5.42,    18_000_000),  // SSV Network pool
  spot("PENDLE","USDC",  3.5,       9.12,    42_000_000),  // Pendle / USDC
  spot("SUSHI", "USDC",  1.22,     -0.85,    22_000_000),  // SushiSwap on Uniswap
];

// ─── PANCAKESWAP — BNB Smart Chain & multi-chain pools ───────────────────────
// Pairs from PancakeSwap v2/v3 — BSC-native, CAKE ecosystem, and bridged assets.
export const PANCAKE_MARKETS: any[] = [
  /* ── CAKE token — PancakeSwap native ── */
  spot("CAKE",  "USDT",  2.24,      3.85,  42_000_000,  580_000_000),  // CAKE/USDT — flagship pair
  spot("CAKE",  "BNB",   0.00572,   3.61,  18_000_000),                // CAKE/BNB direct
  spot("CAKE",  "USDC",  2.24,      3.80,   8_000_000),                // CAKE/USDC v3
  /* ── BSC blue-chip pairs ── */
  spot("BNB",   "USDT",  392,       0.88, 820_000_000),  // BNB/USDT — most liquid BSC pair
  spot("BNB",   "USDC",  392,       0.85, 420_000_000),  // BNB/USDC pool
  spot("WBNB",  "USDT",  392,       0.88, 385_000_000),  // Wrapped BNB pairs
  spot("BTC",   "BNB",   174.1,    -1.85, 285_000_000),  // BTC/BNB cross pair
  spot("ETH",   "BNB",   8.72,      1.32, 195_000_000),  // ETH/BNB
  spot("USDT",  "USDC",  1.0001,    0.01, 650_000_000),  // stable pool
  spot("DAI",   "USDT",  0.9998,    0.02, 320_000_000),  // stablecoin pool
  spot("BUSD",  "USDT",  0.9997,    0.01, 480_000_000),  // BUSD — legacy BSC stable
  /* ── BSC DeFi tokens ── */
  spot("XRP",   "BNB",   0.00122,   1.42,  82_000_000),  // XRP/BNB cross pair
  spot("ADA",   "BNB",   0.00118,   0.85,  58_000_000),  // ADA/BNB
  spot("DOGE",  "BNB",   0.000240,  4.21,  48_000_000),  // DOGE/BNB
  spot("DOT",   "BNB",   0.00360,   1.65,  38_000_000),  // DOT/BNB
  spot("LTC",   "BNB",   0.220,     0.42,  28_000_000),  // LTC/BNB
  spot("LINK",  "BNB",   0.0378,    3.18,  35_000_000),  // LINK/BNB
  spot("UNI",   "BNB",   0.0251,    1.35,  22_000_000),  // UNI/BNB
  spot("AAVE",  "BNB",   0.246,     1.62,  18_000_000),  // AAVE/BNB
  spot("ATOM",  "BNB",   0.0115,    2.84,  15_000_000),  // ATOM/BNB
  /* ── BSC meme / ecosystem ── */
  spot("PEPE",  "USDT",  0.0000182, 8.42,  85_000_000),  // PEPE on BSC
  spot("SHIB",  "USDT",  0.0000198, 5.21,  62_000_000),  // SHIB on BSC
  spot("FLOKI", "USDT",  0.000182,  6.84,  42_000_000),  // FLOKI — BSC-native meme
  spot("BABYDOGE","USDT",0.000000002, 9.15, 28_000_000), // Baby Doge Coin
  spot("GMT",   "USDT",  0.182,     4.85,  35_000_000),  // STEPN / GMT
  spot("TWT",   "USDT",  1.12,      2.84,  18_000_000),  // Trust Wallet Token
  spot("BAKE",  "USDT",  0.182,     5.42,  12_000_000),  // BakerySwap token
  spot("ALPACA","USDT",  0.282,     3.15,   8_000_000),  // Alpaca Finance
  /* ── PancakeSwap v3 on other chains ── */
  spot("ARB",   "USDC",  1.12,      4.85,  28_000_000),  // PCS v3 on Arbitrum
  spot("ETH",   "USDC",  3415,      2.15,  82_000_000),  // PCS v3 on Ethereum
  spot("MATIC", "USDC",  0.82,      2.48,  22_000_000),  // PCS v3 on Polygon
  spot("OP",    "USDC",  2.41,      3.10,  18_000_000),  // PCS v3 on Optimism
];

// ─── GAMING / METAVERSE ───────────────────────────────────────────────────────
export const GAMING_MARKETS: any[] = [
  /* ── Tier 1: Blue-chip gaming ── */
  spot("AXS",     "USDT", 6.82,    4.21,  82_000_000),  // Axie Infinity — pioneer P2E
  spot("SAND",    "USDT", 0.30,    3.42,  48_000_000),  // The Sandbox metaverse
  spot("MANA",    "USDT", 0.30,    2.15,  35_000_000),  // Decentraland
  spot("ENJ",     "USDT", 0.18,    5.82,  28_000_000),  // Enjin — NFT gaming SDK
  spot("GALA",    "USDT", 0.022,   6.48,  42_000_000),  // Gala Games platform
  spot("IMX",     "USDT", 1.85,    8.42,  58_000_000),  // ImmutableX — ZK gaming L2
  spot("RON",     "USDT", 2.42,    5.21,  38_000_000),  // Ronin — Axie Infinity chain
  /* ── Tier 2: Mid-cap gaming ── */
  spot("ILV",     "USDT", 35,      3.84,  22_000_000),  // Illuvium AAA RPG
  spot("BEAM",    "USDT", 0.018,   7.82,  18_000_000),  // Beam gaming chain
  spot("PRIME",   "USDT", 2.8,     4.15,  15_000_000),  // Parallel — sci-fi TCG
  spot("PIXEL",   "USDT", 0.14,    9.42,  28_000_000),  // Pixels — farming RPG
  spot("BIGTIME", "USDT", 0.082,  12.84,  22_000_000),  // Big Time MMO
  spot("MC",      "USDT", 0.12,    5.42,  12_000_000),  // Merit Circle — gaming DAO
  spot("ALICE",   "USDT", 0.82,    6.21,  10_000_000),  // My Neighbor Alice
  spot("WAXP",    "USDT", 0.042,   4.82,  14_000_000),  // WAX — NFT gaming chain
  /* ── Tier 3: Niche gaming ── */
  spot("TLM",     "USDT", 0.012,   8.42,   8_000_000),  // Alien Worlds mining
  spot("SLP",     "USDT", 0.0028,  5.15,   6_000_000),  // Smooth Love Potion (Axie)
  spot("GODS",    "USDT", 0.082,   7.84,   5_000_000),  // Gods Unchained card game
  spot("GHST",    "USDT", 1.42,    5.15,   4_500_000),  // Aavegotchi (Polygon)
  spot("MAGIC",   "USDT", 0.48,    6.84,  12_000_000),  // Treasure / TreasureDAO
];

// ─── COSMOS ECOSYSTEM ─────────────────────────────────────────────────────────
export const COSMOS_MARKETS: any[] = [
  /* ── IBC Hub chains ── */
  spot("ATOM",  "USDT", 4.5,     2.84,  48_000_000),  // Cosmos Hub
  spot("OSMO",  "USDT", 0.48,    5.21,  22_000_000),  // Osmosis DEX
  spot("INJ",   "USDT", 18,      4.21,  42_000_000),  // Injective — DeFi L1
  spot("TIA",   "USDT", 3.5,     8.42,  35_000_000),  // Celestia — modular DA
  spot("DYM",   "USDT", 2.1,     6.84,  18_000_000),  // Dymension rollups
  spot("SEI",   "USDT", 0.24,    7.42,  28_000_000),  // Sei — parallelized EVM
  /* ── Cosmos DeFi ── */
  spot("KAVA",  "USDT", 0.48,    3.15,  14_000_000),  // Kava — lending
  spot("BAND",  "USDT", 1.2,     4.82,   8_000_000),  // Band Protocol — oracle
  spot("EVMOS", "USDT", 0.018,  -2.15,   3_500_000),  // Evmos EVM on Cosmos
  /* ── Cosmos app-chains ── */
  spot("AKT",   "USDT", 2.8,     9.42,  12_000_000),  // Akash — decentralized cloud
  spot("SCRT",  "USDT", 0.38,    4.21,   4_500_000),  // Secret Network — privacy
  spot("STRD",  "USDT", 0.82,    5.84,   3_800_000),  // Stride — liquid staking
  spot("JUNO",  "USDT", 0.28,   -1.42,   2_800_000),  // Juno — CosmWasm hub
  spot("STARS", "USDT", 0.0085,  8.42,   2_200_000),  // Stargaze NFT platform
  spot("NTRN",  "USDT", 0.42,    3.84,   3_200_000),  // Neutron — IBC + DeFi
  /* ── Terra ecosystem ── */
  spot("LUNA",  "USDT", 0.42,    5.21,  18_000_000),  // Terra Luna 2.0
  spot("LUNC",  "USDT", 0.000085, 2.84,  8_000_000),  // Terra Classic
];

// ─── LAYER 1 (L1) ─────────────────────────────────────────────────────────────
export const L1_MARKETS: any[] = [
  /* ── Top 10 L1s ── */
  spot("BTC",  "USDT", 70725,     -1.85, 2_450_000_000),
  spot("ETH",  "USDT", 2152,       1.32,  950_000_000),
  spot("SOL",  "USDT", 91.44,      3.21,  420_000_000),
  spot("BNB",  "USDT", 638,        0.88,  320_000_000),
  spot("ADA",  "USDT", 0.75,      -2.10,   45_000_000),
  spot("AVAX", "USDT", 9.55,       2.15,   62_000_000),
  spot("DOT",  "USDT", 1.41,      -1.20,   38_000_000),
  spot("TON",  "USDT", 2.8,        8.42,  285_000_000),  // Telegram Open Network
  spot("KAS",  "USDT", 0.085,      5.84,   42_000_000),  // Kaspa — PoW DAG
  spot("NEAR", "USDT", 2.5,        4.82,   24_000_000),
  spot("APT",  "USDT", 5.5,        5.21,   18_000_000),
  spot("SUI",  "USDT", 2.5,        6.45,   35_000_000),
  spot("SEI",  "USDT", 0.24,       7.42,   28_000_000),
  spot("TIA",  "USDT", 3.5,        8.42,   35_000_000),
  /* ── Established L1s ── */
  spot("XRP",  "USDT", 1.43,      -0.64,  110_000_000),
  spot("ADA",  "USDT", 0.75,      -2.10,   45_000_000),
  spot("DOGE", "USDT", 0.094,      5.42,   78_000_000),
  spot("LTC",  "USDT", 85,         0.45,   32_000_000),
  spot("BCH",  "USDT", 477,        1.10,   28_000_000),
  spot("XMR",  "USDT", 155,        0.42,    5_000_000),
  spot("EGLD", "USDT", 25,         1.62,    5_000_000),
  spot("ALGO", "USDT", 0.14,      -0.95,    8_000_000),
  spot("XLM",  "USDT", 0.11,       1.42,   12_000_000),
  spot("HBAR", "USDT", 0.17,       2.18,    9_000_000),
  spot("VET",  "USDT", 0.025,      1.25,    8_000_000),
  spot("THETA","USDT", 0.90,      -0.75,    4_000_000),
  spot("FTM",  "USDT", 0.20,       3.28,   18_000_000),
  spot("ONE",  "USDT", 0.012,      4.85,    3_500_000),  // Harmony
  spot("KAVA", "USDT", 0.48,       3.15,    4_200_000),
  spot("CELO", "USDT", 0.48,       2.84,    3_800_000),
  spot("CORE", "USDT", 0.85,       5.21,    5_200_000),  // Core DAO
  spot("CFX",  "USDT", 0.10,       4.42,    3_000_000),  // Conflux
  spot("ROSE", "USDT", 0.048,      3.84,    2_800_000),  // Oasis Network
  spot("FLR",  "USDT", 0.014,      2.15,    2_200_000),  // Flare
  spot("ICX",  "USDT", 0.16,       3.42,    2_000_000),  // ICON
  spot("ZEN",  "USDT", 9.5,        1.84,    1_800_000),  // Horizen
  spot("KDA",  "USDT", 0.75,       4.21,    1_500_000),  // Kadena
];

// ─── LAYER 2 / SCALING ────────────────────────────────────────────────────────
export const L2_MARKETS: any[] = [
  /* ── Major L2s ── */
  spot("ARB",   "USDT", 0.46,    2.85,  28_000_000),   // Arbitrum
  spot("OP",    "USDT", 0.75,    3.10,  22_000_000),   // Optimism
  spot("MATIC", "USDT", 0.40,   -0.92,  54_000_000),   // Polygon
  spot("STRK",  "USDT", 0.42,    4.82,  18_000_000),   // StarkNet
  spot("IMX",   "USDT", 1.85,    8.42,  22_000_000),   // ImmutableX
  spot("MNT",   "USDT", 1.02,    2.84,  12_000_000),   // Mantle
  spot("ZK",    "USDT", 0.15,    6.42,  15_000_000),   // zkSync
  spot("SCR",   "USDT", 0.52,    4.21,   8_000_000),   // Scroll
  spot("METIS", "USDT", 28,      3.84,   6_000_000),   // Metis
  spot("BOBA",  "USDT", 0.18,    5.42,   3_500_000),   // Boba Network
  /* ── Bridge / interop ── */
  spot("ZRO",   "USDT", 2.52,   -2.18,  42_000_000),  // LayerZero
  spot("EIGEN", "USDT", 2.42,   -5.84,  28_000_000),  // EigenLayer restaking
  spot("W",     "USDT", 0.24,   -3.42,  22_000_000),  // Wormhole
  spot("1INCH", "USDT", 0.35,    2.84,  18_000_000),  // 1inch aggregator
  spot("STRK",  "USDT", 0.42,    4.82,  18_000_000),  // StarkNet
];

// ─── REAL WORLD ASSETS (RWA) ──────────────────────────────────────────────────
export const RWA_MARKETS: any[] = [
  /* ── Gold-backed ── */
  spot("PAXG",  "USDT", 2182,    1.42,  28_000_000),  // PAX Gold — 1 PAXG = 1 troy oz gold
  spot("XAUT",  "USDT", 2182,    1.38,  22_000_000),  // Tether Gold
  /* ── Real world finance ── */
  spot("ONDO",  "USDT", 0.85,   12.84,  42_000_000),  // Ondo Finance — tokenized T-bills
  spot("MKR",   "USDT", 1800,   -0.45,   8_000_000),  // MakerDAO — DAI / RWA collateral
  spot("CFG",   "USDT", 0.42,    5.21,   4_500_000),  // Centrifuge — invoice tokenization
  spot("MPL",   "USDT", 14,      3.84,   3_200_000),  // Maple Finance — institutional lending
  /* ── Stablecoins & yield ── */
  spot("USDT",  "USDC", 1.0001,  0.01, 1_820_000_000),
  spot("USDC",  "USDT", 1.0001,  0.01,  980_000_000),
  spot("DAI",   "USDT", 0.9998,  0.02,  480_000_000),
  spot("FRAX",  "USDT", 0.9998,  0.01,  182_000_000),
  spot("LUSD",  "USDT", 1.001,   0.02,   82_000_000),
];

// ─── EXCHANGE TOKENS ──────────────────────────────────────────────────────────
export const EXCHANGE_MARKETS: any[] = [
  spot("BNB",   "USDT", 638,      0.88, 320_000_000),  // Binance
  spot("OKB",   "USDT", 42,       2.84,  48_000_000),  // OKX
  spot("CRO",   "USDT", 0.09,     1.42,  22_000_000),  // Crypto.com
  spot("KCS",   "USDT", 8.5,      3.21,  18_000_000),  // KuCoin
  spot("GT",    "USDT", 6.5,      4.82,  14_000_000),  // Gate.io
  spot("HT",    "USDT", 2.8,      1.85,   8_000_000),  // Huobi (legacy)
  spot("BGB",   "USDT", 3.5,      5.42,  12_000_000),  // Bitget
  spot("WBT",   "USDT", 22,       3.84,   6_000_000),  // WhiteBIT
];

// ─── DEPIN (Decentralized Physical Infrastructure) ────────────────────────────
export const DEPIN_MARKETS: any[] = [
  /* ── Wireless / connectivity ── */
  spot("HNT",   "USDT", 8.42,    -2.15,  22_000_000),  // Helium — LoRaWAN IoT
  spot("IOTX",  "USDT", 0.042,    4.82,   8_000_000),  // IoTeX — device chain
  spot("POWR",  "USDT", 0.22,     3.42,   3_500_000),  // Power Ledger — energy grid
  /* ── Compute / storage ── */
  spot("RNDR",  "USDT", 7.42,     6.82,  62_000_000),  // Render — GPU compute
  spot("FIL",   "USDT", 4.0,     -2.18,  10_000_000),  // Filecoin — storage
  spot("STORJ", "USDT", 0.45,     5.21,   4_200_000),  // Storj — storage
  spot("GLM",   "USDT", 0.28,     3.84,   3_800_000),  // Golem — compute market
  spot("LPT",   "USDT", 7.5,      4.21,   3_200_000),  // Livepeer — video transcoding
  /* ── Data / oracle ── */
  spot("FET",   "USDT", 1.82,     8.45,  85_000_000),  // Fetch.ai — AI agents
  spot("OCEAN", "USDT", 0.612,    5.14,  28_000_000),  // Ocean Protocol — data market
  spot("GRT",   "USDT", 0.12,     3.15,  12_000_000),  // The Graph — indexing
  spot("BAND",  "USDT", 1.2,      4.82,   8_000_000),  // Band Protocol — oracle
  /* ── AI DePIN ── */
  spot("TAO",   "USDT", 482,      4.21, 320_000_000),  // Bittensor — AI compute
  spot("ALT",   "USDT", 0.18,    -5.42,  22_000_000),  // AltLayer — rollup infra
  spot("WLD",   "USDT", 2.84,    -1.45,  98_000_000),  // Worldcoin — iris biometrics
];

// ─── BRC-20 / ORDINALS / RUNES ────────────────────────────────────────────────
export const BRC20_MARKETS: any[] = [
  /* ── BRC-20 (Bitcoin fungible tokens) ── */
  spot("ORDI",  "USDT", 28,    -4.82,  48_000_000),  // #1 BRC-20 by market cap
  spot("SATS",  "USDT", 0.00000035, 8.42, 38_000_000), // 1000SATS — BRC-20 meme
  spot("RATS",  "USDT", 0.00000042, 5.84, 18_000_000), // RATS — BRC-20 meme
  /* ── Stacks (Bitcoin L2) ── */
  spot("STX",   "USDT", 1.52,    6.42,  22_000_000),  // Stacks — Bitcoin smart contracts
  /* ── Bitcoin ecosystem ── */
  spot("WBTC",  "USDT", 70215,  -1.92, 120_000_000),  // Wrapped Bitcoin (ERC-20)
  spot("CBBTC", "USDT", 70725,  -1.85,  85_000_000),  // Coinbase Wrapped BTC (Base)
  spot("RBTC",  "USDT", 70215,  -1.92,  12_000_000),  // RSK smart Bitcoin
  spot("TBTC",  "USDT", 70215,  -1.92,   8_000_000),  // tBTC — decentralized bridge
  /* ── Bitcoin Cash ecosystem ── */
  spot("BCH",   "USDT", 477,     1.10,  28_000_000),
  spot("BSV",   "USDT", 55.42,   4.41,  18_500_000),
];

export const NEW_MARKETS: any[] = [
  spot("BOME",  "USDT", 0.00842, 18.5,  92_000_000),
  spot("W",     "USDT", 0.242,  -3.42,  28_000_000),
  spot("TNSR",  "USDT", 0.342,   5.42,  18_000_000),
  spot("REZ",   "USDT", 0.082,  -8.42,  12_000_000),
  spot("BB",    "USDT", 0.242,   12.4,  22_000_000),
  spot("NOT",   "USDT", 0.00842, 28.5, 182_000_000),
  spot("LISTA", "USDT", 0.182,   6.42,   8_000_000),
  spot("ZRO",   "USDT", 2.84,   -2.18,  42_000_000),
  spot("EIGEN", "USDT", 2.42,   -5.84,  28_000_000),
  spot("SCR",   "USDT", 0.882,  -4.21,  12_000_000),
  spot("CATI",  "USDT", 0.242,  -6.42,  18_000_000),
  spot("HMSTR", "USDT", 0.00142, -9.84, 42_000_000),
  spot("DOGS",  "USDT", 0.000482, 5.42, 22_000_000),
];

// ─── FUTURES ──────────────────────────────────────────────────────────────────
export const FUTURES_MARKETS: any[] = [
  fut("BSV",   55.42,   4.41,  18_500_000),
  fut("BTC",   68310,  -1.85, 2_450_000_000),
  fut("ETH",   3415,    1.32,  950_000_000),
  fut("SOL",   148.5,   3.21,  420_000_000),
  fut("XRP",   0.5242, -0.64,  110_000_000),
  fut("BNB",   392,     0.88,  320_000_000),
  fut("ADA",   0.4421, -2.10,   45_000_000),
  fut("DOGE",  0.1185,  5.42,   78_000_000),
  fut("DOT",   6.82,   -1.20,   38_000_000),
  fut("AVAX",  36.4,    2.15,   62_000_000),
  fut("MATIC", 0.718,  -0.92,   54_000_000),
  fut("LINK",  14.52,   3.64,   48_000_000),
  fut("ARB",   1.12,    2.85,   28_000_000),
  fut("OP",    2.41,    3.10,   22_000_000),
  fut("SUI",   1.22,    6.45,   35_000_000),
  fut("INJ",   28.4,    4.21,   15_000_000),
  fut("NEAR",  6.55,    4.82,   24_000_000),
  fut("APT",   10.5,    5.21,   18_000_000),
];

export const MOCK_MARKETS: any[] = [...USDT_MARKETS, ...BSV_MARKETS, ...FUTURES_MARKETS];

/**
 * Every spot market across all chains and quote assets.
 * Used as a full fallback in the Spot trade page pair selector.
 */
export const ALL_SPOT_MOCK: any[] = [
  ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
  ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS, ...BNB_MARKETS,
  ...MATIC_MARKETS, ...AVAX_MARKETS, ...ARB_MARKETS, ...OP_MARKETS,
  ...FTM_MARKETS, ...CRO_MARKETS,
  ...BASE_MARKETS, ...ZORA_MARKETS, ...LINEA_MARKETS,
  ...ZK_MARKETS, ...SCR_MARKETS, ...MNT_MARKETS,
  ...SOL_MARKETS, ...AI_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
  ...GAMING_MARKETS, ...COSMOS_MARKETS, ...L1_MARKETS, ...L2_MARKETS,
  ...RWA_MARKETS, ...EXCHANGE_MARKETS, ...DEPIN_MARKETS, ...BRC20_MARKETS,
  ...UNISWAP_MARKETS, ...PANCAKE_MARKETS, ...NEW_MARKETS,
].filter(m => !m.type || m.type === "spot");

const BSV_ETH_PRICE = 55.42 / 3415; // ≈ 0.016228 ETH per BSV

function mkTicker(sym: string, price: number, chgPct: number, vol: number, qVol: number): any {
  const chg = price * chgPct / 100;
  return {
    symbol: sym, lastPrice: price, bidPrice: price * 0.9998, askPrice: price * 1.0002,
    openPrice: price - chg, highPrice: price * 1.02, lowPrice: price * 0.98,
    volume: vol, quoteVolume: qVol, priceChange: chg, priceChangePercent: chgPct,
    timestamp: new Date().toISOString(),
  };
}

/** Known approximate USD prices for mock ticker generation. */
const KNOWN_PRICES_USD: Record<string, number> = {
  BTC: 68_310, ETH: 3_415, SOL: 148.5, BSV: 55.42, BNB: 392,
  XRP: 0.5242, ADA: 0.4421, DOGE: 0.1185, DOT: 6.82, LINK: 14.52,
  AVAX: 36.4, MATIC: 0.718, ARB: 1.12, OP: 2.41, SUI: 1.22,
  INJ: 28.4, NEAR: 6.55, APT: 10.5, FTM: 0.82, CRO: 0.093,
  ATOM: 8.42, TRX: 0.115, AERO: 1.24, BRETT: 0.089, TOSHI: 0.0012,
  DEGEN: 0.0076, ZORA: 0.042, WLD: 2.85, ENS: 14.2, UNI: 7.95,
  CAKE: 2.18, SUSHI: 1.31, COMP: 48.2, AAVE: 98.4, CRV: 0.42,
  LDO: 1.82, MKR: 1480, SNX: 2.14, GMX: 28.4, GNS: 5.12,
  PEPE: 0.0000082, SHIB: 0.0000088, FLOKI: 0.000024, WIF: 0.93,
  MEME: 0.024, BONK: 0.000019, BOME: 0.0084, POPCAT: 0.18,
  USDT: 1, USDC: 1, BUSD: 1, DAI: 1, FDUSD: 1,
  BCH: 385, LTC: 82.4, ETC: 24.8, DASH: 28.1, ZEC: 30.2,
  LINEA: 0, ZK: 0.15, SCR: 0.42, MNT: 0.65,
};

/**
 * Generate a mock ticker for any trading pair using known coin prices.
 * Falls back to BSV-USDT data only if both coins are completely unknown.
 */
export function generateTickerForSymbol(base: string, quote: string): any {
  const baseUsd  = KNOWN_PRICES_USD[base.toUpperCase()];
  const quoteUsd = KNOWN_PRICES_USD[quote.toUpperCase()];
  const sym = `${base}-${quote}`;

  if (baseUsd && quoteUsd && quoteUsd > 0) {
    const price = baseUsd / quoteUsd;
    // Seed deterministic change % from the symbol string
    const seed  = [...sym].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const chg   = ((seed % 1000) / 1000 - 0.45) * 8; // -3.6% to +4.4%
    const vol   = baseUsd * 50_000 * (1 + (seed % 10) / 5);
    return mkTicker(sym, price, chg, vol, vol * price);
  }
  // Unknown pair — return BSV-USDT shape but re-labelled
  const fallback = { ...mkTicker(sym, 1, 0, 0, 0) };
  return fallback;
}

export const MOCK_TICKER: Record<string, any> = {
  /* ── Spot ── */
  "BSV-USDT": mkTicker("BSV-USDT",  55.42,    4.41,  18_500_000,  1_025_000_000),
  "BSV-ETH":  { symbol: "BSV-ETH",  lastPrice: BSV_ETH_PRICE, bidPrice: BSV_ETH_PRICE * 0.9997, askPrice: BSV_ETH_PRICE * 1.0003, openPrice: BSV_ETH_PRICE * 0.958, highPrice: BSV_ETH_PRICE * 1.02, lowPrice: BSV_ETH_PRICE * 0.952, volume: 5_420_000, quoteVolume: 5_420_000 * BSV_ETH_PRICE, priceChange: BSV_ETH_PRICE * 0.044, priceChangePercent: 4.41, timestamp: new Date().toISOString() },
  /* ── Perp futures ── */
  "BSV-USDT-PERP":  mkTicker("BSV-USDT-PERP",   55.42,   4.41,  18_500_000,   1_025_000_000),
  "BTC-USDT-PERP":  mkTicker("BTC-USDT-PERP",   68310,  -1.85,  2_450_000_000, 167_400_000_000),
  "ETH-USDT-PERP":  mkTicker("ETH-USDT-PERP",   3415,    1.32,  950_000_000,   3_245_000_000),
  "SOL-USDT-PERP":  mkTicker("SOL-USDT-PERP",   148.5,   3.21,  420_000_000,    62_370_000),
  "XRP-USDT-PERP":  mkTicker("XRP-USDT-PERP",   0.5242, -0.64,  110_000_000,     57_660_000),
  "BNB-USDT-PERP":  mkTicker("BNB-USDT-PERP",   392,     0.88,  320_000_000,   125_440_000),
  "ADA-USDT-PERP":  mkTicker("ADA-USDT-PERP",   0.4421, -2.10,   45_000_000,    19_895_000),
  "DOGE-USDT-PERP": mkTicker("DOGE-USDT-PERP",  0.1185,  5.42,   78_000_000,     9_243_000),
  "DOT-USDT-PERP":  mkTicker("DOT-USDT-PERP",   6.82,   -1.20,   38_000_000,   259_160_000),
  "AVAX-USDT-PERP": mkTicker("AVAX-USDT-PERP",  36.4,    2.15,   62_000_000,  2_256_800_000),
  "MATIC-USDT-PERP":mkTicker("MATIC-USDT-PERP", 0.718,  -0.92,   54_000_000,    38_772_000),
  "LINK-USDT-PERP": mkTicker("LINK-USDT-PERP",  14.52,   3.64,   48_000_000,   696_960_000),
  "ARB-USDT-PERP":  mkTicker("ARB-USDT-PERP",   1.12,    2.85,   28_000_000,    31_360_000),
  "OP-USDT-PERP":   mkTicker("OP-USDT-PERP",    2.41,    3.10,   22_000_000,    53_020_000),
  "SUI-USDT-PERP":  mkTicker("SUI-USDT-PERP",   1.22,    6.45,   35_000_000,    42_700_000),
  "INJ-USDT-PERP":  mkTicker("INJ-USDT-PERP",   28.4,    4.21,   15_000_000,   426_000_000),
  "NEAR-USDT-PERP": mkTicker("NEAR-USDT-PERP",  6.55,    4.82,   24_000_000,   157_200_000),
  "APT-USDT-PERP":  mkTicker("APT-USDT-PERP",   10.5,    5.21,   18_000_000,   189_000_000),
};

export const generateMockOrderBook = (basePrice: number): OrderBook => {
  const bids = [];
  const asks = [];
  let totalBid = 0;
  let totalAsk = 0;
  for (let i = 0; i < 20; i++) {
    const bidPrice = basePrice - (Math.random() * 0.5) - (i * 0.2);
    const askPrice = basePrice + (Math.random() * 0.5) + (i * 0.2);
    const bidQty = Math.random() * 100 + 10;
    const askQty = Math.random() * 100 + 10;
    totalBid += bidQty;
    totalAsk += askQty;
    bids.push({ price: bidPrice, quantity: bidQty, total: totalBid });
    asks.push({ price: askPrice, quantity: askQty, total: totalAsk });
  }
  return { symbol: "BSV-USDT", bids: bids.sort((a, b) => b.price - a.price), asks: asks.sort((a, b) => a.price - b.price), lastUpdateTime: new Date().toISOString() };
};

export const generateMockTrades = (basePrice: number): Trade[] => {
  return Array.from({ length: 30 }).map((_, i) => ({
    id: `trade-${i}`,
    symbol: "BSV-USDT",
    side: (Math.random() > 0.5 ? "buy" : "sell") as "buy" | "sell",
    price: basePrice + (Math.random() > 0.5 ? 1 : -1) * Math.random() * 0.5,
    quantity: Math.random() * 50 + 1,
    total: 0,
    fee: 0.1,
    feeAsset: "USDT",
    timestamp: new Date(Date.now() - i * 5000).toISOString(),
    txid: `0x${Math.random().toString(16).slice(2, 66)}`
  })).map(t => ({ ...t, total: t.price * t.quantity }));
};

export const MOCK_PORTFOLIO: any = {
  totalValue: 12450.82,
  totalPnl: 1230.45,
  totalPnlPercent: 10.97,
  assets: [
    { asset: "USDT", free: 5200.00, locked: 0, total: 5200.00, usdValue: 5200.00, pnl: 0, pnlPercent: 0 },
    { asset: "BSV",  free: 80.5,   locked: 2.0, total: 82.5,  usdValue: 4574.25, pnl: 420.0, pnlPercent: 10.1 },
    { asset: "BTC",  free: 0.025,  locked: 0,   total: 0.025, usdValue: 1707.75, pnl: 185.5, pnlPercent: 12.2 },
    { asset: "ETH",  free: 0.25,   locked: 0,   total: 0.25,  usdValue: 853.75,  pnl: 62.1,  pnlPercent: 7.8 },
    { asset: "SOL",  free: 1.5,    locked: 0,   total: 1.5,   usdValue: 222.75,  pnl: 14.8,  pnlPercent: 7.1 },
  ],
  openOrders: [],
  recentTrades: [],
};

export const generateMockCandles = (basePrice: number): Candle[] => {
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: 100 }).map((_, i) => {
    const open = currentPrice;
    const close = currentPrice + (Math.random() - 0.5) * 2;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    const volume = Math.random() * 1000;
    currentPrice = close;
    return { time: now - (100 - i) * 3600, open, high, low, close, volume };
  });
};
