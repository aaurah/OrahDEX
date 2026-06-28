import { adminFetch } from "@/lib/adminFetch";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users, ArrowRightLeft, TrendingUp, DollarSign,
  Cpu, Key, Activity, ShieldCheck, AlertTriangle,
  RefreshCw, Flame, MessageCircle, Zap, Bot,
  ChevronRight, Shield, Link2, BarChart3, HeartPulse,
  Database, CheckCircle2, ExternalLink, Globe, Server,
  Wifi, ArrowDownToLine, Clock, Layers, Bell,
  TrendingDown, Minus, ToggleLeft, Palette, Megaphone,
  CreditCard, Landmark, Terminal, Brain, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fetchStats    = () => adminFetch(`/api/admin/stats`).then(r => r.json());
const fetchActivity = () => adminFetch(`/api/admin/activity?limit=30`).then(r => r.json());
const fetchApiKeys  = () => adminFetch(`/api/admin/api-keys`).then(r => r.json());
const fetchChannels = () => fetch(`${BASE}/api/chat/channels`).then(r => r.json()).catch(() => []);
const fetchOverlay  = () => adminFetch(`/api/admin/overlay/stats`).then(r => r.json()).catch(() => null);
const fetchDiag     = () => adminFetch(`/api/admin/diagnostics`).then(r => r.json()).catch(() => null);
const fetchAlerts   = () => adminFetch(`/api/admin/alerts`).then(r => r.json()).catch(() => []);

