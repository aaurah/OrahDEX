/**
 * selfHealing.ts — OrahDEX Exchange Auto-Recovery Engine
 *
 * Provides:
 *   1. guardedInterval  — timeout-aware replacement for setInterval + _busy flag.
 *                         Force-breaks stuck locks, tracks health, backs off on failure.
 *   2. withRetry        — exponential-backoff wrapper for DB / network calls.
 *   3. getHealthReport  — per-service status snapshot for /api/health.
 *   4. startOrderReconciler — detects and auto-cancels orders stuck in bad states.
 */

import { logger } from "./logger.js";

/* ── Health registry ─────────────────────────────────────────────────────── */

export interface ServiceHealth {
  name:            string;
  status:          "healthy" | "degraded" | "stuck" | "dead";
  lastRunAt:       Date | null;
  lastSuccessAt:   Date | null;
  consecutiveFails: number;
  totalRuns:       number;
  totalFails:      number;
  avgDurationMs:   number;
  staleSinceMs:    number | null;
}

interface ServiceEntry extends ServiceHealth {
  intervalMs:  number;
  timeoutMs:   number;
  durations:   number[];
}

const registry = new Map<string, ServiceEntry>();

export function getHealthReport(): ServiceHealth[] {
  const now = Date.now();
  return Array.from(registry.values()).map(e => {
    const staleSinceMs = e.lastRunAt ? now - e.lastRunAt.getTime() : null;
    const staleness    = staleSinceMs ?? 0;   // null = never run yet → not stale

    let status: ServiceHealth["status"] = "healthy";
    if (e.consecutiveFails >= 10)                                    status = "dead";
    else if (e.lastRunAt && staleness > e.intervalMs * 5)            status = "dead";
    else if (e.consecutiveFails >= 3)                                 status = "degraded";
    else if (e.lastRunAt && staleness > e.intervalMs * 3)            status = "stuck";

    return { ...e, staleSinceMs, status };
  });
}

function register(name: string, intervalMs: number, timeoutMs: number): ServiceEntry {
  if (!registry.has(name)) {
    registry.set(name, {
      name, intervalMs, timeoutMs,
      status:           "healthy",
      lastRunAt:        null,
      lastSuccessAt:    null,
      consecutiveFails: 0,
      totalRuns:        0,
      totalFails:       0,
      avgDurationMs:    0,
      staleSinceMs:     null,
      durations:        [],
    });
  }
  return registry.get(name)!;
}

function recordRun(entry: ServiceEntry, durationMs: number, ok: boolean) {
  entry.totalRuns++;
  entry.lastRunAt = new Date();
  entry.durations.push(durationMs);
  if (entry.durations.length > 20) entry.durations.shift();
  entry.avgDurationMs = entry.durations.reduce((a, b) => a + b, 0) / entry.durations.length;

  if (ok) {
    entry.consecutiveFails = 0;
    entry.lastSuccessAt    = new Date();
  } else {
    entry.consecutiveFails++;
    entry.totalFails++;
  }
}

/* ── guardedInterval ─────────────────────────────────────────────────────── */

interface GuardedIntervalOptions {
  /** Hard timeout — if fn() takes longer, the lock is force-released. Default: intervalMs * 0.9 */
  timeoutMs?: number;
  /** Max consecutive failures before backing off (doubling the skip count). Default: 5 */
  maxFailsBeforeBackoff?: number;
  /** Initial delay before first run, ms. Default: 0 */
  initialDelayMs?: number;
}

/**
 * Drop-in replacement for the `setInterval + _busy` pattern used throughout
 * the exchange. Unlike the raw pattern, this:
 *   - Force-releases the lock if fn() hangs beyond timeoutMs
 *   - Tracks per-service health in the global registry
 *   - Backs off (skips N intervals) when there are consecutive failures
 *   - Logs "auto-recovered" when a previously-stuck service resumes
 *
 * Returns a stop() function to cancel the interval.
 */
