import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";

const SPOT_MARKETS = [
  { symbol: "BSV/USDT",  base: "BSV",  quote: "USDT", price: 55.42,     change: 0, changeP: 0, vol: 18500000,    high: 55.42,     low: 55.42,    mcap: 1080000000 },
  { symbol: "BTC/USDT",  base: "BTC",  quote: "USDT", price: 65234.50,  change: 0, changeP: 0, vol: 1240000000,  high: 65234.50,  low: 65234.50, mcap: 1280000000000 },
  { symbol: "ETH/USDT",  base: "ETH",  quote: "USDT", price: 3198.70,   change: 0, changeP: 0, vol: 420000000,   high: 3198.70,   low: 3198.70,  mcap: 384000000000 },
  { symbol: "SOL/USDT",  base: "SOL",  quote: "USDT", price: 148.32,    change: 0, changeP: 0, vol: 58000000,    high: 148.32,    low: 148.32,   mcap: 68000000000 },
  { symbol: "XRP/USDT",  base: "XRP",  quote: "USDT", price: 0.5234,    change: 0, changeP: 0, vol: 95000000,    high: 0.5234,    low: 0.5234,   mcap: 29000000000 },
  { symbol: "BNB/USDT",  base: "BNB",  quote: "USDT", price: 412.80,    change: 0, changeP: 0, vol: 120000000,   high: 412.80,    low: 412.80,   mcap: 62000000000 },
  { symbol: "ADA/USDT",  base: "ADA",  quote: "USDT", price: 0.4521,    change: 0, changeP: 0, vol: 28000000,    high: 0.4521,    low: 0.4521,   mcap: 16000000000 },
];

const FUTURES_MARKETS = [
  { symbol: "BSV/USDT-PERP", base: "BSV", quote: "USDT", price: 55.38,    change: 0, changeP: 0, vol: 45000000,    high: 55.38,    low: 55.38 },
  { symbol: "BTC/USDT-PERP", base: "BTC", quote: "USDT", price: 65220.00, change: 0, changeP: 0, vol: 3800000000,  high: 65220.00, low: 65220.00 },
  { symbol: "ETH/USDT-PERP", base: "ETH", quote: "USDT", price: 3196.50,  change: 0, changeP: 0, vol: 1100000000,  high: 3196.50,  low: 3196.50 },
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

  console.log(`Seeded ${allMarkets.length} markets (TOKEN/BSV/BTC fake pairs removed)`);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
