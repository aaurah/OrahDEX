import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { futuresPositionsTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import {
  openFuturesPosition,
  closeFuturesPosition,
  depositToFuturesMargin,
  getFuturesMarginBalance,
  computeLiquidationPrice,
} from "../lib/futuresSettlement.js";
import { verifyAndLockFunding } from "../lib/fundingVerifier.js";

const router: IRouter = Router();

const FUNDING_RATES = [
  { symbol: "BSV/USDT", fundingRate: 0.0001, interval: "8h" },
  { symbol: "BTC/USDT", fundingRate: 0.00015, interval: "8h" },
  { symbol: "ETH/USDT", fundingRate: 0.00012, interval: "8h" },
  { symbol: "SOL/USDT", fundingRate: 0.00008, interval: "8h" },
  { symbol: "XRP/USDT", fundingRate: 0.00006, interval: "8h" },
  { symbol: "BNB/USDT", fundingRate: 0.00010, interval: "8h" },
  { symbol: "ADA/USDT", fundingRate: 0.00004, interval: "8h" },
];

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
      : body.walletSource === "orahdex" ? "orahdex" : "orahdex";

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

    // Close using current mark price (from request or live market)
    const markPrice = body.markPrice
      ? parseFloat(body.markPrice)
      : parseFloat(pos.markPrice);

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
