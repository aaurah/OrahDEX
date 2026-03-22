import { Router } from "express";

const router = Router();

// ── Seed data for all non-crypto asset classes ────────────────────────────────
// Prices reflect approximate values as of early 2026 and are updated with tiny
// random walk every 30 s so the UI shows live-feeling data without real feeds.

interface GlobalMarket {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  category: "stocks" | "indices" | "forex" | "commodities";
  lastPrice: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  description: string;
}

const SEED: GlobalMarket[] = [
  // ── STOCKS ──
  { symbol:"AAPL/USD",  baseAsset:"AAPL",  quoteAsset:"USD", category:"stocks",      lastPrice:212.50,   priceChangePercent24h: 0.82, high24h:215.20,   low24h:210.80,   volume24h:4_200_000_000, description:"Apple Inc." },
  { symbol:"TSLA/USD",  baseAsset:"TSLA",  quoteAsset:"USD", category:"stocks",      lastPrice:262.10,   priceChangePercent24h:-1.34, high24h:268.40,   low24h:259.60,   volume24h:3_800_000_000, description:"Tesla Inc." },
  { symbol:"NVDA/USD",  baseAsset:"NVDA",  quoteAsset:"USD", category:"stocks",      lastPrice:891.40,   priceChangePercent24h: 2.17, high24h:905.00,   low24h:875.20,   volume24h:7_500_000_000, description:"NVIDIA Corp." },
  { symbol:"MSFT/USD",  baseAsset:"MSFT",  quoteAsset:"USD", category:"stocks",      lastPrice:418.70,   priceChangePercent24h: 0.45, high24h:422.30,   low24h:415.10,   volume24h:2_900_000_000, description:"Microsoft Corp." },
  { symbol:"AMZN/USD",  baseAsset:"AMZN",  quoteAsset:"USD", category:"stocks",      lastPrice:223.80,   priceChangePercent24h: 1.09, high24h:226.50,   low24h:220.40,   volume24h:2_100_000_000, description:"Amazon.com Inc." },
  { symbol:"GOOGL/USD", baseAsset:"GOOGL", quoteAsset:"USD", category:"stocks",      lastPrice:175.60,   priceChangePercent24h:-0.23, high24h:177.80,   low24h:174.20,   volume24h:1_800_000_000, description:"Alphabet Inc." },
  { symbol:"META/USD",  baseAsset:"META",  quoteAsset:"USD", category:"stocks",      lastPrice:594.20,   priceChangePercent24h: 1.65, high24h:600.80,   low24h:588.40,   volume24h:3_200_000_000, description:"Meta Platforms" },
  { symbol:"NFLX/USD",  baseAsset:"NFLX",  quoteAsset:"USD", category:"stocks",      lastPrice:986.50,   priceChangePercent24h:-0.71, high24h:995.30,   low24h:980.20,   volume24h:1_100_000_000, description:"Netflix Inc." },
  { symbol:"AMD/USD",   baseAsset:"AMD",   quoteAsset:"USD", category:"stocks",      lastPrice:118.40,   priceChangePercent24h: 0.98, high24h:121.80,   low24h:116.20,   volume24h:1_500_000_000, description:"Advanced Micro Devices" },
  { symbol:"INTC/USD",  baseAsset:"INTC",  quoteAsset:"USD", category:"stocks",      lastPrice:21.80,    priceChangePercent24h:-2.14, high24h:22.60,    low24h:21.40,    volume24h:900_000_000,  description:"Intel Corp." },
  // ── INDICES ──
  { symbol:"SPX/USD",   baseAsset:"SPX",   quoteAsset:"USD", category:"indices",     lastPrice:5720.40,  priceChangePercent24h: 0.34, high24h:5745.80,  low24h:5698.20,  volume24h:28_000_000_000, description:"S&P 500" },
  { symbol:"NDX/USD",   baseAsset:"NDX",   quoteAsset:"USD", category:"indices",     lastPrice:20145.60, priceChangePercent24h: 0.62, high24h:20280.40, low24h:20050.80, volume24h:18_000_000_000, description:"NASDAQ 100" },
  { symbol:"DJI/USD",   baseAsset:"DJI",   quoteAsset:"USD", category:"indices",     lastPrice:42680.20, priceChangePercent24h: 0.18, high24h:42850.60, low24h:42510.40, volume24h:12_000_000_000, description:"Dow Jones Industrial" },
  { symbol:"FTSE/USD",  baseAsset:"FTSE",  quoteAsset:"USD", category:"indices",     lastPrice:8215.80,  priceChangePercent24h:-0.27, high24h:8248.60,  low24h:8194.20,  volume24h:5_500_000_000, description:"FTSE 100 (UK)" },
  { symbol:"DAX/USD",   baseAsset:"DAX",   quoteAsset:"USD", category:"indices",     lastPrice:22840.50, priceChangePercent24h: 0.51, high24h:22980.60, low24h:22710.40, volume24h:7_800_000_000, description:"DAX 40 (Germany)" },
  { symbol:"NKY/USD",   baseAsset:"NKY",   quoteAsset:"USD", category:"indices",     lastPrice:38620.40, priceChangePercent24h:-0.44, high24h:38850.20, low24h:38480.60, volume24h:9_200_000_000, description:"Nikkei 225 (Japan)" },
  // ── FOREX ──
  { symbol:"EUR/USD",   baseAsset:"EUR",   quoteAsset:"USD", category:"forex",       lastPrice:1.0872,   priceChangePercent24h: 0.14, high24h:1.0896,   low24h:1.0848,   volume24h:15_000_000_000, description:"Euro / US Dollar" },
  { symbol:"GBP/USD",   baseAsset:"GBP",   quoteAsset:"USD", category:"forex",       lastPrice:1.2948,   priceChangePercent24h: 0.08, high24h:1.2972,   low24h:1.2918,   volume24h:8_500_000_000, description:"British Pound / US Dollar" },
  { symbol:"USD/JPY",   baseAsset:"USD",   quoteAsset:"JPY", category:"forex",       lastPrice:149.48,   priceChangePercent24h:-0.22, high24h:150.12,   low24h:149.04,   volume24h:11_000_000_000, description:"US Dollar / Japanese Yen" },
  { symbol:"AUD/USD",   baseAsset:"AUD",   quoteAsset:"USD", category:"forex",       lastPrice:0.6582,   priceChangePercent24h: 0.31, high24h:0.6610,   low24h:0.6558,   volume24h:4_200_000_000, description:"Australian Dollar / US Dollar" },
  { symbol:"USD/CAD",   baseAsset:"USD",   quoteAsset:"CAD", category:"forex",       lastPrice:1.3542,   priceChangePercent24h:-0.11, high24h:1.3568,   low24h:1.3518,   volume24h:3_800_000_000, description:"US Dollar / Canadian Dollar" },
  { symbol:"USD/CHF",   baseAsset:"USD",   quoteAsset:"CHF", category:"forex",       lastPrice:0.8882,   priceChangePercent24h: 0.05, high24h:0.8902,   low24h:0.8864,   volume24h:3_200_000_000, description:"US Dollar / Swiss Franc" },
  { symbol:"NZD/USD",   baseAsset:"NZD",   quoteAsset:"USD", category:"forex",       lastPrice:0.6124,   priceChangePercent24h: 0.19, high24h:0.6148,   low24h:0.6102,   volume24h:1_800_000_000, description:"New Zealand Dollar / US Dollar" },
  { symbol:"EUR/GBP",   baseAsset:"EUR",   quoteAsset:"GBP", category:"forex",       lastPrice:0.8398,   priceChangePercent24h: 0.06, high24h:0.8418,   low24h:0.8378,   volume24h:2_400_000_000, description:"Euro / British Pound" },
  // ── COMMODITIES ──
  { symbol:"XAU/USD",   baseAsset:"XAU",   quoteAsset:"USD", category:"commodities", lastPrice:3024.50,  priceChangePercent24h: 0.42, high24h:3048.80,  low24h:3002.20,  volume24h:8_600_000_000, description:"Gold (Troy Oz)" },
  { symbol:"XAG/USD",   baseAsset:"XAG",   quoteAsset:"USD", category:"commodities", lastPrice:33.52,    priceChangePercent24h: 0.78, high24h:33.96,    low24h:33.12,    volume24h:2_100_000_000, description:"Silver (Troy Oz)" },
  { symbol:"OIL/USD",   baseAsset:"OIL",   quoteAsset:"USD", category:"commodities", lastPrice:74.18,    priceChangePercent24h:-0.64, high24h:75.20,    low24h:73.40,    volume24h:3_800_000_000, description:"WTI Crude Oil (Barrel)" },
  { symbol:"BRENT/USD", baseAsset:"BRENT", quoteAsset:"USD", category:"commodities", lastPrice:77.84,    priceChangePercent24h:-0.51, high24h:78.90,    low24h:77.10,    volume24h:4_200_000_000, description:"Brent Crude (Barrel)" },
  { symbol:"NG/USD",    baseAsset:"NG",    quoteAsset:"USD", category:"commodities", lastPrice:2.108,    priceChangePercent24h: 1.24, high24h:2.142,    low24h:2.076,    volume24h:820_000_000,  description:"Natural Gas (MMBtu)" },
  { symbol:"XPT/USD",   baseAsset:"XPT",   quoteAsset:"USD", category:"commodities", lastPrice:980.40,   priceChangePercent24h:-0.18, high24h:988.60,   low24h:972.80,   volume24h:480_000_000,  description:"Platinum (Troy Oz)" },
  { symbol:"WHEAT/USD", baseAsset:"WHEAT", quoteAsset:"USD", category:"commodities", lastPrice:5.82,     priceChangePercent24h:-1.02, high24h:5.96,     low24h:5.74,     volume24h:350_000_000,  description:"Wheat (Bushel)" },
  { symbol:"CORN/USD",  baseAsset:"CORN",  quoteAsset:"USD", category:"commodities", lastPrice:4.58,     priceChangePercent24h: 0.44, high24h:4.64,     low24h:4.52,     volume24h:280_000_000,  description:"Corn (Bushel)" },
];

// Deep clone to work on
const markets: GlobalMarket[] = SEED.map(m => ({ ...m }));

// Simulate live price movements every 15 seconds
setInterval(() => {
  for (const m of markets) {
    const move = m.lastPrice * (Math.random() * 0.002 - 0.001); // ±0.1% random walk
    m.lastPrice = parseFloat((m.lastPrice + move).toFixed(m.lastPrice > 100 ? 2 : m.lastPrice > 1 ? 4 : 6));
    const origSeed = SEED.find(s => s.symbol === m.symbol)!;
    m.high24h = Math.max(m.high24h, m.lastPrice);
    m.low24h = Math.min(m.low24h, m.lastPrice);
    m.priceChangePercent24h = parseFloat(((m.lastPrice - origSeed.lastPrice) / origSeed.lastPrice * 100).toFixed(2));
  }
}, 15_000);

// ── GET /api/global-markets ───────────────────────────────────────────────────
router.get("/", (_req, res) => {
  res.json(markets);
});

// ── GET /api/global-markets/:symbol ──────────────────────────────────────────
router.get("/:symbol", (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const market = markets.find(m => m.symbol === symbol);
  if (!market) return res.status(404).json({ error: "Market not found" });
  res.json(market);
});

export default router;
