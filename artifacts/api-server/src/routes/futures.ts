import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { futuresPositionsTable, marketsTable, fundingRatesTable, fundingPaymentsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import crypto from "crypto";
import {
  openFuturesPosition,
  closeFuturesPosition,
  depositToFuturesMargin,
  getFuturesMarginBalance,
  computeLiquidationPrice,
} from "../lib/futuresSettlement.js";
import { verifyAndLockFunding } from "../lib/fundingVerifier.js";
import { fetchHlMarkets } from "../lib/hyperliquid.js";

const router: IRouter = Router();

// Data-read routes (markets, funding-rates, ticker) are always available.
// Trading routes (open/close/deposit) require FUTURES_ENABLED=true.
const TRADING_PATHS = ["/futures/open", "/futures/close", "/futures/deposit", "/futures/positions"];
router.use((req, res, next) => {
  const isTrading = TRADING_PATHS.some(p => req.path.startsWith(p));
  if (isTrading && process.env.FUTURES_ENABLED !== "true") {
    return res.status(503).json({ error: "Futures trading is not yet enabled." });
  }
  return next();
});

const FUNDING_RATES = [
  { symbol: "BSV/USDT", fundingRate: 0.0001, interval: "8h" },
  { symbol: "BTC/USDT", fundingRate: 0.00015, interval: "8h" },
  { symbol: "ETH/USDT", fundingRate: 0.00012, interval: "8h" },
  { symbol: "SOL/USDT", fundingRate: 0.00008, interval: "8h" },
  { symbol: "XRP/USDT", fundingRate: 0.00006, interval: "8h" },
  { symbol: "BNB/USDT", fundingRate: 0.00010, interval: "8h" },
  { symbol: "ADA/USDT", fundingRate: 0.00004, interval: "8h" },
];

// ── GET /futures/markets ─────────────────────────────────────────────────────
// Returns the list of supported perpetual markets with live prices from the
// sovereign price engine.
const PERP_SYMBOLS = [
  "BSV/USDT","BTC/USDT","ETH/USDT","SOL/USDT","XRP/USDT","BNB/USDT",
  "ADA/USDT","DOGE/USDT","DOT/USDT","AVAX/USDT","MATIC/USDT","LINK/USDT",
  "ARB/USDT","OP/USDT","SUI/USDT","INJ/USDT","NEAR/USDT","APT/USDT",
];

router.get("/futures/markets", async (_req, res) => {
  try {
    // Fetch DB prices and HL live data in parallel
    const [perpMarkets, hlMarkets] = await Promise.all([
      db.select().from(marketsTable).where(inArray(marketsTable.symbol, PERP_SYMBOLS)),
      fetchHlMarkets().catch(() => [] as Awaited<ReturnType<typeof fetchHlMarkets>>),
    ]);

    const priceMap: Record<string, (typeof perpMarkets)[0]> = {};
    for (const m of perpMarkets) priceMap[m.symbol] = m;

    // Build a map of coin → HL market for O(1) lookup
    const hlMap: Record<string, (typeof hlMarkets)[0]> = {};
    for (const h of hlMarkets) hlMap[h.coin] = h;

    function nextFundingTime(): string {
      const d = new Date(); const h = d.getHours();
      const nh = h < 8 ? 8 : h < 16 ? 16 : 24;
      d.setHours(nh % 24, 0, 0, 0);
      if (nh === 24) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }

    const markets = PERP_SYMBOLS.map((sym) => {
      const m    = priceMap[sym];
      const base = sym.split("/")[0];
      const hl   = hlMap[base];

      // Prefer HL mark/oracle prices; fall back to DB last price
      const dbLast   = m ? parseFloat(m.lastPrice) : 0;
      const markPrice  = hl?.markPrice  > 0 ? hl.markPrice  : dbLast;
      const indexPrice = hl?.oraclePrice > 0 ? hl.oraclePrice : markPrice;

      const chg        = m ? parseFloat(m.priceChangePercent24h ?? "0") : 0;
      const dbVol      = m ? parseFloat(m.volume24h ?? "0") : 0;

      // HL volume/OI in USD; fall back to DB volume estimate
      const volume24h    = hl?.volume24h    > 0 ? hl.volume24h    : dbVol;
      const openInterest = hl?.openInterest > 0 ? hl.openInterest : dbVol * 0.15;

      // Real HL funding rate; fall back to static table
      const staticRate  = FUNDING_RATES.find((r) => r.symbol === sym);
      const fundingRate = hl?.fundingRate !== undefined
        ? hl.fundingRate
        : (staticRate?.fundingRate ?? 0.0001);

      return {
        symbol:                `${base}/USDT-PERP`,
        baseAsset:             base,
        quoteAsset:            "USDT",
        lastPrice:             markPrice,
        markPrice,
        indexPrice,
        priceChangePercent:    chg,
        priceChangePercent24h: chg,
        volume:                volume24h,
        volume24h,
        openInterest,
        fundingRate,
        fundingRatePct:        fundingRate * 100,
        nextFundingTime:       nextFundingTime(),
        maxLeverage:           hl?.maxLeverage ?? 100,
        type:                  "futures",
        source:                hl ? "hyperliquid" : "internal",
      };
    });

    res.json(markets);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/futures/funding-rates", (_req, res) => {
  const now = new Date();
  const nextFunding = new Date(now.getTime());
  const hours = nextFunding.getHours();
  const nextHour = hours < 8 ? 8 : hours < 16 ? 16 : 24;
  nextFunding.setHours(nextHour % 24, 0, 0, 0);
  if (nextHour === 24) nextFunding.setDate(nextFunding.getDate() + 1);

  res.json(
    FUNDING_RATES.map((r) => ({
      ...r,
      nextFundingTime: nextFunding.toISOString(),
      lastFundingRate: r.fundingRate,
      predictedFundingRate: r.fundingRate,
    }))
  );
});

// ── GET /futures/funding-rate/:symbol (dynamic — from DB) ─────────────────────
router.get("/futures/funding-rate/:symbol", async (req, res) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol).replace("-PERP", "").replace("-", "/");
    const [latest] = await db
      .select()
      .from(fundingRatesTable)
      .where(eq(fundingRatesTable.symbol, symbol))
      .orderBy(desc(fundingRatesTable.createdAt))
      .limit(1);

    if (!latest) {
      // Fall back to static data if the engine hasn't run yet
      const staticRate = FUNDING_RATES.find((r) => r.symbol === symbol);
      if (!staticRate) {
        res.status(404).json({ error: "Symbol not found" });
        return;
      }
      const now = new Date();
      const nextFunding = new Date(now.getTime());
      const hours = nextFunding.getHours();
      const nextHour = hours < 8 ? 8 : hours < 16 ? 16 : 24;
      nextFunding.setHours(nextHour % 24, 0, 0, 0);
      if (nextHour === 24) nextFunding.setDate(nextFunding.getDate() + 1);
      res.json({
        symbol,
        fundingRate:          staticRate.fundingRate,
        fundingRatePct:       staticRate.fundingRate * 100,
        markPrice:            null,
        indexPrice:           null,
        premium:              null,
        nextFundingAt:        nextFunding.toISOString(),
        lastFundingAt:        null,
        source:               "static",
      });
      return;
    }

    res.json({
      symbol:               latest.symbol,
      fundingRate:          parseFloat(latest.rate),
      fundingRatePct:       parseFloat(latest.rate) * 100,
      markPrice:            parseFloat(latest.markPrice),
      indexPrice:           parseFloat(latest.indexPrice),
      premium:              parseFloat(latest.premium),
      nextFundingAt:        latest.nextFundingAt.toISOString(),
      lastFundingAt:        latest.createdAt.toISOString(),
      source:               "dynamic",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get funding rate");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /futures/funding-history/:symbol ──────────────────────────────────────
router.get("/futures/funding-history/:symbol", async (req, res) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol).replace("-PERP", "").replace("-", "/");
    const limit  = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);

    const rows = await db
      .select()
      .from(fundingRatesTable)
      .where(eq(fundingRatesTable.symbol, symbol))
      .orderBy(desc(fundingRatesTable.createdAt))
      .limit(limit);

    res.json(
      rows.map((r) => ({
        symbol:        r.symbol,
        fundingRate:   parseFloat(r.rate),
        fundingRatePct: parseFloat(r.rate) * 100,
        markPrice:     parseFloat(r.markPrice),
        indexPrice:    parseFloat(r.indexPrice),
        premium:       parseFloat(r.premium),
        nextFundingAt: r.nextFundingAt.toISOString(),
        timestamp:     r.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get funding history");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /futures/funding-payments ─────────────────────────────────────────────
router.get("/futures/funding-payments", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string | undefined;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const payments = await db
      .select()
      .from(fundingPaymentsTable)
      .where(eq(fundingPaymentsTable.walletAddress, walletAddress))
      .orderBy(desc(fundingPaymentsTable.settledAt))
      .limit(200);

    res.json(
      payments.map((p) => ({
        id:           p.id,
        positionId:   p.positionId,
        symbol:       p.symbol,
        fundingRate:  parseFloat(p.fundingRate),
        positionSize: parseFloat(p.positionSize),
        payment:      parseFloat(p.payment),
        direction:    p.direction,
        settledAt:    p.settledAt.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get funding payments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/futures/positions", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const positions = await db
      .select()
      .from(futuresPositionsTable)
      .where(and(eq(futuresPositionsTable.walletAddress, walletAddress), eq(futuresPositionsTable.status, "open")));

    // Disable caching so the UI always gets fresh position data after trades
    res.setHeader("Cache-Control", "no-store");
    res.json(
      positions.map((p) => ({
        id: p.id,
        walletAddress: p.walletAddress,
        symbol: p.symbol,
        side: p.side,
        leverage: parseFloat(p.leverage),
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        liquidationPrice: parseFloat(p.liquidationPrice),
        quantity: parseFloat(p.quantity),
        margin: parseFloat(p.margin),
        unrealizedPnl: parseFloat(p.unrealizedPnl),
        unrealizedPnlPercent: parseFloat(p.unrealizedPnlPercent),
        realizedPnl: parseFloat(p.realizedPnl),
        fundingFee: parseFloat(p.fundingFee),
        status: p.status,
        txid: p.txid,
        openedAt: p.openedAt.toISOString(),
        closedAt: p.closedAt?.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get futures positions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/futures/positions", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress || !body.symbol || !body.side || !body.leverage || !body.quantity) {
      res.status(400).json({ error: "Missing required fields: walletAddress, symbol, side, leverage, quantity" });
      return;
    }

    // Normalize symbol: "BSV-USDT-PERP" → "BSV/USDT-PERP", strip -PERP suffix to look up base market
    const symbol = (body.symbol as string).replace(/^([A-Z0-9]+)-([A-Z0-9]+)(-PERP)?$/, "$1/$2$3");
    const baseMarketSymbol = symbol.replace("-PERP", "");
    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, baseMarketSymbol));

    const rawEntry = body.price || (market ? parseFloat(market.lastPrice) : null);
    if (!rawEntry || rawEntry <= 0) {
      res.status(400).json({ error: `No market price available for ${symbol}. Please retry.` });
      return;
    }
    const entryPrice: number = parseFloat(rawEntry);
    const leverage  = parseFloat(body.leverage);
    const quantity  = parseFloat(body.quantity);
    const margin    = (entryPrice * quantity) / leverage;

    const walletSource = body.walletSource === "external" ? "external"
      : body.walletSource === "orah" ? "orah" : "orah";

    const fundingVerif = await verifyAndLockFunding({
      walletAddress: body.walletAddress,
      kind:          "FUTURES",   // routes to futures_margin_accounts bucket
      walletSource,
      asset:         "USDT",
      amount:        margin.toFixed(8),
    });
    if (!fundingVerif.valid) {
      res.status(400).json({ error: fundingVerif.error, code: fundingVerif.code });
      return;
    }

    // ── Open position via futuresSettlement (locks margin + inserts row) ──
    const result = await openFuturesPosition({
      walletAddress: body.walletAddress,
      symbol,
      side:          body.side as "long" | "short",
      leverage,
      margin,
      quantity,
      entryPrice,
      fundingRef:    fundingVerif.fundingRef,
    });

    res.status(201).json({
      id:               result.positionId,
      walletAddress:    body.walletAddress,
      symbol,
      side:             body.side,
      leverage,
      entryPrice,
      markPrice:        entryPrice,
      liquidationPrice: result.liquidationPrice,
      quantity,
      margin,
      notionalValue:    result.notionalValue,
      openingFee:       result.openingFee,
      unrealizedPnl:    0,
      unrealizedPnlPercent: 0,
      realizedPnl:      0,
      fundingFee:       0,
      status:           "open",
      fundingRef:       fundingVerif.fundingRef,
      openedAt:         new Date().toISOString(),
      closedAt:         undefined,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to open futures position");
    if (err?.message?.startsWith("INSUFFICIENT_FUTURES_MARGIN")) {
      res.status(400).json({ error: err.message, code: "INSUFFICIENT_FUTURES_MARGIN" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

router.delete("/futures/positions/:positionId", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    // Verify the position belongs to this wallet before closing
    const [pos] = await db
      .select()
      .from(futuresPositionsTable)
      .where(
        and(
          eq(futuresPositionsTable.id, req.params.positionId),
          eq(futuresPositionsTable.walletAddress, body.walletAddress)
        )
      );

    if (!pos) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    if (pos.status !== "open") {
      res.status(400).json({ error: `Position is already ${pos.status}`, code: "POSITION_NOT_OPEN" });
      return;
    }

    // Always use the oracle-sourced mark price stored on the position.
    // Client-supplied markPrice is intentionally ignored to prevent profit
    // fabrication — users must not be able to self-report their close price.
    const markPrice = parseFloat(pos.markPrice);

    // closeFuturesPosition: computes PnL, releases margin ± PnL, marks row closed
    const closeResult = await closeFuturesPosition({
      positionId: req.params.positionId,
      markPrice,
    });

    // Re-read the updated position for the response
    const [closed] = await db
      .select()
      .from(futuresPositionsTable)
      .where(eq(futuresPositionsTable.id, req.params.positionId));

    res.json({
      id:               closed!.id,
      walletAddress:    closed!.walletAddress,
      symbol:           closed!.symbol,
      side:             closed!.side,
      leverage:         parseFloat(closed!.leverage),
      entryPrice:       parseFloat(closed!.entryPrice),
      markPrice:        parseFloat(closed!.markPrice),
      liquidationPrice: parseFloat(closed!.liquidationPrice),
      quantity:         parseFloat(closed!.quantity),
      margin:           parseFloat(closed!.margin),
      unrealizedPnl:    parseFloat(closed!.unrealizedPnl),
      unrealizedPnlPercent: parseFloat(closed!.unrealizedPnlPercent),
      realizedPnl:      closeResult.realizedPnl,
      returnedMargin:   closeResult.returnedMargin,
      closingFee:       closeResult.closingFee,
      fundingFee:       parseFloat(closed!.fundingFee),
      status:           closed!.status,
      txid:             closed!.txid,
      openedAt:         closed!.openedAt.toISOString(),
      closedAt:         closed!.closedAt?.toISOString(),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to close futures position");
    if (err?.message?.startsWith("POSITION_NOT")) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ── POST /futures/margin/deposit ─────────────────────────────────────────────
// Transfer USDT from the spot wallet into the futures margin account.
// This is the ONLY authorised cross-bucket pathway.
router.post("/futures/margin/deposit", async (req, res) => {
  try {
    const { walletAddress, amount } = req.body;
    if (!walletAddress || !amount) {
      res.status(400).json({ error: "walletAddress and amount are required" });
      return;
    }
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    await depositToFuturesMargin(walletAddress, amt);
    const balance = await getFuturesMarginBalance(walletAddress);
    res.json({ success: true, walletAddress, deposited: amt, balance });
  } catch (err) {
    req.log.error({ err }, "Failed to deposit futures margin");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /futures/margin/:walletAddress ───────────────────────────────────────
// Returns the futures margin account balance (separate from spot user_balances).
router.get("/futures/margin/:walletAddress", async (req, res) => {
  try {
    const balance = await getFuturesMarginBalance(req.params.walletAddress);
    res.json({ walletAddress: req.params.walletAddress, asset: "USDT", ...balance });
  } catch (err) {
    req.log.error({ err }, "Failed to get futures margin");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
