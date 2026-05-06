/**
 * alertBus.ts — OrahDEX Structured Alert Bus
 *
 * Provides:
 *   - In-memory ring buffer (last 500 alerts, survives across requests)
 *   - DB persistence to alert_events table (created on first use)
 *   - emit() — fire an alert with severity + category + details
 *   - getAlerts() — retrieve recent alerts (with optional filters)
 *   - getAlertSummary() — count by severity/category for dashboard
 *
 * Categories: rpc | le | stripe | db | webhook | reconciler | admin | order | price | system
 * Severities: critical | high | warning | info
 */

import { logger } from "./logger.js";
import { pool } from "@workspace/db";

/* ── Types ────────────────────────────────────────────────────────────────── */

export type AlertSeverity = "critical" | "high" | "warning" | "info";
export type AlertCategory  =
  | "rpc" | "le" | "stripe" | "db" | "webhook"
  | "reconciler" | "admin" | "order" | "price" | "system";

export interface Alert {
  id:        string;
  severity:  AlertSeverity;
  category:  AlertCategory;
  message:   string;
  detail?:   string;
  ts:        number;           // Unix ms
  resolved:  boolean;
  resolvedAt?: number;
}

/* ── Ring buffer (in-memory) ─────────────────────────────────────────────── */

const RING_SIZE = 500;
const ring: Alert[] = [];
let   seq = 0;

/* ── DB setup (lazy) ─────────────────────────────────────────────────────── */

let _dbReady = false;

