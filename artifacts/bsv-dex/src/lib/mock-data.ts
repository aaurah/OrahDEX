import type { Market, Ticker, OrderBook, Trade, Order, Portfolio, AssetBalance, Candle } from "@workspace/api-client-react";

function spot(base: string, quote: string, price: number, chg: number, vol: number, cap?: number): any {
  return {
    symbol: `${base}-${quote}`, baseAsset: base, quoteAsset: quote,
    lastPrice: price, priceChange24h: price * chg / 100, priceChangePercent24h: chg,
    volume24h: vol, high24h: price * 1.02, low24h: price * 0.98,
    marketCap: cap, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001,
    minOrderSize: 0.00000001, maxOrderSize: 1000000, tickSize: 0.01,
  };
}

function fut(base: string, price: number, chg: number, vol: number): any {
  return {
    symbol: `${base}-USDT-PERP`, baseAsset: base, quoteAsset: "USDT",
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
  bsvPair("BTC",  68310,  -1.85, 2_450_000_000),
  bsvPair("ETH",  3415,    1.32,  950_000_000),
  bsvPair("SOL",  148.5,   3.21,  420_000_000),
  bsvPair("XRP",  0.5242, -0.64,  110_000_000),
  bsvPair("BNB",  392,     0.88,  320_000_000),
  bsvPair("ADA",  0.4421, -2.10,   45_000_000),
  bsvPair("DOGE", 0.1185,  5.42,   78_000_000),
  bsvPair("DOT",  6.82,   -1.20,   38_000_000),
  bsvPair("AVAX", 36.4,    2.15,   62_000_000),
  bsvPair("MATIC",0.718,  -0.92,   54_000_000),
  bsvPair("LINK", 14.52,   3.64,   48_000_000),
  bsvPair("UNI",  9.84,    1.55,   22_000_000),
  bsvPair("ATOM", 8.42,   -0.78,   18_000_000),
  bsvPair("LTC",  78.2,    0.45,   32_000_000),
  bsvPair("BCH",  384,     1.10,   28_000_000),
  bsvPair("TRX",  0.1205,  2.31,   35_000_000),
  bsvPair("NEAR", 6.55,    4.82,   24_000_000),
  bsvPair("PEPE", 0.0000082, 8.5, 185_000_000),
  bsvPair("SHIB", 0.0000235, 6.1,  92_000_000),
  bsvPair("APT",  10.5,    5.21,   18_000_000),
  bsvPair("ARB",  1.12,    2.85,   28_000_000),
  bsvPair("OP",   2.41,    3.10,   22_000_000),
  bsvPair("SUI",  1.22,    6.45,   35_000_000),
  bsvPair("INJ",  28.4,    4.21,   15_000_000),
  bsvPair("FIL",  5.82,   -2.18,   10_000_000),
  bsvPair("ALGO", 0.182,  -0.95,    8_000_000),
  bsvPair("XLM",  0.112,   1.42,   12_000_000),
  bsvPair("HBAR", 0.0952,  2.18,    9_000_000),
  bsvPair("FTM",  0.652,   3.28,   18_000_000),
  bsvPair("ZEC",  28.2,    0.85,    3_000_000),
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

// ─── ETH PAIRS ────────────────────────────────────────────────────────────────
const ETH_PRICE = 3415;
function ethPair(base: string, usdtPrice: number, chg: number, vol: number): any {
  const p = usdtPrice / ETH_PRICE;
  return spot(base, "ETH", p, chg, vol / ETH_PRICE);
}
export const ETH_MARKETS: any[] = [
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

export const SOL_MARKETS: any[] = [
  spot("SOL",   "USDT", 148.5,  3.21, 420_000_000),
  spot("BONK",  "USDT", 0.0000248, 12.5, 185_000_000),
  spot("WIF",   "USDT", 0.892,  8.42,  82_000_000),
  spot("JUP",   "USDT", 0.842, -2.18,  48_000_000),
  spot("PYTH",  "USDT", 0.382,  4.85,  28_000_000),
  spot("ORCA",  "USDT", 2.84,   3.42,  12_000_000),
  spot("JTO",   "USDT", 2.42,  -1.82,  18_000_000),
  spot("BOME",  "USDT", 0.00842, 18.5, 92_000_000),
  spot("MEW",   "USDT", 0.00582, 9.21, 45_000_000),
  spot("POPCAT","USDT", 0.842,  15.42, 62_000_000),
  spot("SLERF", "USDT", 0.00482, 4.82, 12_000_000),
  spot("GRASS", "USDT", 0.282,   8.70, 18_000_000),
  spot("W",     "USDT", 0.242,  -3.42, 28_000_000),
  spot("ZEUS",  "USDT", 0.182,   6.15,  8_000_000),
];

export const MEME_MARKETS: any[] = [
  spot("DOGE",   "USDT", 0.1185,  5.42,  78_000_000),
  spot("SHIB",   "USDT", 0.0000235, 6.1, 92_000_000),
  spot("PEPE",   "USDT", 0.0000082, 8.5, 185_000_000),
  spot("BONK",   "USDT", 0.0000248, 12.5, 185_000_000),
  spot("WIF",    "USDT", 0.892,   8.42,  82_000_000),
  spot("FLOKI",  "USDT", 0.000182, 9.84, 48_000_000),
  spot("BABYDOGE","USDT",0.00000000242, 14.5, 12_000_000),
  spot("COQ",    "USDT", 0.00000012, 22.4, 8_000_000),
  spot("BRETT",  "USDT", 0.082,   18.42, 42_000_000),
  spot("MOG",    "USDT", 0.00000082, 11.5, 22_000_000),
  spot("TURBO",  "USDT", 0.00842, 15.84, 18_000_000),
  spot("TRUMP",  "USDT", 8.42,    -4.21, 182_000_000),
  spot("FWOG",   "USDT", 0.0842,   7.45, 12_000_000),
  spot("POPCAT", "USDT", 0.842,   15.42, 62_000_000),
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

export const MOCK_TICKER: Record<string, any> = {
  "BSV-USDT": { symbol: "BSV-USDT", lastPrice: 55.42, bidPrice: 55.40, askPrice: 55.44, openPrice: 53.10, highPrice: 56.50, lowPrice: 52.80, volume: 18_500_000, quoteVolume: 1_025_000_000, priceChange: 2.32, priceChangePercent: 4.41, timestamp: new Date().toISOString() }
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
    side: Math.random() > 0.5 ? "buy" : "sell",
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
