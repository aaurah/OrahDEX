/**
 * bsvMempoolWatcher.ts — OrahDEX
 *
 * SPV-enhanced deposit watcher for BSV internal wallets (mainnet only).
 * Runs every 15 s (vs. the 60 s WoC balance poll in bsvDepositWatcher.ts).
 *
 * Tick phases:
 *
 *   Phase 0 — Header chain sync
 *     Extend the local header chain from P2P peers (bsvPeerSync.ts),
 *     falling back to WoC REST API if all peers are unreachable.
 *     Validates PoW of every header before storing.
 *
 *   Phase 1 — Mempool scan (round-robin across all watched addresses)
 *     For each address in the current round-robin window, fetch WoC address
 *     history. Any height-0 (mempool) tx not yet in bsv_pending_deposits is
 *     recorded there with status = 'mempool'.
 *
 *   Phase 2 — SPV merkle proof verification
 *     For each 'mempool' row with proof_tries < MAX_PROOF_TRIES:
 *       a. Fetch the TSC merkle proof from WoC.
 *       b. Resolve the merkle root via getValidatedMerkleRoot(blockHash) — this
 *          uses our locally PoW-validated header, NOT the proof's merkleRoot field.
 *       c. Verify the branch proof against the locally-validated root.
 *       d. If valid: call applyDeltaCredit() and mark 'confirmed'.
 *
 *   Phase 3 — Stale cleanup
 *     Rows stuck in 'mempool' for > 24 h are marked 'stale' and handed off to
 *     the 60 s WoC balance poller (bsvDepositWatcher.ts) as fallback.
 *
 * Testnet: this watcher does nothing on testnet; the 60 s poller handles it.
 */

import { pool }                           from "@workspace/db";
import { logger }                         from "./logger.js";
import { BSV_NET }                        from "./bsvNetworkConfig.js";
import { guardedInterval }                from "./selfHealing.js";
import {
  fetchMerkleProof,
  verifyMerkleProof,
  fetchTxAmountToAddress,
  fetchAddressHistory,
} from "./bsvSpvVerifier.js";
import {
  ensureHeaderTable,
  syncNewHeaders,
  getValidatedMerkleRoot,
} from "./bsvHeaderChain.js";
import { applyDeltaCredit, fetchBalance } from "./bsvDepositWatcher.js";

// ── Configuration ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = 15_000;
const MAX_ADDRESSES_PER_TICK = 30;   // round-robin window size
const MAX_PROOF_TRIES   = 8;         // after which the 60 s fallback takes over
const STALE_AFTER_HOURS = 24;

// ── Module-level round-robin cursor ──────────────────────────────────────────
// In-memory cursor persists between ticks (resets on process restart, which
// is fine since we will naturally pick up from OFFSET 0 again).
let addressCursor = 0;

// ── DB helpers ────────────────────────────────────────────────────────────────

