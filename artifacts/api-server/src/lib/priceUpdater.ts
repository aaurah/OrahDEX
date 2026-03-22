import { db } from "@workspace/db";
import { marketsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const COINGECKO_IDS: Record<string, string> = {
  BSV: "bitcoin-sv",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  ADA: "cardano",
};

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
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return res.json() as Promise<Record<string, CoinGeckoPrice>>;
}

export async function updateMarketPrices() {
  try {
    const prices = await fetchLivePrices();
    const markets = await db.select().from(marketsTable);

    for (const market of markets) {
      const cgId = COINGECKO_IDS[market.baseAsset];
      if (!cgId) continue;

      const data = prices[cgId];
      if (!data || !data.usd) continue;

      const lastPrice = data.usd;
      const changePercent = data.usd_24h_change ?? 0;
      const change = (lastPrice / (1 + changePercent / 100)) * (changePercent / 100);
      const openPrice = lastPrice - change;
      const volatility = Math.abs(change) * 1.5 || lastPrice * 0.01;
      const high24h = openPrice + volatility;
      const low24h = openPrice - volatility;

      const isFutures = market.type === "futures";
      const futuresBasis = isFutures ? lastPrice * (1 - 0.0001) : lastPrice;

      await db
        .update(marketsTable)
        .set({
          lastPrice: futuresBasis.toFixed(8),
          priceChange24h: change.toFixed(8),
          priceChangePercent24h: changePercent.toFixed(4),
          volume24h: (data.usd_24h_vol / (isFutures ? 10 : 1)).toFixed(2),
          high24h: high24h.toFixed(8),
          low24h: Math.max(low24h, 0.00000001).toFixed(8),
          marketCap: data.usd_market_cap ? data.usd_market_cap.toFixed(2) : null,
        })
        .where(eq(marketsTable.symbol, market.symbol));
    }

    logger.info("Market prices updated from CoinGecko");
  } catch (err) {
    logger.warn({ err }, "Failed to update prices from CoinGecko");
  }
}

let updateInterval: NodeJS.Timeout | null = null;

export function startPriceUpdater() {
  updateMarketPrices();
  updateInterval = setInterval(updateMarketPrices, 60_000);
  logger.info("Live price updater started (interval: 60s)");
}

export function stopPriceUpdater() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}
