/**
 * bsvMempoolWatcher.ts — OrahDEX
 *
 * SPV-enhanced deposit watcher for BSV internal wallets (mainnet only).
 *
 * Runs every 15 s (vs. the 60 s WoC balance poll in bsvDepositWatcher.ts):
 *
 *   Phase 1 — Mempool scan
 *     For each watched address in internal_bsv_wallets, fetch WoC address
 *     history and record any height-0 (mempool) transactions in the
 *     bsv_pending_deposits table with status = 'mempool'.
 *
 *   Phase 2 — SPV verification
 *     For each 'mempool' row, request a TSC merkle proof from WoC.
 *     If the proof is valid, credit the user's balance immediately using
 *     the same delta-credit function as bsvDepositWatcher.ts, and mark
 *     the row 'confirmed'.
 *
 * The existing 60 s WoC balance poller (bsvDepositWatcher.ts) is kept as a
 * fallback — it is a pure no-op for any address already credited by this
 * watcher.
 *
 * Testnet: SPV is skipped; testnet deposits continue using the 60 s polling
 * loop exclusively.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { guardedInterval } from "./selfHealing.js";
import {
  fetchMerkleProof,
  verifyMerkleProof,
  fetchTxAmountToAddress,
  fetchAddressHistory,
  fetchBlockHeight,
} from "./bsvSpvVerifier.js";
import { applyDeltaCredit, fetchBalance } from "./bsvDepositWatcher.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 15_000;
/** Addresses scanned per tick. Fewer than the 60 s watcher (shorter interval). */
const MAX_ADDRESSES_TICK = 30;
/** After this many failed proof requests we stop polling and let the 60 s fallback handle it. */
const MAX_PROOF_TRIES    = 8;
/** Pending rows older than this are marked stale — the 60 s poller will credit them instead. */
const STALE_AFTER_HOURS  = 24;

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function ensurePendingDepositsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bsv_pending_deposits (
      txid          TEXT    NOT NULL,
      bsv_address   TEXT    NOT NULL,
      user_wallet   TEXT    NOT NULL,
      amount_sat    BIGINT  NOT NULL DEFAULT 0,
      status        TEXT    NOT NULL DEFAULT 'mempool',
      block_height  INT,
      detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at  TIMESTAMPTZ,
      proof_tries   INT     NOT NULL DEFAULT 0,
      PRIMARY KEY (txid, bsv_address)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bsv_pending_deposits_wallet_status_idx
    ON bsv_pending_deposits (user_wallet, status)
  `);
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function mempoolTick(): Promise<void> {
  await ensurePendingDepositsTable();

  // ── Phase 1: Mempool detection ─────────────────────────────────────────────
  const { rows: targets } = await pool.query<{ evm_address: string; bsv_address: string }>(
    `SELECT evm_address, bsv_address
     FROM internal_bsv_wallets
     WHERE bsv_address IS NOT NULL AND bsv_address <> ''
     ORDER BY created_at NULLS LAST
     LIMIT $1`,
    [MAX_ADDRESSES_TICK],
  );

  let newMempool = 0;

  for (const t of targets) {
    const history = await fetchAddressHistory(t.bsv_address);
    for (const entry of history) {
      if (entry.height !== 0) continue;  // only mempool (unconfirmed) entries

      const { rows: existing } = await pool.query(
        `SELECT txid FROM bsv_pending_deposits WHERE txid = $1 AND bsv_address = $2`,
        [entry.tx_hash, t.bsv_address],
      );
      if (existing.length > 0) continue;

      const amountSat = await fetchTxAmountToAddress(entry.tx_hash, t.bsv_address);
      if (amountSat <= 0) continue;

      await pool.query(
        `INSERT INTO bsv_pending_deposits (txid, bsv_address, user_wallet, amount_sat, status)
         VALUES ($1, $2, $3, $4, 'mempool')
         ON CONFLICT (txid, bsv_address) DO NOTHING`,
        [entry.tx_hash, t.bsv_address, t.evm_address, amountSat],
      );

      newMempool++;
      logger.info(
        { txid: entry.tx_hash, bsvAddress: t.bsv_address, user: t.evm_address, amountSat },
        "BSV mempool: new pending deposit detected",
      );
    }
  }

  // ── Phase 2: SPV merkle proof verification ─────────────────────────────────
  const { rows: pending } = await pool.query<{
    txid:        string;
    bsv_address: string;
    user_wallet: string;
    amount_sat:  string;
    proof_tries: number;
  }>(
    `SELECT txid, bsv_address, user_wallet, amount_sat::text, proof_tries
     FROM bsv_pending_deposits
     WHERE status = 'mempool' AND proof_tries < $1
     ORDER BY detected_at ASC
     LIMIT 20`,
    [MAX_PROOF_TRIES],
  );

  let confirmed = 0;

  for (const row of pending) {
    await pool.query(
      `UPDATE bsv_pending_deposits SET proof_tries = proof_tries + 1 WHERE txid = $1 AND bsv_address = $2`,
      [row.txid, row.bsv_address],
    );

    const proof = await fetchMerkleProof(row.txid);
    if (!proof) continue;  // tx not yet in a block

    const txid  = proof.txOrId || row.txid;
    const valid = verifyMerkleProof(txid, proof.index, proof.nodes, proof.merkleRoot);

    if (!valid) {
      logger.warn(
        { txid: row.txid, merkleRoot: proof.merkleRoot },
        "BSV SPV: merkle proof invalid — will retry via 60 s fallback",
      );
      continue;
    }

    // Fetch the confirmed balance and credit the delta
    try {
      const bal = await fetchBalance(row.bsv_address);
      if (!bal || bal.confirmed <= 0) continue;

      const delta = await applyDeltaCredit({
        userWallet:   row.user_wallet,
        bsvAddress:   row.bsv_address,
        confirmedSat: bal.confirmed,
      });

      // Resolve block height (best-effort — non-fatal if unavailable)
      let blockHeight: number | null = null;
      if (proof.blockHash) {
        blockHeight = await fetchBlockHeight(proof.blockHash);
      }

      await pool.query(
        `UPDATE bsv_pending_deposits
         SET status = 'confirmed', confirmed_at = NOW(), block_height = $3
         WHERE txid = $1 AND bsv_address = $2`,
        [row.txid, row.bsv_address, blockHeight],
      );

      confirmed++;
      logger.info(
        {
          txid:        row.txid,
          bsvAddress:  row.bsv_address,
          user:        row.user_wallet,
          delta,
          blockHeight,
          merkleRoot:  proof.merkleRoot,
        },
        delta > 0
          ? "BSV SPV: merkle-verified deposit credited"
          : "BSV SPV: merkle-verified — already credited by 60 s fallback poller",
      );
    } catch (err) {
      logger.warn({ err, txid: row.txid }, "BSV SPV: credit failed after merkle proof (will retry)");
    }
  }

  // ── Phase 3: Mark over-aged mempool rows as stale ─────────────────────────
  const { rowCount: staled } = await pool.query(
    `UPDATE bsv_pending_deposits SET status = 'stale'
     WHERE status = 'mempool' AND detected_at < NOW() - INTERVAL '${STALE_AFTER_HOURS} hours'`,
  );
  if ((staled ?? 0) > 0) {
    logger.warn({ staled }, "BSV mempool watcher: stale deposits handed off to 60 s fallback");
  }

  if (newMempool > 0 || confirmed > 0) {
    logger.info(
      { newMempool, confirmed, pendingTotal: pending.length },
      "BSV mempool watcher: tick complete",
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startBsvMempoolWatcher(): void {
  if (BSV_NET.isTestnet) {
    logger.info("BSV mempool watcher: testnet detected — skipping SPV (60 s polling-only mode)");
    return;
  }
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, maxAddresses: MAX_ADDRESSES_TICK, maxProofTries: MAX_PROOF_TRIES },
    "BSV mempool watcher starting (mainnet SPV mode)",
  );
  guardedInterval("bsv-mempool-watcher", mempoolTick, POLL_INTERVAL_MS, {
    timeoutMs:      POLL_INTERVAL_MS - 3_000,
    initialDelayMs: 10_000,
  });
}
