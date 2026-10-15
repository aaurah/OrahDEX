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
 *   Standard isolated-margin perp formula (loss = margin * (1 - mmr)):
 *     LONG:  liquidationPrice = entryPrice * (1 - (1 - mmr) / leverage)
 *     SHORT: liquidationPrice = entryPrice * (1 + (1 - mmr) / leverage)
 *
 *   maintenanceMarginRate = 0.005 (0.5%)
 */

import { pool, db, withDbRetry } from "@workspace/db";
import { futuresPositionsTable, marketsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { parseUnits, formatUnits, mulDiv, mulPriceQty, pow10 } from "./money.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAINTENANCE_MARGIN_RATE   = 0.005;   // 0.5%
const DEFAULT_TAKER_FEE_RATE    = 0.0005;  // 0.05% — fallback when market row has no fee
/** Maximum allowed leverage to prevent instant-liquidation abuse. */
export const MAX_FUTURES_LEVERAGE = 100;

const PRICE_DECIMALS = 8;
const QTY_DECIMALS = 8;
const MONEY_DECIMALS = 18;

function moneyRaw(value: string | number): bigint {
  return parseUnits(String(value), MONEY_DECIMALS);
}
function priceRaw(value: string | number): bigint {
  return parseUnits(String(value), PRICE_DECIMALS);
}
function qtyRaw(value: string | number): bigint {
  return parseUnits(String(value), QTY_DECIMALS);
}
function feeFractionRaw(value: string | number): bigint {
  return parseUnits(String(value), MONEY_DECIMALS);
}
function unit(): bigint {
  return pow10(MONEY_DECIMALS);
}
function liquidationPriceRawFromEntry(entryRaw: bigint, leverage: bigint, side: "long" | "short"): bigint {
  if (leverage < 1n) throw new Error("INVALID_LEVERAGE");
  const mmrRaw = feeFractionRaw(MAINTENANCE_MARGIN_RATE);
  const moveRaw = (unit() - mmrRaw) / leverage;
  return side === "long"
    ? mulDiv(entryRaw, unit() - moveRaw, unit(), "floor")
    : mulDiv(entryRaw, unit() + moveRaw, unit(), "ceil");
}

/** Look up the taker fee for a perp symbol from the markets table; falls back to the constant. */
async function getTakerFeeRate(symbol: string): Promise<string> {
  try {
    const baseSym = symbol.replace("-PERP", "");
    const [m] = await withDbRetry(() =>
      db.select().from(marketsTable).where(eq(marketsTable.symbol, baseSym))
    );
    if (m?.takerFee) {
      try {
        feeFractionRaw(m.takerFee);
        return m.takerFee;
      } catch {
        // fall through
      }
    }
    return DEFAULT_TAKER_FEE_RATE.toString();
  } catch {
    return DEFAULT_TAKER_FEE_RATE.toString();
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FuturesOpenParams {
  walletAddress: string;
  symbol:        string;
  side:          "long" | "short";
  leverage:      number;
  /** Margin amount in USDT committed from futures_margin_accounts */
  margin:        string | number;
  /** Notional quantity */
  quantity:      string | number;
  entryPrice:    string | number;
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
  markPrice:  string | number;
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
  entryPrice: string | number,
  leverage:   number,
  side:       "long" | "short",
): number {
  const entryRaw = priceRaw(entryPrice);
  const leverageBig = BigInt(Math.round(leverage));
  const liqRaw = liquidationPriceRawFromEntry(entryRaw, leverageBig, side);
  return Number(formatUnits(liqRaw, PRICE_DECIMALS));
}

// ── Margin bucket helpers ─────────────────────────────────────────────────────

/**
 * Lock `amount` of USDT in the futures margin bucket for `walletAddress`.
 * Throws "INSUFFICIENT_FUTURES_MARGIN" if the available balance is too low.
 * The spot user_balances table is NEVER touched here.
 */
export async function lockFuturesMargin(
  walletAddress: string,
  amount:        string | number,
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

    const amountRaw = moneyRaw(amount);
    if (amountRaw <= 0n) throw new Error(`lockFuturesMargin: invalid amount ${amount}`);
    const availRaw = moneyRaw(rows[0]?.available ?? "0");
    if (availRaw < amountRaw) {
      throw new Error(
        `INSUFFICIENT_FUTURES_MARGIN:${asset}:need=${formatUnits(amountRaw, MONEY_DECIMALS)},` +
        `have=${formatUnits(availRaw, MONEY_DECIMALS)}`,
      );
    }

    await client.query(
      `UPDATE futures_margin_accounts
       SET available  = available - $1,
           locked     = locked + $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset = $3`,
      [formatUnits(amountRaw, MONEY_DECIMALS), walletAddress, asset],
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
  amount:        string | number,
  asset:         string = "USDT",
): Promise<void> {
  const amountRaw = moneyRaw(amount);
  if (amountRaw <= 0n) {
    throw new Error(`releaseFuturesMargin: invalid amount ${amount}`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ locked: string }>(
      `SELECT locked FROM futures_margin_accounts
       WHERE wallet_address = $1 AND asset = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );
    const currentLockedRaw = moneyRaw(rows[0]?.locked ?? "0");
    if (currentLockedRaw < amountRaw) {
      throw new Error(
        `releaseFuturesMargin: cannot release ${amount} ${asset} — only ` +
        `${formatUnits(currentLockedRaw, MONEY_DECIMALS)} is locked for ${walletAddress}`,
      );
    }
    const actualReleaseRaw = amountRaw;
    await client.query(
      `UPDATE futures_margin_accounts
       SET locked     = locked - $1,
           available  = available + $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset = $3`,
      [formatUnits(actualReleaseRaw, MONEY_DECIMALS), walletAddress, asset],
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
 * Transfer USDT from the spot wallet into the futures margin account.
 * This is the ONLY authorised pathway that crosses between buckets, and it
 * must be an explicit user action (not automatic).
 *
 * Both the spot debit and futures credit run inside a single transaction
 * so neither can succeed without the other.
 */
export async function depositToFuturesMargin(
  walletAddress: string,
  amount:        string | number,
  asset:         string = "USDT",
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Debit spot balance (with row-lock to prevent race)
    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );
    const amountRaw = moneyRaw(amount);
    if (amountRaw <= 0n) throw new Error(`depositToFuturesMargin: invalid amount ${amount}`);
    const availRaw = moneyRaw(rows[0]?.available ?? "0");
    if (availRaw < amountRaw) {
      throw new Error(`INSUFFICIENT_FUNDS:${asset}`);
    }
    const amountSql = formatUnits(amountRaw, MONEY_DECIMALS);

    await client.query(
      `UPDATE user_balances
       SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amountSql, walletAddress, asset],
    );

    // Credit futures margin
    await client.query(
      `INSERT INTO futures_margin_accounts (wallet_address, asset, available, locked, updated_at)
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT (wallet_address, asset)
       DO UPDATE SET available = futures_margin_accounts.available + $3, updated_at = now()`,
      [walletAddress, asset, amountSql],
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
 * Atomically locks the margin AND inserts the position row in a single
 * database transaction.  The previous two-step flow (lockFuturesMargin in
 * its own transaction, then a separate db.insert) left a race window where
 * margin could be debited but no position existed if the server crashed or
 * the process was killed between the two commits.
 *
 * Caller must have already verified funding via fundingVerifier.verifyFuturesFunding()
 * and passed the resulting fundingRef in params.fundingRef.
 */
export async function openFuturesPosition(
  params: FuturesOpenParams,
): Promise<FuturesOpenResult> {
  const {
    walletAddress, symbol, side, leverage,
    margin, quantity, entryPrice, fundingRef,
  } = params;

  const leverageNumber = Number(leverage);
  if (!Number.isFinite(leverageNumber) || leverageNumber < 1 || leverageNumber > MAX_FUTURES_LEVERAGE) {
    throw new Error(
      `INVALID_LEVERAGE: leverage must be between 1 and ${MAX_FUTURES_LEVERAGE}, got ${leverage}`,
    );
  }
  const leverageBig = BigInt(Math.round(leverageNumber));

  const entryRaw = priceRaw(entryPrice);
  const quantityRaw = qtyRaw(quantity);
  const marginRaw = moneyRaw(margin);
  if (entryRaw <= 0n || quantityRaw <= 0n || marginRaw <= 0n) {
    throw new Error(`Invalid open params: entry=${entryPrice}, qty=${quantity}, margin=${margin}`);
  }

  const liquidationPriceRaw = liquidationPriceRawFromEntry(entryRaw, leverageBig, side);
  const notionalRaw = mulPriceQty({
    priceRaw: entryRaw,
    priceDecimals: PRICE_DECIMALS,
    quantityRaw,
    quantityDecimals: QTY_DECIMALS,
    outputDecimals: MONEY_DECIMALS,
    rounding: "ceil",
  });
  const takerFeeRate = await getTakerFeeRate(symbol);
  const openingFeeRaw = mulDiv(notionalRaw, feeFractionRaw(takerFeeRate), unit(), "floor");

  const liquidationPrice = Number(formatUnits(liquidationPriceRaw, PRICE_DECIMALS));
  const notionalValue = Number(formatUnits(notionalRaw, MONEY_DECIMALS));
  const openingFee = Number(formatUnits(openingFeeRaw, MONEY_DECIMALS));
  const positionId       = crypto.randomUUID();
  const txid             = crypto.createHash("sha256")
    .update(`futures-open:${positionId}:${Date.now()}`)
    .digest("hex");

  // ── Atomic: lock margin AND insert position in ONE transaction ─────────────
  // Eliminates the race window that existed when these were separate commits.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure the margin account row exists before we lock it
    await client.query(
      `INSERT INTO futures_margin_accounts (wallet_address, asset, available, locked, updated_at)
       VALUES ($1, 'USDT', 0, 0, now())
       ON CONFLICT (wallet_address, asset) DO NOTHING`,
      [walletAddress],
    );

    // Lock the row and verify sufficient balance
    const { rows: marginRows } = await client.query<{ available: string }>(
      `SELECT available FROM futures_margin_accounts
       WHERE wallet_address = $1 AND asset = 'USDT' FOR UPDATE`,
      [walletAddress],
    );
    const availRaw = moneyRaw(marginRows[0]?.available ?? "0");
    if (availRaw < marginRaw) {
      throw new Error(
        `INSUFFICIENT_FUTURES_MARGIN:USDT:need=${formatUnits(marginRaw, MONEY_DECIMALS)},` +
        `have=${formatUnits(availRaw, MONEY_DECIMALS)}`,
      );
    }

    // Move margin: available → locked
    await client.query(
      `UPDATE futures_margin_accounts
       SET available  = available - $1,
           locked     = locked + $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset = 'USDT'`,
      [formatUnits(marginRaw, MONEY_DECIMALS), walletAddress],
    );

    // Insert the position row in the same transaction — no race window
    await client.query(
      `INSERT INTO futures_positions
         (id, wallet_address, symbol, side, leverage, entry_price, mark_price,
          liquidation_price, quantity, margin, unrealized_pnl, unrealized_pnl_percent,
          realized_pnl, funding_fee, margin_mode, status, txid, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'0','0','0','0','isolated','open',$11,now())`,
      [
        positionId, walletAddress, symbol, side,
        leverageNumber.toFixed(2),
        formatUnits(entryRaw, PRICE_DECIMALS),
        formatUnits(entryRaw, PRICE_DECIMALS),
        formatUnits(liquidationPriceRaw, PRICE_DECIMALS),
        formatUnits(quantityRaw, QTY_DECIMALS),
        formatUnits(marginRaw, MONEY_DECIMALS),
        txid,
      ],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: posRows } = await client.query<{
      id: string; wallet_address: string; symbol: string; side: string;
      entry_price: string; quantity: string; margin: string; status: string;
    }>(
      `SELECT id, wallet_address, symbol, side, entry_price, quantity, margin, status
       FROM futures_positions WHERE id = $1 FOR UPDATE`,
      [positionId],
    );

    const pos = posRows[0];
    if (!pos) throw new Error(`POSITION_NOT_FOUND:${positionId}`);
    if (pos.status !== "open") throw new Error(`POSITION_NOT_OPEN:${positionId}:${pos.status}`);

    const entryRaw = parseUnits(pos.entry_price, PRICE_DECIMALS);
    const markRaw = priceRaw(markPrice);
    const quantityRaw = parseUnits(pos.quantity, QTY_DECIMALS);
    const marginRaw = moneyRaw(pos.margin);

    const priceDiffRaw = markRaw - entryRaw;
    const absDiffRaw = priceDiffRaw < 0n ? -priceDiffRaw : priceDiffRaw;
    const absolutePnlRaw = mulPriceQty({
      priceRaw: absDiffRaw,
      priceDecimals: PRICE_DECIMALS,
      quantityRaw,
      quantityDecimals: QTY_DECIMALS,
      outputDecimals: MONEY_DECIMALS,
      rounding: "floor",
    });
    const realizedPnlRaw = pos.side === "long" ? absolutePnlRaw : -absolutePnlRaw;

    const takerFeeRate = await getTakerFeeRate(pos.symbol);
    const notionalRaw = mulPriceQty({
      priceRaw: markRaw,
      priceDecimals: PRICE_DECIMALS,
      quantityRaw,
      quantityDecimals: QTY_DECIMALS,
      outputDecimals: MONEY_DECIMALS,
      rounding: "ceil",
    });
    const closingFeeRaw = mulDiv(notionalRaw, feeFractionRaw(takerFeeRate), unit(), "floor");

    const returnedMarginRawCandidate = marginRaw + realizedPnlRaw - closingFeeRaw;
    const returnedMarginRaw = returnedMarginRawCandidate > 0n ? returnedMarginRawCandidate : 0n;

    const realizedPnl = Number(formatUnits(realizedPnlRaw, MONEY_DECIMALS));
    const returnedMargin = Number(formatUnits(returnedMarginRaw, MONEY_DECIMALS));
    const closingFeeNumber = Number(formatUnits(closingFeeRaw, MONEY_DECIMALS));

    const { rowCount: marginRows } = await client.query(
      `UPDATE futures_margin_accounts
       SET locked     = GREATEST(locked - $1, 0),
           available  = available + $2,
           updated_at = now()
       WHERE wallet_address = $3 AND asset = 'USDT'`,
      [formatUnits(marginRaw, MONEY_DECIMALS), formatUnits(returnedMarginRaw, MONEY_DECIMALS), pos.wallet_address],
    );
    if ((marginRows ?? 0) < 1) throw new Error(`NO_MARGIN_ACCOUNT:${pos.wallet_address}`);

    await client.query(
      `UPDATE futures_positions
       SET status       = 'closed',
           mark_price   = $1,
           realized_pnl = $2,
           closed_at    = now()
       WHERE id = $3 AND status = 'open'`,
      [formatUnits(markRaw, PRICE_DECIMALS), formatUnits(realizedPnlRaw, MONEY_DECIMALS), positionId],
    );

    await client.query("COMMIT");
    return { realizedPnl, returnedMargin, closingFee: closingFeeNumber };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Liquidation ───────────────────────────────────────────────────────────────

/**
 * Liquidate a position when mark price crosses the liquidation threshold.
 * The entire margin is lost (goes to the protocol insurance fund).
 * Uses SELECT FOR UPDATE to prevent double-liquidation race conditions.
 */
export async function liquidateFuturesPosition(
  positionId: string,
  markPrice:  string | number,
): Promise<FuturesLiquidateResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Row-lock the position first to prevent concurrent liquidations from
    // both reading status='open' and each proceeding with full liquidation.
    const { rows: posRows } = await client.query<{
      id: string; wallet_address: string; margin: string; status: string;
    }>(
      `SELECT id, wallet_address, margin, status FROM futures_positions WHERE id = $1 FOR UPDATE`,
      [positionId],
    );

    const pos = posRows[0];
    if (!pos || pos.status !== "open") {
      await client.query("ROLLBACK");
      return { loss: 0 };
    }

    const marginRaw = moneyRaw(pos.margin);
    const markRaw = priceRaw(markPrice);

    // Confiscate the locked margin (it stays locked, removed from account)
    await client.query(
      `UPDATE futures_margin_accounts
       SET locked     = GREATEST(locked - $1, 0),
           updated_at = now()
       WHERE wallet_address = $2 AND asset = 'USDT'`,
      [formatUnits(marginRaw, MONEY_DECIMALS), pos.wallet_address],
    );

    await client.query(
      `UPDATE futures_positions
       SET status     = 'liquidated',
           mark_price = $1,
           closed_at  = now()
       WHERE id = $2 AND status = 'open'`,
      [formatUnits(markRaw, PRICE_DECIMALS), positionId],
    );

    await client.query("COMMIT");
    return { loss: Number(formatUnits(marginRaw, MONEY_DECIMALS)) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
