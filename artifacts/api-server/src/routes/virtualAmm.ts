/**
 * Genesis Liquidity Engine — Virtual AMM (Linear Bonding Curve)
 *
 * Provides $8,500 USDT of virtual depth for every asset with no real liquidity needed.
 *
 * price(s) = basePrice + slope × s
 * buyCost(n, s)    = (price(s) + price(s+n)) × n / 2
 * sellPayout(n, s) = (price(s) + price(s-n)) × n / 2
 *
 * Calibration: slope = 0.01 × spotPrice² / 8500
 * → buying $8,500 worth moves price by ~1%
 */
import { Router } from "express";
import { logger } from "../lib/logger.js";

const GENESIS_DEPTH_USD = 8_500; // virtual depth target
const SWAP_FEE = 0.003;          // 0.3% total fee
const LP_FEE_SHARE = 5 / 6;
const PROTOCOL_FEE_SHARE = 1 / 6;

interface Trade {
  id: string;
  time: number;
  side: "buy" | "sell";
  amount: number;
  price: number;
  total: number;
  wallet?: string;
}

interface PricePoint {
  time: number;
  price: number;
}

interface VammMarket {
  symbol: string;
  quoteSymbol: "USDT";
  basePrice: number;
  slope: number;
  supply: number;
  treasury: number;
  volume24h: number;
  volumeResetAt: number;
  trades: Trade[];
  priceHistory: PricePoint[];
  seedPrice: number;
  lastUpdated: number;
}

/* ── Seed prices (USDT per 1 base unit) ──────────────────────────────────── */
const SEED_PRICES: Record<string, number> = {
  BTC: 71_000, ETH: 2_160, SOL: 92,   BSV: 55,   BNB: 640,
  XRP: 1.42,   ADA: 0.264, DOGE: 0.094, DOT: 1.39, LINK: 14.2,
  AVAX: 38,    MATIC: 0.82, LTC: 87,  BCH: 490,  UNI: 8.4,
  AAVE: 165,   MKR: 2_800, COMP: 48,  CRV: 0.48, SNX: 1.82,
  SUSHI: 1.1,  ZRX: 0.33,  BAT: 0.20, ENJ: 0.25, MANA: 0.35,
  SAND: 0.40,  AXS: 5.8,   GALA: 0.027, CHZ: 0.088, FLOW: 0.61,
  NEAR: 5.4,   ALGO: 0.17, ATOM: 6.1, FTM: 0.51, ONE: 0.013,
  ROSE: 0.072, BAND: 1.24, REN: 0.052, OMG: 0.49, TRX: 0.115,
  BTT: 0.00000095, WIN: 0.000070, JST: 0.028, "1INCH": 0.31,
  IMX: 1.64,   INJ: 24,    APT: 8.2,  ARB: 1.18, OP: 2.41,
  SEI: 0.45,   SUI: 1.02,  PEPE: 0.0000094, SHIB: 0.0000094,
  FLOKI: 0.000195, WIF: 2.65, BONK: 0.0000278,
};

/* ── Calibrate curve for a given spot price ─────────────────────────────── */
function calibrate(spotPrice: number): Pick<VammMarket, "basePrice" | "slope" | "supply" | "treasury"> {
  // slope calibrated so $8500 of buys → 1% price impact
  const slope = (0.01 * spotPrice * spotPrice) / GENESIS_DEPTH_USD;
  // Start with price(0) = spotPrice (sell curve goes down from here)
  const basePrice = spotPrice;
  const supply = 0;
  // Pre-fund treasury so sells are immediately possible
  const treasury = GENESIS_DEPTH_USD * 3;
  return { basePrice, slope, supply, treasury };
}

/* ── In-memory market state ─────────────────────────────────────────────── */
const markets = new Map<string, VammMarket>();

function initMarkets() {
  for (const [sym, price] of Object.entries(SEED_PRICES)) {
    const cal = calibrate(price);
    markets.set(sym, {
      symbol: sym,
      quoteSymbol: "USDT",
      ...cal,
      volume24h: 0,
      volumeResetAt: Date.now() + 86_400_000,
      trades: [],
      priceHistory: [{ time: Date.now() - 3_600_000, price }, { time: Date.now(), price }],
      seedPrice: price,
      lastUpdated: Date.now(),
    });
  }
}
initMarkets();

// Reset 24h volume daily
setInterval(() => {
  const now = Date.now();
  for (const m of markets.values()) {
    if (now >= m.volumeResetAt) {
      m.volume24h = 0;
      m.volumeResetAt = now + 86_400_000;
    }
  }
}, 60_000);