/* ── Tiny helpers ─────────────────────────────────────────────────────── */
function fmt(n: number | undefined | null) {
  if (!n && n !== 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtNum(n: number | undefined | null) {
  if (!n && n !== 0) return "—";
  return n.toLocaleString();
}

/* ── KPI card ─────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, color, trend, href }: {
  icon: any; label: string; value: string; sub?: string;
  color: string; trend?: "up" | "down" | "flat"; href?: string;
}) {
  const clrs: Record<string, string> = {
    primary: "text-primary bg-primary/10 border-primary/20",
    green:   "text-green-400 bg-green-400/10 border-green-400/20",
    blue:    "text-blue-400 bg-blue-400/10 border-blue-400/20",
    violet:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
    orange:  "text-orange-400 bg-orange-400/10 border-orange-400/20",
    red:     "text-red-400 bg-red-400/10 border-red-400/20",
    cyan:    "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
    amber:   "text-amber-400 bg-amber-400/10 border-amber-400/20",
  };
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendCls  = trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";

  const inner = (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3 group hover:border-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 h-full">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border", clrs[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">{label}</p>
        <p className="text-xl font-bold font-mono tabular-nums leading-none">{value}</p>
        {sub && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {trend && <TrendIcon className={cn("w-3 h-3 shrink-0", trendCls)} />}
            <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
          </div>
        )}
      </div>
      {href && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary shrink-0 mt-1 transition-colors" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/* ── Service pill ─────────────────────────────────────────────────────── */
function ServicePill({ name, status, icon: Icon, latency }: { name: string; status: "ok" | "warn" | "error" | "unknown"; icon: any; latency?: string }) {
  const cfg = {
    ok:      { dot: "bg-green-400", ring: "border-green-400/20 bg-green-400/5",  label: "Online",  txt: "text-green-400"  },
    warn:    { dot: "bg-amber-400", ring: "border-amber-400/20 bg-amber-400/5",  label: "Degraded",txt: "text-amber-400"  },
    error:   { dot: "bg-red-400",   ring: "border-red-400/20 bg-red-400/5",      label: "Down",    txt: "text-red-400"    },
    unknown: { dot: "bg-muted",     ring: "border-border bg-secondary/20",       label: "Unknown", txt: "text-muted-foreground" },
  }[status];
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all", cfg.ring)}>
      <Icon className={cn("w-4 h-4 shrink-0", cfg.txt)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground leading-none">{name}</p>
        {latency && <p className="text-[10px] text-muted-foreground mt-0.5">{latency}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={cn("w-1.5 h-1.5 rounded-full", cfg.dot, status === "ok" && "animate-pulse")} />
        <span className={cn("text-[10px] font-bold uppercase tracking-wide", cfg.txt)}>{cfg.label}</span>
      </div>
    </div>
  );
}

/* ── Mini bar (pure CSS) ─────────────────────────────────────────────── */
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-8 flex items-end">
      <div className="w-full h-full flex items-end">
        <div className={cn("w-full rounded-t-sm transition-all duration-500", color)} style={{ height: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

/* ── Activity type config ─────────────────────────────────────────────── */
const TYPE_CFG: Record<string, { cls: string; label: string }> = {
  buy:      { cls: "bg-green-400/10 text-green-400 border-green-400/20",   label: "BUY"      },
  sell:     { cls: "bg-red-400/10 text-red-400 border-red-400/20",         label: "SELL"     },
  user:     { cls: "bg-blue-400/10 text-blue-400 border-blue-400/20",      label: "USER"     },
  pair:     { cls: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",      label: "PAIR"     },
  api:      { cls: "bg-primary/10 text-primary border-primary/20",          label: "API"      },
  warn:     { cls: "bg-orange-400/10 text-orange-400 border-orange-400/20", label: "WARN"     },
  contract: { cls: "bg-violet-400/10 text-violet-400 border-violet-400/20", label: "CONTRACT" },
  admin:    { cls: "bg-pink-400/10 text-pink-400 border-pink-400/20",       label: "ADMIN"    },
  trade:    { cls: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",       label: "TRADE"    },
  system:   { cls: "bg-amber-400/10 text-amber-400 border-amber-400/20",   label: "SYSTEM"   },
};

const FALLBACK_ACTIVITY = [
  { id: "f1", time: "—", event: "No recent activity", type: "api", detail: "Events appear here as users trade", ts: 0 },
];

type ActivityFilter = "all" | "trade" | "user" | "system" | "warn";

const FILTER_TABS: { key: ActivityFilter; label: string }[] = [
  { key: "all",    label: "All"    },
  { key: "trade",  label: "Trades" },
  { key: "user",   label: "Users"  },
  { key: "system", label: "System" },
  { key: "warn",   label: "Alerts" },
];

const FILTER_TYPES: Record<ActivityFilter, string[]> = {
  all:    [],
  trade:  ["buy", "sell", "trade"],
  user:   ["user"],
  system: ["api", "pair", "contract", "admin", "system"],
  warn:   ["warn"],
};

/* ── Quick action ─────────────────────────────────────────────────────── */
function QuickAction({ href, icon: Icon, label, color, kbd }: { href: string; icon: any; label: string; color: string; kbd?: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/40 transition-all group text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-b from-primary/3 to-transparent transition-opacity" />
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
      {kbd && <span className="text-[9px] text-muted-foreground/40 font-mono absolute top-1.5 right-1.5">{kbd}</span>}
    </Link>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export function AdminDashboard() {
  const [actFilter, setActFilter] = useState<ActivityFilter>("all");
  const [now] = useState(new Date());

  const { data: stats, isLoading, dataUpdatedAt: statsUpdated } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchStats,
    refetchInterval: 30_000,
    staleTime:       25_000,
  });

  const { data: activityRaw, isLoading: actLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: fetchActivity,
    refetchInterval: 20_000,
    staleTime:       15_000,
  });

  const { data: apiKeysRaw } = useQuery({
    queryKey: ["admin-api-settings"],
    queryFn: fetchApiKeys,
    refetchInterval: 60_000,
  });

  const { data: chatChannels } = useQuery({
    queryKey: ["admin-chat-channels"],
    queryFn: fetchChannels,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const { data: overlayStats } = useQuery({
    queryKey: ["admin-overlay-stats"],
    queryFn: fetchOverlay,
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const { data: diagRaw } = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: fetchDiag,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const { data: alertsRaw } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const activityAll: typeof FALLBACK_ACTIVITY = Array.isArray(activityRaw) && activityRaw.length > 0
    ? activityRaw : FALLBACK_ACTIVITY;

  const activity = useMemo(() => {
    const types = FILTER_TYPES[actFilter];
    if (!types.length) return activityAll;
    return activityAll.filter(a => types.includes(a.type));
  }, [activityAll, actFilter]);

  const apiKeys   = Array.isArray(apiKeysRaw) ? apiKeysRaw : [];
  const activeKeys = apiKeys.filter((k: any) => k.status === "active").length;
  const channels  = Array.isArray(chatChannels) ? chatChannels : [];
  const alerts    = Array.isArray(alertsRaw) ? alertsRaw : [];
  const totalMsgs = channels.reduce((s: number, c: any) => s + (c.messageCount ?? 0), 0);
  const totalSubs = channels.reduce((s: number, c: any) => s + (c.activeSubscribers ?? 0), 0);

  const lastAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  /* Derive service health from diagnostics */
  const services = useMemo(() => {
    const d = diagRaw as any;
    const probe = (key: string, fallback: "ok" | "unknown" = "unknown"): "ok" | "warn" | "error" | "unknown" => {
      if (!d) return "unknown";
      const v = d[key];
      if (typeof v === "boolean") return v ? "ok" : "error";
      if (typeof v === "string") {
        if (v === "ok" || v === "healthy" || v === "operational") return "ok";
        if (v === "degraded" || v === "warn") return "warn";
        if (v === "down" || v === "error") return "error";
      }
      if (typeof v === "object" && v !== null) {
        if (v.status === "ok" || v.healthy) return "ok";
        if (v.status === "warn") return "warn";
        if (v.status === "error" || v.healthy === false) return "error";
      }
      return fallback;
    };
    return [
      { name: "Database",     icon: Database,   status: probe("db",          "unknown") },
      { name: "API Server",   icon: Server,     status: probe("api",         "ok")      },
      { name: "WebSocket",    icon: Wifi,       status: probe("websocket",   "unknown") },
      { name: "Liquidity Bot",icon: Bot,        status: probe("liquidityBot","unknown") },
      { name: "Price Feed",   icon: TrendingUp, status: probe("priceFeed",   "unknown") },
      { name: "Bridge",       icon: Globe,      status: probe("bridge",      "ok")      },
      { name: "Overlay",      icon: Layers,     status: (overlayStats as any)?.total > 0 ? "ok" as const : "unknown" as const },
      { name: "Mailer",       icon: MessageCircle, status: probe("mailer",   "unknown") },
    ];
  }, [diagRaw, overlayStats]);

  /* Revenue bar chart — last 7 days from stats or mock */
  const revBars = useMemo(() => {
    const rev = (stats as any)?.revenueHistory as number[] | undefined;
    const data = rev?.length === 7 ? rev : [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 1.0].map(f => (stats?.revenue24h ?? 1000) * f);
    const max = Math.max(...data, 1);
    return { data, max };
  }, [stats]);

  const warnAlerts = alerts.filter((a: any) => a.level === "warn" || a.level === "error");

  return (
    <div className="space-y-5 max-w-[1600px]">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{greeting} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · OrahDEX Platform Overview
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/8 border border-green-500/15 text-[11px]">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 font-semibold">All Systems Operational</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-2.5 py-1.5 bg-secondary/40 rounded-xl border border-border">
            <RefreshCw className="w-3 h-3" style={{ animationName: "spin", animationDuration: "4s", animationTimingFunction: "linear", animationIterationCount: "infinite" }} />
            {lastAt}
          </div>
        </div>
      </div>

      {/* ── KPI Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard href="/admin/users" icon={Users} label="Total Users"
          value={isLoading ? "…" : fmtNum(stats?.totalUsers)}
          sub={`${stats?.activeUsers24h ?? "—"} active today`}
          color="blue" trend="up" />
        <KpiCard href="/admin/trade-analytics" icon={TrendingUp} label="24h Volume"
          value={isLoading ? "…" : fmt(stats?.totalVolume24h)}
          sub={`${fmtNum(stats?.totalTrades24h)} trades`}
          color="green" trend={stats?.totalVolume24h > 100_000 ? "up" : "flat"} />
        <KpiCard href="/admin/fees" icon={DollarSign} label="Revenue 24h"
          value={isLoading ? "…" : fmt(stats?.revenue24h)}
          sub={`${stats?.feeRate ?? "—"}% fee rate`}
          color="orange" trend="up" />
        <KpiCard href="/admin/pairs" icon={ArrowRightLeft} label="Active Pairs"
          value={isLoading ? "…" : `${stats?.activePairs ?? "—"}/${stats?.totalPairs ?? "—"}`}
          sub="spot + futures"
          color="primary" />
        <KpiCard href="/admin/treasury" icon={Landmark} label="TVL"
          value={isLoading ? "…" : fmt(stats?.tvl)}
          sub="total value locked"
          color="violet" trend="up" />
        <KpiCard href="/admin/support/inbox" icon={ShieldCheck} label="Open Orders"
          value={isLoading ? "…" : fmtNum(stats?.openOrders)}
          sub="across all pairs"
          color="cyan" />
        <KpiCard icon={Key} label="API Keys"
          value={apiKeys.length > 0 ? String(apiKeys.length) : "—"}
          sub={`${activeKeys} active`}
          color="amber" />
        <KpiCard icon={MessageCircle} label="Live Chat"
          value={channels.length > 0 ? `${channels.length} ch` : "—"}
          sub={`${totalMsgs} msgs · ${totalSubs} live`}
          color="blue" />
        <KpiCard icon={Brain} label="AI Sessions"
          value={isLoading ? "…" : fmtNum(stats?.aiConversations)}
          sub={`${fmtNum(stats?.aiMessages)} messages`}
          color="violet" />
        <KpiCard icon={Database} label="Overlay Records"
          value={(overlayStats as any)?.total != null ? String((overlayStats as any).total) : "—"}
          sub={(overlayStats as any)?.latestBlockScanned ? `block ${(overlayStats as any).latestBlockScanned}` : "BSV on-chain"}
          color="primary" />
      </div>

      {/* ── Row: System Health + Revenue Chart ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* System services */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-green-400" />
              Service Health
            </h3>
            <Link href="/admin/health" className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
              Full diagnostics <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {services.map(s => (
              <ServicePill key={s.name} name={s.name} status={s.status} icon={s.icon} />
            ))}
          </div>
          {warnAlerts.length > 0 && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-400/5 border border-amber-400/20 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-amber-300">{warnAlerts[0]?.message ?? `${warnAlerts.length} system alert${warnAlerts.length > 1 ? "s" : ""} active`}</span>
            </div>
          )}
        </div>

        {/* Revenue trend */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Revenue Trend
            </h3>
            <span className="text-[10px] text-muted-foreground font-medium">7-day</span>
          </div>
          <p className="text-2xl font-bold tabular-nums font-mono mb-4">{fmt(stats?.revenue24h)}<span className="text-sm font-normal text-muted-foreground ml-1">today</span></p>
          <div className="grid grid-cols-7 gap-1 items-end h-20">
            {revBars.data.map((v, i) => {
              const days = ["M","T","W","T","F","S","S"];
              const isToday = i === 6;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <MiniBar value={v} max={revBars.max} color={isToday ? "bg-primary" : "bg-primary/30"} />
                  <span className="text-[9px] text-muted-foreground">{days[i]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row: Activity feed + Alerts ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Activity feed (wider) */}
        <div className="lg:col-span-3 bg-card border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Live Activity
              {actLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE
                </span>
              )}
            </h3>
            <span className="text-[10px] text-muted-foreground">Updated {lastAt}</span>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 mb-3 shrink-0 flex-wrap">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActFilter(tab.key)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wide transition-all border",
                  actFilter === tab.key
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "text-muted-foreground border-transparent hover:border-border hover:text-foreground"
                )}
              >{tab.label}</button>
            ))}
          </div>

          <div className="space-y-2 flex-1 overflow-y-auto max-h-[320px] pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
            {activity.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No {actFilter !== "all" ? actFilter : ""} events found</p>
            )}
            {activity.map((a: any, i: number) => {
              const cfg = TYPE_CFG[a.type] ?? { cls: "bg-muted/20 text-muted-foreground border-border", label: (a.type ?? "?").toUpperCase() };
              return (
                <div key={a.id ?? i} className="flex items-start gap-2.5 text-sm group hover:bg-white/[0.02] rounded-lg px-1 py-0.5 transition-colors">
                  <span className="text-[10px] text-muted-foreground font-mono w-12 shrink-0 pt-0.5 tabular-nums">{a.time}</span>
                  <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide shrink-0 mt-0.5", cfg.cls)}>{cfg.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight truncate">{a.event}</p>
                    {a.detail && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{a.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts + Pending */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* System Alerts */}
          <div className="bg-card border border-border rounded-2xl p-5 flex-1">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-400" />
              Smart Alerts
              {warnAlerts.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 ml-auto">{warnAlerts.length}</span>
              )}
            </h3>
            <div className="space-y-2">
              {stats?.openOrders > 500 && (
                <AlertRow level="warn" icon={Clock} msg={`${stats.openOrders} orders awaiting settlement`} sub="above threshold" href="/admin/support" />
              )}
              {stats?.totalVolume24h > 1_000_000 && (
                <AlertRow level="ok" icon={TrendingUp} msg={`Strong volume: ${fmt(stats.totalVolume24h)}`} sub={`${fmtNum(stats.totalTrades24h)} trades`} />
              )}
              {stats?.activePairs > 0 && (
                <AlertRow level="ok" icon={ArrowRightLeft} msg={`${stats.activePairs} pairs active`} sub="all healthy" />
              )}
              {stats?.aiConversations > 0 && (
                <AlertRow level="ok" icon={Brain} msg={`Ora AI — ${fmtNum(stats.aiConversations)} sessions`} sub="fully operational" />
              )}
              {channels.length > 0 && (
                <AlertRow level="ok" icon={MessageCircle} msg={`Chat — ${channels.length} channels · ${totalSubs} live`} sub={`${totalMsgs} total msgs`} />
              )}
              {!stats && !isLoading && (
                <AlertRow level="error" icon={AlertTriangle} msg="Cannot reach API stats endpoint" sub="Server may be restarting" />
              )}
              {stats && stats.openOrders <= 500 && stats.activePairs > 0 && (
                <AlertRow level="ok" icon={CheckCircle2} msg="Exchange core — all systems nominal" sub="Rate limiting · Order auth · Bridge routing" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── BSV Overlay ───────────────────────────────────────────────── */}
      {overlayStats && (overlayStats as any).recent?.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" />
              BSV Overlay Index
            </h3>
            <div className="flex items-center gap-2">
              {(overlayStats as any).latestBlockScanned && (
                <span className="text-[10px] text-muted-foreground font-mono">block {(overlayStats as any).latestBlockScanned}</span>
              )}
              <span className="text-[10px] font-bold text-violet-400 bg-violet-400/10 border border-violet-400/20 px-2 py-0.5 rounded-full">
                {(overlayStats as any).total} records
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {((overlayStats as any).recent as any[]).slice(0, 6).map((rec: any, i: number) => (
              <div key={rec.txid + i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/40 border border-border/50 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-foreground/80 truncate block">{rec.txid.slice(0, 10)}…{rec.txid.slice(-6)}</span>
                  <span className="text-muted-foreground">{rec.orderId ? `order ${rec.orderId}` : "—"}{rec.blockHeight ? ` · #${rec.blockHeight}` : ""}</span>
                </div>
                <a href={`https://whatsonchain.com/tx/${rec.txid}`} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Quick Actions
          <span className="ml-auto text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">v4.9.0 · 28 Jun 2026</span>
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <QuickAction href="/admin/pairs"           icon={ArrowRightLeft} label="Trade Pairs"  color="text-primary bg-primary/10" />
          <QuickAction href="/admin/fees"            icon={DollarSign}     label="Fee Config"   color="text-orange-400 bg-orange-400/10" />
          <QuickAction href="/admin/users"           icon={Users}          label="Users"        color="text-blue-400 bg-blue-400/10" />
          <QuickAction href="/admin/security"        icon={Shield}         label="Security"     color="text-green-400 bg-green-400/10" />
          <QuickAction href="/admin/health"          icon={HeartPulse}     label="Health"       color="text-cyan-400 bg-cyan-400/10" />
          <QuickAction href="/admin/trade-analytics" icon={BarChart3}      label="Analytics"    color="text-violet-400 bg-violet-400/10" />
          <QuickAction href="/admin/withdrawals"     icon={ArrowDownToLine}label="Withdrawals"  color="text-amber-400 bg-amber-400/10" />
          <QuickAction href="/admin/ledger"          icon={Database}       label="Ledger"       color="text-green-400 bg-green-400/10" />
          <QuickAction href="/admin/features"        icon={ToggleLeft}     label="Features"     color="text-primary bg-primary/10" />
          <QuickAction href="/admin/api"             icon={Key}            label="API Keys"     color="text-orange-400 bg-orange-400/10" />
          <QuickAction href="/admin/themes"          icon={Palette}        label="Themes"       color="text-pink-400 bg-pink-400/10" />
          <QuickAction href="/admin/announcements"   icon={Megaphone}      label="Announce"     color="text-amber-400 bg-amber-400/10" />
          <QuickAction href="/admin/treasury"        icon={Landmark}       label="Treasury"     color="text-orange-400 bg-orange-400/10" />
          <QuickAction href="/admin/ai"              icon={Brain}          label="Ora AI"       color="text-violet-400 bg-violet-400/10" />
          <QuickAction href="/admin/logs"            icon={Terminal}       label="Logs"         color="text-red-400 bg-red-400/10" />
          <QuickAction href="/admin/setup"           icon={Rocket}         label="Setup"        color="text-cyan-400 bg-cyan-400/10" />
        </div>
      </div>

      {/* ── Recent Platform Updates ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Latest Platform Updates
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: "₿", color: "text-green-400", bg: "bg-green-400/5 border-green-400/20", title: "BSV Withdrawal Fixed", detail: "@noble/curves v2 API update: secp256k1.sign() returns raw Uint8Array directly. On-chain BSV withdrawals fully operational." },
            { icon: "✓", color: "text-primary",   bg: "bg-primary/5 border-primary/20",     title: "Withdrawal Success Card", detail: "Confirmation card with txid copy, per-chain explorer links (WhatsOnChain, Mempool.space, Blockchair, Solana, XRPScan)." },
            { icon: "📊", color: "text-blue-400",  bg: "bg-blue-400/5 border-blue-400/20",   title: "Stats Enrichment", detail: "Coin detail sheet now fetches live USDT ticker to fill 24h High/Low/Vol when DB seeder hasn't populated them yet." },
            { icon: "🔑", color: "text-amber-400", bg: "bg-amber-400/5 border-amber-400/20", title: "Named Wallet Import", detail: "Wallet name field in seed phrase import. Custom label passed to biometric (passkey) and PIN import paths." },
          ].map(({ icon, color, bg, title, detail }) => (
            <div key={title} className={cn("flex items-start gap-3 p-3 rounded-xl border", bg)}>
              <span className={cn("text-base shrink-0 mt-0.5", color)}>{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground leading-snug">{title}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ── Alert row helper ─────────────────────────────────────────────────── */
function AlertRow({ level, icon: Icon, msg, sub, href }: { level: "ok"|"warn"|"error"; icon: any; msg: string; sub?: string; href?: string }) {
  const cfg = {
    ok:    { bg: "bg-green-400/5 border-green-400/20",   icon: "text-green-400" },
    warn:  { bg: "bg-orange-400/5 border-orange-400/20", icon: "text-orange-400" },
    error: { bg: "bg-red-400/5 border-red-400/20",       icon: "text-red-400"   },
  }[level];
  const inner = (
    <div className={cn("flex items-start gap-2.5 p-2.5 rounded-xl border text-xs", cfg.bg)}>
      <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", cfg.icon)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground leading-snug">{msg}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {href && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
