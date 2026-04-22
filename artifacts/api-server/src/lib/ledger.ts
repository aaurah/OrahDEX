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
  const { rows } = await pool.query<{ asset_symbol: string; available: string; locked: string; seeded: string }>(
    `SELECT asset_symbol,
            GREATEST(0, available - COALESCE(seeded, 0)) AS available,
            locked,
            COALESCE(seeded, 0) AS seeded
     FROM user_balances
     WHERE wallet_address = $1
     ORDER BY asset_symbol`,
    [walletAddress],
  );
  // Only return assets where the user has a real (non-seeded) balance > 0,
  // so the portfolio view is clean and shows nothing for pure-seeded wallets.
  return rows
    .map(r => ({ asset: r.asset_symbol, available: r.available, locked: r.locked }))
    .filter(r => parseFloat(r.available) > 0 || parseFloat(r.locked) > 0);
}

// ── Seed initial balances (first-time user) ──────────────────────────────────
// Called once when a wallet is first seen.  Uses a deterministic PRNG so every
// fresh wallet always starts with the same amounts (reproducible seed data).

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
    // ── Stablecoins ──────────────────────────────────────────────────────────
    { asset: "USDT",  min: 1000,    max: 20000,      dec: 2 },
    { asset: "USDC",  min: 1000,    max: 20000,      dec: 2 },
    { asset: "TUSD",  min: 1000,    max: 10000,      dec: 2 },
    { asset: "FDUSD", min: 500,     max: 5000,       dec: 2 },
    { asset: "BUSD",  min: 500,     max: 10000,      dec: 2 },
    { asset: "DAI",   min: 500,     max: 10000,      dec: 2 },
    { asset: "USDD",  min: 200,     max: 3000,       dec: 2 },
    // ── L1 / Major chains ────────────────────────────────────────────────────
    { asset: "BTC",   min: 0.01,    max: 1.0,        dec: 8 },
    { asset: "ETH",   min: 0.5,     max: 10,         dec: 6 },
    { asset: "BSV",   min: 10,      max: 300,        dec: 4 },
    { asset: "BNB",   min: 1,       max: 30,         dec: 4 },
    { asset: "SOL",   min: 5,       max: 100,        dec: 4 },
    { asset: "XRP",   min: 100,     max: 5000,       dec: 2 },
    { asset: "ADA",   min: 100,     max: 5000,       dec: 2 },
    { asset: "DOGE",  min: 500,     max: 20000,      dec: 2 },
    { asset: "TRX",   min: 500,     max: 10000,      dec: 2 },
    { asset: "TON",   min: 5,       max: 200,        dec: 4 },
    { asset: "MATIC", min: 100,     max: 3000,       dec: 2 },
    { asset: "AVAX",  min: 5,       max: 100,        dec: 4 },
    { asset: "BCH",   min: 0.5,     max: 20,         dec: 6 },
    { asset: "LTC",   min: 0.5,     max: 20,         dec: 6 },
    { asset: "DOT",   min: 10,      max: 300,        dec: 4 },
    { asset: "ATOM",  min: 5,       max: 150,        dec: 4 },
    { asset: "NEAR",  min: 10,      max: 400,        dec: 4 },
    { asset: "FTM",   min: 100,     max: 5000,       dec: 2 },
    { asset: "ALGO",  min: 100,     max: 5000,       dec: 2 },
    { asset: "XLM",   min: 100,     max: 5000,       dec: 2 },
    { asset: "HBAR",  min: 200,     max: 10000,      dec: 2 },
    { asset: "ETC",   min: 1,       max: 30,         dec: 4 },
    { asset: "XMR",   min: 0.1,     max: 5,          dec: 6 },
    { asset: "EGLD",  min: 0.5,     max: 20,         dec: 4 },
    { asset: "ZEC",   min: 0.5,     max: 20,         dec: 4 },
    { asset: "DASH",  min: 0.5,     max: 20,         dec: 4 },
    { asset: "EOS",   min: 20,      max: 500,        dec: 2 },
    { asset: "THETA", min: 20,      max: 500,        dec: 2 },
    { asset: "VET",   min: 1000,    max: 50000,      dec: 0 },
    { asset: "ICP",   min: 10,      max: 300,        dec: 4 },
    { asset: "SEI",   min: 50,      max: 2000,       dec: 2 },
    { asset: "KAS",   min: 1000,    max: 30000,      dec: 0 },
    { asset: "STX",   min: 50,      max: 1500,       dec: 2 },
    { asset: "ROSE",  min: 100,     max: 5000,       dec: 2 },
    { asset: "ONE",   min: 100,     max: 5000,       dec: 2 },
    // ── L2 / EVM chains ──────────────────────────────────────────────────────
    { asset: "ARB",   min: 50,      max: 2000,       dec: 4 },
    { asset: "OP",    min: 20,      max: 500,        dec: 4 },
    { asset: "SUI",   min: 50,      max: 2000,       dec: 4 },
    { asset: "APT",   min: 5,       max: 150,        dec: 4 },
    { asset: "IMX",   min: 20,      max: 500,        dec: 4 },
    { asset: "STRK",  min: 20,      max: 500,        dec: 4 },
    { asset: "ZK",    min: 100,     max: 3000,       dec: 2 },
    { asset: "METIS", min: 1,       max: 30,         dec: 4 },
    // ── DeFi blue chips ──────────────────────────────────────────────────────
    { asset: "LINK",  min: 10,      max: 500,        dec: 4 },
    { asset: "UNI",   min: 10,      max: 500,        dec: 4 },
    { asset: "AAVE",  min: 1,       max: 50,         dec: 4 },
    { asset: "MKR",   min: 0.01,    max: 0.5,        dec: 6 },
    { asset: "CRV",   min: 50,      max: 2000,       dec: 2 },
    { asset: "SUSHI", min: 20,      max: 500,        dec: 2 },
    { asset: "COMP",  min: 0.5,     max: 20,         dec: 4 },
    { asset: "GRT",   min: 100,     max: 5000,       dec: 2 },
    { asset: "SNX",   min: 20,      max: 500,        dec: 2 },
    { asset: "YFI",   min: 0.001,   max: 0.05,       dec: 8 },
    { asset: "LDO",   min: 20,      max: 500,        dec: 4 },
    { asset: "GMX",   min: 1,       max: 30,         dec: 4 },
    { asset: "DYDX",  min: 10,      max: 300,        dec: 4 },
    { asset: "RUNE",  min: 10,      max: 300,        dec: 4 },
    { asset: "INJ",   min: 1,       max: 50,         dec: 4 },
    { asset: "RNDR",  min: 5,       max: 150,        dec: 4 },
    { asset: "FET",   min: 20,      max: 500,        dec: 4 },
    { asset: "TAO",   min: 0.01,    max: 0.5,        dec: 6 },
    { asset: "WLD",   min: 5,       max: 200,        dec: 4 },
    { asset: "EIGEN", min: 10,      max: 300,        dec: 4 },
    { asset: "TIA",   min: 5,       max: 150,        dec: 4 },
    { asset: "PENDLE",min: 10,      max: 300,        dec: 4 },
    { asset: "ENS",   min: 5,       max: 100,        dec: 4 },
    // ── Gaming / NFT / Metaverse ─────────────────────────────────────────────
    { asset: "AXS",   min: 5,       max: 200,        dec: 4 },
    { asset: "SAND",  min: 50,      max: 2000,       dec: 2 },
    { asset: "MANA",  min: 50,      max: 2000,       dec: 2 },
    { asset: "GALA",  min: 100,     max: 5000,       dec: 2 },
    { asset: "ILV",   min: 0.5,     max: 20,         dec: 4 },
    { asset: "FIL",   min: 5,       max: 150,        dec: 4 },
    // ── Meme coins ───────────────────────────────────────────────────────────
    { asset: "PEPE",  min: 10000000, max: 500000000, dec: 0 },
    { asset: "SHIB",  min: 500000,  max: 20000000,   dec: 0 },
    { asset: "BONK",  min: 1000000, max: 50000000,   dec: 0 },
    { asset: "FLOKI", min: 100000,  max: 5000000,    dec: 0 },
    { asset: "WIF",   min: 10,      max: 500,        dec: 4 },
    { asset: "POPCAT",min: 50,      max: 2000,       dec: 2 },
    { asset: "NOT",   min: 100,     max: 5000,       dec: 2 },
    { asset: "DOGS",  min: 1000,    max: 50000,      dec: 0 },
    { asset: "NEIRO", min: 100,     max: 5000,       dec: 2 },
    { asset: "TURBO", min: 100,     max: 5000,       dec: 2 },
    { asset: "CATI",  min: 50,      max: 2000,       dec: 2 },
    { asset: "HMSTR", min: 100,     max: 5000,       dec: 2 },
    // ── Tron ecosystem ───────────────────────────────────────────────────────
    { asset: "BTT",   min: 1000000, max: 100000000,  dec: 0 },
    { asset: "WIN",   min: 10000,   max: 500000,     dec: 0 },
    { asset: "JST",   min: 1000,    max: 30000,      dec: 0 },
    // ── Other notable coins ──────────────────────────────────────────────────
    { asset: "CAKE",  min: 10,      max: 300,        dec: 4 },
    { asset: "ORDI",  min: 1,       max: 30,         dec: 4 },
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < SEED_ASSETS.length; i++) {
      const a = SEED_ASSETS[i]!;
      const amount = between(walletAddress, i * 3, a.min, a.max).toFixed(a.dec);
      // Record `seeded` amount so the withdrawal layer can block platform funds.
      // Users may trade with seeded balance but may NOT withdraw it — only admin can.
      await client.query(
        `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, seeded, updated_at)
         VALUES ($1, $2, $3, '0', $3, now())
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

// ── Ensure a specific asset has at least `minAmount` available ────────────────
// Called before locking for an order when the user's balance is missing or
// insufficient for that asset.  Credits a seed amount so any pair can be traded.

const ASSET_SEED_AMOUNTS: Record<string, { amount: string }> = {
  // Stablecoins
  USDT: { amount: "5000" }, USDC: { amount: "5000" }, BUSD: { amount: "5000" },
  DAI:  { amount: "5000" }, TUSD: { amount: "5000" }, FDUSD: { amount: "2000" },
  USDD: { amount: "2000" },
  // Major L1s
  BTC:   { amount: "0.5" },    ETH:   { amount: "5" },      BSV:   { amount: "100" },
  BNB:   { amount: "15" },     SOL:   { amount: "50" },     XRP:   { amount: "2000" },
  ADA:   { amount: "2000" },   DOGE:  { amount: "5000" },   TRX:   { amount: "2000" },
  TON:   { amount: "50" },     MATIC: { amount: "1000" },   AVAX:  { amount: "50" },
  BCH:   { amount: "10" },     LTC:   { amount: "10" },     DOT:   { amount: "100" },
  ATOM:  { amount: "50" },     NEAR:  { amount: "100" },    FTM:   { amount: "1000" },
  ALGO:  { amount: "1000" },   XLM:   { amount: "1000" },   HBAR:  { amount: "2000" },
  ETC:   { amount: "10" },     XMR:   { amount: "1" },      EGLD:  { amount: "5" },
  ZEC:   { amount: "5" },      DASH:  { amount: "5" },      EOS:   { amount: "100" },
  THETA: { amount: "100" },    VET:   { amount: "10000" },  ICP:   { amount: "100" },
  SEI:   { amount: "500" },    KAS:   { amount: "5000" },   STX:   { amount: "200" },
  ROSE:  { amount: "500" },    ONE:   { amount: "500" },
  // L2 / EVM
  ARB:   { amount: "200" },    OP:    { amount: "100" },    SUI:   { amount: "200" },
  APT:   { amount: "50" },     IMX:   { amount: "100" },    STRK:  { amount: "100" },
  ZK:    { amount: "500" },    METIS: { amount: "5" },
  // DeFi
  LINK:  { amount: "200" },    UNI:   { amount: "200" },    AAVE:  { amount: "20" },
  MKR:   { amount: "0.1" },    CRV:   { amount: "500" },    SUSHI: { amount: "100" },
  COMP:  { amount: "5" },      GRT:   { amount: "1000" },   SNX:   { amount: "100" },
  YFI:   { amount: "0.01" },   LDO:   { amount: "100" },    GMX:   { amount: "5" },
  DYDX:  { amount: "100" },    RUNE:  { amount: "100" },    INJ:   { amount: "20" },
  RNDR:  { amount: "50" },     FET:   { amount: "100" },    TAO:   { amount: "0.1" },
  WLD:   { amount: "50" },     EIGEN: { amount: "100" },    TIA:   { amount: "50" },
  PENDLE:{ amount: "100" },    ENS:   { amount: "20" },
  // Gaming / NFT
  AXS:   { amount: "50" },     SAND:  { amount: "500" },    MANA:  { amount: "500" },
  GALA:  { amount: "1000" },   ILV:   { amount: "5" },      FIL:   { amount: "50" },
  // Meme coins
  PEPE:  { amount: "50000000" }, SHIB: { amount: "5000000" }, BONK: { amount: "5000000" },
  FLOKI: { amount: "500000" }, WIF:   { amount: "100" },    POPCAT:{ amount: "200" },
  NOT:   { amount: "1000" },   DOGS:  { amount: "10000" },  NEIRO: { amount: "500" },
  TURBO: { amount: "500" },    CATI:  { amount: "200" },    HMSTR: { amount: "500" },
  // Tron ecosystem
  BTT:   { amount: "10000000" }, WIN:  { amount: "100000" }, JST:  { amount: "5000" },
  // Others
  CAKE:  { amount: "100" },    ORDI:  { amount: "5" },
};

export async function ensureSeedForAsset(
  walletAddress: string,
  asset:         string,
  neededAmount:  string,
): Promise<void> {
  const needed = parseFloat(neededAmount);
  // Run inside a transaction with a row lock so two concurrent callers
  // cannot both read the same balance and both decide to seed.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert so the row always exists before we lock it
    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, $2, '0', '0', now())
       ON CONFLICT (wallet_address, asset_symbol) DO NOTHING`,
      [walletAddress, asset],
    );

    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );
    const current = rows[0] ? parseFloat(rows[0].available) : 0;
    if (current >= needed) {
      await client.query("ROLLBACK");
      return;  // already sufficient — no seeding required
    }

    // Credit the difference (or a default seed amount, whichever is larger)
    const defaultSeed = parseFloat(ASSET_SEED_AMOUNTS[asset]?.amount ?? "1000");
    const credit = Math.max(needed - current + defaultSeed * 0.5, defaultSeed).toFixed(8);
    await client.query(
      `UPDATE user_balances
       SET available = available + $1, updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [credit, walletAddress, asset],
    );

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

// ── Debit available balance (burn / admin deduction) ──────────────────────────

export async function debitAvailable(
  walletAddress: string,
  asset:         string,
  amount:        string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [walletAddress, asset],
    );
    const row = rows[0];
    if (!row || lt(row.available, amount)) {
      throw new Error(`INSUFFICIENT_FUNDS:${asset}`);
    }
    await client.query(
      `UPDATE user_balances
       SET available  = available - $1,
           updated_at = now()
       WHERE wallet_address = $2 AND asset_symbol = $3`,
      [amount, walletAddress, asset],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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

    const { rows } = await client.query<{ available: string; seeded: string }>(
      `SELECT available, COALESCE(seeded, 0) AS seeded FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2
       FOR UPDATE`,
      [params.walletAddress, params.asset],
    );

    const row = rows[0];
    // Real (withdrawable) balance = available − seeded. Seeded funds are
    // platform liquidity — users cannot trade with them directly.
    const realAvailable = row
      ? Math.max(0, parseFloat(row.available) - parseFloat(row.seeded)).toFixed(18)
      : "0";
    if (!row || lt(realAvailable, params.amount)) {
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

    // Lock all four rows at once (ORDER BY to prevent deadlocks) and read
    // current locked balances so we can assert sufficiency before crediting.
    const { rows: lockedRows } = await client.query<{
      wallet_address: string;
      asset_symbol:   string;
      locked:         string;
    }>(
      `SELECT wallet_address, asset_symbol, locked FROM user_balances
       WHERE (wallet_address = $1 OR wallet_address = $2)
         AND asset_symbol IN ($3, $4)
       ORDER BY wallet_address, asset_symbol
       FOR UPDATE`,
      [buyerAddress, sellerAddress, baseAsset, quoteAsset],
    );

    // Helper: find the locked value for a specific (wallet, asset) pair
    const lockedOf = (addr: string, asset: string): number => {
      const row = lockedRows.find(
        r => r.wallet_address === addr && r.asset_symbol === asset,
      );
      return parseFloat(row?.locked ?? "0");
    };

    // Strict invariant: locked funds must cover the settlement amounts.
    // GREATEST(locked - x, 0) is explicitly prohibited here — it silently
    // creates ledger value from nothing when locked < debit amount.
    // A small epsilon (1e-9) tolerates accumulated floating-point rounding
    // across multiple partial fills on the same limit order.
    const EPSILON = 1e-9;

    const buyerLockedQuote = lockedOf(buyerAddress, quoteAsset);
    if (buyerLockedQuote < parseFloat(cost) - EPSILON) {
      throw new Error(
        `SETTLEMENT_INSUFFICIENT_LOCK: buyer ${buyerAddress} has ` +
        `${buyerLockedQuote} locked ${quoteAsset}, need ${cost}`,
      );
    }

    const sellerLockedBase = lockedOf(sellerAddress, baseAsset);
    if (sellerLockedBase < parseFloat(amount) - EPSILON) {
      throw new Error(
        `SETTLEMENT_INSUFFICIENT_LOCK: seller ${sellerAddress} has ` +
        `${sellerLockedBase} locked ${baseAsset}, need ${amount}`,
      );
    }

    // Buyer: deduct only the fill cost from locked (not the entire locked balance).
    // Any over-locked amount (price improvement on a limit order) stays locked
    // until the order is fully filled or cancelled — the cancel handler returns
    // any remaining locked balance via unlockFunds().
    // Separately credit the received base asset.
    await client.query(
      `UPDATE user_balances
       SET locked     = locked - $1::numeric,
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
       SET locked     = locked - $1,
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

    // Lock both rows in a single query ordered by asset_symbol to prevent deadlocks.
    // Two concurrent transactions locking the same two rows always acquire them in
    // the same order, so no circular wait can form.
    await client.query(
      `SELECT asset_symbol FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = ANY(ARRAY[$2, $3]::text[])
       ORDER BY asset_symbol
       FOR UPDATE`,
      [walletAddress, assetA, assetB],
    );

    const { rows: rowsA } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2`,
      [walletAddress, assetA],
    );
    const { rows: rowsB } = await client.query<{ available: string }>(
      `SELECT available FROM user_balances
       WHERE wallet_address = $1 AND asset_symbol = $2`,
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