/* ── Pure math ──────────────────────────────────────────────────────────── */
function currentPrice(m: VammMarket): number {
  return m.basePrice + m.slope * m.supply;
}

function buyCost(m: VammMarket, tokenAmt: number): number {
  const p0 = m.basePrice + m.slope * m.supply;
  const p1 = m.basePrice + m.slope * (m.supply + tokenAmt);
  return ((p0 + p1) / 2) * tokenAmt;
}

function sellPayout(m: VammMarket, tokenAmt: number): number {
  const safeAmt = Math.min(tokenAmt, m.supply);
  if (safeAmt <= 0) return 0;
  const p0 = m.basePrice + m.slope * m.supply;
  const p1 = m.basePrice + m.slope * (m.supply - safeAmt);
  return ((p0 + p1) / 2) * safeAmt;
}

function priceImpactPct(m: VammMarket, tokenAmt: number, side: "buy" | "sell"): number {
  const p0 = currentPrice(m);
  const newSupply = side === "buy" ? m.supply + tokenAmt : Math.max(0, m.supply - tokenAmt);
  const p1 = m.basePrice + m.slope * newSupply;
  return Math.abs((p1 - p0) / p0) * 100;
}

// Invert buy cost: given USDT in, solve quadratic for token amount
function tokensForUsd(m: VammMarket, usdIn: number): number {
  const a = m.slope / 2;
  const b = m.basePrice + m.slope * m.supply;
  const c = -usdIn;
  if (Math.abs(a) < 1e-30) return usdIn / b; // linear case
  const disc = b * b - 4 * a * c;
  return disc >= 0 ? (-b + Math.sqrt(disc)) / (2 * a) : usdIn / currentPrice(m);
}

/* ── Router ─────────────────────────────────────────────────────────────── */
const router = Router();

/* GET /api/genesis/markets */
router.get("/genesis/markets", (_req, res) => {
  const result = Array.from(markets.values()).map(m => {
    const price = currentPrice(m);
    const open24h = m.priceHistory.length > 1 ? m.priceHistory[0].price : price;
    const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
    return {
      symbol: m.symbol,
      quoteSymbol: m.quoteSymbol,
      price,
      supply: m.supply,
      marketCap: price * m.supply,
      treasury: m.treasury,
      volume24h: m.volume24h,
      change24h,
      seedPrice: m.seedPrice,
      tradeCount: m.trades.length,
    };
  });
  res.json(result);
});

/* GET /api/genesis/market/:symbol */
router.get("/genesis/market/:symbol", (req, res) => {
  const m = markets.get(req.params.symbol?.toUpperCase());
  if (!m) { res.status(404).json({ error: "Market not found" }); return; }

  const price = currentPrice(m);
  const open24h = m.priceHistory.length > 0 ? m.priceHistory[0].price : price;
  const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

  res.json({
    symbol: m.symbol,
    quoteSymbol: m.quoteSymbol,
    price,
    supply: m.supply,
    marketCap: price * m.supply,
    treasury: m.treasury,
    volume24h: m.volume24h,
    change24h,
    virtualDepthUsd: GENESIS_DEPTH_USD,
    trades: m.trades.slice(0, 30),
    priceHistory: m.priceHistory.slice(-100),
    curve: {
      basePrice: m.basePrice,
      slope: m.slope,
    },
  });
});

/* GET /api/genesis/quote */
router.get("/genesis/quote", (req, res) => {
  const { symbol, side, usdtAmount, tokenAmount } = req.query as Record<string, string>;
  const m = markets.get(symbol?.toUpperCase());
  if (!m) { res.status(404).json({ error: `Market not found: ${symbol}` }); return; }
  if (side !== "buy" && side !== "sell") { res.status(400).json({ error: "side must be buy or sell" }); return; }

  const price = currentPrice(m);

  if (side === "buy") {
    const usdIn = Math.max(0, parseFloat(usdtAmount ?? "0"));
    if (!usdIn) { res.status(400).json({ error: "usdtAmount must be > 0" }); return; }
    const tokensOut = tokensForUsd(m, usdIn);
    const cost = buyCost(m, tokensOut);
    const fee = cost * SWAP_FEE;
    const impact = priceImpactPct(m, tokensOut, "buy");
    const priceAfter = m.basePrice + m.slope * (m.supply + tokensOut);

    res.json({
      symbol, side, usdtIn: usdIn, tokensOut, price: cost / tokensOut,
      priceAfter, priceImpactPct: impact,
      fee, feeLp: fee * LP_FEE_SHARE, feeProtocol: fee * PROTOCOL_FEE_SHARE,
      marketPrice: price, slippage: impact / 100,
    });
  } else {
    const tokIn = Math.max(0, parseFloat(tokenAmount ?? "0"));
    if (!tokIn) { res.status(400).json({ error: "tokenAmount must be > 0" }); return; }
    const payout = sellPayout(m, tokIn);
    const fee = payout * SWAP_FEE;
    const usdtOut = payout - fee;
    const impact = priceImpactPct(m, tokIn, "sell");
    const priceAfter = m.basePrice + m.slope * Math.max(0, m.supply - tokIn);

    res.json({
      symbol, side, tokensIn: tokIn, usdtOut, price: payout / tokIn,
      priceAfter, priceImpactPct: impact,
      fee, feeLp: fee * LP_FEE_SHARE, feeProtocol: fee * PROTOCOL_FEE_SHARE,
      marketPrice: price, slippage: impact / 100,
    });
  }
});

