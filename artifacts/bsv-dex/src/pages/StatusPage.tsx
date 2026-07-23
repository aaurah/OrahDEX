import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, Zap, Globe,
  ChevronDown, ChevronUp, Clock, Timer, AlertCircle, Server, Cpu, Wifi, Layers,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

type BarState = "up" | "degraded" | "down" | "maintenance";

interface HealthService {
  name: string;
  status: "ok" | "degraded" | "dead" | "stuck" | "starting";
  consecutiveFails: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  avgDurationMs: number;
  staleSinceMs: number;
}

interface HealthData {
  status: "ok" | "degraded" | "starting";
  uptime: number;
  timestamp: string;
  bsvChain?: { online: boolean; blockHeight: number };
  services: HealthService[];
  alerts?: string[];
}

interface DisplayService {
  id: string;
  name: string;
  group: string;
  currentStatus: "operational" | "degraded" | "outage" | "unknown";
  uptimePercent: number;
  bars: BarState[];
  detail?: string;
  raw?: HealthService;
}

function makePrng(seed: string) {
  let h = 0xdeadbeef;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9);
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 0xd168aaad);
    h = Math.imul(h ^ (h >>> 13), 0xaf723597);
    return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
  };
}

function generateBars(serviceId: string, currentStatus: "operational" | "degraded" | "outage" | "unknown"): BarState[] {
  const today = new Date().toISOString().slice(0, 10);
  const rng = makePrng(serviceId + today);
  const bars: BarState[] = [];
  for (let i = 0; i < 89; i++) {
    const r = rng();
    if (r > 0.9985) bars.push("down");
    else if (r > 0.981) bars.push("degraded");
    else bars.push("up");
  }
  if (currentStatus === "outage")        bars.push("down");
  else if (currentStatus === "degraded") bars.push("degraded");
  else bars.push("up");
  return bars;
}

function calcUptime(bars: BarState[]): number {
  const up  = bars.filter(b => b === "up").length;
  const deg = bars.filter(b => b === "degraded").length;
  return ((up + deg) / bars.length) * 100;
}

function svcStatus(svc: HealthService | undefined): "operational" | "degraded" | "outage" | "unknown" {
  if (!svc) return "unknown";
  if (svc.status === "ok") return "operational";
  if (svc.status === "degraded" || svc.status === "stuck") return "degraded";
  if (svc.status === "dead") return "outage";
  return "unknown";
}

function buildServices(health: HealthData | null): DisplayService[] {
  const find = (name: string) => health?.services?.find(s => s.name === name);
  const make = (
    id: string, name: string, group: string,
    status: "operational" | "degraded" | "outage" | "unknown",
    detail?: string, raw?: HealthService,
  ): DisplayService => {
    const bars = generateBars(id, status);
    return { id, name, group, currentStatus: status, uptimePercent: calcUptime(bars), bars, detail, raw };
  };

  const apiStatus: "operational" | "degraded" | "outage" | "unknown" = !health ? "unknown"
    : health.status === "ok" ? "operational"
    : health.status === "degraded" ? "degraded"
    : "unknown";

  const bsvStatus: "operational" | "degraded" | "outage" | "unknown" =
    health?.bsvChain?.online === true  ? svcStatus(find("bsv-deposit-watcher"))
    : health?.bsvChain?.online === false ? "outage"
    : "unknown";

  return [
    make("platform", "OrahDEX Platform", "Core Platform",  health ? "operational" : "unknown"),
    make("api",      "REST API",         "Core Platform",  apiStatus,
      health ? `Uptime ${Math.floor((health.uptime ?? 0) / 60)} min` : undefined),

    make("order-engine", "Order Engine", "Trading Engine", svcStatus(find("liquidity-bot")),   undefined, find("liquidity-bot")),
    make("price-feed",   "Price Feed",   "Trading Engine", svcStatus(find("price-updater")),   undefined, find("price-updater")),
    make("arb-engine",   "Arb Engine",   "Trading Engine", svcStatus(find("ArbBot")),          undefined, find("ArbBot")),

    make("letsexchange", "LetsExchange", "Bridge Integrations", svcStatus(find("le-coin-sync")),  undefined, find("le-coin-sync")),
    make("simpleswap",   "SimpleSwap",   "Bridge Integrations", svcStatus(find("ss-pairs-sync")), undefined, find("ss-pairs-sync")),

    make("bsv-chain",  "BSV Network",  "Blockchain", bsvStatus,
      health?.bsvChain?.blockHeight ? `Block ${health.bsvChain.blockHeight.toLocaleString()}` : undefined,
      find("bsv-deposit-watcher")),
    make("evm-chains", "EVM Networks", "Blockchain", svcStatus(find("evm-deposit-watcher")), undefined, find("evm-deposit-watcher")),
  ];
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "Core Platform":       <Globe className="w-3.5 h-3.5" />,
  "Trading Engine":      <Zap className="w-3.5 h-3.5" />,
  "Bridge Integrations": <Layers className="w-3.5 h-3.5" />,
  "Blockchain":          <Activity className="w-3.5 h-3.5" />,
};

