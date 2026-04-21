import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

const ROUND_DURATION_S = 300;
const LOCK_DURATION_S  = 30;

interface PredictionRound {
  id: string;
  epoch: number;
  symbol: string;
  lockPrice: number | null;
  closePrice: number | null;
  bullAmount: number;
  bearAmount: number;
  totalAmount: number;
  status: "live" | "locked" | "closed" | "cancelled";
  startTs: number;
  lockTs: number;
  closeTs: number;
  winner: "bull" | "bear" | null;
}

const rounds: Map<string, PredictionRound[]> = new Map();

let epochCounter = 1000;

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureBetsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_bets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      round_id    TEXT        NOT NULL,
      symbol      TEXT        NOT NULL,
      wallet      TEXT        NOT NULL,
      position    TEXT        NOT NULL,
      amount      NUMERIC(36,18) NOT NULL,
      leverage    INT         NOT NULL DEFAULT 1,
      claimed     BOOLEAN     NOT NULL DEFAULT FALSE,
      payout      NUMERIC(36,18) NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS prediction_bets_wallet_idx
    ON prediction_bets (wallet, round_id)
  `);
}

async function insertBet(params: {
  roundId:  string;
  symbol:   string;
  wallet:   string;
  position: "bull" | "bear";
  amount:   number;
  leverage: number;
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO prediction_bets (round_id, symbol, wallet, position, amount, leverage)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [params.roundId, params.symbol, params.wallet, params.position, params.amount, params.leverage],
  );
  return rows[0]!.id;
}

async function getUnclaimedBets(roundId: string, wallet: string, symbol: string) {
  const { rows } = await pool.query<{
    id: string; round_id: string; position: string; amount: string;
    leverage: number; claimed: boolean; payout: string; created_at: Date;
  }>(
    `SELECT id, round_id, position, amount, leverage, claimed, payout, created_at
     FROM prediction_bets
     WHERE round_id = $1 AND wallet = $2 AND symbol = $3 AND claimed = FALSE`,
    [roundId, wallet.toLowerCase(), symbol],
  );
  return rows;
}

async function claimBets(ids: string[], payout: number): Promise<void> {
  if (!ids.length) return;
  await pool.query(
    `UPDATE prediction_bets SET claimed = TRUE, payout = $1 WHERE id = ANY($2::uuid[])`,
    [payout, ids],
  );
}

async function getWalletBets(wallet: string) {
  const { rows } = await pool.query<{
    id: string; round_id: string; symbol: string; position: string;
    amount: string; leverage: number; claimed: boolean; payout: string; created_at: Date;
  }>(
    `SELECT id, round_id, symbol, position, amount, leverage, claimed, payout, created_at
     FROM prediction_bets
     WHERE wallet = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [wallet.toLowerCase()],
  );
  return rows;
}

// ── Round helpers (unchanged) ─────────────────────────────────────────────────

function getSymbolRounds(symbol: string): PredictionRound[] {
  if (!rounds.has(symbol)) rounds.set(symbol, []);
  return rounds.get(symbol)!;
}

async function getCurrentPrice(symbol: string): Promise<number> {
  try {
    const pair = symbol.replace("-", "/");
    const { rows } = await pool.query(
      `SELECT last_price FROM markets WHERE symbol = $1 LIMIT 1`,
      [pair],
    );
    if (rows.length > 0) return parseFloat(rows[0].last_price) || 0;
  } catch {}
  return 0;
}

function createRound(symbol: string, price: number): PredictionRound {
  const now = Math.floor(Date.now() / 1000);
  const epoch = ++epochCounter;
  const round: PredictionRound = {
    id: `pred_${epoch}_${Date.now()}`,
    epoch,
    symbol,
    lockPrice: null,
    closePrice: null,
    bullAmount: 0,
    bearAmount: 0,
    totalAmount: 0,
    status: "live",
    startTs: now,
    lockTs: now + ROUND_DURATION_S - LOCK_DURATION_S,
    closeTs: now + ROUND_DURATION_S,
    winner: null,
  };
  return round;
}