export function guardedInterval(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number,
  options: GuardedIntervalOptions = {},
): () => void {
  // Cap backoff to ~16 intervals so repeated failures do not effectively disable
  // a background worker for many hours before the next retry.
  const MAX_SKIP_INTERVALS = 16;
  const timeoutMs           = options.timeoutMs            ?? Math.floor(intervalMs * 0.9);
  const maxFails            = options.maxFailsBeforeBackoff ?? 5;
  const initialDelayMs      = options.initialDelayMs        ?? 0;

  const entry = register(name, intervalMs, timeoutMs);

  let busy          = false;
  let busySince     = 0;
  let skipCount     = 0;
  let skipsLeft     = 0;

  const tick = async () => {
    if (skipsLeft > 0) { skipsLeft--; return; }

    if (busy) {
      const staleness = Date.now() - busySince;
      if (staleness > timeoutMs) {
        logger.warn({ service: name, staleMs: staleness },
          `[SelfHeal] ${name}: lock stuck ${Math.round(staleness / 1000)}s — force-releasing`);
        busy = false;
      } else {
        return;
      }
    }

    busy      = true;
    busySince = Date.now();
    const start = Date.now();
    let ok = false;

    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      ok = true;

      if (entry.consecutiveFails > 0) {
        logger.info({ service: name }, `[SelfHeal] ${name}: auto-recovered after ${entry.consecutiveFails} failure(s)`);
      }
      skipCount = 0;
      skipsLeft = 0;
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes("timed out");
      logger.warn({ service: name, err, isTimeout }, `[SelfHeal] ${name}: tick failed`);

      if (entry.consecutiveFails + 1 >= maxFails) {
        skipCount = Math.min(skipCount + 1, MAX_SKIP_INTERVALS);
        skipsLeft = skipCount;
        logger.warn({ service: name, skipCount },
          `[SelfHeal] ${name}: backing off — will skip next ${skipCount} interval(s)`);
      }
    } finally {
      recordRun(entry, Date.now() - start, ok);
      busy = false;
    }
  };

  let handle: ReturnType<typeof setInterval>;

  if (initialDelayMs > 0) {
    setTimeout(() => {
      tick();
      handle = setInterval(tick, intervalMs);
    }, initialDelayMs);
  } else {
    handle = setInterval(tick, intervalMs);
  }

  logger.info({ service: name, intervalMs, timeoutMs }, `[SelfHeal] ${name}: registered`);
  return () => { if (handle) clearInterval(handle); };
}

/* ── withRetry ───────────────────────────────────────────────────────────── */

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?:  number;
  /** Called on each failure before retry */
  onRetry?: (attempt: number, err: unknown) => void;
}

/**
 * Retries an async function with exponential backoff + jitter.
 * Useful for transient DB/network failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 250, maxDelayMs = 8_000, onRetry } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;

      const jitter = Math.random() * baseDelayMs;
      const delay  = Math.min(baseDelayMs * 2 ** (attempt - 1) + jitter, maxDelayMs);
      onRetry?.(attempt, err);
      logger.warn({ attempt, maxAttempts, delayMs: Math.round(delay) },
        `[SelfHeal] withRetry: attempt ${attempt} failed — retrying in ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/* ── Order reconciler ────────────────────────────────────────────────────── */

/**
 * Scans for orders stuck in terminal-adjacent states and auto-cancels them.
 * Runs every 5 minutes. Uses dynamic import to avoid circular deps.
 */
export function startOrderReconciler(): void {
  const RECONCILE_INTERVAL_MS = 5 * 60_000;
  const STUCK_ORDER_AGE_MS    = 30 * 60_000;
  // Process-local lock to avoid duplicate in-flight cancellation attempts
  // in a single API instance. Cross-instance idempotency is enforced by the
  // SQL WHERE status='open' predicate in the UPDATE below.
  const cancellingOrders = new Set<string>();

  const reconcile = async () => {
    try {
      const { db } = await import("@workspace/db");
      const { ordersTable } = await import("@workspace/db/schema");
      const { lt, eq, and, not } = await import("drizzle-orm");

      const cutoff = new Date(Date.now() - STUCK_ORDER_AGE_MS);

      const stuck = await db
        .select({ id: ordersTable.id, symbol: ordersTable.symbol, status: ordersTable.status })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.status, "open"),
            lt(ordersTable.createdAt, cutoff),
            not(eq(ordersTable.walletAddress, "BOT_LIQUIDITY_ENGINE")),
          )
        )
        .limit(50);

      if (stuck.length === 0) return;

      let cancelled = 0;
      const cancelledSymbols = new Set<string>();

      for (const order of stuck) {
        if (cancellingOrders.has(order.id)) {
          logger.debug({ orderId: order.id }, "[SelfHeal] Order reconciler: skip in-flight cancel lock");
          continue;
        }
        cancellingOrders.add(order.id);
        try {
          const rows = await db
            .update(ordersTable)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(
              and(
                eq(ordersTable.id, order.id),
                eq(ordersTable.status, "open"),
              )
            )
            .returning({ id: ordersTable.id });
          if (rows.length > 0) {
            cancelled++;
            cancelledSymbols.add(order.symbol);
          } else {
            logger.debug({ orderId: order.id }, "[SelfHeal] Order reconciler: skip already-processed order");
          }
        } finally {
          cancellingOrders.delete(order.id);
        }
      }

      if (cancelled > 0) {
        logger.warn({ count: cancelled, symbols: [...cancelledSymbols] },
          `[SelfHeal] Order reconciler: auto-cancelled ${cancelled} stuck order(s)`);
      }
    } catch (err) {
      logger.warn({ err }, "[SelfHeal] Order reconciler: cycle failed");
    }
  };

  setTimeout(reconcile, 60_000);
  setInterval(reconcile, RECONCILE_INTERVAL_MS);
  logger.info({ intervalMs: RECONCILE_INTERVAL_MS, stuckAgeMs: STUCK_ORDER_AGE_MS },
    "[SelfHeal] Order reconciler started");
}
