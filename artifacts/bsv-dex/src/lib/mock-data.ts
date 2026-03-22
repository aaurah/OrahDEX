import type { Market, Ticker, OrderBook, Trade, Order, Portfolio, AssetBalance, Candle } from "@workspace/api-client-react";

// Robust mock data fallbacks to ensure the UI looks stunning even without an active backend
export const MOCK_MARKETS: Market[] = [
  { symbol: "BSV-USDT", baseAsset: "BSV", quoteAsset: "USDT", lastPrice: 58.42, priceChange24h: 2.15, priceChangePercent24h: 3.82, volume24h: 12500000, high24h: 60.10, low24h: 55.20, marketCap: 1100000000, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001 },
  { symbol: "BTC-USDT", baseAsset: "BTC", quoteAsset: "USDT", lastPrice: 64230.50, priceChange24h: -1200.50, priceChangePercent24h: -1.83, volume24h: 25000000000, high24h: 66000.00, low24h: 63500.00, marketCap: 1200000000000, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001 },
  { symbol: "ETH-USDT", baseAsset: "ETH", quoteAsset: "USDT", lastPrice: 3450.20, priceChange24h: 45.20, priceChangePercent24h: 1.32, volume24h: 15000000000, high24h: 3500.00, low24h: 3380.00, marketCap: 400000000000, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001 },
  { symbol: "SHIB-BSV", baseAsset: "SHIB", quoteAsset: "BSV", lastPrice: 0.000021, priceChange24h: 0.000002, priceChangePercent24h: 10.5, volume24h: 500000, high24h: 0.000022, low24h: 0.000018, status: "active", type: "spot", makerFee: 0.001, takerFee: 0.001 },
];

export const MOCK_TICKER: Record<string, Ticker> = {
  "BSV-USDT": { symbol: "BSV-USDT", lastPrice: 58.42, bidPrice: 58.40, askPrice: 58.44, openPrice: 56.27, highPrice: 60.10, lowPrice: 55.20, volume: 12500000, quoteVolume: 730000000, priceChange: 2.15, priceChangePercent: 3.82, timestamp: new Date().toISOString() }
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
  
  return { symbol: "BSV-USDT", bids: bids.sort((a,b) => b.price - a.price), asks: asks.sort((a,b) => a.price - b.price), lastUpdateTime: new Date().toISOString() };
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
    
    return {
      time: now - (100 - i) * 3600,
      open, high, low, close, volume
    };
  });
};

export const MOCK_PORTFOLIO: Portfolio = {
  walletAddress: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  totalValueUSD: 14520.50,
  totalPnlUSD: 450.20,
  totalPnlPercent: 3.2,
  openOrdersCount: 2,
  openPositionsCount: 1,
  balances: [
    { asset: "USDT", free: 4520.50, locked: 1000.00, total: 5520.50, valueUSD: 5520.50 },
    { asset: "BSV", free: 150.00, locked: 0, total: 150.00, valueUSD: 8763.00, pnl24h: 215.50, pnl24hPercent: 2.5 },
    { asset: "BTC", free: 0.0035, locked: 0, total: 0.0035, valueUSD: 237.00 }
  ]
};