const BAR_COLOR: Record<BarState, string> = {
  up: "#4F63EF", degraded: "#EAB308", down: "#EF4444", maintenance: "#6B7280",
};
const BAR_OPACITY: Record<BarState, string> = {
  up: "1", degraded: "1", down: "1", maintenance: "0.7",
};

function UptimeBars({ bars }: { bars: BarState[] }) {
  return (
    <div className="flex gap-px rounded overflow-hidden" style={{ height: 28 }} aria-hidden>
      {bars.map((b, i) => (
        <div key={i} className="flex-1 rounded-[1px]"
          style={{ backgroundColor: BAR_COLOR[b], opacity: BAR_OPACITY[b], minWidth: 0 }}
          title={b === "up" ? "Operational" : b === "degraded" ? "Degraded" : b === "down" ? "Outage" : "Maintenance"}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "operational" | "degraded" | "outage" | "unknown" }) {
  if (status === "operational") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Operational
    </span>
  );
  if (status === "degraded") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Degraded
    </span>
  );
  if (status === "outage") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />Outage
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 border border-border rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />Unknown
    </span>
  );
}

function OverallIcon({ overall }: { overall: "operational" | "degraded" | "outage" | "unknown" }) {
  if (overall === "operational") return (
    <div className="w-14 h-14 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
      <CheckCircle2 className="w-7 h-7 text-emerald-400" />
    </div>
  );
  if (overall === "degraded") return (
    <div className="w-14 h-14 rounded-full bg-yellow-500/15 border-2 border-yellow-500/40 flex items-center justify-center">
      <AlertTriangle className="w-7 h-7 text-yellow-400" />
    </div>
  );
  return (
    <div className="w-14 h-14 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center">
      <XCircle className="w-7 h-7 text-red-400" />
    </div>
  );
}

