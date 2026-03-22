import { useQuery } from "@tanstack/react-query";
import {
  Users, ArrowRightLeft, TrendingUp, DollarSign,
  Cpu, Key, Activity, ShieldCheck, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchStats = () => fetch(`${BASE}/api/admin/stats`).then(r => r.json());

function StatCard({ icon: Icon, label, value, sub, color = "primary" }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    green: "text-green-400 bg-green-400/10",
    blue: "text-blue-400 bg-blue-400/10",
    violet: "text-violet-400 bg-violet-400/10",
    orange: "text-orange-400 bg-orange-400/10",
    red: "text-red-400 bg-red-400/10",
  };
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colors[color])}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
        <p className="text-2xl font-bold font-mono">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const ACTIVITY = [
  { time: "09:14", event: "New user registered", type: "user", detail: "via HandCash" },
  { time: "09:11", event: "BSV/USDT pair fee updated", type: "pair", detail: "0.1% → 0.08%" },
  { time: "09:08", event: "API key generated", type: "api", detail: "Trading Bot Integration" },
  { time: "09:01", event: "User suspended", type: "warn", detail: "usr_0004 — TOS violation" },
  { time: "08:55", event: "ORAH token deployed", type: "contract", detail: "BSV Mainnet" },
  { time: "08:42", event: "New admin added", type: "admin", detail: "Finance Analyst role" },
  { time: "08:30", event: "ETH/USDT pair enabled", type: "pair", detail: "Spot market activated" },
];

const TYPE_COLORS: Record<string, string> = {
  user: "bg-green-400/10 text-green-400",
  pair: "bg-blue-400/10 text-blue-400",
  api: "bg-primary/10 text-primary",
  warn: "bg-orange-400/10 text-orange-400",
  contract: "bg-violet-400/10 text-violet-400",
  admin: "bg-pink-400/10 text-pink-400",
};

export function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats, refetchInterval: 10000 });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Platform Overview</h2>
        <p className="text-muted-foreground text-sm">Real-time Orah DEX system metrics and activity</p>
      </div>

      {/* System Status */}
      <div className="flex items-center gap-3 p-4 bg-green-400/5 border border-green-400/20 rounded-xl">
        <Activity className="w-5 h-5 text-green-400" />
        <div>
          <span className="text-sm font-semibold text-green-400">All Systems Operational</span>
          <span className="text-xs text-muted-foreground ml-3">Last checked: just now</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Users" value={isLoading ? "..." : stats?.totalUsers?.toLocaleString()} sub={`${stats?.activeUsers24h ?? "—"} active today`} color="blue" />
        <StatCard icon={TrendingUp} label="24h Volume" value={isLoading ? "..." : `$${(stats?.totalVolume24h / 1e6)?.toFixed(2)}M`} sub={`${stats?.totalTrades24h?.toLocaleString()} trades`} color="green" />
        <StatCard icon={ArrowRightLeft} label="Active Pairs" value={isLoading ? "..." : `${stats?.activePairs} / ${stats?.totalPairs}`} sub="spot + futures" color="primary" />
        <StatCard icon={DollarSign} label="Revenue 24h" value={isLoading ? "..." : `$${stats?.revenue24h?.toLocaleString()}`} sub={`${stats?.feeRate}% fee rate`} color="orange" />
        <StatCard icon={ShieldCheck} label="Open Orders" value={isLoading ? "..." : stats?.openOrders?.toLocaleString()} sub="across all pairs" color="violet" />
        <StatCard icon={Cpu} label="Contracts" value={isLoading ? "..." : stats?.deployedContracts?.toString()} sub="BSV Mainnet" color="violet" />
        <StatCard icon={Key} label="API Keys" value="4" sub="3 active, 1 revoked" color="primary" />
        <StatCard icon={DollarSign} label="TVL" value={isLoading ? "..." : `$${((stats?.tvl ?? 0) / 1e6)?.toFixed(0)}M`} sub="total value locked" color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Recent Activity
          </h3>
          <div className="space-y-3">
            {ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-muted-foreground font-mono w-12 shrink-0 pt-0.5">{a.time}</span>
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5", TYPE_COLORS[a.type])}>{a.type}</span>
                <div>
                  <p className="text-foreground font-medium leading-tight">{a.event}</p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> System Alerts
          </h3>
          <div className="space-y-3">
            {[
              { sev: "warn", msg: "1 user account pending KYC review", time: "2h ago" },
              { sev: "info", msg: "API rate limit nearing capacity on pub key", time: "4h ago" },
              { sev: "info", msg: "BSV/BTC pair volume 42% above average", time: "6h ago" },
              { sev: "ok", msg: "All database backups completed", time: "8h ago" },
              { sev: "ok", msg: "Smart contract audit passed — ORAH token", time: "1d ago" },
            ].map((a, i) => (
              <div key={i} className={cn("flex items-start gap-3 p-3 rounded-xl border text-sm",
                a.sev === "warn" ? "bg-orange-400/5 border-orange-400/20" :
                a.sev === "info" ? "bg-blue-400/5 border-blue-400/20" :
                "bg-green-400/5 border-green-400/20"
              )}>
                <span className={cn("shrink-0 mt-0.5",
                  a.sev === "warn" ? "text-orange-400" : a.sev === "info" ? "text-blue-400" : "text-green-400"
                )}>
                  {a.sev === "ok" ? "✓" : a.sev === "warn" ? "⚠" : "ℹ"}
                </span>
                <div className="flex-1">
                  <p className="text-foreground">{a.msg}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
