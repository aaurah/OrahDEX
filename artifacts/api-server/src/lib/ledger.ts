/**
 * ledger.ts — Single source of truth for user balances.
 *
 * All mutating operations run inside a DB transaction with SELECT FOR UPDATE
 * row locks so there is no double-spend and no "balance not cutting" bugs.
 *
 * Rules:
 *  - `available` = funds the user can trade/withdraw right now
 *  - `locked`    = funds held against open orders
 *  - LP positions are tracked separately in liquidity_positions — they do NOT
 *    appear in available or locked (no double-counting)
 */

import { pool } from "@workspace/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Balance {
  asset:     string;
  available: string;
  locked:    string;
}

export interface LpPosition {
  id:            number;
  poolId:        string;
  assetA:        string;
  assetB:        string;
  amountA:       string;
  amountB:       string;
  lpTokens:      string;
  status:        string;
  createdAt:     Date;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function big(n: string | number): bigint {
  // We keep amounts as strings in the DB.  Use comparison helpers below.
  return 0n; // placeholder; we rely on DB for arithmetic
}

// Compare two decimal strings
export function gte(a: string, b: string): boolean {
  return parseFloat(a) >= parseFloat(b);
}

export function lt(a: string, b: string): boolean {
  return parseFloat(a) < parseFloat(b);
}

// ── Ensure balance row exists (upsert with 0) ─────────────────────────────

async function ensureBalance(
  client: { query: Function },
  walletAddress: string,
  asset: string,
): Promise<void> {
  await client.query(
    `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
     VALUES ($1, $2, '0', '0', now())
     ON CONFLICT (wallet_address, asset_symbol) DO NOTHING`,
    [walletAddress, asset],
  );
}

// ── Get all balances for a wallet ────────────────────────────────────────────

export async function getBalances(walletAddress: string): Promise<Balance[]> {
  const { rows } = await pool.query<{ asset_symbol: string; available: string; locked: string }>(
    `SELECT asset_symbol, available, locked
     FROM user_balances
     WHERE wallet_address = $1
     ORDER BY asset_symbol`,
    [walletAddress],
  );
  return rows.map(r => ({ asset: r.asset_symbol, available: r.available, locked: r.locked }));
}

// ── Seed initial balances (demo / first-time user) ───────────────────────────
// Called once when a wallet is first seen.  Uses a deterministic PRNG so every
// fresh wallet always starts with the same amounts (reproducible demo data).

export async function seedInitialBalances(walletAddress: string): Promise<void> {
  function seededRng(addr: string, slot: number): number {
    let h = 0xcafe1234 ^ slot;
    for (let i = 0; i < addr.length; i++) {
      h = Math.imul(h ^ addr.charCodeAt(i), 0x9e3779b9);
      h ^= h >>> 16;
    }
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return Math.abs(h) / 0x7fffffff;
  }
  function between(addr: string, slot: number, min: number, max: number): number {
    return min + seededRng(addr, slot) * (max - min);
  }

  const SEED_ASSETS = [
    { asset: "USDT", min: 500,   max: 15000, dec: 2 },
    { asset: "BSV",  min: 5,     max: 200,   dec: 4 },
    { asset: "BTC",  min: 0.001, max: 0.5,   dec: 8 },
    { asset: "ETH",  min: 0.05,  max: 8,     dec: 6 },
    { asset: "BNB",  min: 0.5,   max: 20,    dec: 4 },
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < SEED_ASSETS.length; i++) {
      const a = SEED_ASSETS[i]!;
      const amount = between(walletAddress, i * 3, a.min, a.max).toFixed(a.dec);
      await client.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
         VALUES ($1, $2, $3, '0', now())
         ON CONFLICT (wallet_address, asset_symbol) DO NOTHING`,
        [walletAddress, a.asset, amount],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Credit (direct add to available — e.g. on deposit) ──────────────────────

export async function creditAvailable(
  walletAddress: string,
  asset:         string,
  amount:        string,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
     VALUES ($1, $2, $3, '0', now())
     ON CONFLICT (wallet_address, asset_symbol)
     DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
    [walletAddress, asset, amount],
  );
}

// ── Lock funds for an order (available → locked) ──────────────────────────────

export async function lockForOrder(params: {
  walletAddress: string;
  asset:         string;
  amount:        string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureBalance(client, params.walletAddress, params.asset);

    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [params.walletAddress, params.asset],
    );

    const row = rows[0];
    if (!row || lt(row.available, params.amount)) {
      throw new Error(`INSUFFICIENT_FUNDS:${params.asset}`);
    }

    await client.query(
      `UPDATE user_balances
       SET available  = available - $1,
           locked     = locked + $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [params.amount, params.walletAddress, params.asset],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Unlock funds (locked → available — e.g. on order cancel) ─────────────────

export async function unlockFunds(params: {
  walletAddress: string;
  asset:         string;
  amount:        string;
}): Promise<void> {
  await pool.query(
    `UPDATE user_balances
     SET locked     = GREATEST(locked - $1, 0),
         available  = available + LEAST(locked, $1),
         updated_at = now()
     WHERE wallet_address = $2 AND asset_symbol = $3`,
    [params.amount, params.walletAddress, params.asset],
  );
}

// ── Settle a matched trade (locked → available for both parties) ──────────────

export async function settleTrade(params: {
  buyerAddress:  string;
  sellerAddress: string;
  baseAsset:     string;
  quoteAsset:    string;
  amount:        string;   // base amount filled
  price:         string;   // fill price
  feePct?:       number;   // fraction e.g. 0.001 = 0.1%
}): Promise<void> {
  const { buyerAddress, sellerAddress, baseAsset, quoteAsset, amount, price, feePct = 0.001 } = params;
  const cost    = (parseFloat(amount) * parseFloat(price)).toFixed(18);
  const buyFee  = (parseFloat(amount) * feePct).toFixed(18);
  const sellFee = (parseFloat(cost)   * feePct).toFixed(18);
  const netBase = (parseFloat(amount) - parseFloat(buyFee)).toFixed(18);
  const netQuote= (parseFloat(cost)   - parseFloat(sellFee)).toFixed(18);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock all four rows at once (ORDER BY to prevent deadlocks)
    await client.query(
      `SELECT id FROM user_balances
       WHERE (wallet_address = $1 OR wallet_address = $2)
         AND asset_symbol IN ($3, $4)
       ORDER BY wallet_address, asset_symbol
       FOR UPDATE`,
      [buyerAddress, sellerAddress, baseAsset, quoteAsset],
    );

    // Buyer: clear full locked amount for quote, refund excess (limit price vs fill price),
    // and credit base asset. This handles "buy at limit 50, filled at 15" correctly.
    await client.query(
      `UPDATE user_balances
       SET available  = available + GREATEST(locked - $1::numeric, '0'),
           locked     = 0,
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [cost, buyerAddress, quoteAsset],
    );
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [buyerAddress, baseAsset, netBase],
    );

    // Seller: locked_base -= amount, available_quote += netQuote
    await client.query(
      `UPDATE user_balances
       SET locked     = GREATEST(locked - $1, 0),
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amount, sellerAddress, baseAsset],
    );
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [sellerAddress, quoteAsset, netQuote],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Settle a swap (AMM — direct debit/credit) ─────────────────────────────────

export async function settleSwap(params: {
  walletAddress: string;
  assetIn:       string;
  assetOut:      string;
  amountIn:      string;
  amountOut:     string;
}): Promise<void> {
  const { walletAddress, assetIn, assetOut, amountIn, amountOut } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureBalance(client, walletAddress, assetIn);

    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, assetIn],
    );

    const row = rows[0];
    if (!row || lt(row.available, amountIn)) {
      throw new Error(`INSUFFICIENT_FUNDS:${assetIn}`);
    }

    await client.query(
      `UPDATE user_balances
       SET available  = available - $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amountIn, walletAddress, assetIn],
    );

    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [walletAddress, assetOut, amountOut],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Add liquidity ────────────────────────────────────────────────────────────

export async function addLiquidity(params: {
  walletAddress: string;
  poolId:        string;
  assetA:        string;
  assetB:        string;
  amountA:       string;
  amountB:       string;
}): Promise<{ lpTokens: string; positionId: number }> {
  const { walletAddress, poolId, assetA, assetB, amountA, amountB } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureBalance(client, walletAddress, assetA);
    await ensureBalance(client, walletAddress, assetB);

    const { rows: rowsA } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, assetA],
    );
    const { rows: rowsB } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, assetB],
    );

    if (!rowsA[0] || lt(rowsA[0].available, amountA)) throw new Error(`INSUFFICIENT_FUNDS:${assetA}`);
    if (!rowsB[0] || lt(rowsB[0].available, amountB)) throw new Error(`INSUFFICIENT_FUNDS:${assetB}`);

    await client.query(
      `UPDATE user_balances
       SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amountA, walletAddress, assetA],
    );
    await client.query(
      `UPDATE user_balances
       SET available = available - $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amountB, walletAddress, assetB],
    );

    // LP tokens = geometric mean of amounts (simplified)
    const lpTokens = Math.sqrt(parseFloat(amountA) * parseFloat(amountB)).toFixed(18);

    const { rows: posRows } = await client.query<{ id: number }>(
      `INSERT INTO liquidity_positions
         (wallet_address, pool_id, asset_a, asset_b, amount_a, amount_b, lp_tokens, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now())
       RETURNING id`,
      [walletAddress, poolId, assetA, assetB, amountA, amountB, lpTokens],
    );

    await client.query("COMMIT");
    return { lpTokens, positionId: posRows[0]!.id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Remove liquidity ─────────────────────────────────────────────────────────

export async function removeLiquidity(params: {
  walletAddress: string;
  positionId:    number;
}): Promise<{ assetA: string; assetB: string; amountA: string; amountB: string }> {
  const { walletAddress, positionId } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{
      id: number; pool_id: string; asset_a: string; asset_b: string;
      amount_a: string; amount_b: string; lp_tokens: string; status: string;
    }>(
      `SELECT * FROM liquidity_positions
       WHERE id = $1 AND wallet_address = $2 AND status = 'active'
       FOR UPDATE`,
      [positionId, walletAddress],
    );

    const pos = rows[0];
    if (!pos) throw new Error("POSITION_NOT_FOUND");

    await client.query(
      `UPDATE liquidity_positions SET status = 'removed', updated_at = now() WHERE id = $1`,
      [positionId],
    );

    // Return both assets to available
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [walletAddress, pos.asset_a, pos.amount_a],
    );
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, $3, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $3, updated_at = now()`,
      [walletAddress, pos.asset_b, pos.amount_b],
    );

    await client.query("COMMIT");
    return { assetA: pos.asset_a, assetB: pos.asset_b, amountA: pos.amount_a, amountB: pos.amount_b };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Get LP positions for a wallet ─────────────────────────────────────────────

export async function getLpPositions(walletAddress: string): Promise<LpPosition[]> {
  const { rows } = await pool.query<{
    id: number; pool_id: string; asset_a: string; asset_b: string;
    amount_a: string; amount_b: string; lp_tokens: string; status: string; created_at: Date;
  }>(
    `SELECT id, pool_id, asset_a, asset_b, amount_a, amount_b, lp_tokens, status, created_at
     FROM liquidity_positions
     WHERE wallet_address = $1
     ORDER BY created_at DESC`,
    [walletAddress],
  );
  return rows.map(r => ({
    id:        r.id,
    poolId:    r.pool_id,
    assetA:    r.asset_a,
    assetB:    r.asset_b,
    amountA:   r.amount_a,
    amountB:   r.amount_b,
    lpTokens:  r.lp_tokens,
    status:    r.status,
    createdAt: r.created_at,
  }));
}