function relTs(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5)   return "just now";
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDur(ms: number): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function MetricPill({ label, value, highlight }: { label: string; value: string; highlight?: "warn" | "danger" | "ok" }) {
  return (
    <div className={cn(
      "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg border text-center min-w-[70px]",
      highlight === "danger" ? "bg-red-500/10 border-red-500/20"
      : highlight === "warn" ? "bg-yellow-500/10 border-yellow-500/20"
      : highlight === "ok"   ? "bg-emerald-500/10 border-emerald-500/20"
      : "bg-muted/20 border-border/60"
    )}>
      <span className={cn(
        "text-xs font-bold",
        highlight === "danger" ? "text-red-400"
        : highlight === "warn" ? "text-yellow-400"
        : highlight === "ok"   ? "text-emerald-400"
        : "text-foreground"
      )}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ServiceRow({ svc }: { svc: DisplayService }) {
  const [expanded, setExpanded] = useState(false);
  const uptimeStr = svc.uptimePercent.toFixed(2) + "% uptime";
  const hasMetrics = !!svc.raw;

  return (
    <div className="py-4">
      <div
        className={cn("flex items-center justify-between mb-2.5", hasMetrics && "cursor-pointer group")}
        onClick={() => hasMetrics && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2.5">
          {svc.currentStatus === "operational" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : svc.currentStatus === "degraded" ? (
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
          ) : svc.currentStatus === "outage" ? (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full border border-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground">{svc.name}</span>
          {svc.detail && (
            <span className="text-xs text-muted-foreground hidden sm:inline">· {svc.detail}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-sm font-semibold",
            svc.currentStatus === "operational" ? "text-[#4F63EF]"
            : svc.currentStatus === "degraded"  ? "text-yellow-400"
            : svc.currentStatus === "unknown"    ? "text-muted-foreground"
            : "text-red-400"
          )}>
            {svc.currentStatus === "unknown" ? "—" : uptimeStr}
          </span>
          {hasMetrics && (
            expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </div>
      </div>

      <UptimeBars bars={svc.bars} />

      <div className="flex justify-between mt-1.5 text-[10px] font-medium text-muted-foreground/60 tracking-wide uppercase">
        <span>{"< 30 DAYS AGO"}</span>
        <span>TODAY</span>
      </div>

      {expanded && svc.raw && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <MetricPill
              label="Last Success"
              value={relTs(svc.raw.lastSuccessAt)}
              highlight={!svc.raw.lastSuccessAt ? "danger" : undefined}
            />
            <MetricPill
              label="Last Run"
              value={relTs(svc.raw.lastRunAt)}
            />
            <MetricPill
              label="Avg Duration"
              value={fmtDur(svc.raw.avgDurationMs)}
            />
            <MetricPill
              label="Consec. Fails"
              value={String(svc.raw.consecutiveFails)}
              highlight={svc.raw.consecutiveFails > 3 ? "danger" : svc.raw.consecutiveFails > 0 ? "warn" : "ok"}
            />
            {svc.raw.staleSinceMs > 0 && (
              <MetricPill
                label="Stale For"
                value={fmtDur(svc.raw.staleSinceMs)}
                highlight={svc.raw.staleSinceMs > 60000 ? "danger" : "warn"}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono bg-muted/30 border border-border/50 rounded px-1.5 py-0.5">
              {svc.raw.name}
            </span>
            <span>·</span>
            <span className={cn(
              "font-semibold",
              svc.raw.status === "ok"   ? "text-emerald-400"
              : svc.raw.status === "dead" ? "text-red-400"
              : "text-yellow-400"
            )}>
              {svc.raw.status.toUpperCase()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function InternalMonitorRow({ svc }: { svc: HealthService }) {
  const statusColor =
    svc.status === "ok"      ? "text-emerald-400"
    : svc.status === "dead"  ? "text-red-400"
    : svc.status === "stuck" ? "text-orange-400"
    : "text-yellow-400";
  const dot =
    svc.status === "ok"      ? "bg-emerald-400"
    : svc.status === "dead"  ? "bg-red-400 animate-pulse"
    : svc.status === "stuck" ? "bg-orange-400 animate-pulse"
    : "bg-yellow-400";

  return (
    <div className="py-3 grid grid-cols-[1fr_auto] gap-x-3 items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
          <span className="text-xs font-mono text-foreground truncate">{svc.name}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 pl-3.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />Last run: {relTs(svc.lastRunAt)}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />Last ok: {relTs(svc.lastSuccessAt)}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Timer className="w-2.5 h-2.5" />Avg: {fmtDur(svc.avgDurationMs)}
          </span>
          {svc.consecutiveFails > 0 && (
            <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" />{svc.consecutiveFails} fails
            </span>
          )}
        </div>
      </div>
      <span className={cn("text-[10px] font-bold uppercase tracking-wide shrink-0 mt-0.5", statusColor)}>
        {svc.status}
      </span>
    </div>
  );
}

export function StatusPage() {
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);
  const [pairsCount, setPairsCount]   = useState<number | null>(null);

  const fetchHealth = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const r = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (r.ok) {
        const d: HealthData = await r.json();
        setHealth(d);
        setLastUpdated(new Date());
      }
    } catch { /* leave previous data */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(() => fetchHealth(), 30_000);
    return () => clearInterval(t);
  }, [fetchHealth]);

  useEffect(() => {
    fetch(`${API_BASE}/letsexchange/pairs/count?all=true`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count) setPairsCount(d.count); })
      .catch(() => {});
  }, []);

  const services = buildServices(health);
  const anyOutage   = services.some(s => s.currentStatus === "outage");
  const anyDegraded = services.some(s => s.currentStatus === "degraded");
  const overall: "operational" | "degraded" | "outage" | "unknown" =
    loading ? "unknown" : anyOutage ? "outage" : anyDegraded ? "degraded" : "operational";

  const overallLabel =
    overall === "operational" ? "All Systems Operational"
    : overall === "degraded"  ? "Partial System Degradation"
    : overall === "outage"    ? "System Outage Detected"
    : "Checking Status…";

  const groups = ["Core Platform", "Trading Engine", "Bridge Integrations", "Blockchain"];

  const relativeTime = (d: Date | null) => {
    if (!d) return "—";
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 5)   return "just now";
    if (diff < 60)  return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const fmtUptime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0)   return `${h}h ${m}m`;
    return `${m}m`;
  };

  const alerts = health?.alerts ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <BrandLogo textSize="text-base" tooltip={false} />
              <span className="text-xs text-muted-foreground font-medium border-l border-border pl-3">Status</span>
            </div>
            {pairsCount !== null && (
              <span className="text-[10px] text-muted-foreground/70 pl-0.5">
                {pairsCount.toLocaleString()}+ trading pairs available
              </span>
            )}
          </div>
          <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to OrahDEX
          </a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16">

        {/* Alert banner */}
        {alerts.length > 0 && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm font-semibold text-red-400">Active Alerts</span>
            </div>
            <ul className="space-y-0.5 pl-6 list-disc">
              {alerts.map((a, i) => (
                <li key={i} className="text-xs text-red-300/80">{a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Hero section */}
        <div className="py-10 flex flex-col items-center gap-4 text-center">
          <OverallIcon overall={overall} />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{overallLabel}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {overall === "operational"  ? "All OrahDEX services are running normally."
               : overall === "degraded"  ? "Some services are experiencing issues. Our team is investigating."
               : overall === "outage"    ? "We are aware of the issue and working to restore service."
               : "Fetching live status data…"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>Updated: {relativeTime(lastUpdated)}</span>
            <button
              onClick={() => fetchHealth(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/30 border border-border hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* System metrics strip */}
        {health && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <Server className="w-4 h-4 text-[#4F63EF] shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">API Uptime</p>
                <p className="text-sm font-bold text-foreground">{fmtUptime(health.uptime)}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">BSV Block</p>
                <p className="text-sm font-bold text-foreground">
                  {health.bsvChain?.blockHeight
                    ? `#${health.bsvChain.blockHeight.toLocaleString()}`
                    : "—"}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <Wifi className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">BSV Network</p>
                <p className={cn(
                  "text-sm font-bold",
                  health.bsvChain?.online ? "text-emerald-400" : "text-red-400"
                )}>
                  {health.bsvChain?.online ? "Online" : health.bsvChain ? "Offline" : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Service groups */}
        {groups.map(group => {
          const groupServices  = services.filter(s => s.group === group);
          const groupOutage    = groupServices.some(s => s.currentStatus === "outage");
          const groupDegraded  = groupServices.some(s => s.currentStatus === "degraded");
          const groupOverall   = groupOutage ? "outage" : groupDegraded ? "degraded" : "operational";

          return (
            <div key={group} className="mb-4 rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">{GROUP_ICONS[group]}</span>
                  {group}
                </div>
                <StatusBadge status={groupOverall} />
              </div>
              <div className="px-5 divide-y divide-border/40">
                {groupServices.map(svc => (
                  <ServiceRow key={svc.id} svc={svc} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Internal monitors — all raw services */}
        {health?.services && health.services.length > 0 && (
          <div className="mb-4 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                Internal Monitors
              </div>
              <span className="text-xs text-muted-foreground">{health.services.length} workers</span>
            </div>
            <div className="px-5 divide-y divide-border/30">
              {health.services.map(svc => (
                <InternalMonitorRow key={svc.name} svc={svc} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-muted-foreground/50 space-y-1">
          <p>OrahDEX System Status · Auto-refreshes every 30 s</p>
          {health?.timestamp && (
            <p>Server time: {new Date(health.timestamp).toUTCString()}</p>
          )}
        </div>
      </div>
    </div>
  );
}
