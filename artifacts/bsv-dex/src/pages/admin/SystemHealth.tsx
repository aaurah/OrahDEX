import { adminFetch } from "@/lib/adminFetch";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, Cpu, Database, Clock, Server, Zap,
  RefreshCw, CheckCircle, AlertTriangle, HardDrive, ShieldCheck, Link2, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchHealth() {
  return adminFetch(`/api/admin/health`).then(r => r.json());
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function GaugeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, sub, color = "green", gauge,
}: {
  icon: any; label: string; value: string; sub?: string;
  color?: "green" | "blue" | "violet" | "orange" | "red"; gauge?: { value: number; max: number };
}) {
  const colors = {
    green:  "text-green-400  bg-green-400/10",
    blue:   "text-blue-400   bg-blue-400/10",
    violet: "text-violet-400 bg-violet-400/10",
    orange: "text-orange-400 bg-orange-400/10",
    red:    "text-red-400    bg-red-400/10",
  };
  const gaugeColors = {
    green:  "bg-green-400",
    blue:   "bg-blue-400",
    violet: "bg-violet-400",
    orange: "bg-orange-400",
    red:    "bg-red-400",
  };
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", colors[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
          <p className="text-xl font-bold font-mono">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
      {gauge && (
        <GaugeBar value={gauge.value} max={gauge.max} color={gaugeColors[color]} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const ok = status === "operational";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
      ok
        ? "bg-green-400/10 text-green-400 border-green-400/20"
        : "bg-red-400/10   text-red-400   border-red-400/20"
    )}>
      {ok
        ? <CheckCircle className="w-3 h-3" />
        : <AlertTriangle className="w-3 h-3" />}
      {ok ? "All Systems Operational" : "Degraded"}
    </span>
  );
}

export function AdminSystemHealth() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:        ["admin-health"],
    queryFn:         fetchHealth,
    refetchInterval: 20_000,
    staleTime:       15_000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">System Health</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live server metrics · auto-refreshes every 10s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Updated {lastUpdated}</span>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
          {data && <StatusBadge status={data.status ?? "unknown"} />}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading health data…
        </div>
      ) : data ? (
        <>
          {/* Memory */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Memory</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard
                icon={HardDrive} label="Heap Used" color="blue"
                value={`${data.nodeHeapMB} MB`}
                sub={`of ${data.nodeHeapTotalMB} MB allocated`}
                gauge={{ value: data.nodeHeapMB, max: data.nodeHeapTotalMB }}
              />
              <MetricCard
                icon={Cpu} label="RSS Memory" color="violet"
                value={`${data.nodeRssMB} MB`}
                sub="Resident set size"
                gauge={{ value: data.nodeRssMB, max: 512 }}
              />
              <MetricCard
                icon={Server} label="Node.js" color="green"
                value={data.nodeVersion ?? "—"}
                sub={data.platform ?? ""}
              />
            </div>
          </div>

          {/* Database */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Database</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                icon={Database} label="DB Latency" color="green"
                value={`${data.dbLatencyMs} ms`}
                sub="PostgreSQL ping"
                gauge={{ value: data.dbLatencyMs, max: 200 }}
              />
              <MetricCard
                icon={Database} label="DB Connections" color="blue"
                value={String(data.dbConnections ?? "—")}
                sub="Pool size"
              />
              <MetricCard
                icon={Activity} label="Active Markets" color="violet"
                value={String(data.activeMarkets ?? "—")}
                sub={`of ${data.totalMarkets ?? "—"} total`}
                gauge={{ value: data.activeMarkets, max: data.totalMarkets }}
              />
              <MetricCard
                icon={Zap} label="Open Orders" color="orange"
                value={(data.openOrders ?? 0).toLocaleString()}
                sub="In orderbook"
              />
            </div>
          </div>

          {/* Latency */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">API Latency</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard
                icon={Clock} label="Orderbook Latency" color="green"
                value={`${data.avgOrderbookLatencyMs} ms`}
                sub="Avg per request"
                gauge={{ value: data.avgOrderbookLatencyMs, max: 300 }}
              />
              <MetricCard
                icon={Clock} label="Trades Latency" color="blue"
                value={`${data.avgTradesLatencyMs} ms`}
                sub="Avg per request"
                gauge={{ value: data.avgTradesLatencyMs, max: 300 }}
              />
              <MetricCard
                icon={Activity} label="Uptime" color="violet"
                value={fmtUptime(data.uptimeSeconds ?? 0)}
                sub="Since last restart"
              />
            </div>
          </div>

          {/* DB pool config */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">DB Pool Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                icon={Database} label="Max Connections" color="blue"
                value="25"
                sub="Pool ceiling"
              />
              <MetricCard
                icon={Timer} label="Query Timeout" color="orange"
                value="20 s"
                sub="Kills runaway queries"
              />
              <MetricCard
                icon={Clock} label="Idle Timeout" color="violet"
                value="15 s"
                sub="Connection released if idle"
              />
              <MetricCard
                icon={ShieldCheck} label="Keep-Alive" color="green"
                value="Enabled"
                sub="TCP keep-alive on"
              />
            </div>
          </div>

          {/* BSV Intent watcher */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">BSV Intent Settlement</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <MetricCard
                icon={Link2} label="Watcher" color="green"
                value="Active"
                sub="Polls every 30 s"
              />
              <MetricCard
                icon={Clock} label="Startup Delay" color="blue"
                value="72 s"
                sub="Staggered after server boot"
              />
              <MetricCard
                icon={ShieldCheck} label="Script Type" color="violet"
                value="Dual-Hash"
                sub="secretHash + intentHash"
              />
            </div>
          </div>

          {/* Raw JSON for devs */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Raw Response</span>
              <span className="text-[10px] text-muted-foreground">{data.timestamp}</span>
            </div>
            <pre className="text-xs font-mono text-muted-foreground overflow-auto max-h-48 bg-black/20 rounded-xl p-3">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">
          Could not load health data.
        </div>
      )}
    </div>
  );
}
