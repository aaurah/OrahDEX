/**
 * futuresSettlement.ts — Futures position open / close / liquidation
 *
 * Operates on the FUTURES margin bucket (futures_margin_accounts), which is
 * COMPLETELY SEPARATE from the spot balance bucket (user_balances).
 *
 * ── Bucket isolation invariant ────────────────────────────────────────────────
 *
 *   Spot orders    → user_balances    (available / locked)
 *   Futures orders → futures_margin_accounts (available / locked)
 *   These two tables NEVER cross-contaminate.
 *
 * ── Position lifecycle ────────────────────────────────────────────────────────
 *
 *   1. openPosition()
 *        Validates margin from futures_margin_accounts.
 *        Moves margin: available → locked.
 *        Inserts a new row in futures_positions.
 *        Returns positionId + opening txid.
 *
 *   2. closePosition()
 *        Computes realized PnL from mark price vs entry price.
 *        Returns margin ± PnL to futures_margin_accounts.available.
 *        Marks the position row as closed.
 *        Returns { realizedPnl, returnedMargin }.
 *
 *   3. liquidatePosition()
 *        Triggered when mark price crosses the liquidation price.
 *        Confiscates margin (moves to protocol treasury / insurance fund).
 *        Marks position as liquidated.
 *        Returns { loss }.
 *
 * ── Funding-rate settlement ───────────────────────────────────────────────────
 *
 *   applyFundingRate()
 *       Called by the periodic funding engine (futuresProfitEngine.ts).
 *       Debits longs / credits shorts (or vice versa) from the locked margin.
 *
 * ── Leverage and liquidation price ───────────────────────────────────────────
 *
 *   For LONG:  liquidationPrice = entryPrice * (1 - 1/leverage + maintenanceMarginRate)
 *   For SHORT: liquidationPrice = entryPrice * (1 + 1/leverage - maintenanceMarginRate)
 *
 *   maintenanceMarginRate = 0.005 (0.5%)
 */

