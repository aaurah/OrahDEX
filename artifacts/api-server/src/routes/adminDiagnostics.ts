/**
 * adminDiagnostics.ts — OrahDEX Admin Diagnostics & Repair API
 *
 * Mounts under /admin (already protected by requireAdminToken in index.ts)
 *
 * GET  /admin/diagnostics           — full subsystem probe report
 * GET  /admin/diagnostics/rpc       — RPC-only probe (per chain)
 * GET  /admin/alerts                — recent alert events
 * GET  /admin/alerts/summary        — alert counts by severity/category
 * POST /admin/alerts/:id/resolve    — mark an alert resolved
 * POST /admin/repair/stuck-orders   — force-cancel orders stuck >30min
 * POST /admin/repair/sync-le-swaps  — force-sync all pending LE swaps
 * POST /admin/repair/cancel-ghost-orders — cancel ghost processing orders
 * POST /admin/repair/rebuild-price  — force a price engine run
 */

import { Router } from "express";
import { pool }   from "@workspace/db";
import { logger } from "../lib/logger.js";
import { runAllProbes, probeAllRpc } from "../lib/subsystemProbe.js";
import {
  getAlerts, getAlertSummary, resolveAlert, alertInfo,
} from "../lib/alertBus.js";
import { updateMarketPrices } from "../lib/priceUpdater.js";
import {
  getRepairEngineStatus,
  getCircuitBreakerStates,
  withCircuitBreaker,
  recordRateLimit,
} from "../lib/exchangeApiRepairEngine.js";

const router = Router();

/* ── GET /admin/diagnostics ──────────────────────────────────────────────── */

router.get("/diagnostics", async (_req, res) => {
  try {
    const report = await runAllProbes();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Diagnostics probe failed" });
  }
});

/* ── GET /admin/diagnostics/rpc ─────────────────────────────────────────── */

