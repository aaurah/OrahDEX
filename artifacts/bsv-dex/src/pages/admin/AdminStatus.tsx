import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/adminFetch";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Zap, Globe, Clock, Server, HardDrive, Cpu, Database,
  Layers, Wifi, WifiOff, ChevronDown, ChevronUp,
  AlertCircle, Timer, TrendingUp, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface HealthService {
  name: string;
  status: "ok" | "degraded" | "dead" | "stuck" | "starting";
  consecutiveFails: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  avgDurationMs: number;
  staleSinceMs: number;
}

interface PublicHealth {
  status: "ok" | "degraded" | "starting";
  uptime: number;
  timestamp: string;
  bsvChain?: { online: boolean; blockHeight: number };
  services: HealthService[];
  alerts?: string[];
}

interface AdminHealth {
  status: string;
  uptimeSeconds: number;
  nodeHeapMB: number;
  nodeHeapTotalMB: number;
  nodeRssMB: number;
  dbLatencyMs: number;
  dbConnections: number;
  activeMarkets: number;
  totalMarkets: number;
  openOrders: number;
  avgOrderbookLatencyMs: number;
  avgTradesLatencyMs: number;
  nodeVersion: string;
  platform: string;
  timestamp: string;
}

const GROUP_MAP: Record<string, string> = {
  "le-coin-sync":        "Bridge",
  "ss-pairs-sync":       "Bridge",
  "universal-markets":   "Bridge",
  "liquidity-bot":       "Trading",
  "price-updater":       "Trading",
  "ArbBot":              "Trading",
  "futures-funding":     "Trading",
  "futures-liquidation": "Trading",
  "bsv-deposit-watcher": "Blockchain",
  "evm-deposit-watcher": "Blockchain",
  "bsv-block-monitor":   "Blockchain",
};

function groupFor(name: string): string {
  return GROUP_MAP[name] ?? "System";
}