function seedIfEmpty(symbol: string, price: number) {
  const arr = getSymbolRounds(symbol);
  if (arr.length > 0) return;

  const now = Math.floor(Date.now() / 1000);
  for (let i = 5; i >= 1; i--) {
    const e = ++epochCounter;
    const startTs = now - i * ROUND_DURATION_S;
    const lockTs = startTs + ROUND_DURATION_S - LOCK_DURATION_S;
    const closeTs = startTs + ROUND_DURATION_S;
    const variation = (Math.random() - 0.5) * 0.02;
    const lp = price * (1 + variation);
    const cp = lp * (1 + (Math.random() - 0.5) * 0.01);
    const bull = Math.round(Math.random() * 50000 + 5000);
    const bear = Math.round(Math.random() * 50000 + 5000);
    const winner = cp > lp ? "bull" : "bear";
    arr.push({
      id: `pred_${e}_${Date.now() - i * 300000}`,
      epoch: e,
      symbol,
      lockPrice: parseFloat(lp.toFixed(4)),
      closePrice: parseFloat(cp.toFixed(4)),
      bullAmount: bull,
      bearAmount: bear,
      totalAmount: bull + bear,
      status: "closed",
      startTs,
      lockTs,
      closeTs,
      winner,
    });
  }

  const currentRound = createRound(symbol, price);
  const bull2 = Math.round(Math.random() * 30000 + 2000);
  const bear2 = Math.round(Math.random() * 30000 + 2000);
  currentRound.bullAmount = bull2;
  currentRound.bearAmount = bear2;
  currentRound.totalAmount = bull2 + bear2;
  arr.push(currentRound);

  const nextRound = createRound(symbol, price);
  nextRound.startTs = currentRound.closeTs;
  nextRound.lockTs = nextRound.startTs + ROUND_DURATION_S - LOCK_DURATION_S;
  nextRound.closeTs = nextRound.startTs + ROUND_DURATION_S;
  arr.push(nextRound);
}

async function tickRounds(symbol: string) {
  const price = await getCurrentPrice(symbol);
  if (price <= 0) return;
  seedIfEmpty(symbol, price);

  const arr = getSymbolRounds(symbol);
  const now = Math.floor(Date.now() / 1000);

  for (const r of arr) {
    if (r.status === "live" && now >= r.lockTs) {
      r.status = "locked";
      r.lockPrice = price;
    }
    if ((r.status === "locked" || r.status === "live") && now >= r.closeTs) {
      r.status = "closed";
      if (!r.lockPrice) r.lockPrice = price;
      r.closePrice = price;
      r.winner = r.closePrice > r.lockPrice ? "bull" : r.closePrice < r.lockPrice ? "bear" : null;
    }
  }

  const liveRounds = arr.filter(r => r.status === "live");
  if (liveRounds.length === 0) {
    const lastClosed = arr.filter(r => r.status === "closed" || r.status === "locked").pop();
    const startTs = lastClosed ? lastClosed.closeTs : now;

    const newLive = createRound(symbol, price);
    newLive.startTs = Math.max(startTs, now);
    newLive.lockTs = newLive.startTs + ROUND_DURATION_S - LOCK_DURATION_S;
    newLive.closeTs = newLive.startTs + ROUND_DURATION_S;
    arr.push(newLive);

    const next = createRound(symbol, price);
    next.startTs = newLive.closeTs;
    next.lockTs = next.startTs + ROUND_DURATION_S - LOCK_DURATION_S;
    next.closeTs = next.startTs + ROUND_DURATION_S;
    arr.push(next);
  }

  while (arr.length > 20) arr.shift();
}