export async function ensurePendingDepositsTable_inner(): Promise<void> {
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
  await pool.query(
    `CREATE INDEX IF NOT EXISTS bsv_pending_deposits_wallet_status_idx
     ON bsv_pending_deposits (user_wallet, status)`,
  );
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function mempoolTick(): Promise<void> {
  // Ensure tables exist (idempotent — cheap after first run)
  await ensureHeaderTable();
  await ensurePendingDepositsTable_inner();

  // ── Phase 0: Header chain sync ─────────────────────────────────────────────
  try {
    await syncNewHeaders();
  } catch (syncErr) {
    logger.warn({ err: syncErr }, "BSV mempool watcher: header sync error (non-fatal)");
  }

  // ── Phase 1: Mempool scan (round-robin) ───────────────────────────────────
  const { rows: [countRow] } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM internal_bsv_wallets WHERE bsv_address IS NOT NULL AND bsv_address <> ''`,
  );
  const total = Number(countRow?.c ?? 0);

  let newMempool = 0;

  if (total > 0) {
    const offset = addressCursor % total;
    const { rows: targets } = await pool.query<{ evm_address: string; bsv_address: string }>(
      `SELECT evm_address, bsv_address
       FROM internal_bsv_wallets
       WHERE bsv_address IS NOT NULL AND bsv_address <> ''
       ORDER BY evm_address       -- stable ordering ensures cursor wraps correctly
       LIMIT $1 OFFSET $2`,
      [MAX_ADDRESSES_PER_TICK, offset],
    );

    // Advance cursor; wrap at total so we always cover every address in ceil(total/BATCH) ticks
    addressCursor = (offset + targets.length) % total;

    for (const t of targets) {
      const history = await fetchAddressHistory(t.bsv_address);
      for (const entry of history) {
        // Capture mempool txs (height=0) AND recently confirmed txs.
        // If an address is first scanned after a tx confirms, height > 0 here;
        // we still ingest it so Phase 2 can run the merkle-proof fast path
        // rather than waiting for the 60 s balance poller.
        // WoC /address/history typically returns the last ~50 txs, so very old
        // confirmed txs won't appear and we avoid stale re-ingestion.
        const { rows: dup } = await pool.query(
          `SELECT txid FROM bsv_pending_deposits WHERE txid = $1 AND bsv_address = $2`,
          [entry.tx_hash, t.bsv_address],
        );
        if (dup.length > 0) continue;

        const amountSat = await fetchTxAmountToAddress(entry.tx_hash, t.bsv_address);
        if (amountSat <= 0) continue;

        // Insert as 'mempool' regardless; Phase 2 will immediately attempt
        // merkle proof for confirmed txs (height > 0) on the next evaluation.
        await pool.query(
          `INSERT INTO bsv_pending_deposits (txid, bsv_address, user_wallet, amount_sat, status)
           VALUES ($1, $2, $3, $4, 'mempool')
           ON CONFLICT (txid, bsv_address) DO NOTHING`,
          [entry.tx_hash, t.bsv_address, t.evm_address, amountSat],
        );
        newMempool++;
        logger.info(
          {
            txid:       entry.tx_hash,
            height:     entry.height,
            bsvAddress: t.bsv_address,
            user:       t.evm_address,
            amountSat,
          },
          entry.height === 0
            ? "BSV SPV: mempool deposit detected"
            : "BSV SPV: confirmed deposit ingested for SPV fast-path",
        );
      }
    }
  }

  // ── Phase 2: SPV merkle proof verification ────────────────────────────────
  const { rows: pending } = await pool.query<{
    txid:        string;
    bsv_address: string;
    user_wallet: string;
    proof_tries: number;
  }>(
    `SELECT txid, bsv_address, user_wallet, proof_tries
     FROM bsv_pending_deposits
     WHERE status = 'mempool' AND proof_tries < $1
     ORDER BY detected_at ASC
     LIMIT 20`,
    [MAX_PROOF_TRIES],
  );

  let confirmed = 0;

  for (const row of pending) {
    // Increment proof_tries immediately to avoid repeated expensive calls
    await pool.query(
      `UPDATE bsv_pending_deposits SET proof_tries = proof_tries + 1
       WHERE txid = $1 AND bsv_address = $2`,
      [row.txid, row.bsv_address],
    );

    // Fetch the TSC merkle proof from WoC
    const proof = await fetchMerkleProof(row.txid);
    if (!proof) continue; // tx not yet in a block

    // Resolve the merkle root from our locally PoW-validated header chain.
    // This does NOT trust the merkleRoot field in WoC's proof response.
    const validatedRoot = await getValidatedMerkleRoot(proof.blockHash);
    if (!validatedRoot) {
      logger.debug(
        { txid: row.txid, blockHash: proof.blockHash },
        "BSV SPV: could not validate block header yet — will retry",
      );
      continue;
    }

    // Verify the merkle branch against our locally-validated root
    const txid  = proof.txOrId || row.txid;
    const valid = verifyMerkleProof(txid, proof.index, proof.nodes, validatedRoot);

    if (!valid) {
      logger.warn(
        { txid: row.txid, validatedRoot, proofRoot: proof.merkleRoot },
        "BSV SPV: merkle proof INVALID against locally-validated header — skipping credit",
      );
      continue;
    }

    // Proof is valid — credit via the safe delta method (immune to double-credit)
    try {
      const bal = await fetchBalance(row.bsv_address);
      if (!bal || bal.confirmed <= 0) continue;

      const delta = await applyDeltaCredit({
        userWallet:   row.user_wallet,
        bsvAddress:   row.bsv_address,
        confirmedSat: bal.confirmed,
      });

      // Resolve block height from our validated header (best-effort)
      const { rows: hdrRows } = await pool.query<{ height: number }>(
        `SELECT height FROM bsv_block_headers WHERE hash = $1 LIMIT 1`,
        [proof.blockHash],
      );
      const blockHeight = hdrRows[0]?.height ?? null;

      await pool.query(
        `UPDATE bsv_pending_deposits
         SET status = 'confirmed', confirmed_at = NOW(), block_height = $3
         WHERE txid = $1 AND bsv_address = $2`,
        [row.txid, row.bsv_address, blockHeight],
      );

      confirmed++;
      logger.info(
        {
          txid:       row.txid,
          user:       row.user_wallet,
          delta,
          blockHeight,
          source:     "spv",
        },
        delta > 0
          ? "BSV SPV: merkle-verified deposit credited"
          : "BSV SPV: merkle-verified — already credited by 60 s fallback",
      );
    } catch (err) {
      logger.warn({ err, txid: row.txid }, "BSV SPV: credit step failed — will retry");
    }
  }

  // ── Phase 3: Mark stale mempool deposits ──────────────────────────────────
  const { rowCount: staled } = await pool.query(
    `UPDATE bsv_pending_deposits SET status = 'stale'
     WHERE status = 'mempool'
       AND detected_at < NOW() - INTERVAL '${STALE_AFTER_HOURS} hours'`,
  );
  if ((staled ?? 0) > 0) {
    logger.warn({ staled }, "BSV SPV: stale deposits handed off to 60 s fallback poller");
  }

  if (newMempool > 0 || confirmed > 0) {
    logger.info(
      { newMempool, confirmed, pendingTotal: pending.length, addressesScanned: Math.min(MAX_ADDRESSES_PER_TICK, total) },
      "BSV mempool watcher: tick complete",
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function startBsvMempoolWatcher(): void {
  if (BSV_NET.isTestnet) {
    logger.info("BSV mempool watcher: testnet — SPV disabled (60 s polling mode)");
    return;
  }
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, batchSize: MAX_ADDRESSES_PER_TICK, maxProofTries: MAX_PROOF_TRIES },
    "BSV mempool watcher starting (mainnet SPV + round-robin mode)",
  );
  guardedInterval("bsv-mempool-watcher", mempoolTick, POLL_INTERVAL_MS, {
    timeoutMs:      30_000,   // WoC API calls + header sync regularly exceed 12 s; 30 s gives enough headroom
    initialDelayMs: 12_000,
  });
}

// ── Re-export for deposit.ts / app.ts usage ───────────────────────────────────
export { ensurePendingDepositsTable_inner as ensurePendingDepositsTable };
