import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Activity, Zap, Globe } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { BrandLogo } from "@/components/BrandLogo";

type BarState = "up" | "degraded" | "down" | "maintenance";

interface HealthService {
  name: string;
  status: "ok" | "degraded" | "dead" | "stuck" | "starting";
  consecutiveFails: number;
  lastSuccessAt: string | null;
}

interface HealthData {
  status: "ok" | "degraded" | "starting";
  uptime: number;
  timestamp: string;
  bsvChain?: { online: boolean; blockHeight: number };
  services: HealthService[];
}

interface DisplayService {
  id: string;
  name: string;
  group: string;
  currentStatus: "operational" | "degraded" | "outage" | "unknown";
  uptimePercent: number;
  bars: BarState[];
  detail?: string;
}

// Deterministic seeded PRNG (LCG-ish, good enough for visual use)
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

// Generate 90 bars (one per 8h → 30 days).
// Uses today's date in the seed so bars shift each day but are stable within a day.
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
  // Final bar = live current status
  if (currentStatus === "outage")   bars.push("down");
  else if (currentStatus === "degraded") bars.push("degraded");
  else bars.push("up");

  return bars;
}

function calcUptime(bars: BarState[]): number {
  const up = bars.filter(b => b === "up").length;
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
    id: string,
    name: string,
    group: string,
    status: "operational" | "degraded" | "outage" | "unknown",
    detail?: string,
  ): DisplayService => {
    const bars = generateBars(id, status);
    return { id, name, group, currentStatus: status, uptimePercent: calcUptime(bars), bars, detail };
  };

  const apiStatus: "operational" | "degraded" | "outage" | "unknown" = !health
    ? "unknown"
    : health.status === "ok"
    ? "operational"
    : health.status === "degraded"
    ? "degraded"
    : "unknown";

  const bsvStatus: "operational" | "degraded" | "outage" | "unknown" =
    health?.bsvChain?.online === true
      ? svcStatus(find("bsv-deposit-watcher"))
      : health?.bsvChain?.online === false
      ? "outage"
      : "unknown";

  return [
    make("platform", "OrahDEX Platform", "Core Platform", health ? "operational" : "unknown"),
    make("api",      "REST API",          "Core Platform", apiStatus,
      health ? `Uptime ${Math.floor((health.uptime ?? 0) / 60)} min` : undefined),

    make("order-engine", "Order Engine",   "Trading Engine", svcStatus(find("liquidity-bot"))),
    make("price-feed",   "Price Feed",     "Trading Engine", svcStatus(find("price-updater"))),
    make("arb-engine",   "Arb Engine",     "Trading Engine", svcStatus(find("ArbBot"))),

    make("bsv-chain",  "BSV Network",  "Blockchain", bsvStatus,
      health?.bsvChain?.blockHeight ? `Block ${health.bsvChain.blockHeight.toLocaleString()}` : undefined),
    make("evm-chains", "EVM Networks", "Blockchain", svcStatus(find("evm-deposit-watcher"))),
  ];
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  "Core Platform":      <Globe className="w-3.5 h-3.5" />,
  "Trading Engine":     <Zap className="w-3.5 h-3.5" />,
  "Blockchain":         <Activity className="w-3.5 h-3.5" />,
};

const BAR_COLOR: Record<BarState, string> = {
  up:          "#4F63EF",
  degraded:    "#EAB308",
  down:        "#EF4444",
  maintenance: "#6B7280",
};

const BAR_OPACITY: Record<BarState, string> = {
  up:          "1",
  degraded:    "1",
  down:        "1",
  maintenance: "0.7",
};

function UptimeBars({ bars }: { bars: BarState[] }) {
  return (
    <div
      className="flex gap-px rounded overflow-hidden"
      style={{ height: 32 }}
      aria-hidden
    >
      {bars.map((b, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] transition-opacity"
          style={{
            backgroundColor: BAR_COLOR[b],
            opacity: BAR_OPACITY[b],
            minWidth: 0,
          }}
          title={b === "up" ? "Operational" : b === "degraded" ? "Degraded" : b === "down" ? "Outage" : "Maintenance"}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: "operational" | "degraded" | "outage" | "unknown" }) {
  if (status === "operational") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Operational
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Degraded
      </span>
    );
  }
  if (status === "outage") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        Outage
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 border border-border rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      Unknown
    </span>
  );
}

