/**
 * selfHealingReconcilers.ts — OrahDEX Data-Integrity Reconcilers
 *
 * Supplements selfHealing.ts with exchange-specific reconcilers:
 *
 *   startLeStatusSync        — Syncs LE swap status for non-terminal le_swaps rows
 *   startGhostOrderDetector  — Flags orders stuck in settlement_pending / processing
 *   startStripeLeReconciler  — Finds Stripe-paid orders where LE was never called
 *
 * All reconcilers use guardedInterval so failures are tracked in /api/health.
 */

import { logger }         from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { alertWarning, alertCritical, alertInfo } from "./alertBus.js";
import { pool }           from "@workspace/db";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function leRequest(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const key = process.env["LETSEXCHANGE_API_KEY"];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const r = await fetch(`https://api.letsexchange.io/api${path}`, {
    method,
    headers,
    body:   body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`LE ${path} → HTTP ${r.status}`);
  return r.json();
}

/* ── 1. LE swap status sync ──────────────────────────────────────────────── */
// Finds le_swaps rows that are not in a terminal state and re-checks them
// against the LE API every 10 minutes.

const LE_TERMINAL = new Set(["finished", "expired", "failed", "refunded", "overdue"]);

export function startLeStatusSync(): void {
  const INTERVAL_MS = 10 * 60_000;

  guardedInterval(
    "le-status-sync",
    async () => {
      if (!process.env["LETSEXCHANGE_API_KEY"]) return; // skip if no key

      const { rows } = await pool.query<{ id: string; status: string }>(
        `SELECT id, status FROM le_swaps
         WHERE status NOT IN ('finished','expired','failed','refunded','overdue')
           AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC
         LIMIT 50`,
      );

      if (rows.length === 0) return;

      let synced = 0;
      let changed = 0;

      for (const row of rows) {
        try {
          const data = await leRequest(`/v1/transaction/${row.id}`) as { status?: string };
          const newStatus = data?.status?.toLowerCase() ?? null;
          synced++;

          if (newStatus && newStatus !== row.status) {
            await pool.query(
              `UPDATE le_swaps SET status = $1 ${LE_TERMINAL.has(newStatus) ? ", completed_at = NOW()" : ""}
               WHERE id = $2`,
              [newStatus, row.id],
            );
            changed++;
            logger.info({ leId: row.id, from: row.status, to: newStatus }, "[Reconciler] LE swap status updated");

            if (newStatus === "failed" || newStatus === "expired") {
              alertWarning("le", `LE swap ${row.id} → ${newStatus}`, `Was: ${row.status}`);
            }
          }
        } catch (err: any) {
          // Non-fatal per-swap failure
          logger.warn({ leId: row.id, err: err?.message }, "[Reconciler] LE status fetch failed");
        }
      }

      if (changed > 0) {
        logger.info({ synced, changed }, "[Reconciler] LE status sync complete");
      }
    },
    INTERVAL_MS,
    { timeoutMs: 8 * 60_000, initialDelayMs: 90_000 },
  );
}

/* ── 2. Ghost order detector ─────────────────────────────────────────────── */
// Detects orders stuck in 'processing' or with fundingRef='settlement_pending'
// for longer than the configured threshold.

export function startGhostOrderDetector(): void {
  const INTERVAL_MS       = 15 * 60_000;
  const STUCK_THRESHOLD_MS = 2 * 60 * 60_000; // 2 hours

  guardedInterval(
    "ghost-order-detector",
    async () => {
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

      // Orders stuck in 'processing' (should complete within minutes)
      const { rows: stuckProcessing } = await pool.query<{
        id: string; symbol: string; wallet_address: string; created_at: string; funding_ref: string | null;
      }>(
        `SELECT id, symbol, wallet_address, created_at::text, funding_ref
         FROM orders
         WHERE status = 'processing'
           AND created_at < $1
           AND wallet_address != 'BOT_LIQUIDITY_ENGINE'
         LIMIT 20`,
        [cutoff],
      );

      for (const order of stuckProcessing) {
        const ageHr = Math.round((Date.now() - new Date(order.created_at).getTime()) / 3_600_000);
        alertCritical(
          "order",
          `Ghost order detected: ${order.id} (${order.symbol}) stuck 'processing' ${ageHr}h`,
          `wallet: ${order.wallet_address} · fundingRef: ${order.funding_ref ?? "none"}`,
        );
        logger.warn({ orderId: order.id, symbol: order.symbol, ageHr }, "[Reconciler] Ghost order: stuck in processing");
      }

      // Orders with settlement_pending funding ref older than threshold
      const { rows: stuckSettlement } = await pool.query<{
        id: string; symbol: string; created_at: string;
      }>(
        `SELECT id, symbol, created_at::text
         FROM orders
         WHERE funding_ref LIKE 'settlement_pending%'
           AND created_at < $1
           AND status NOT IN ('cancelled','failed','filled')
         LIMIT 20`,
        [cutoff],
      );

      for (const order of stuckSettlement) {
        const ageHr = Math.round((Date.now() - new Date(order.created_at).getTime()) / 3_600_000);
        alertWarning(
          "order",
          `Order ${order.id} (${order.symbol}) settlement_pending ${ageHr}h — may need manual review`,
        );
      }

      const total = stuckProcessing.length + stuckSettlement.length;
      if (total > 0) {
        logger.warn({ stuckProcessing: stuckProcessing.length, stuckSettlement: stuckSettlement.length },
          "[Reconciler] Ghost order scan found issues");
      }
    },
    INTERVAL_MS,
    { timeoutMs: 5 * 60_000, initialDelayMs: 3 * 60_000 },
  );
}

/* ── 3. Stripe ↔ LE reconciler ───────────────────────────────────────────── */
// Finds Stripe payment_intents in le_swaps that never progressed past 'waiting'
// and are older than 30 minutes — a sign the webhook may have been missed.
// Emits alerts but does NOT auto-retry (avoids double-funding risk).

export function startStripeLeReconciler(): void {
  const INTERVAL_MS    = 5 * 60_000;
  const STUCK_AGE_MS   = 30 * 60_000;

  guardedInterval(
    "stripe-le-reconciler",
    async () => {
      const cutoff = new Date(Date.now() - STUCK_AGE_MS).toISOString();

      // le_swaps stuck in 'waiting' for 30+ min
      const { rows } = await pool.query<{
        id: string; coin_from: string; coin_to: string; status: string; created_at: string;
      }>(
        `SELECT id, coin_from, coin_to, status, created_at::text
         FROM le_swaps
         WHERE status = 'waiting'
           AND created_at < $1
         LIMIT 20`,
        [cutoff],
      );

      for (const swap of rows) {
        const ageMin = Math.round((Date.now() - new Date(swap.created_at).getTime()) / 60_000);
        alertWarning(
          "le",
          `LE swap ${swap.id} stuck 'waiting' for ${ageMin}min (${swap.coin_from}→${swap.coin_to})`,
          "May indicate a missed deposit or webhook gap. Check LE dashboard.",
        );
        logger.warn({ leId: swap.id, coinFrom: swap.coin_from, ageMin }, "[Reconciler] LE swap stuck waiting");
      }

      // Orders with funding_ref starting with 'le:' but in status 'open' for 30+ min
      // (LE swap was created but order never transitioned)
      const { rows: stuckOrders } = await pool.query<{
        id: string; symbol: string; funding_ref: string; created_at: string;
      }>(
        `SELECT id, symbol, funding_ref, created_at::text
         FROM orders
         WHERE funding_ref LIKE 'le:%'
           AND status = 'open'
           AND created_at < $1
         LIMIT 10`,
        [cutoff],
      );

      for (const order of stuckOrders) {
        const ageMin = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60_000);
        alertWarning(
          "order",
          `Order ${order.id} (${order.symbol}) has LE funding ref but still open ${ageMin}min`,
          `fundingRef: ${order.funding_ref}`,
        );
      }

      if (rows.length > 0 || stuckOrders.length > 0) {
        logger.warn({ stuckSwaps: rows.length, stuckOrders: stuckOrders.length },
          "[Reconciler] Stripe-LE reconciliation found anomalies");
      }
    },
    INTERVAL_MS,
    { timeoutMs: 3 * 60_000, initialDelayMs: 2 * 60_000 },
  );
}