const STATUS_CONFIG = {
  ok:       { label: "OK",        icon: CheckCircle2,  cls: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  degraded: { label: "Degraded",  icon: AlertTriangle, cls: "text-amber-400  bg-amber-400/10  border-amber-400/20"  },
  stuck:    { label: "Stuck",     icon: AlertTriangle, cls: "text-amber-400  bg-amber-400/10  border-amber-400/20"  },
  dead:     { label: "Dead",      icon: XCircle,       cls: "text-red-400    bg-red-400/10    border-red-400/20"    },
  starting: { label: "Starting",  icon: Clock,         cls: "text-blue-400   bg-blue-400/10   border-blue-400/20"   },
} as const;

const DOT: Record<string, string> = {
  ok:       "bg-emerald-400",
  degraded: "bg-amber-400 animate-pulse",
  stuck:    "bg-amber-400 animate-pulse",
  dead:     "bg-red-400   animate-pulse",
  starting: "bg-blue-400  animate-pulse",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)    return "just now";
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDur(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function StatChip({ label, value, sub, color = "default" }: {
  label: string; value: string; sub?: string;
  color?: "default" | "green" | "amber" | "red" | "blue" | "violet";
}) {
  const c = {
    default: "text-foreground",
    green:   "text-emerald-400",
    amber:   "text-amber-400",
    red:     "text-red-400",
    blue:    "text-blue-400",
    violet:  "text-violet-400",
  }[color];
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</span>
      <span className={cn("text-lg font-bold font-mono", c)}>{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function GaugeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ServiceRow({ svc, expanded, onToggle }: {
  svc: HealthService; expanded: boolean; onToggle: () => void;
}) {
  const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.dead;
  const Icon = cfg.icon;
  const hasFails = svc.consecutiveFails > 0;

  return (
    <div className={cn(
      "border-b border-border/40 last:border-0 transition-colors hover:bg-white/[0.02]",
      svc.status === "dead" && "bg-red-400/[0.03]",
      svc.status === "degraded" && "bg-amber-400/[0.03]",
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
      >
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOT[svc.status] ?? "bg-zinc-500")} />

        <span className="flex-1 text-sm font-medium font-mono">{svc.name}</span>

        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span className="hidden sm:block w-20 text-right">{relTime(svc.lastRunAt)}</span>
          <span className="hidden md:block w-16 text-right">{fmtDur(svc.avgDurationMs)}</span>
          {hasFails && (
            <span className="flex items-center gap-1 text-red-400 font-semibold">
              <AlertTriangle className="w-3 h-3" />
              {svc.consecutiveFails} fail{svc.consecutiveFails > 1 ? "s" : ""}
            </span>
          )}
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
            cfg.cls
          )}>
            <Icon className="w-2.5 h-2.5" />
            {cfg.label}
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-secondary/40 p-2.5">
            <p className="text-muted-foreground mb-0.5">Last Run</p>
            <p className="font-mono font-semibold">{relTime(svc.lastRunAt)}</p>
            {svc.lastRunAt && <p className="text-muted-foreground mt-0.5 text-[10px]">{new Date(svc.lastRunAt).toLocaleTimeString()}</p>}
          </div>
          <div className="rounded-lg bg-secondary/40 p-2.5">
            <p className="text-muted-foreground mb-0.5">Last Success</p>
            <p className="font-mono font-semibold">{relTime(svc.lastSuccessAt)}</p>
            {svc.lastSuccessAt && <p className="text-muted-foreground mt-0.5 text-[10px]">{new Date(svc.lastSuccessAt).toLocaleTimeString()}</p>}
          </div>
          <div className="rounded-lg bg-secondary/40 p-2.5">
            <p className="text-muted-foreground mb-0.5">Avg Duration</p>
            <p className="font-mono font-semibold">{fmtDur(svc.avgDurationMs)}</p>
            {svc.avgDurationMs > 0 && (
              <div className="mt-1.5">
                <GaugeBar value={svc.avgDurationMs} max={30_000} color="bg-blue-400" />
              </div>
            )}
          </div>
          <div className="rounded-lg bg-secondary/40 p-2.5">
            <p className="text-muted-foreground mb-0.5">Consecutive Fails</p>
            <p className={cn("font-mono font-semibold", hasFails ? "text-red-400" : "text-emerald-400")}>
              {svc.consecutiveFails}
            </p>
            {svc.staleSinceMs > 0 && (
              <p className="text-muted-foreground text-[10px] mt-0.5">Stale {fmtDur(svc.staleSinceMs)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceGroup({ title, icon: Icon, services, color }: {
  title: string; icon: any; services: HealthService[]; color: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);

  const issues = services.filter(s => s.status !== "ok" && s.status !== "starting");
  const overallOk = issues.length === 0;

  const toggleAll = () => {
    if (allOpen) {
      setExpanded(new Set());
    } else {
      setExpanded(new Set(services.map(s => s.name)));
    }
    setAllOpen(!allOpen);
  };

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  if (services.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-2.5">
          <Icon className={cn("w-4 h-4", color)} />
          <span className="text-sm font-bold">{title}</span>
          <span className="text-xs text-muted-foreground">{services.length} services</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border",
            overallOk
              ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
              : "text-red-400 bg-red-400/10 border-red-400/20"
          )}>
            {overallOk ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {overallOk ? "Operational" : `${issues.length} issue${issues.length > 1 ? "s" : ""}`}
          </span>
          <button
            onClick={toggleAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border hover:border-border/80 transition-colors"
          >
            {allOpen ? "Collapse" : "Expand all"}
          </button>
        </div>
      </div>
      <div className="divide-y divide-border/0">
        {services.map(svc => (
          <ServiceRow
            key={svc.name}
            svc={svc}
            expanded={expanded.has(svc.name)}
            onToggle={() => toggle(svc.name)}
          />
        ))}
      </div>
    </div>
  );
}

const GROUP_DEFS = [
  { key: "Trading",    label: "Trading Engine",      icon: Zap,      color: "text-yellow-400" },
  { key: "Bridge",     label: "Bridge & Markets",    icon: Layers,   color: "text-violet-400" },
  { key: "Blockchain", label: "Blockchain",           icon: Activity, color: "text-blue-400"   },
  { key: "System",     label: "System Workers",       icon: Server,   color: "text-zinc-400"   },
];

export function AdminStatusPage() {
  const [pubHealth, setPubHealth] = useState<PublicHealth | null>(null);
  const [admHealth, setAdmHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastAt, setLastAt]     = useState<Date | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [pub, adm] = await Promise.allSettled([
        window.fetch(`${BASE}/api/health`).then(r => r.json()),
        adminFetch(`/api/admin/health`).then(r => r.json()),
      ]);
      if (pub.status === "fulfilled") setPubHealth(pub.value);
      if (adm.status === "fulfilled") setAdmHealth(adm.value);
      setLastAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const id = setInterval(fetch, 15_000);
    return () => clearInterval(id);
  }, [fetch]);

  const services  = pubHealth?.services ?? [];
  const alerts    = pubHealth?.alerts   ?? [];
  const hasAlerts = alerts.length > 0;
  const bsv       = pubHealth?.bsvChain;

  const overallOk = pubHealth
    ? services.every(s => s.status === "ok" || s.status === "starting")
    : null;

  const deadCount     = services.filter(s => s.status === "dead").length;
  const degradedCount = services.filter(s => s.status === "degraded" || s.status === "stuck").length;

  const grouped = GROUP_DEFS.map(g => ({
    ...g,
    services: services.filter(s => groupFor(s.name) === g.key),
  }));

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Service Status
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All background workers · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastAt && (
            <span className="text-xs text-muted-foreground">
              Updated {lastAt.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          {pubHealth && (
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
              overallOk
                ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                : "bg-red-400/10 text-red-400 border-red-400/20"
            )}>
              {overallOk
                ? <><CheckCircle2 className="w-3.5 h-3.5" /> All Systems Operational</>
                : <><AlertTriangle className="w-3.5 h-3.5" /> {deadCount + degradedCount} Issue{deadCount + degradedCount > 1 ? "s" : ""}</>
              }
            </span>
          )}
        </div>
      </div>

      {/* ── Alert banner ───────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-4">
          <button
            onClick={() => setExpandedAlerts(p => !p)}
            className="w-full flex items-center gap-2 text-left"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-red-300 flex-1">
              {alerts.length} Active Alert{alerts.length > 1 ? "s" : ""}
            </span>
            {expandedAlerts ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
          </button>
          {expandedAlerts && (
            <ul className="mt-3 space-y-1.5">
              {alerts.map((a, i) => (
                <li key={i} className="text-xs text-red-300/90 flex items-start gap-2">
                  <span className="shrink-0 mt-1 w-1 h-1 rounded-full bg-red-400" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Top metrics ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatChip
          label="API Uptime"
          value={admHealth ? fmtUptime(admHealth.uptimeSeconds) : pubHealth ? fmtUptime(pubHealth.uptime) : "—"}
          color="green"
        />
        <StatChip
          label="Heap Used"
          value={admHealth ? `${admHealth.nodeHeapMB} MB` : "—"}
          sub={admHealth ? `of ${admHealth.nodeHeapTotalMB} MB` : undefined}
          color={admHealth && admHealth.nodeHeapMB / admHealth.nodeHeapTotalMB > 0.85 ? "red" : "blue"}
        />
        <StatChip
          label="RSS Memory"
          value={admHealth ? `${admHealth.nodeRssMB} MB` : "—"}
          color="violet"
        />
        <StatChip
          label="DB Latency"
          value={admHealth ? `${admHealth.dbLatencyMs} ms` : "—"}
          color={admHealth && admHealth.dbLatencyMs > 100 ? "amber" : "green"}
        />
        <StatChip
          label="Active Markets"
          value={admHealth ? admHealth.activeMarkets.toLocaleString() : "—"}
          sub={admHealth ? `of ${admHealth.totalMarkets.toLocaleString()} total` : undefined}
          color="blue"
        />
        <StatChip
          label="Open Orders"
          value={admHealth ? admHealth.openOrders.toLocaleString() : "—"}
          color="amber"
        />
      </div>

      {/* ── Second metrics row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatChip
          label="Orderbook Latency"
          value={admHealth ? `${admHealth.avgOrderbookLatencyMs} ms` : "—"}
          color={admHealth && admHealth.avgOrderbookLatencyMs > 200 ? "amber" : "green"}
        />
        <StatChip
          label="Trades Latency"
          value={admHealth ? `${admHealth.avgTradesLatencyMs} ms` : "—"}
          color={admHealth && admHealth.avgTradesLatencyMs > 200 ? "amber" : "green"}
        />
        <StatChip
          label="Node.js"
          value={admHealth ? admHealth.nodeVersion : "—"}
          sub={admHealth?.platform}
          color="default"
        />
        <StatChip
          label="Total Workers"
          value={String(services.length)}
          sub={`${services.filter(s => s.status === "ok").length} healthy`}
          color={deadCount > 0 ? "red" : degradedCount > 0 ? "amber" : "green"}
        />
        <StatChip
          label="BSV Block"
          value={bsv ? `#${bsv.blockHeight.toLocaleString()}` : "—"}
          sub={bsv ? (bsv.online ? "Online" : "Offline") : undefined}
          color={bsv ? (bsv.online ? "green" : "red") : "default"}
        />
      </div>

      {/* ── Service groups ─────────────────────────────────────────────── */}
      {loading && !pubHealth ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading services…
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => (
            <ServiceGroup
              key={g.key}
              title={g.label}
              icon={g.icon}
              services={g.services}
              color={g.color}
            />
          ))}
        </div>
      )}

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      {services.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-400/5 border border-emerald-400/20 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xl font-bold text-emerald-400">{services.filter(s => s.status === "ok").length}</p>
              <p className="text-xs text-muted-foreground">Healthy</p>
            </div>
          </div>
          <div className={cn(
            "border rounded-xl p-3 flex items-center gap-3",
            degradedCount > 0 ? "bg-amber-400/5 border-amber-400/20" : "bg-secondary/40 border-border"
          )}>
            <AlertTriangle className={cn("w-5 h-5 shrink-0", degradedCount > 0 ? "text-amber-400" : "text-muted-foreground")} />
            <div>
              <p className={cn("text-xl font-bold", degradedCount > 0 ? "text-amber-400" : "text-muted-foreground")}>{degradedCount}</p>
              <p className="text-xs text-muted-foreground">Degraded</p>
            </div>
          </div>
          <div className={cn(
            "border rounded-xl p-3 flex items-center gap-3",
            deadCount > 0 ? "bg-red-400/5 border-red-400/20" : "bg-secondary/40 border-border"
          )}>
            <XCircle className={cn("w-5 h-5 shrink-0", deadCount > 0 ? "text-red-400" : "text-muted-foreground")} />
            <div>
              <p className={cn("text-xl font-bold", deadCount > 0 ? "text-red-400" : "text-muted-foreground")}>{deadCount}</p>
              <p className="text-xs text-muted-foreground">Down</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Raw health JSON ────────────────────────────────────────────── */}
      {pubHealth && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raw Health Response</span>
            <span className="text-[10px] text-muted-foreground">{pubHealth.timestamp}</span>
          </div>
          <pre className="text-[11px] font-mono text-muted-foreground overflow-auto max-h-52 bg-black/20 rounded-xl p-3">
            {JSON.stringify(pubHealth, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
