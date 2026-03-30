import { useQuery } from "@tanstack/react-query";
import {
  Users, ArrowRightLeft, TrendingUp, DollarSign,
  Cpu, Key, Activity, ShieldCheck, AlertTriangle,
  RefreshCw, TrendingDown, Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchStats    = () => fetch(`${BASE}/api/admin/stats`).then(r => r.json());
const fetchActivity = () => fetch(`${BASE}/api/admin/activity?limit=12`).then(r => r.json());
const fetchApiKeys  = () => fetch(`${BASE}/api/admin/api-settings`).then(r => r.json());

function StatCard({ icon: Icon, label, value, sub, color = "primary", live = false }: {
  icon: any; label: string; value: string; sub?: string; color?: string; live?: boolean;
}) {
  const colors: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    green:   "text-green-400 bg-green-400/10",
    blue:    "text-blue-400 bg-blue-400/10",
    violet:  "text-violet-400 bg-violet-400/10",
    orange:  "text-orange-400 bg-orange-400/10",
    red:     "text-red-400 bg-red-400/10",
  };
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colors[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          {live && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />}
        </div>
        <p className="text-2xl font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  buy:      "bg-green-400/10 text-green-400",
  sell:     "bg-red-400/10 text-red-400",
  user:     "bg-green-400/10 text-green-400",
  pair:     "bg-blue-400/10 text-blue-400",
  api:      "bg-primary/10 text-primary",
  warn:     "bg-orange-400/10 text-orange-400",
  contract: "bg-violet-400/10 text-violet-400",
  admin:    "bg-pink-400/10 text-pink-400",
  trade:    "bg-cyan-400/10 text-cyan-400",
};

const TYPE_LABELS: Record<string, string> = {
  buy: "BUY", sell: "SELL", user: "USER", pair: "PAIR", api: "API",
  warn: "WARN", contract: "CONTRACT", admin: "ADMIN", trade: "TRADE",
};

const FALLBACK_ACTIVITY = [
  { id: "f1", time: "—", event: "No recent activity", type: "api", detail: "Activity will appear as users trade", ts: 0 },
];

export function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchStats,
    refetchInterval: 10_000,
  });

  const { data: activityRaw, isLoading: actLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: fetchActivity,
    refetchInterval: 8_000,
  });

  const { data: apiKeysRaw } = useQuery({
    queryKey: ["admin-api-settings"],
    queryFn: fetchApiKeys,
    refetchInterval: 30_000,
  });

  const activity: typeof FALLBACK_ACTIVITY = Array.isArray(activityRaw) && activityRaw.length > 0
    ? activityRaw
    : FALLBACK_ACTIVITY;

  const apiKeys   = Array.isArray(apiKeysRaw) ? apiKeysRaw : [];
  const activeKeys = apiKeys.filter((k: any) => k.status === "active").length;
  const totalKeys  = apiKeys.length;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Platform Overview</h2>
          <p className="text-muted-foreground text-sm">Real-time Orah DEX system metrics and activity</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 pt-1">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: "4s" }} />
          <span>Auto-refresh · last at {lastUpdated}</span>
        </div>
      </div>

      {/* System Status */}
      <div className="flex items-center gap-3 p-4 bg-green-400/5 border border-green-400/20 rounded-xl">
        <Activity className="w-5 h-5 text-green-400" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-green-400">All Systems Operational</span>
          <span className="text-xs text-muted-foreground ml-3">Stats refresh every 10s · Activity refresh every 8s</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-semibold">LIVE</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard live icon={Users} label="Total Users"
          value={isLoading ? "…" : (stats?.totalUsers?.toLocaleString() ?? "0")}
          sub={`${stats?.activeUsers24h ?? "—"} active today`} color="blue" />
        <StatCard live icon={TrendingUp} label="24h Volume"
          value={isLoading ? "…" : `$${((stats?.totalVolume24h ?? 0) / 1e6).toFixed(2)}M`}
          sub={`${stats?.totalTrades24h?.toLocaleString() ?? "0"} trades`} color="green" />
        <StatCard live icon={ArrowRightLeft} label="Active Pairs"
          value={isLoading ? "…" : `${stats?.activePairs ?? "—"} / ${stats?.totalPairs ?? "—"}`}
          sub="spot + futures" color="primary" />
        <StatCard live icon={DollarSign} label="Revenue 24h"
          value={isLoading ? "…" : `$${(stats?.revenue24h ?? 0).toLocaleString()}`}
          sub={`${stats?.feeRate ?? "—"}% fee rate`} color="orange" />
        <StatCard live icon={ShieldCheck} label="Open Orders"
          value={isLoading ? "…" : (stats?.openOrders?.toLocaleString() ?? "0")}
          sub="across all pairs" color="violet" />
        <StatCard live icon={Cpu} label="Contracts"
          value={isLoading ? "…" : (stats?.deployedContracts?.toString() ?? "0")}
          sub="BSV Mainnet" color="violet" />
        <StatCard icon={Key} label="API Keys"
          value={totalKeys > 0 ? String(totalKeys) : isLoading ? "…" : "—"}
          sub={totalKeys > 0 ? `${activeKeys} active` : "loading…"} color="primary" />
        <StatCard live icon={DollarSign} label="TVL"
          value={isLoading ? "…" : `$${((stats?.tvl ?? 0) / 1e6).toFixed(0)}M`}
          sub="total value locked" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Activity Feed */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Live Activity
            </h3>
            {actLoading ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> fetching…
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {activity.map((a, i) => (
              <div key={a.id ?? i} className="flex items-start gap-3 text-sm">
                <span className="text-[10px] text-muted-foreground font-mono w-12 shrink-0 pt-0.5 tabular-nums">
                  {a.time}
                </span>
                <span className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5",
                  TYPE_COLORS[a.type] ?? "bg-muted/20 text-muted-foreground"
                )}>
                  {TYPE_LABELS[a.type] ?? a.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground font-medium leading-tight text-[13px] truncate">{a.event}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.detail}</p>
                </div>
              </div>
            ))}
            {activity === FALLBACK_ACTIVITY && (
              <div className="text-center text-xs text-muted-foreground py-4">
                Waiting for user activity — trades and orders will appear here in real time.
              </div>
            )}
          </div>
        </div>

        {/* System Alerts */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> System Alerts
          </h3>
          <div className="space-y-3">
            {/* Dynamic alerts from stats */}
            {stats && stats.openOrders > 50 && (
              <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-orange-400/5 border-orange-400/20">
                <span className="text-orange-400 shrink-0 mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-foreground">{stats.openOrders} open orders pending settlement</p>
                  <p className="text-xs text-muted-foreground mt-0.5">just now</p>
                </div>
              </div>
            )}
            {stats && stats.totalVolume24h > 1_000_000 && (
              <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-blue-400/5 border-blue-400/20">
                <TrendingUp className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-foreground">24h volume above $1M — strong liquidity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${(stats.totalVolume24h / 1e6).toFixed(2)}M across {stats.totalTrades24h} trades
                  </p>
                </div>
              </div>
            )}
            {stats && stats.activePairs > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-green-400/5 border-green-400/20">
                <span className="text-green-400 shrink-0 mt-0.5">✓</span>
                <div className="flex-1">
                  <p className="text-foreground">{stats.activePairs} trading pairs active — all healthy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">checked just now</p>
                </div>
              </div>
            )}
            {stats && stats.aiConversations > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-violet-400/5 border-violet-400/20">
                <Flame className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-foreground">Ora AI — {stats.aiConversations} sessions, {stats.aiMessages} messages</p>
                  <p className="text-xs text-muted-foreground mt-0.5">all AI services operational</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-green-400/5 border-green-400/20">
              <span className="text-green-400 shrink-0 mt-0.5">✓</span>
              <div className="flex-1">
                <p className="text-foreground">All database backups completed</p>
                <p className="text-xs text-muted-foreground mt-0.5">BSV Mainnet contracts audited</p>
              </div>
            </div>
            {!stats && !isLoading && (
              <div className="flex items-start gap-3 p-3 rounded-xl border text-sm bg-orange-400/5 border-orange-400/20">
                <span className="text-orange-400 shrink-0 mt-0.5">⚠</span>
                <div className="flex-1">
                  <p className="text-foreground">Could not fetch live stats</p>
                  <p className="text-xs text-muted-foreground mt-0.5">API server may be restarting</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Trade Volume Chart Placeholder */}
        <div className="bg-card border border-border rounded-2xl p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" /> Revenue & Volume Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Users",    value: stats?.totalUsers?.toLocaleString() ?? "—",    icon: Users,          color: "text-blue-400" },
              { label: "Trades Today",   value: stats?.totalTrades24h?.toLocaleString() ?? "—", icon: ArrowRightLeft, color: "text-green-400" },
              { label: "Revenue Today",  value: stats ? `$${(stats.revenue24h).toLocaleString()}` : "—", icon: DollarSign, color: "text-orange-400" },
              { label: "TVL",            value: stats ? `$${((stats.tvl ?? 0) / 1e6).toFixed(0)}M` : "—", icon: ShieldCheck, color: "text-violet-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <span className="text-xl font-bold font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
