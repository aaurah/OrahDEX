import { useState, useEffect, useRef, useCallback } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Zap, Server, Database, Clock, RotateCcw, Wifi, WifiOff,
  TrendingUp, Terminal, Info,
} from "lucide-react";

const POLL_MS = 5_000;
const CRASH_THRESHOLD = 3;

interface ServiceStatus {
  status: "healthy" | "stale" | "slow" | "degraded";
  lastRunAt?: number;
  lastRunAgoSec?: number;
  lastCycleAt?: number;
  lastCycleAgoSec?: number;
  lastAt?: number;
  lastAgoSec?: number;
  runs?: number;
  cycles?: number;
  errors?: number;
  latencyMs?: number;
}

interface HealthData {
  status: "operational" | "degraded";
  uptimeSeconds: number;
  responseTimeMs: number;
  nodeHeapMB: number;
  nodeHeapTotalMB: number;
  nodeRssMB: number;
  dbLatencyMs: number;
  openOrders: number;
  activeMarkets: number;
  totalMarkets: number;
  nodeVersion: string;
  timestamp: string;
  services: {
    priceEngine:  ServiceStatus;
    liquidityBot: ServiceStatus;
    bsvMonitor:   ServiceStatus;
    database:     ServiceStatus;
  };
  incidents: { ts: number; level: "info" | "warn" | "error"; service: string; msg: string }[];
  restartCount: number;
  lastRestartAt: number;
}

interface PollPoint { ts: number; ms: number; ok: boolean }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
    healthy:     { color: "text-green-400 bg-green-400/10 border-green-400/25",   icon: CheckCircle2, label: "Healthy"   },
    operational: { color: "text-green-400 bg-green-400/10 border-green-400/25",   icon: CheckCircle2, label: "Operational" },
    slow:        { color: "text-amber-400 bg-amber-400/10 border-amber-400/25",    icon: AlertTriangle, label: "Slow"    },
    stale:       { color: "text-amber-400 bg-amber-400/10 border-amber-400/25",    icon: AlertTriangle, label: "Stale"   },
    degraded:    { color: "text-red-400 bg-red-400/10 border-red-400/25",          icon: XCircle,      label: "Degraded" },
    offline:     { color: "text-red-400 bg-red-400/10 border-red-400/25",          icon: XCircle,      label: "Offline"  },
  };
  const cfg = map[status] ?? map.degraded;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide", cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function Sparkline({ points, height = 28 }: { points: PollPoint[]; height?: number }) {
  if (points.length < 2) return <div className="h-7 flex items-center text-[10px] text-muted-foreground">No data</div>;
  const maxMs = Math.max(...points.map(p => p.ms), 1);
  const w = 180;
  const h = height;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map(p => h - (p.ms / maxMs) * (h - 4) - 2);
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary/60"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r="2"
          className={p.ok ? "fill-green-400" : "fill-red-400"}
        />
      ))}
      <path d={`${path} L ${xs[xs.length-1]} ${h} L 0 ${h} Z`} fill="currentColor" className="text-primary/10" />
    </svg>
  );
}

