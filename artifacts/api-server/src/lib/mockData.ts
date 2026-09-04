import crypto from "crypto";

function randomId() {
  return crypto.randomUUID();
}

function randomHex(len: number) {
  return crypto.randomBytes(len / 2).toString("hex");
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1));
}

interface MarketRow {
  symbol: string;
  lastPrice: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  priceChange24h: number;
  priceChangePercent24h: number;
}

export function generateTicker(market: MarketRow) {
  const spread = market.lastPrice * 0.0001;
  // Deterministic per-symbol funding rate — seeded by symbol hash so each
  // perpetual has a unique but stable rate. Range: -0.0200% … +0.0200% (8-hour).
  const symHash = market.symbol.split("").reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
  const fundingBps = ((symHash % 41) - 20) / 10000; // -0.0020 … +0.0020
  const indexPrice = parseFloat(market.lastPrice.toFixed(8));
  const markPrice  = parseFloat((indexPrice * (1 + fundingBps)).toFixed(8));
  return {
    symbol: market.symbol,
    lastPrice: market.lastPrice,
    bidPrice: parseFloat((market.lastPrice - spread / 2).toFixed(8)),
    askPrice: parseFloat((market.lastPrice + spread / 2).toFixed(8)),
    openPrice: parseFloat((market.lastPrice - market.priceChange24h).toFixed(8)),
    highPrice: market.high24h,
    lowPrice: market.low24h,
    high24h: market.high24h,
    low24h: market.low24h,
    volume24h: market.volume24h,
    volume: market.volume24h,
    quoteVolume: market.volume24h * market.lastPrice,
    priceChange: market.priceChange24h,
    priceChangePercent: market.priceChangePercent24h,
    // Perpetual futures fields
    markPrice,
    indexPrice,
    fundingRate: fundingBps,       // 8-hourly rate, e.g. 0.0001 = 0.01%
    fundingRatePct: parseFloat((fundingBps * 100).toFixed(4)), // in %
    openInterest: parseFloat((market.volume24h * market.lastPrice * 0.15).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
}

function intervalToSeconds(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
  };
  return map[interval] || 3600;
}

/** LCG seeded PRNG — stable per (price+timeBucket) so charts don't jump on re-fetch. */
function seededRng(seed: number) {
  let s = (seed | 0) >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Per-candle log-return volatility scaled to ~80% annualised. */
function candleVol(intervalSec: number): number {
  return 0.80 * Math.sqrt(intervalSec / (365 * 24 * 3600));
}

export function generateCandles(lastPrice: number, interval: string, limit: number) {
  const intervalSec = intervalToSeconds(interval);
  const now         = Math.floor(Date.now() / 1000);
  const vol = candleVol(intervalSec);

  // Seed off time-bucket so the series is stable across re-renders in the same minute.
  const rng = seededRng(Math.floor(now / 60) ^ (lastPrice * 1000 | 0));

  // Pure GBM backward walk — no drift, just noise.  The last close is always
  // exactly lastPrice with no snap, and the series looks genuinely random.
  const logC = new Array<number>(limit);
  logC[limit - 1] = Math.log(Math.max(lastPrice, 1e-12));
  for (let i = limit - 2; i >= 0; i--) {
    logC[i] = logC[i + 1] + (rng() * 2 - 1) * vol;
  }

  return logC.map((lc, i) => {
    const close = Math.exp(lc);
    const open  = i === 0
      ? close * Math.exp((rng() - 0.5) * vol * 0.5)
      : Math.exp(logC[i - 1]);

    const body    = Math.abs(close - open);
    const minWick = close * 0.0008;
    const high    = Math.max(open, close) + Math.max(body * (0.4 + rng() * 1.2), minWick);
    const low     = Math.min(open, close) - Math.max(body * (0.4 + rng() * 1.2), minWick);
    const volume  = Math.exp(Math.log(500 * (intervalSec / 3600)) + (rng() - 0.5) * 1.2);

    return { time: now - intervalSec * (limit - i), open, high, low, close, volume };
  });
}

export function generateOrderBook(symbol: string, lastPrice: number, depth: number) {
  const bids = [];
  const asks = [];
  let bidPrice = lastPrice * (1 - 0.0001);
  let askPrice = lastPrice * (1 + 0.0001);
  let bidTotal = 0;
  let askTotal = 0;

  for (let i = 0; i < depth; i++) {
    const bidQty = randomBetween(0.1, 100) * (1 + i * 0.1);
    const askQty = randomBetween(0.1, 100) * (1 + i * 0.1);
    bidTotal += bidQty;
    askTotal += askQty;

    bids.push({
      price: parseFloat(bidPrice.toFixed(8)),
      quantity: parseFloat(bidQty.toFixed(8)),
      total: parseFloat(bidTotal.toFixed(8)),
    });
    asks.push({
      price: parseFloat(askPrice.toFixed(8)),
      quantity: parseFloat(askQty.toFixed(8)),
      total: parseFloat(askTotal.toFixed(8)),
    });

    bidPrice *= 1 - randomBetween(0.0001, 0.0005);
    askPrice *= 1 + randomBetween(0.0001, 0.0005);
  }

  return {
    symbol,
    bids,
    asks,
    lastUpdateTime: new Date().toISOString(),
  };
}

export function generateRecentTrades(symbol: string, lastPrice: number, limit: number) {
  const trades = [];
  let price = lastPrice;
  const now = Date.now();

  for (let i = 0; i < limit; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.001);
    const side = Math.random() > 0.5 ? "buy" : "sell";
    const qty = randomBetween(0.01, 50);
    const total = price * qty;

    trades.push({
      id: randomId(),
      symbol,
      side,
      price: parseFloat(price.toFixed(8)),
      quantity: parseFloat(qty.toFixed(8)),
      total: parseFloat(total.toFixed(8)),
      fee: parseFloat((total * 0.001).toFixed(8)),
      feeAsset: symbol.split("/")[1] || "USDT",
      timestamp: new Date(now - i * randomInt(1000, 10000)).toISOString(),
      txid: randomHex(64),
    });
  }

  return trades;
}

export function generatePortfolio(walletAddress: string) {
  const assets = [
    { asset: "BSV", amount: randomBetween(1, 100), price: 55.42 },
    { asset: "USDT", amount: randomBetween(100, 10000), price: 1.0 },
    { asset: "BTC", amount: randomBetween(0.001, 0.5), price: 65000 },
    { asset: "ETH", amount: randomBetween(0.1, 5), price: 3200 },
    { asset: "TOKEN", amount: randomBetween(100, 5000), price: 0.15 },
  ];

  const balances = assets.map((a) => {
    const free = a.amount * randomBetween(0.7, 1.0);
    const locked = a.amount - free;
    const valueUSD = a.amount * a.price;
    const pnl24h = valueUSD * randomBetween(-0.08, 0.12);
    return {
      asset: a.asset,
      free: parseFloat(free.toFixed(8)),
      locked: parseFloat(locked.toFixed(8)),
      total: parseFloat(a.amount.toFixed(8)),
      valueUSD: parseFloat(valueUSD.toFixed(2)),
      pnl24h: parseFloat(pnl24h.toFixed(2)),
      pnl24hPercent: parseFloat(((pnl24h / valueUSD) * 100).toFixed(2)),
    };
  });

  const totalValueUSD = balances.reduce((s, b) => s + b.valueUSD, 0);
  const totalPnlUSD = balances.reduce((s, b) => s + (b.pnl24h || 0), 0);

  return {
    walletAddress,
    totalValueUSD: parseFloat(totalValueUSD.toFixed(2)),
    totalPnlUSD: parseFloat(totalPnlUSD.toFixed(2)),
    totalPnlPercent: parseFloat(((totalPnlUSD / totalValueUSD) * 100).toFixed(2)),
    balances,
    openOrdersCount: randomInt(0, 8),
    openPositionsCount: randomInt(0, 3),
  };
}

export function generateWalletTransactions(walletAddress: string, limit: number) {
  const types = ["deposit", "withdrawal", "trade", "fee", "funding"] as const;
  const assets = ["BSV", "USDT", "BTC", "ETH"];
  const now = Date.now();
  const txs = [];

  for (let i = 0; i < limit; i++) {
    const type = types[randomInt(0, types.length - 1)];
    const asset = assets[randomInt(0, assets.length - 1)];
    const amount = randomBetween(0.001, 100);
    txs.push({
      txid: randomHex(64),
      type,
      asset,
      amount: parseFloat(amount.toFixed(8)),
      fee: parseFloat((amount * 0.001).toFixed(8)),
      status: "confirmed",
      confirmations: randomInt(1, 100),
      timestamp: new Date(now - i * randomInt(60000, 3600000)).toISOString(),
      blockHeight: randomInt(800000, 900000),
    });
  }
  return txs;
}
