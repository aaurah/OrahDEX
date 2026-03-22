import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { futuresPositionsTable, marketsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const FUNDING_RATES = [
  { symbol: "BSV/USDT", fundingRate: 0.0001, interval: "8h" },
  { symbol: "BTC/USDT", fundingRate: 0.00015, interval: "8h" },
  { symbol: "ETH/USDT", fundingRate: 0.00012, interval: "8h" },
  { symbol: "TOKEN/USDT", fundingRate: -0.00005, interval: "8h" },
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
      lastFundingRate: r.fundingRate * (1 + (Math.random() - 0.5) * 0.2),
      predictedFundingRate: r.fundingRate * (1 + (Math.random() - 0.5) * 0.1),
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
    if (!body.walletAddress || !body.symbol || !body.side || !body.leverage || !body.quantity || !body.orderType || !body.marginMode) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const [market] = await db.select().from(marketsTable).where(eq(marketsTable.symbol, body.symbol));
    const entryPrice = body.price || (market ? parseFloat(market.lastPrice) : 55.42);
    const leverage = parseFloat(body.leverage);
    const quantity = parseFloat(body.quantity);
    const margin = (entryPrice * quantity) / leverage;

    const liquidationPrice =
      body.side === "long"
        ? entryPrice * (1 - 1 / leverage + 0.004)
        : entryPrice * (1 + 1 / leverage - 0.004);

    const id = crypto.randomUUID();
    const newPosition = {
      id,
      walletAddress: body.walletAddress,
      symbol: body.symbol,
      side: body.side,
      leverage: leverage.toString(),
      entryPrice: entryPrice.toString(),
      markPrice: entryPrice.toString(),
      liquidationPrice: liquidationPrice.toString(),
      quantity: quantity.toString(),
      margin: margin.toString(),
      unrealizedPnl: "0",
      unrealizedPnlPercent: "0",
      realizedPnl: "0",
      fundingFee: "0",
      marginMode: body.marginMode,
      status: "open",
      txid: body.signedTx ? crypto.randomBytes(32).toString("hex") : null,
    };

    await db.insert(futuresPositionsTable).values(newPosition);

    res.status(201).json({
      ...newPosition,
      leverage,
      entryPrice,
      markPrice: entryPrice,
      liquidationPrice,
      quantity,
      margin,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      realizedPnl: 0,
      fundingFee: 0,
      openedAt: new Date().toISOString(),
      closedAt: undefined,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to open futures position");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/futures/positions/:positionId", async (req, res) => {
  try {
    const body = req.body;
    if (!body.walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const [position] = await db
      .update(futuresPositionsTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(
        and(
          eq(futuresPositionsTable.id, req.params.positionId),
          eq(futuresPositionsTable.walletAddress, body.walletAddress)
        )
      )
      .returning();

    if (!position) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    res.json({
      id: position.id,
      walletAddress: position.walletAddress,
      symbol: position.symbol,
      side: position.side,
      leverage: parseFloat(position.leverage),
      entryPrice: parseFloat(position.entryPrice),
      markPrice: parseFloat(position.markPrice),
      liquidationPrice: parseFloat(position.liquidationPrice),
      quantity: parseFloat(position.quantity),
      margin: parseFloat(position.margin),
      unrealizedPnl: parseFloat(position.unrealizedPnl),
      unrealizedPnlPercent: parseFloat(position.unrealizedPnlPercent),
      realizedPnl: parseFloat(position.realizedPnl),
      fundingFee: parseFloat(position.fundingFee),
      status: position.status,
      txid: position.txid,
      openedAt: position.openedAt.toISOString(),
      closedAt: position.closedAt?.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to close futures position");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
