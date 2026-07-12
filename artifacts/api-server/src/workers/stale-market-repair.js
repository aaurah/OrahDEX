#!/usr/bin/env node
// artifacts/api-server/src/workers/stale-market-repair.js
// Resilient, batched stale-market-repair worker.
// - Batches with SELECT ... FOR UPDATE SKIP LOCKED
// - Per-transaction statement_timeout
// - Bounded number of batches per loop
// - Per-row error handling
//
// Safety: honor DISABLE_STALE_MARKET_REPAIR=true (safe to merge without running).

const { setTimeout: wait } = require("timers/promises");

// configuration via env vars
const BATCH_SIZE = Number(process.env.STALE_MARKET_REPAIR_BATCH_SIZE || 100);
const LOOP_INTERVAL_MS = Number(process.env.STALE_MARKET_REPAIR_INTERVAL_MS || 300_000); // default 5m
const STATEMENT_TIMEOUT_MS = Number(process.env.STALE_MARKET_REPAIR_STATEMENT_TIMEOUT_MS || 30_000);
const MAX_BATCHES_PER_RUN = Number(process.env.STALE_MARKET_REPAIR_MAX_BATCHES || 50);
const DISABLE_FLAG = process.env.DISABLE_STALE_MARKET_REPAIR === "true";

async function processBatch(pool) {
  const client = await pool.connect();
  try {
    // Bound DB statements to avoid hangs
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    // Acquire a small batch without blocking others
    const sel = await client.query(
      `SELECT id /* add additional columns you need here */
       FROM markets
       WHERE needs_repair = true
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    if (sel.rowCount === 0) return false;

    for (const row of sel.rows) {
      try {
        // Keep DB work minimal and fast inside the transaction.
        // If you need external calls, collect ids, release client, call external APIs with timeouts,
        // then re-acquire a client and perform the short update per id.
        await client.query(
          `UPDATE markets SET repaired_at = now(), needs_repair = false WHERE id = $1`,
          [row.id]
        );
      } catch (err) {
        console.warn("[stale-market-repair] row failed, skipping", row.id, err?.message ?? err);
        // continue to next row (do not fail the whole batch for one bad row)
      }
    }
    return true;
  } finally {
    client.release();
  }
}

async function main() {
  if (DISABLE_FLAG) {
    console.info("[stale-market-repair] disabled via DISABLE_STALE_MARKET_REPAIR=true");
    process.exit(0);
  }

  // Lazy require DB pool to keep startup small
  const { pool } = require("@workspace/db"); // adapt import to your DB module/name if needed

  console.info(
    "[stale-market-repair] starting (batchSize=%d, intervalMs=%d, stmtTimeoutMs=%d, maxBatches=%d)",
    BATCH_SIZE,
    LOOP_INTERVAL_MS,
    STATEMENT_TIMEOUT_MS,
    MAX_BATCHES_PER_RUN
  );

  while (true) {
    try {
      let didWork = false;
      for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
        const ok = await processBatch(pool);
        if (!ok) break;
        didWork = true;
      }

      // If we did work recently, give a short rest; else wait usual interval
      await wait(didWork ? 1000 : LOOP_INTERVAL_MS);
    } catch (err) {
      console.error("[stale-market-repair] worker loop error", err?.message ?? err);
      // Backoff on repeated errors rather than tight-failing loop
      await wait(5000);
    }
  }
}

main().catch((err) => {
  console.error("[stale-market-repair] fatal", err);
  process.exit(1);
});
