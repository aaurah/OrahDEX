/**
 * Trade Metrics — in-process telemetry store
 *
 * Tracks:
 *   • End-to-end latency per phase (build / sign / broadcast / confirm)
 *   • Failure rate by pair, network, and wallet type
 *   • Aggregate stats for the /api/metrics/trades endpoint
 *
 * Storage is intentionally in-memory (no DB writes) to keep the hot path lean.
 * Data is TTL-bucketed into hourly windows so old data ages out automatically.
 */

export interface TradeMetricEvent {
  symbol:     string;
  side:       "buy" | "sell";
  network:    string;
  walletType: string;
  success:    boolean;
  errorCode?: string;
  timings: {
    precheck?:  number;
    build?:     number;
    sign?:      number;
    broadcast?: number;
    confirm?:   number;
    totalMs?:   number;
  };
}

interface BucketStats {
  count:      number;
  failures:   number;
  totalMs:    number;
  precheckMs: number;
  signMs:     number;
  broadcastMs:number;
  confirmMs:  number;
  errorCodes: Map<string, number>;
}

function newBucket(): BucketStats {
  return { count: 0, failures: 0, totalMs: 0, precheckMs: 0,
           signMs: 0, broadcastMs: 0, confirmMs: 0, errorCodes: new Map() };
}

// ── In-memory store (hour-keyed) ──────────────────────────────────────────────
// key: "pair:network:wallet:YYYY-MM-DDTHH"
const buckets = new Map<string, BucketStats>();

function hourKey(symbol: string, network: string, walletType: string): string {
  const now = new Date();
  const h   = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}T${String(now.getUTCHours()).padStart(2,"0")}`;
  return `${symbol}:${network}:${walletType}:${h}`;
}

// ── Record ────────────────────────────────────────────────────────────────────
export function recordTradeMetric(evt: TradeMetricEvent) {
  const key = hourKey(evt.symbol, evt.network, evt.walletType);
  if (!buckets.has(key)) buckets.set(key, newBucket());
  const b = buckets.get(key)!;

  b.count++;
  if (!evt.success) {
    b.failures++;
    if (evt.errorCode) b.errorCodes.set(evt.errorCode, (b.errorCodes.get(evt.errorCode) ?? 0) + 1);
  }
  b.totalMs     += evt.timings.totalMs    ?? 0;
  b.precheckMs  += evt.timings.precheck   ?? 0;
  b.signMs      += evt.timings.sign       ?? 0;
  b.broadcastMs += evt.timings.broadcast  ?? 0;
  b.confirmMs   += evt.timings.confirm    ?? 0;

  // Prune old buckets (keep only last 48 h = 48 keys per dimension)
  if (buckets.size > 10_000) {
    const now = Date.now();
    for (const [k] of buckets) {
      // Extract hour from key and drop if > 48 h old
      const parts = k.split(":");
      const hourStr = parts[parts.length - 1]; // "2026-04-03T14"
      const ts = new Date(hourStr + ":00:00Z").getTime();
      if (now - ts > 48 * 3_600_000) buckets.delete(k);
    }
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────
export interface PairMetricSummary {
  symbol:       string;
  network:      string;
  walletType:   string;
  count:        number;
  failRate:     number;
  avgTotalMs:   number;
  avgPrecheckMs:number;
  avgSignMs:    number;
  avgBroadcastMs:number;
  avgConfirmMs: number;
  topErrors:    { code: string; count: number }[];
  badge:        "fast" | "reliable" | "slow" | "unstable" | null;
}

export function getMetricsSummary(): PairMetricSummary[] {
  // Aggregate all hour buckets into per-(symbol:network:wallet) summaries
  const agg = new Map<string, BucketStats & { symbol: string; network: string; walletType: string }>();

  for (const [key, b] of buckets) {
    const parts = key.split(":");
    // symbol can contain "/" so join everything except last 3 parts
    const walletType = parts[parts.length - 2];
    const network    = parts[parts.length - 3];
    const symbol     = parts.slice(0, parts.length - 3).join(":");
    const aggKey     = `${symbol}:${network}:${walletType}`;

    if (!agg.has(aggKey)) {
      agg.set(aggKey, { ...newBucket(), symbol, network, walletType });
    }
    const a = agg.get(aggKey)!;
    a.count       += b.count;
    a.failures    += b.failures;
    a.totalMs     += b.totalMs;
    a.precheckMs  += b.precheckMs;
    a.signMs      += b.signMs;
    a.broadcastMs += b.broadcastMs;
    a.confirmMs   += b.confirmMs;
    for (const [code, cnt] of b.errorCodes) {
      a.errorCodes.set(code, (a.errorCodes.get(code) ?? 0) + cnt);
    }
  }

  return Array.from(agg.values()).map(a => {
    const n         = a.count || 1;
    const failRate  = a.failures / n;
    const avgTotalMs = a.totalMs / n;
    const badge     = deriveBadge(avgTotalMs, failRate);
    const topErrors = Array.from(a.errorCodes.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 5);

    return {
      symbol:        a.symbol,
      network:       a.network,
      walletType:    a.walletType,
      count:         a.count,
      failRate:      parseFloat(failRate.toFixed(4)),
      avgTotalMs:    Math.round(avgTotalMs),
      avgPrecheckMs: Math.round(a.precheckMs / n),
      avgSignMs:     Math.round(a.signMs / n),
      avgBroadcastMs:Math.round(a.broadcastMs / n),
      avgConfirmMs:  Math.round(a.confirmMs / n),
      topErrors,
      badge,
    };
  }).sort((a, b) => b.count - a.count);
}

function deriveBadge(avgMs: number, failRate: number): PairMetricSummary["badge"] {
  if (failRate > 0.15) return "unstable";
  if (avgMs > 30_000)  return "slow";
  if (failRate < 0.02 && avgMs < 5_000)  return "fast";
  if (failRate < 0.05 && avgMs < 15_000) return "reliable";
  return null;
}