async function ensureTable() {
  if (_dbReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id          TEXT PRIMARY KEY,
        severity    TEXT NOT NULL,
        category    TEXT NOT NULL,
        message     TEXT NOT NULL,
        detail      TEXT,
        ts          BIGINT NOT NULL,
        resolved    BOOLEAN NOT NULL DEFAULT FALSE,
        resolved_at BIGINT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS alert_events_ts_idx ON alert_events (ts DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS alert_events_sev_idx ON alert_events (severity)`);
    _dbReady = true;
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[AlertBus] Could not create alert_events table (non-fatal)");
  }
}

/* ── Core emit ────────────────────────────────────────────────────────────── */

/**
 * Emit an alert. Always adds to in-memory ring; persists to DB for
 * critical/high. Deduplicates: if the same message+category appears in
 * the ring within 5 minutes, it is skipped (avoids alert storms).
 */
export async function emit(
  severity: AlertSeverity,
  category: AlertCategory,
  message:  string,
  detail?:  string,
): Promise<void> {
  // Dedup: skip if identical message+category within last 5 min
  const cutoff = Date.now() - 5 * 60_000;
  const dupe = ring.find(
    a => a.category === category && a.message === message && a.ts > cutoff && !a.resolved,
  );
  if (dupe) return;

  const id    = `${Date.now()}-${++seq}`;
  const alert: Alert = { id, severity, category, message, detail, ts: Date.now(), resolved: false };

  // Add to ring (drop oldest if full)
  ring.unshift(alert);
  if (ring.length > RING_SIZE) ring.pop();

  // Log it
  const logFn =
    severity === "critical" ? logger.error.bind(logger) :
    severity === "high"     ? logger.warn.bind(logger)  :
    severity === "warning"  ? logger.warn.bind(logger)  :
                              logger.info.bind(logger);
  logFn({ severity, category, detail }, `[Alert] ${message}`);

  // Persist to DB for critical/high
  if (severity === "critical" || severity === "high") {
    ensureTable().then(() => {
      pool.query(
        `INSERT INTO alert_events (id, severity, category, message, detail, ts, resolved)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         ON CONFLICT (id) DO NOTHING`,
        [id, severity, category, message, detail ?? null, alert.ts],
      ).catch(err => logger.warn({ err: err?.message }, "[AlertBus] DB persist failed"));
    }).catch(() => {});
  }
}

/* ── Convenience helpers ─────────────────────────────────────────────────── */

export const alertCritical = (cat: AlertCategory, msg: string, detail?: string) =>
  emit("critical", cat, msg, detail);
export const alertHigh     = (cat: AlertCategory, msg: string, detail?: string) =>
  emit("high",     cat, msg, detail);
export const alertWarning  = (cat: AlertCategory, msg: string, detail?: string) =>
  emit("warning",  cat, msg, detail);
export const alertInfo     = (cat: AlertCategory, msg: string, detail?: string) =>
  emit("info",     cat, msg, detail);

/* ── Resolve an alert ─────────────────────────────────────────────────────── */

export async function resolveAlert(id: string): Promise<boolean> {
  const a = ring.find(r => r.id === id);
  if (a) { a.resolved = true; a.resolvedAt = Date.now(); }

  try {
    await pool.query(
      `UPDATE alert_events SET resolved = true, resolved_at = $1 WHERE id = $2`,
      [Date.now(), id],
    );
  } catch { /* non-fatal */ }

  return !!a;
}

/* ── Query ────────────────────────────────────────────────────────────────── */

export interface AlertFilter {
  severity?:    AlertSeverity;
  category?:    AlertCategory;
  unresolvedOnly?: boolean;
  limit?:       number;
  since?:       number;  // Unix ms
}

export function getAlerts(filter: AlertFilter = {}): Alert[] {
  const { severity, category, unresolvedOnly, limit = 100, since } = filter;
  let results = ring;
  if (severity)        results = results.filter(a => a.severity === severity);
  if (category)        results = results.filter(a => a.category === category);
  if (unresolvedOnly)  results = results.filter(a => !a.resolved);
  if (since)           results = results.filter(a => a.ts > since);
  return results.slice(0, limit);
}

export function getAlertSummary(): {
  critical: number; high: number; warning: number; info: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<string, number>;
  total:      number;
  unresolved: number;
} {
  const unresolved = ring.filter(a => !a.resolved);
  const bySeverity = { critical: 0, high: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>;
  const byCategory: Record<string, number> = {};

  for (const a of unresolved) {
    bySeverity[a.severity]        = (bySeverity[a.severity]        ?? 0) + 1;
    byCategory[a.category]        = (byCategory[a.category]        ?? 0) + 1;
  }

  return {
    ...bySeverity,
    bySeverity,
    byCategory,
    total:      ring.length,
    unresolved: unresolved.length,
  };
}

/* ── Periodic DB flush of ring (in case of restart) ─────────────────────── */

export async function flushAlertsToDB(maxRows = 100): Promise<void> {
  await ensureTable();
  const toFlush = ring
    .filter(a => a.severity === "critical" || a.severity === "high")
    .slice(0, maxRows);

  for (const a of toFlush) {
    try {
      await pool.query(
        `INSERT INTO alert_events (id, severity, category, message, detail, ts, resolved, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET resolved = $7, resolved_at = $8`,
        [a.id, a.severity, a.category, a.message, a.detail ?? null, a.ts, a.resolved, a.resolvedAt ?? null],
      );
    } catch { /* non-fatal */ }
  }
}

/* ── Load recent DB alerts into ring on startup ────────────────────────────── */

export async function hydrateAlertsFromDB(): Promise<void> {
  try {
    await ensureTable();
    const { rows } = await pool.query<{
      id: string; severity: string; category: string; message: string;
      detail: string | null; ts: string; resolved: boolean; resolved_at: string | null;
    }>(
      `SELECT id, severity, category, message, detail, ts, resolved, resolved_at
       FROM alert_events
       WHERE ts > $1
       ORDER BY ts DESC
       LIMIT 200`,
      [Date.now() - 24 * 60 * 60 * 1000],  // last 24 hours
    );

    for (const row of rows.reverse()) {
      const a: Alert = {
        id:         row.id,
        severity:   row.severity as AlertSeverity,
        category:   row.category as AlertCategory,
        message:    row.message,
        detail:     row.detail ?? undefined,
        ts:         Number(row.ts),
        resolved:   row.resolved,
        resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
      };
      // Only add if not already in ring
      if (!ring.find(r => r.id === a.id)) {
        ring.push(a);
      }
    }
    ring.sort((a, b) => b.ts - a.ts);
    if (ring.length > RING_SIZE) ring.splice(RING_SIZE);

    logger.info({ loaded: rows.length }, "[AlertBus] Hydrated alerts from DB");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[AlertBus] Could not hydrate alerts from DB (non-fatal)");
  }
}