/* ── 4. DB connection watchdog ───────────────────────────────────────────── */
// Pings the DB every 2 minutes; fires a critical alert if unreachable.

export function startDbWatchdog(): void {
  guardedInterval(
    "db-watchdog",
    async () => {
      const start = Date.now();
      await pool.query("SELECT 1");
      const latencyMs = Date.now() - start;

      if (latencyMs > 500) {
        alertWarning("db", `DB response slow: ${latencyMs}ms`);
      }
    },
    2 * 60_000,
    { timeoutMs: 15_000, initialDelayMs: 30_000 },
  );
}

/* ── 5. Price engine watchdog ────────────────────────────────────────────── */
// Watches the price engine's last-run timestamp via the self-healing registry.
// If stale > 10 min, fires a high-severity alert.

export function startPriceEngineWatchdog(): void {
  guardedInterval(
    "price-watchdog",
    async () => {
      const { getHealthReport } = await import("./selfHealing.js");
      const services = getHealthReport();
      const price    = services.find(s => s.name === "price-updater");
      if (!price) return;

      if (price.status === "dead") {
        alertCritical("price", "Price engine is dead — no price updates in >5 intervals");
      } else if (price.status === "stuck") {
        alertWarning("price", `Price engine stuck (${price.consecutiveFails} consecutive fails)`);
      } else if (price.consecutiveFails > 0) {
        alertInfo("price", `Price engine degraded — ${price.consecutiveFails} consecutive fail(s)`);
      }
    },
    5 * 60_000,
    { timeoutMs: 30_000, initialDelayMs: 5 * 60_000 },
  );
}

/* ── Start all reconcilers ───────────────────────────────────────────────── */

export function startAllReconcilers(): void {
  try { startLeStatusSync();        } catch (e) { logger.error({ err: e }, "startLeStatusSync failed"); }
  try { startGhostOrderDetector();  } catch (e) { logger.error({ err: e }, "startGhostOrderDetector failed"); }
  try { startStripeLeReconciler();  } catch (e) { logger.error({ err: e }, "startStripeLeReconciler failed"); }
  try { startDbWatchdog();          } catch (e) { logger.error({ err: e }, "startDbWatchdog failed"); }
  try { startPriceEngineWatchdog(); } catch (e) { logger.error({ err: e }, "startPriceEngineWatchdog failed"); }
  logger.info("[SelfHeal] All data-integrity reconcilers started");
}