/* POST /api/genesis/swap */
router.post("/genesis/swap", (req, res) => {
  const { symbol, side, usdtAmount, tokenAmount, wallet } = req.body as {
    symbol: string; side: "buy" | "sell";
    usdtAmount?: number; tokenAmount?: number; wallet?: string;
  };

  const m = markets.get(symbol?.toUpperCase());
  if (!m) { res.status(404).json({ error: `Market not found: ${symbol}` }); return; }

  const price = currentPrice(m);
  const tradeId = Math.random().toString(36).slice(2, 10).toUpperCase();

  if (side === "buy") {
    const usdIn = Number(usdtAmount ?? 0);
    if (usdIn <= 0) { res.status(400).json({ error: "usdtAmount must be > 0" }); return; }

    const tokensOut = tokensForUsd(m, usdIn);
    const cost = buyCost(m, tokensOut);
    const fee = cost * SWAP_FEE;
    const avgPrice = cost / tokensOut;

    m.supply += tokensOut;
    m.treasury += cost * (1 - PROTOCOL_FEE_SHARE * SWAP_FEE);
    m.volume24h += cost;
    m.lastUpdated = Date.now();

    const trade: Trade = { id: tradeId, time: Date.now(), side: "buy", amount: tokensOut, price: avgPrice, total: cost, wallet };
    m.trades = [trade, ...m.trades].slice(0, 100);
    m.priceHistory = [...m.priceHistory, { time: Date.now(), price: currentPrice(m) }].slice(-200);

    logger.info({ tradeId, symbol, side, usdIn, tokensOut, avgPrice }, "Genesis swap executed");
    res.json({ success: true, tradeId, side: "buy", tokensReceived: tokensOut, usdtSpent: cost, fee, avgPrice, newPrice: currentPrice(m), trade });

  } else {
    const tokIn = Number(tokenAmount ?? 0);
    if (tokIn <= 0) { res.status(400).json({ error: "tokenAmount must be > 0" }); return; }

    const payout = sellPayout(m, tokIn);
    const fee = payout * SWAP_FEE;
    const usdtOut = payout - fee;
    if (m.treasury < usdtOut) { res.status(400).json({ error: "Treasury depth exceeded — try a smaller amount" }); return; }

    const avgPrice = payout / tokIn;
    m.supply = Math.max(0, m.supply - tokIn);
    m.treasury -= usdtOut;
    m.volume24h += payout;
    m.lastUpdated = Date.now();

    const trade: Trade = { id: tradeId, time: Date.now(), side: "sell", amount: tokIn, price: avgPrice, total: usdtOut, wallet };
    m.trades = [trade, ...m.trades].slice(0, 100);
    m.priceHistory = [...m.priceHistory, { time: Date.now(), price: currentPrice(m) }].slice(-200);

    logger.info({ tradeId, symbol, side, tokIn, usdtOut, avgPrice }, "Genesis swap executed");
    res.json({ success: true, tradeId, side: "sell", usdtReceived: usdtOut, tokensSold: tokIn, fee, avgPrice, newPrice: currentPrice(m), trade });
  }
});

/* ── External price updater (called by market price engine) ─────────────── */
export function updateGenesisPrice(symbol: string, newSpotPrice: number): void {
  const m = markets.get(symbol.toUpperCase());
  if (!m || newSpotPrice <= 0) return;
  // Softly recalibrate basePrice, preserving current supply
  const targetBase = newSpotPrice - m.slope * m.supply;
  if (targetBase > 0) {
    // Blend towards new price slowly (10% weight) to avoid jumps
    m.basePrice = m.basePrice * 0.9 + targetBase * 0.1;
  }
  m.lastUpdated = Date.now();
}

export function getGenesisMarket(symbol: string): VammMarket | undefined {
  return markets.get(symbol.toUpperCase());
}

export default router;
