/**
 * bsvDepositWatcher.ts — OrahDEX
 *
 * Polls WhatsOnChain every 60 s and detects new BSV deposits to each user's
 * per-user custodial deposit address (rows in `internal_bsv_wallets`).
 *
 * When a user's on-chain confirmed balance exceeds the amount we have already
 * credited to them, the delta is credited atomically to `user_balances` (asset
 * "BSV") and the running total is recorded so the same coins never double-credit.
 *
 * Sweep-to-hot-wallet is intentionally NOT performed here — funds remain at the
 * per-user deposit address until an operator chooses to sweep. The user's
 * internal exchange balance is credited regardless, so they can immediately
 * trade or queue withdrawals; the operator just needs to keep the BSV hot
 * wallet funded for outgoing payouts.
 *
 * Schema (auto-created on first run):
 *   bsv_deposits_credited (
 *     bsv_address     TEXT PRIMARY KEY,
 *     user_wallet     TEXT NOT NULL,
 *     total_satoshis  BIGINT NOT NULL DEFAULT 0,
 *     last_seen_at    TIMESTAMPTZ DEFAULT NOW()
 *   )
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { guardedInterval } from "./selfHealing.js";

const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
/** Max addresses to scan per tick — protects WoC rate limits. */
const MAX_ADDRESSES_PER_TICK = 50;
const SAT_PER_BSV = 100_000_000;

interface WocBalance {
  confirmed:   number;  // satoshis
  unconfirmed: number;
}

async function ensureTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bsv_deposits_credited (
      bsv_address    TEXT PRIMARY KEY,
      user_wallet    TEXT NOT NULL,
      total_satoshis BIGINT NOT NULL DEFAULT 0,
      last_seen_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bsv_deposits_credited_user_idx
    ON bsv_deposits_credited (user_wallet)
  `);
}

async function fetchBalance(addr: string): Promise<WocBalance | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${BSV_NET.wocBase}/address/${addr}/balance`, {
      signal: ctl.signal,
      headers: { "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as WocBalance;
  } catch {
    return null;
  }
}

/**
 * Atomically credit a delta to a user's BSV balance and bump the running total.
 * If the on-chain confirmed balance has not increased since the last tick, no
 * credit is applied. Returns the credited delta in satoshis (0 = no-op).
 */
async function applyDeltaCredit(params: {
  userWallet:   string;
  bsvAddress:   string;
  confirmedSat: number;
}): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert a zero row first if absent so the subsequent SELECT FOR UPDATE
    // actually has something to lock. Without this, two concurrent ticks could
    // both compute the full delta and both credit (race on first deposit).
    await client.query(
      `INSERT INTO bsv_deposits_credited (bsv_address, user_wallet, total_satoshis, last_seen_at)
       VALUES ($1, $2, 0, now())
       ON CONFLICT (bsv_address) DO NOTHING`,
      [params.bsvAddress, params.userWallet],
    );

    const { rows } = await client.query<{ total_satoshis: string }>(
      `SELECT total_satoshis::text FROM bsv_deposits_credited
       WHERE bsv_address = $1 FOR UPDATE`,
      [params.bsvAddress],
    );
    const previouslyCredited = rows[0] ? parseInt(rows[0].total_satoshis, 10) : 0;
    const deltaSat = params.confirmedSat - previouslyCredited;

    if (deltaSat <= 0) {
      // Touch last_seen_at even on no-op so we know the address is being scanned.
      await client.query(
        `INSERT INTO bsv_deposits_credited (bsv_address, user_wallet, total_satoshis, last_seen_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (bsv_address) DO UPDATE SET last_seen_at = now()`,
        [params.bsvAddress, params.userWallet, params.confirmedSat],
      );
      await client.query("COMMIT");
      return 0;
    }

    const deltaBsv = (deltaSat / SAT_PER_BSV).toFixed(18);

    await client.query(
      `INSERT INTO bsv_deposits_credited (bsv_address, user_wallet, total_satoshis, last_seen_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (bsv_address) DO UPDATE
         SET total_satoshis = EXCLUDED.total_satoshis, last_seen_at = now()`,
      [params.bsvAddress, params.userWallet, params.confirmedSat],
    );

    await client.query(
      `INSERT INTO user_balances (wallet_address, asset_symbol, available, locked, updated_at)
       VALUES ($1, 'BSV', $2, '0', now())
       ON CONFLICT (wallet_address, asset_symbol)
       DO UPDATE SET available = user_balances.available + $2, updated_at = now()`,
      [params.userWallet, deltaBsv],
    );

    await client.query("COMMIT");
    return deltaSat;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// _busy lock managed by guardedInterval (selfHealing.ts)
let _cursor = 0;

async function scanTick(): Promise<void> {
  await ensureTable();

  // Round-robin over addresses so a large user count doesn't blow up WoC quotas
  const { rows: targets } = await pool.query<{ evm_address: string; bsv_address: string }>(
    `SELECT evm_address, bsv_address
     FROM internal_bsv_wallets
     WHERE bsv_address IS NOT NULL AND bsv_address <> ''
     ORDER BY created_at NULLS LAST
     LIMIT $1 OFFSET $2`,
    [MAX_ADDRESSES_PER_TICK, _cursor],
  );

  if (targets.length === 0) {
    _cursor = 0;
    return;
  }
  _cursor += targets.length;

  let scanned = 0;
  let credited = 0;
  let creditedSat = 0;

  for (const t of targets) {
    const bal = await fetchBalance(t.bsv_address);
    if (!bal) continue;
    scanned++;
    if (bal.confirmed <= 0) continue;
    try {
      const delta = await applyDeltaCredit({
        userWallet:   t.evm_address,
        bsvAddress:   t.bsv_address,
        confirmedSat: bal.confirmed,
      });
      if (delta > 0) {
        credited++;
        creditedSat += delta;
        logger.info(
          { user: t.evm_address, bsvAddress: t.bsv_address, deltaSat: delta, totalSat: bal.confirmed },
          "BSV deposit credited",
        );
      }
    } catch (err) {
      logger.warn({ err, bsvAddress: t.bsv_address }, "BSV deposit credit failed");
    }
  }

  logger.info(
    { scanned, credited, creditedSat, batchSize: targets.length, cursor: _cursor },
    "BSV deposit watcher: tick complete",
  );
}

export function startBsvDepositWatcher(): void {
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, batch: MAX_ADDRESSES_PER_TICK },
    "BSV deposit watcher starting",
  );
  guardedInterval("bsv-deposit-watcher", scanTick, POLL_INTERVAL_MS, {
    timeoutMs: POLL_INTERVAL_MS - 5_000,
    initialDelayMs: 5_000,
  });
}
