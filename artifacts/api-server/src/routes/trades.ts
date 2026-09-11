import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tradesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/trades/history", async (req, res) => {
  try {
    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress) {
      res.status(400).json({ error: "walletAddress is required" });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const trades = await db
      .select()
      .from(tradesTable)
      .where(eq(tradesTable.walletAddress, walletAddress))
      .limit(limit);

    if (trades.length === 0) {
      res.json([]);
      return;
    }

    res.json(
      trades.map((t) => ({
        ...t,
        price: parseFloat(t.price),
        quantity: parseFloat(t.quantity),
        total: parseFloat(t.total),
        fee: parseFloat(t.fee),
        timestamp: t.timestamp.toISOString(),
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get trade history");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