function ServiceCard({ name, svc }: { name: string; svc: ServiceStatus }) {
  const agoSec = svc.lastRunAgoSec ?? svc.lastCycleAgoSec ?? svc.lastAgoSec;
  const cycles = svc.runs ?? svc.cycles;
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-foreground">{name}</span>
        <StatusBadge status={svc.status} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {agoSec !== undefined && (
          <>
            <span className="text-muted-foreground">Last seen</span>
            <span className="font-mono text-foreground">{agoSec}s ago</span>
          </>
        )}
        {cycles !== undefined && (
          <>
            <span className="text-muted-foreground">Runs</span>
            <span className="font-mono text-foreground">{cycles.toLocaleString()}</span>
          </>
        )}
        {svc.errors !== undefined && (
          <>
            <span className="text-muted-foreground">Errors</span>
            <span className={cn("font-mono", svc.errors > 0 ? "text-red-400" : "text-foreground")}>
              {svc.errors}
            </span>
          </>
        )}
        {svc.latencyMs !== undefined && (
          <>
            <span className="text-muted-foreground">Latency</span>
            <span className={cn("font-mono", svc.latencyMs > 500 ? "text-red-400" : svc.latencyMs > 200 ? "text-amber-400" : "text-foreground")}>
              {svc.latencyMs}ms
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function fmt(n: number) {
  const s = Math.floor(n);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function ApiMonitor() {
  const [data, setData]           = useState<HealthData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lastOk, setLastOk]       = useState(true);
  const [failStreak, setFailStreak] = useState(0);
  const [crashed, setCrashed]     = useState(false);
  const [history, setHistory]     = useState<PollPoint[]>([]);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const t0 = performance.now();
    try {
      const r = await adminFetch(`/api/admin/health`);
      const ms = Math.round(performance.now() - t0);
      if (r.ok) {
        const json: HealthData = await r.json();
        setData(json);
        setLastOk(true);
        setFailStreak(0);
        setCrashed(false);
        setHistory(h => [...h.slice(-29), { ts: Date.now(), ms, ok: true }]);
      } else {
        throw new Error(`HTTP ${r.status}`);
      }
    } catch {
      const ms = Math.round(performance.now() - t0);
      setLastOk(false);
      setHistory(h => [...h.slice(-29), { ts: Date.now(), ms, ok: false }]);
      setFailStreak(prev => {
        const next = prev + 1;
        if (next >= CRASH_THRESHOLD) setCrashed(true);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [poll]);

  const handleRestart = async () => {
    setRestarting(true);
    setRestartMsg(null);
    try {
      const r = await adminFetch(`/api/admin/restart-services`, { method: "POST" });
      if (r.ok) {
        setRestartMsg("Services restarting — status will update in ~10s");
        setCrashed(false);
        setFailStreak(0);
      } else {
        setRestartMsg("Restart request failed (check server logs)");
      }
    } catch {
      setRestartMsg("Could not reach the server to restart services");
    } finally {
      setRestarting(false);
    }
  };

  const avgMs = history.length
    ? Math.round(history.reduce((s, p) => s + p.ms, 0) / history.length)
    : 0;
  const failRate = history.length
    ? ((history.filter(p => !p.ok).length / history.length) * 100).toFixed(0)
    : "0";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            API Health Monitor
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live polling every {POLL_MS / 1000}s · {history.length} data points
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastOk
            ? <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold"><Wifi className="w-4 h-4" /> Online</span>
            : <span className="flex items-center gap-1.5 text-red-400 text-sm font-semibold animate-pulse"><WifiOff className="w-4 h-4" /> Unreachable</span>
          }
          <button
            onClick={() => void poll()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs font-semibold hover:bg-card transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Crash alert banner */}
      {crashed && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-300 text-sm">API server appears to be down</p>
            <p className="text-red-400/70 text-xs mt-0.5">
              {failStreak} consecutive health check failures. The server may have crashed.
            </p>
          </div>
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={cn("w-3.5 h-3.5", restarting && "animate-spin")} />
            {restarting ? "Restarting…" : "Restart Services"}
          </button>
        </div>
      )}

      {restartMsg && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/25 text-sm text-primary">
          <Info className="w-4 h-4 shrink-0" />
          {restartMsg}
        </div>
      )}

      {/* Sparkline + summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Response Time (last 30 polls)
            </span>
            <span className="text-xs text-muted-foreground">avg {avgMs}ms · {failRate}% errors</span>
          </div>
          <Sparkline points={history} height={48} />
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <span className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <Server className="w-4 h-4 text-primary" />
            Server
          </span>
          {data && (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={data.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span className="font-mono text-foreground">{fmt(data.uptimeSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Response</span>
                <span className={cn("font-mono", data.responseTimeMs > 500 ? "text-red-400" : "text-foreground")}>
                  {data.responseTimeMs}ms
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heap</span>
                <span className="font-mono text-foreground">{data.nodeHeapMB}/{data.nodeHeapTotalMB} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RSS</span>
                <span className="font-mono text-foreground">{data.nodeRssMB} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Node</span>
                <span className="font-mono text-foreground">{data.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restarts</span>
                <span className="font-mono text-foreground">{data.restartCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Service cards */}
      {data && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ServiceCard name="Price Engine"   svc={data.services.priceEngine} />
            <ServiceCard name="Liquidity Bot"  svc={data.services.liquidityBot} />
            <ServiceCard name="BSV Monitor"    svc={data.services.bsvMonitor} />
            <ServiceCard name="Database"       svc={data.services.database} />
          </div>
        </div>
      )}

      {/* Exchange metrics */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Open Orders",     value: data.openOrders.toLocaleString(),  icon: Activity },
            { label: "Active Markets",  value: `${data.activeMarkets} / ${data.totalMarkets}`, icon: TrendingUp },
            { label: "DB Latency",      value: `${data.dbLatencyMs}ms`,           icon: Database },
            { label: "Last Poll",       value: new Date(data.timestamp).toLocaleTimeString(), icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </div>
              <div className="text-lg font-bold font-mono text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Restart button (non-crash state) */}
      {!crashed && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-secondary text-sm font-semibold hover:bg-card transition-colors disabled:opacity-50"
          >
            <RotateCcw className={cn("w-4 h-4", restarting && "animate-spin")} />
            {restarting ? "Restarting…" : "Soft Restart Services"}
          </button>
          <span className="text-xs text-muted-foreground">
            Triggers price engine + bot restart without killing the Node process
          </span>
        </div>
      )}

      {/* Incident log */}
      {data && data.incidents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Terminal className="w-4 h-4" />
            Incident Log ({data.incidents.length})
          </h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {data.incidents.map((inc, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-3 px-4 py-2.5 text-[11px] border-b border-border/50 last:border-0",
                    inc.level === "error" ? "bg-red-500/5" : inc.level === "warn" ? "bg-amber-500/5" : ""
                  )}
                >
                  <span className={cn(
                    "shrink-0 font-bold uppercase text-[9px] mt-0.5 px-1.5 py-0.5 rounded",
                    inc.level === "error" ? "bg-red-500/20 text-red-400"
                    : inc.level === "warn"  ? "bg-amber-500/20 text-amber-400"
                    : "bg-blue-500/20 text-blue-400"
                  )}>
                    {inc.level}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {new Date(inc.ts).toLocaleTimeString()}
                  </span>
                  <span className="text-primary/80 shrink-0 font-medium">{inc.service}</span>
                  <span className="text-foreground/80 break-all">{inc.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && data.incidents.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-green-500/5 border border-green-500/15 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          No incidents recorded — all services running cleanly
        </div>
      )}
    </div>
  );
}
