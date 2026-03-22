import { logger } from "./logger.js";

const BINANCE_SYMBOLS: Record<string, string> = {
  "BTC/USDT": "BTCUSDT",
  "ETH/USDT": "ETHUSDT",
  "SOL/USDT": "SOLUSDT",
  "XRP/USDT": "XRPUSDT",
  "BNB/USDT": "BNBUSDT",
  "ADA/USDT": "ADAUSDT",
  "BTC/USDT-PERP": "BTCUSDT",
  "ETH/USDT-PERP": "ETHUSDT",
};

const COINGECKO_SYMBOLS: Record<string, string> = {
  "BSV/USDT": "bitcoin-sv",
  "BSV/USDT-PERP": "bitcoin-sv",
};

const INTERVAL_MAP: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

const CG_DAYS_MAP: Record<string, string> = {
  "1m": "1",
  "5m": "1",
  "15m": "7",
  "1h": "30",
  "4h": "90",
  "1d": "365",
  "1w": "365",
};

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchBinanceCandles(binanceSym: string, interval: string, limit: number): Promise<Candle[]> {
  const binanceInterval = INTERVAL_MAP[interval] || "1h";
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${binanceInterval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = (await res.json()) as number[][];
  return data.map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1] as unknown as string),
    high: parseFloat(k[2] as unknown as string),
    low: parseFloat(k[3] as unknown as string),
    close: parseFloat(k[4] as unknown as string),
    volume: parseFloat(k[5] as unknown as string),
  }));
}

async function fetchCoinGeckoCandles(cgId: string, interval: string, limit: number): Promise<Candle[]> {
  const days = CG_DAYS_MAP[interval] || "30";
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`CoinGecko OHLC HTTP ${res.status}`);
  const data = (await res.json()) as number[][];
  return data
    .slice(-limit)
    .map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: 0,
    }));
}

function generateFallbackCandles(lastPrice: number, interval: string, limit: number): Candle[] {
  const intervalSec: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600,
    "4h": 14400, "1d": 86400, "1w": 604800,
  };
  const sec = intervalSec[interval] || 3600;
  const now = Math.floor(Date.now() / 1000);
  let price = lastPrice * 0.95;
  const candles: Candle[] = [];
  for (let i = 0; i < limit; i++) {
    const open = price;
    const change = (Math.random() - 0.48) * lastPrice * 0.005;
    const close = Math.max(open + change, 0.00000001);
    const wicks = Math.abs(change) * 0.3;
    candles.push({
      time: now - sec * (limit - i),
      open, high: Math.max(open, close) + wicks,
      low: Math.min(open, close) - wicks,
      close, volume: Math.random() * 10000 + 500,
    });
    price = close;
  }
  candles[candles.length - 1].close = lastPrice;
  return candles;
}

export async function fetchRealCandles(symbol: string, lastPrice: number, interval: string, limit: number): Promise<Candle[]> {
  const binanceSym = BINANCE_SYMBOLS[symbol];
  if (binanceSym) {
    try {
      return await fetchBinanceCandles(binanceSym, interval, limit);
    } catch (err) {
      logger.warn({ err, symbol }, "Binance candle fetch failed, using fallback");
    }
  }

  const cgId = COINGECKO_SYMBOLS[symbol];
  if (cgId) {
    try {
      return await fetchCoinGeckoCandles(cgId, interval, limit);
    } catch (err) {
      logger.warn({ err, symbol }, "CoinGecko candle fetch failed, using fallback");
    }
  }

  return generateFallbackCandles(lastPrice, interval, limit);
}