router.get("/diagnostics/rpc", async (_req, res) => {
  try {
    const rpcResults = await probeAllRpc();
    const downCount     = rpcResults.filter(r => r.status === "down").length;
    const degradedCount = rpcResults.filter(r => r.status === "degraded").length;
    res.json({
      status: downCount > 3 ? "critical" : downCount > 0 ? "degraded" : degradedCount > 0 ? "degraded" : "ok",
      checkedAt: new Date().toISOString(),
      summary: { down: downCount, degraded: degradedCount, ok: rpcResults.length - downCount - degradedCount },
      rpc: rpcResults,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /admin/alerts ───────────────────────────────────────────────────── */

router.get("/alerts", (req, res) => {
  const { severity, category, unresolved, limit, since } = req.query as Record<string, string>;
  const alerts = getAlerts({
    severity:      severity as any,
    category:      category as any,
    unresolvedOnly: unresolved === "true",
    limit:         limit ? Math.min(parseInt(limit, 10) || 100, 500) : 100,
    since:         since ? parseInt(since, 10) : undefined,
  });
  res.json({ alerts, count: alerts.length });
});

/* ── GET /admin/alerts/summary ───────────────────────────────────────────── */

router.get("/alerts/summary", (_req, res) => {
  res.json(getAlertSummary());
});

/* ── POST /admin/alerts/:id/resolve ─────────────────────────────────────── */

router.post("/alerts/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const ok = await resolveAlert(id);
  if (!ok) { res.status(404).json({ error: "Alert not found" }); return; }
  res.json({ ok: true, id, resolvedAt: new Date().toISOString() });
});

/* ── POST /admin/repair/stuck-orders ─────────────────────────────────────── */
// Force-cancel orders that are open for longer than threshold.

router.post("/repair/stuck-orders", async (req, res) => {
  try {
    const thresholdMin = Math.max(5, parseInt((req.body?.thresholdMinutes as string) ?? "30", 10));
    const cutoff = new Date(Date.now() - thresholdMin * 60_000);

    const { rows } = await pool.query<{ id: string; symbol: string; status: string }>(
      `UPDATE orders
         SET status = 'cancelled', updated_at = NOW()
       WHERE status = 'open'
         AND created_at < $1
         AND wallet_address != 'BOT_LIQUIDITY_ENGINE'
       RETURNING id, symbol, status`,
      [cutoff],
    );

    logger.warn({ cancelled: rows.length, thresholdMin }, "admin: repair/stuck-orders executed");
    alertInfo("reconciler", `Admin repair: cancelled ${rows.length} stuck open order(s) (>${thresholdMin}min)`);

    res.json({
      ok:          true,
      cancelled:   rows.length,
      thresholdMin,
      orders:      rows.map(r => ({ id: r.id, symbol: r.symbol })),
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: repair/stuck-orders failed");
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/repair/cancel-ghost-orders ──────────────────────────────── */
// Force-cancel orders stuck in 'processing' for longer than threshold.

router.post("/repair/cancel-ghost-orders", async (req, res) => {
  try {
    const thresholdHr = Math.max(1, parseInt((req.body?.thresholdHours as string) ?? "2", 10));
    const cutoff = new Date(Date.now() - thresholdHr * 3_600_000);

    const { rows } = await pool.query<{ id: string; symbol: string }>(
      `UPDATE orders
         SET status = 'failed', updated_at = NOW()
       WHERE status = 'processing'
         AND created_at < $1
         AND wallet_address != 'BOT_LIQUIDITY_ENGINE'
       RETURNING id, symbol`,
      [cutoff],
    );

    logger.warn({ cancelled: rows.length, thresholdHr }, "admin: repair/cancel-ghost-orders executed");
    alertInfo("reconciler", `Admin repair: cancelled ${rows.length} ghost processing order(s) (>${thresholdHr}h)`);

    res.json({
      ok:          true,
      cancelled:   rows.length,
      thresholdHr,
      orders:      rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/repair/sync-le-swaps ────────────────────────────────────── */
// Force-sync LE swap statuses for all non-terminal rows.

router.post("/repair/sync-le-swaps", async (req, res) => {
  if (!process.env["LETSEXCHANGE_API_KEY"]) {
    res.status(503).json({ error: "LETSEXCHANGE_API_KEY not configured" });
    return;
  }

  try {
    const { rows } = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM le_swaps
       WHERE status NOT IN ('finished','expired','failed','refunded','overdue')
         AND created_at > NOW() - INTERVAL '7 days'
       LIMIT 50`,
    );

    let synced = 0; let changed = 0; const errors: string[] = [];

    for (const row of rows) {
      try {
        const r = await fetch(`https://api.letsexchange.io/api/v1/transaction/${row.id}`, {
          headers: { Authorization: `Bearer ${process.env["LETSEXCHANGE_API_KEY"]}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!r.ok) { errors.push(`${row.id}: HTTP ${r.status}`); continue; }
        const data = await r.json() as { status?: string };
        const newStatus = data?.status?.toLowerCase() ?? null;
        synced++;
        if (newStatus && newStatus !== row.status) {
          await pool.query(
            `UPDATE le_swaps SET status = $1 WHERE id = $2`,
            [newStatus, row.id],
          );
          changed++;
        }
      } catch (err: any) {
        errors.push(`${row.id}: ${err?.message}`);
      }
    }

    logger.info({ total: rows.length, synced, changed, errors: errors.length }, "admin: repair/sync-le-swaps complete");
    alertInfo("le", `Admin repair: synced ${synced} LE swaps, ${changed} status changes`);

    res.json({ ok: true, total: rows.length, synced, changed, errors });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/repair/rebuild-price ────────────────────────────────────── */
// Force an immediate price engine run.

router.post("/repair/rebuild-price", async (_req, res) => {
  try {
    const start = Date.now();
    await updateMarketPrices();
    const elapsed = Date.now() - start;
    alertInfo("price", `Admin repair: price engine force-run completed in ${elapsed}ms`);
    res.json({ ok: true, elapsedMs: elapsed, updatedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── GET /admin/diagnostics/services ─────────────────────────────────────── */
// Returns self-healing service registry (same as /api/health but admin-formatted).

router.get("/diagnostics/services", async (_req, res) => {
  const { getHealthReport } = await import("../lib/selfHealing.js");
  const services = getHealthReport();
  const dead     = services.filter(s => s.status === "dead");
  const stuck    = services.filter(s => s.status === "stuck");
  const degraded = services.filter(s => s.status === "degraded");
  res.json({
    overall: dead.length > 0 ? "critical" : stuck.length > 0 ? "degraded" : degraded.length > 0 ? "degraded" : "ok",
    services,
    alerts: [
      ...dead.map(s    => ({ level: "critical", message: `DEAD: ${s.name}` })),
      ...stuck.map(s   => ({ level: "warning",  message: `STUCK: ${s.name}` })),
      ...degraded.map(s => ({ level: "warning", message: `DEGRADED: ${s.name}` })),
    ],
    checkedAt: new Date().toISOString(),
  });
});

/* ── GET /admin/exchange-repair/status ───────────────────────────────────── */
// Full repair engine snapshot: circuit breakers, rate limits, route probes,
// price source failover chain, and recent repair history.

router.get("/exchange-repair/status", (_req, res) => {
  res.json(getRepairEngineStatus());
});

/* ── GET /admin/exchange-repair/circuits ─────────────────────────────────── */
// Just the circuit breaker states — lighter payload for polling dashboards.

router.get("/exchange-repair/circuits", (_req, res) => {
  const states = getCircuitBreakerStates();
  const open   = states.filter(s => s.state === "OPEN").length;
  const half   = states.filter(s => s.state === "HALF_OPEN").length;
  res.json({
    overall:  open > 0 ? "degraded" : half > 0 ? "recovering" : "healthy",
    open, halfOpen: half, closed: states.length - open - half,
    circuits: states,
    checkedAt: new Date().toISOString(),
  });
});

/* ── POST /admin/exchange-repair/reset-circuit ───────────────────────────── */
// Manually force-close a circuit breaker (use with caution).

router.post("/exchange-repair/reset-circuit", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    // Force a successful probe to close the circuit
    await withCircuitBreaker(name, async () => {
      logger.info({ circuit: name }, "[AutoRepair] Admin force-reset circuit breaker");
    });
    alertInfo("admin", `Admin manually reset circuit breaker: ${name}`);
    res.json({ ok: true, circuit: name, action: "force-reset" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

/* ── POST /admin/exchange-repair/simulate-rate-limit ─────────────────────── */
// Simulate a rate limit for testing the throttle system.

router.post("/exchange-repair/simulate-rate-limit", (req, res) => {
  const { api, retryAfterMs } = req.body as { api?: string; retryAfterMs?: number };
  if (!api) { res.status(400).json({ error: "api is required" }); return; }
  recordRateLimit(api, retryAfterMs ?? 30_000);
  alertInfo("admin", `Admin simulated rate limit for: ${api}`);
  res.json({ ok: true, api, throttledForMs: retryAfterMs ?? 30_000 });
});

export default router;