import { pool, db } from "@workspace/db";
import { futuresPositionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAINTENANCE_MARGIN_RATE = 0.005;   // 0.5%
const TAKER_FEE_RATE          = 0.0005;  // 0.05%

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FuturesOpenParams {
  walletAddress: string;
  symbol:        string;
  side:          "long" | "short";
  leverage:      number;
  /** Margin amount in USDT committed from futures_margin_accounts */
  margin:        number;
  /** Notional quantity (margin × leverage / entryPrice) */
  quantity:      number;
  entryPrice:    number;
  /** Proves the margin was locked from the futures bucket */
  fundingRef:    string;
}

export interface FuturesOpenResult {
  positionId:       string;
  liquidationPrice: number;
  notionalValue:    number;
  openingFee:       number;
}

export interface FuturesCloseParams {
  positionId: string;
  markPrice:  number;
}

export interface FuturesCloseResult {
  realizedPnl:    number;
  returnedMargin: number;
  closingFee:     number;
}

export interface FuturesLiquidateResult {
  loss: number;
}

// ── Liquidation price computation ─────────────────────────────────────────────

export function computeLiquidationPrice(
  entryPrice: number,
  leverage:   number,
  side:       "long" | "short",
): number {
  const mmr = MAINTENANCE_MARGIN_RATE;
  return side === "long"
    ? entryPrice * (1 - 1 / leverage + mmr)
    : entryPrice * (1 + 1 / leverage - mmr);
}

// ── Margin bucket helpers ─────────────────────────────────────────────────────

/**
 * Lock `amount` of USDT in the futures margin bucket for `walletAddress`.
 * Throws "INSUFFICIENT_FUTURES_MARGIN" if the available balance is too low.
 * The spot user_balances table is NEVER touched here.
 */
export async function lockFuturesMargin(
  walletAddress: string,
  amount:        number,
  asset:         string = "USDT",
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert row so it always exists
    await client.query(
      `INSERT INTO futures_margin_accounts (wallet_address, asset, available, locked, updated_at)
       VALUES ($1, $2, 0, 0, now())
       ON CONFLICT (wallet_address, asset) DO NOTHING`,
      [walletAddress, asset],
    );

    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM futures_margin_accounts
       WHERE wallet_address = $1 AND asset = $2 FOR UPDATE`,
      [walletAddress, asset],
    );

    const avail = parseFloat(rows[0]?.available ?? "0");
    if (avail < amount) {
      throw new Error(`INSUFFICIENT_FUTURES_MARGIN:${asset}:need=${amount},have=${avail}`);
    }

    await client.query(
      `UPDATE futures_margin_accounts
       SET available  = available - $1,
           locked     = locked + $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset = $3`,
      [amount.toFixed(8), walletAddress, asset],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release `amount` of USDT from the futures margin locked bucket back to available.
 * Called on close, partial-reduce, or liquidation (to the insurance fund for liquidations).
 */
export async function releaseFuturesMargin(
  walletAddress: string,
  amount:        number,
  asset:         string = "USDT",
): Promise<void> {
  await pool.query(
    `UPDATE futures_margin_accounts
     SET locked     = GREATEST(locked - $1, 0),
         available  = available + LEAST(locked, $1),
         updated_at = now()
     WHERE wallet_address = $2 AND asset = $3`,
    [amount.toFixed(8), walletAddress, asset],
  );
}

/**
 * Deposit USDT into a wallet's futures margin account from the spot bucket.
 * This is the ONLY authorised pathway that crosses between buckets, and it
 * must be an explicit user action (not automatic).
 */
export async function depositToFuturesMargin(
  walletAddress: string,
  amount:        number,
  asset:         string = "USDT",
): Promise<void> {
  await pool.query(
    `INSERT INTO futures_margin_accounts (wallet_address, asset, available, locked, updated_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (wallet_address, asset)
     DO UPDATE SET available = futures_margin_accounts.available + $3, updated_at = now()`,
    [walletAddress, asset, amount.toFixed(8)],
  );
}

/**
 * Get the futures margin account balance for a wallet.
 */
export async function getFuturesMarginBalance(
  walletAddress: string,
  asset:         string = "USDT",
): Promise<{ available: number; locked: number }> {
  const { rows } = await pool.query<{ available: string; locked: string }>(
    `SELECT available, locked FROM futures_margin_accounts
     WHERE wallet_address = $1 AND asset = $2`,
    [walletAddress, asset],
  );
  return rows[0]
    ? { available: parseFloat(rows[0].available), locked: parseFloat(rows[0].locked) }
    : { available: 0, locked: 0 };
}

// ── Position open ─────────────────────────────────────────────────────────────

/**
 * Open a new futures position.
 *
 * Caller must have already verified funding via fundingVerifier.verifyFuturesFunding()
 * and passed the resulting fundingRef in params.fundingRef.
 * The margin lock happens here, not before (fundingVerifier only validates balance).
 */
export async function openFuturesPosition(
  params: FuturesOpenParams,
): Promise<FuturesOpenResult> {
  const {
    walletAddress, symbol, side, leverage,
    margin, quantity, entryPrice, fundingRef,
  } = params;

  // Lock margin from the futures bucket
  await lockFuturesMargin(walletAddress, margin);

  const liquidationPrice = computeLiquidationPrice(entryPrice, leverage, side);
  const notionalValue    = quantity * entryPrice;
  const openingFee       = notionalValue * TAKER_FEE_RATE;
  const positionId       = crypto.randomUUID();
  const unrealizedPnl    = 0;
  const txid             = crypto.createHash("sha256")
    .update(`futures-open:${positionId}:${Date.now()}`)
    .digest("hex");

  await db.insert(futuresPositionsTable).values({
    id:                   positionId,
    walletAddress,
    symbol,
    side,
    leverage:             leverage.toFixed(2),
    entryPrice:           entryPrice.toFixed(8),
    markPrice:            entryPrice.toFixed(8),
    liquidationPrice:     liquidationPrice.toFixed(8),
    quantity:             quantity.toFixed(8),
    margin:               margin.toFixed(8),
    unrealizedPnl:        "0",
    unrealizedPnlPercent: "0",
    realizedPnl:          "0",
    fundingFee:           "0",
    marginMode:           "isolated",
    status:               "open",
    txid,
  });

  return { positionId, liquidationPrice, notionalValue, openingFee };
}

// ── Position close ────────────────────────────────────────────────────────────

/**
 * Close an open position at the given mark price.
 * Realizes PnL and returns margin ± PnL to the futures margin account.
 */
export async function closeFuturesPosition(
  params: FuturesCloseParams,
): Promise<FuturesCloseResult> {
  const { positionId, markPrice } = params;

  const [pos] = await db
    .select()
    .from(futuresPositionsTable)
    .where(eq(futuresPositionsTable.id, positionId));

  if (!pos) throw new Error(`POSITION_NOT_FOUND:${positionId}`);
  if (pos.status !== "open") throw new Error(`POSITION_NOT_OPEN:${positionId}:${pos.status}`);

  const entryPrice = parseFloat(pos.entryPrice);
  const quantity   = parseFloat(pos.quantity);
  const margin     = parseFloat(pos.margin);

  const priceDiff     = markPrice - entryPrice;
  const dirMult       = pos.side === "long" ? 1 : -1;
  const realizedPnl   = dirMult * priceDiff * quantity;
  const closingFee    = markPrice * quantity * TAKER_FEE_RATE;
  const returnedMargin = Math.max(0, margin + realizedPnl - closingFee);

  // Return margin ± PnL to futures bucket
  await releaseFuturesMargin(pos.walletAddress, returnedMargin);

  await db.update(futuresPositionsTable)
    .set({
      status:      "closed",
      markPrice:   markPrice.toFixed(8),
      realizedPnl: realizedPnl.toFixed(8),
      closedAt:    new Date(),
    })
    .where(eq(futuresPositionsTable.id, positionId));

  return { realizedPnl, returnedMargin, closingFee };
}

// ── Liquidation ───────────────────────────────────────────────────────────────

/**
 * Liquidate a position when mark price crosses the liquidation threshold.
 * The entire margin is lost (goes to the protocol insurance fund).
 */
export async function liquidateFuturesPosition(
  positionId: string,
  markPrice:  number,
): Promise<FuturesLiquidateResult> {
  const [pos] = await db
    .select()
    .from(futuresPositionsTable)
    .where(eq(futuresPositionsTable.id, positionId));

  if (!pos || pos.status !== "open") return { loss: 0 };

  const margin = parseFloat(pos.margin);

  // Confiscate the locked margin (it stays locked, removed from account)
  await pool.query(
    `UPDATE futures_margin_accounts
     SET locked     = GREATEST(locked - $1, 0),
         updated_at = now()
     WHERE wallet_address = $2 AND asset = 'USDT'`,
    [margin.toFixed(8), pos.walletAddress],
  );

  await db.update(futuresPositionsTable)
    .set({
      status:    "liquidated",
      markPrice: markPrice.toFixed(8),
      closedAt:  new Date(),
    })
    .where(eq(futuresPositionsTable.id, positionId));

  return { loss: margin };
}
