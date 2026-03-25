import { Router } from "express";
import { db } from "@workspace/db";
import { coinNominationsTable, coinVoteLogsTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── GET /api/votes/coins  ─────────────────────────────────────────────────
   Returns all nominations sorted by vote count desc.
─────────────────────────────────────────────────────────────────────────── */
router.get("/votes/coins", async (_req, res) => {
  try {
    const coins = await db
      .select()
      .from(coinNominationsTable)
      .orderBy(desc(coinNominationsTable.votes), desc(coinNominationsTable.createdAt));
    res.json({ coins });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "votes/coins list failed");
    res.json({ coins: [] });
  }
});

/* ── POST /api/votes/coins  ────────────────────────────────────────────────
   Nominate a new coin for listing.
   Body: { symbol, name, chain?, contractAddress?, website?, description? }
─────────────────────────────────────────────────────────────────────────── */
router.post("/votes/coins", async (req, res) => {
  const { symbol, name, chain, contractAddress, website, description } = req.body ?? {};
  if (!symbol || !name) { res.status(400).json({ error: "symbol and name are required" }); return; }

  const sym = String(symbol).toUpperCase().trim().slice(0, 20);
  const nm  = String(name).trim().slice(0, 100);

  try {
    // Prevent exact duplicate symbols (case-insensitive)
    const existing = await db
      .select({ id: coinNominationsTable.id })
      .from(coinNominationsTable)
      .where(eq(sql`LOWER(${coinNominationsTable.symbol})`, sym.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "This coin is already nominated. Vote for it instead!" });
      return;
    }

    const [row] = await db.insert(coinNominationsTable).values({
      symbol:          sym,
      name:            nm,
      chain:           chain ? String(chain).trim().slice(0, 50) : null,
      contractAddress: contractAddress ? String(contractAddress).trim().slice(0, 100) : null,
      website:         website ? String(website).trim().slice(0, 200) : null,
      description:     description ? String(description).trim().slice(0, 300) : null,
      nominatedBy:     req.ip ?? null,
    }).returning();

    res.status(201).json({ coin: row });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "coin nomination failed");
    res.status(500).json({ error: "Failed to nominate coin" });
  }
});

/* ── POST /api/votes/coins/:id/vote  ───────────────────────────────────────
   Vote for a nominated coin. Rate-limited: 1 vote per IP per coin.
─────────────────────────────────────────────────────────────────────────── */
router.post("/votes/coins/:id/vote", async (req, res) => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const voterIp      = req.ip ?? "unknown";
  const voterAddress = (req.body?.walletAddress ?? "").toString().trim().slice(0, 100) || null;

  try {
    // Check if voter already voted for this coin
    const already = await db
      .select({ id: coinVoteLogsTable.id })
      .from(coinVoteLogsTable)
      .where(and(
        eq(coinVoteLogsTable.nominationId, id),
        eq(coinVoteLogsTable.voterIp, voterIp),
      ))
      .limit(1);

    if (already.length > 0) {
      res.status(409).json({ error: "You already voted for this coin" });
      return;
    }

    // Increment votes
    await db
      .update(coinNominationsTable)
      .set({ votes: sql`${coinNominationsTable.votes} + 1` })
      .where(eq(coinNominationsTable.id, id));

    // Log the vote
    await db.insert(coinVoteLogsTable).values({
      nominationId: id,
      voterIp,
      voterAddress,
    });

    const [updated] = await db
      .select({ votes: coinNominationsTable.votes })
      .from(coinNominationsTable)
      .where(eq(coinNominationsTable.id, id));

    res.json({ success: true, votes: updated?.votes ?? 0 });
  } catch (err: any) {
    logger.warn({ err: err?.message, id }, "coin vote failed");
    res.status(500).json({ error: "Failed to record vote" });
  }
});

export default router;