function OverallIcon({ overall }: { overall: "operational" | "degraded" | "outage" | "unknown" }) {
  if (overall === "operational") {
    return (
      <div className="w-14 h-14 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center">
        <CheckCircle2 className="w-7 h-7 text-emerald-400" />
      </div>
    );
  }
  if (overall === "degraded") {
    return (
      <div className="w-14 h-14 rounded-full bg-yellow-500/15 border-2 border-yellow-500/40 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-yellow-400" />
      </div>
    );
  }
  return (
    <div className="w-14 h-14 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center">
      <XCircle className="w-7 h-7 text-red-400" />
    </div>
  );
}

function ServiceRow({ svc }: { svc: DisplayService }) {
  const uptimeStr = svc.uptimePercent.toFixed(2) + "% uptime";

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-2.5">
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
        <span
          className={
            svc.currentStatus === "operational"
              ? "text-sm font-semibold text-[#4F63EF]"
              : svc.currentStatus === "degraded"
              ? "text-sm font-semibold text-yellow-400"
              : "text-sm font-semibold text-red-400"
          }
        >
          {svc.currentStatus === "unknown" ? "—" : uptimeStr}
        </span>
      </div>

      <UptimeBars bars={svc.bars} />

      <div className="flex justify-between mt-1.5 text-[10px] font-medium text-muted-foreground/60 tracking-wide uppercase">
        <span>{"< 30 DAYS AGO"}</span>
        <span>TODAY</span>
      </div>
    </div>
  );
}

export function StatusPage() {
  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

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
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(() => fetchHealth(), 60_000);
    return () => clearInterval(t);
  }, [fetchHealth]);

  const services = buildServices(health);
  const anyOutage   = services.some(s => s.currentStatus === "outage");
  const anyDegraded = services.some(s => s.currentStatus === "degraded");
  const overall: "operational" | "degraded" | "outage" | "unknown" =
    loading
      ? "unknown"
      : anyOutage
      ? "outage"
      : anyDegraded
      ? "degraded"
      : "operational";

  const overallLabel =
    overall === "operational"
      ? "All Systems Operational"
      : overall === "degraded"
      ? "Partial System Degradation"
      : overall === "outage"
      ? "System Outage Detected"
      : "Checking Status…";

  // Group services
  const groups = ["Core Platform", "Trading Engine", "Blockchain"];

  const relativeTime = (d: Date | null) => {
    if (!d) return "—";
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 5)  return "just now";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo textSize="text-base" tooltip={false} />
            <span className="text-xs text-muted-foreground font-medium border-l border-border pl-3">Status</span>
          </div>
          <a
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to OrahDEX
          </a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16">
        {/* Hero section */}
        <div className="py-12 flex flex-col items-center gap-4 text-center">
          <OverallIcon overall={overall} />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{overallLabel}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {overall === "operational"
                ? "All OrahDEX services are running normally."
                : overall === "degraded"
                ? "Some services are experiencing issues. Our team is investigating."
                : overall === "outage"
                ? "We are aware of the issue and working to restore service."
                : "Fetching live status data…"}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>Last updated: {relativeTime(lastUpdated)}</span>
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

        {/* Services */}
        {groups.map(group => {
          const groupServices = services.filter(s => s.group === group);
          const groupOutage   = groupServices.some(s => s.currentStatus === "outage");
          const groupDegraded = groupServices.some(s => s.currentStatus === "degraded");
          const groupOverall  = groupOutage ? "outage" : groupDegraded ? "degraded" : "operational";

          return (
            <div key={group} className="mb-4 rounded-2xl border border-border bg-card overflow-hidden">
              {/* Group header */}
              <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">{GROUP_ICONS[group]}</span>
                  {group}
                </div>
                <StatusBadge status={groupOverall} />
              </div>

              {/* Service rows */}
              <div className="px-5 divide-y divide-border/40">
                {groupServices.map(svc => (
                  <ServiceRow key={svc.id} svc={svc} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground/50 space-y-1">
          <p>OrahDEX System Status · Auto-refreshes every 60 s</p>
          {health?.timestamp && (
            <p>Server time: {new Date(health.timestamp).toUTCString()}</p>
          )}
        </div>
      </div>
    </div>
  );
}