router.get("/prediction/rounds/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    await tickRounds(symbol);
    const arr = getSymbolRounds(symbol);
    const price = await getCurrentPrice(symbol);
    const normalized = arr.slice(-10).map(r => ({
      ...r,
      bullPool:   Number(r.bullAmount  ?? 0),
      bearPool:   Number(r.bearAmount  ?? 0),
      totalPool:  Number(r.totalAmount ?? 0),
      startTime:  (r.startTs ?? 0) * 1000,
      lockTime:   (r.lockTs  ?? 0) * 1000,
      closeTime:  (r.closeTs ?? 0) * 1000,
      result:     r.winner ?? null,
      lockPrice:  r.lockPrice  ?? null,
      closePrice: r.closePrice ?? null,
    }));
    res.json({ rounds: normalized, currentPrice: price ?? 0, serverTime: Math.floor(Date.now() / 1000) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/prediction/bet", async (req, res) => {
  try {
    await ensureBetsTable();

    const { roundId, symbol, wallet, position, amount, leverage = 1 } = req.body as {
      roundId: string;
      symbol: string;
      wallet: string;
      position: "bull" | "bear";
      amount: number;
      leverage?: number;
    };

    if (!roundId || !symbol || !wallet || !position || !amount) {
      res.status(400).json({ error: "Missing required fields" }); return;
    }
    if (amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
    if (leverage < 1 || leverage > 100) { res.status(400).json({ error: "Leverage must be 1-100x" }); return; }

    const sym = symbol.toUpperCase();
    await tickRounds(sym);
    const arr = getSymbolRounds(sym);
    const round = arr.find(r => r.id === roundId);
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }
    if (round.status !== "live") { res.status(400).json({ error: "Round is locked or closed — wait for next round" }); return; }

    const wAddr = wallet.toLowerCase();

    // Debit USDT and insert persistent bet record in a single transaction so a
    // server restart cannot lose a bet that has already debited the balance.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const balRes = await client.query<{ available: string }>(
        `SELECT available FROM user_balances WHERE LOWER(wallet_address) = $1 AND asset_symbol = 'USDT' FOR UPDATE`,
        [wAddr],
      );
      const available = parseFloat(balRes.rows[0]?.available ?? "0");
      if (available < amount) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Insufficient USDT balance. Available: ${available.toFixed(2)}` }); return;
      }
      await client.query(
        `UPDATE user_balances SET available = available - $1 WHERE LOWER(wallet_address) = $2 AND asset_symbol = 'USDT'`,
        [amount.toString(), wAddr],
      );
      await client.query(
        `INSERT INTO prediction_bets (round_id, symbol, wallet, position, amount, leverage)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [roundId, sym, wAddr, position, amount, Math.min(leverage, 100)],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    if (position === "bull") {
      round.bullAmount += amount;
    } else {
      round.bearAmount += amount;
    }
    round.totalAmount = round.bullAmount + round.bearAmount;

    res.json({
      success: true,
      bet: { roundId, position, amount, leverage, epoch: round.epoch },
      round: { bullAmount: round.bullAmount, bearAmount: round.bearAmount, totalAmount: round.totalAmount },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/prediction/claim", async (req, res) => {
  try {
    await ensureBetsTable();

    const { roundId, symbol, wallet } = req.body as { roundId: string; symbol: string; wallet: string };
    const sym = (symbol ?? "BSV-USDT").toUpperCase();
    await tickRounds(sym);
    const arr = getSymbolRounds(sym);
    const round = arr.find(r => r.id === roundId);
    if (!round) { res.status(404).json({ error: "Round not found" }); return; }
    if (round.status !== "closed") { res.status(400).json({ error: "Round not finished" }); return; }

    const userBets = await getUnclaimedBets(roundId, wallet, sym);
    if (userBets.length === 0) { res.status(400).json({ error: "No unclaimed bets for this round" }); return; }

    let totalPayout = 0;
    const claimIds: string[] = [];

    for (const bet of userBets) {
      const betAmount = parseFloat(bet.amount);
      const betLeverage = bet.leverage;

      if (round.winner === bet.position) {
        const ownSide = bet.position === "bull" ? round.bullAmount : round.bearAmount;
        const multiplier = ownSide > 0 ? (round.totalAmount / ownSide) : 2;

        // Cap leverage bonus: leverage 1-100 gives 0–4.95x additional multiplier
        // (formula: (leverage-1) * 0.05), capped at 5. Total effective multiplier
        // is at most multiplier * 6, and the hard pool cap below prevents creation of funds.
        const leverageBonus = Math.min((betLeverage - 1) * 0.05, 5);
        const rawPayout = betAmount * multiplier * (1 + leverageBonus);
        // Hard cap: winner's payout cannot exceed the full pool
        const cappedPayout = Math.min(rawPayout, round.totalAmount);
        totalPayout += cappedPayout;
      } else if (round.winner === null) {
        totalPayout += betAmount;
      }
      claimIds.push(bet.id);
    }

    // Cap total payout across all bets to the round pool
    totalPayout = Math.min(totalPayout, round.totalAmount);

    if (totalPayout > 0) {
      await pool.query(
        `UPDATE user_balances SET available = available + $1 WHERE LOWER(wallet_address) = $2 AND asset_symbol = 'USDT'`,
        [totalPayout.toString(), wallet.toLowerCase()],
      );
    }
    await claimBets(claimIds, totalPayout);

    res.json({ success: true, payout: totalPayout, bets: claimIds.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/prediction/history/:wallet", async (req, res) => {
  try {
    await ensureBetsTable();

    const wallet = req.params.wallet;
    const dbBets = await getWalletBets(wallet);
    const result = dbBets.map(b => {
      const sym = b.symbol;
      const arr = getSymbolRounds(sym);
      const round = arr.find(r => r.id === b.round_id);
      return {
        id:         b.id,
        roundId:    b.round_id,
        symbol:     sym,
        position:   b.position,
        amount:     parseFloat(b.amount),
        leverage:   b.leverage,
        claimed:    b.claimed,
        payout:     parseFloat(b.payout),
        ts:         new Date(b.created_at).getTime(),
        epoch:      round?.epoch,
        winner:     round?.winner,
        lockPrice:  round?.lockPrice,
        closePrice: round?.closePrice,
        status:     round?.status,
        won:        round?.status === "closed" && round?.winner === b.position,
      };
    });
    res.json({ bets: result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
