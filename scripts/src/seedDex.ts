import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";

const SPOT_MARKETS = [
  { symbol: "BSV/USDT", base: "BSV", quote: "USDT", price: 55.42, change: 2.34, changeP: 4.41, vol: 18500000, high: 57.10, low: 53.20, mcap: 1080000000 },
  { symbol: "BTC/USDT", base: "BTC", quote: "USDT", price: 65234.50, change: -1230.0, changeP: -1.85, vol: 1240000000, high: 66800.00, low: 64200.00, mcap: 1280000000000 },
  { symbol: "ETH/USDT", base: "ETH", quote: "USDT", price: 3198.70, change: 48.20, changeP: 1.53, vol: 420000000, high: 3250.00, low: 3120.00, mcap: 384000000000 },
  { symbol: "TOKEN/USDT", base: "TOKEN", quote: "USDT", price: 0.1543, change: 0.0083, changeP: 5.69, vol: 2300000, high: 0.162, low: 0.144, mcap: 154300000 },
  { symbol: "BSV/BTC", base: "BSV", quote: "BTC", price: 0.00085, change: 0.000045, changeP: 5.59, vol: 340, high: 0.00088, low: 0.00082, mcap: undefined },
  { symbol: "TOKEN/BSV", base: "TOKEN", quote: "BSV", price: 0.00278, change: 0.00014, changeP: 5.31, vol: 125000, high: 0.00290, low: 0.00265, mcap: undefined },
  { symbol: "SOL/USDT", base: "SOL", quote: "USDT", price: 148.32, change: -3.12, changeP: -2.06, vol: 58000000, high: 154.00, low: 145.20, mcap: 68000000000 },
  { symbol: "XRP/USDT", base: "XRP", quote: "USDT", price: 0.5234, change: 0.0187, changeP: 3.70, vol: 95000000, high: 0.535, low: 0.502, mcap: 29000000000 },
  { symbol: "BNB/USDT", base: "BNB", quote: "USDT", price: 412.80, change: 8.30, changeP: 2.05, vol: 120000000, high: 420.00, low: 400.00, mcap: 62000000000 },
  { symbol: "ADA/USDT", base: "ADA", quote: "USDT", price: 0.4521, change: -0.0123, changeP: -2.65, vol: 28000000, high: 0.470, low: 0.440, mcap: 16000000000 },
];

const FUTURES_MARKETS = [
  { symbol: "BSV/USDT-PERP", base: "BSV", quote: "USDT", price: 55.38, change: 2.30, changeP: 4.33, vol: 45000000, high: 57.05, low: 53.15, mcap: undefined },
  { symbol: "BTC/USDT-PERP", base: "BTC", quote: "USDT", price: 65220.00, change: -1240.00, changeP: -1.87, vol: 3800000000, high: 66850.00, low: 64150.00, mcap: undefined },
  { symbol: "ETH/USDT-PERP", base: "ETH", quote: "USDT", price: 3196.50, change: 46.80, changeP: 1.49, vol: 1100000000, high: 3248.00, low: 3118.00, mcap: undefined },
];

async function seed() {
  console.log("Seeding DEX markets...");

  const allMarkets = [
    ...SPOT_MARKETS.map((m) => ({
      symbol: m.symbol,
      baseAsset: m.base,
      quoteAsset: m.quote,
      lastPrice: m.price.toString(),
      priceChange24h: m.change.toString(),
      priceChangePercent24h: m.changeP.toString(),
      volume24h: m.vol.toString(),
      high24h: m.high.toString(),
      low24h: m.low.toString(),
      marketCap: m.mcap?.toString() || null,
      status: "active",
      type: "spot",
      minOrderSize: "0.00000001",
      maxOrderSize: "1000000",
      tickSize: m.price > 100 ? "0.01" : m.price > 1 ? "0.0001" : "0.00000001",
      makerFee: "0.001",
      takerFee: "0.001",
    })),
    ...FUTURES_MARKETS.map((m) => ({
      symbol: m.symbol,
      baseAsset: m.base,
      quoteAsset: m.quote,
      lastPrice: m.price.toString(),
      priceChange24h: m.change.toString(),
      priceChangePercent24h: m.changeP.toString(),
      volume24h: m.vol.toString(),
      high24h: m.high.toString(),
      low24h: m.low.toString(),
      marketCap: null,
      status: "active",
      type: "futures",
      minOrderSize: "0.001",
      maxOrderSize: "10000",
      tickSize: m.price > 100 ? "0.01" : "0.0001",
      makerFee: "0.0002",
      takerFee: "0.0005",
    })),
  ];

  await db.delete(marketsTable);
  await db.insert(marketsTable).values(allMarkets);

  console.log(`Seeded ${allMarkets.length} markets`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
