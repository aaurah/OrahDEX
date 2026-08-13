import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, RefreshCw, DollarSign, ArrowRightLeft,
  Zap, Droplets, Activity, Copy, Shield, Wallet,
  BarChart3, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

type Period = "24h" | "7d" | "30d" | "all";

type SourceEntry = {
  source: string;
  label: string;
  amount: number;
};

type ProfitsData = {
  breakdown: Record<Period, SourceEntry[]>;
  totals: Record<Period, number>;
  bridge: {
    totalSwaps: number;
    finishedSwaps: number;
    totalVolumeUsd: number;
    finishedVolumeUsd: number;
    estimatedCommissionUsd: number;
    commissionRatePct: string;
  };
  currency: string;
};

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "24 Hours",
  "7d":  "7 Days",
  "30d": "30 Days",
  "all": "All Time",
};

const SOURCE_META: Record<string, { icon: React.ElementType; color: string; bar: string }> = {
  orderbook:  { icon: ArrowRightLeft, color: "text-blue-400",   bar: "bg-blue-400" },
  swap:       { icon: Zap,            color: "text-violet-400", bar: "bg-violet-400" },
  bridge:     { icon: Droplets,       color: "text-emerald-400",bar: "bg-emerald-400" },
  p2p:        { icon: Copy,           color: "text-yellow-400", bar: "bg-yellow-400" },
  lp_spread:  { icon: Activity,       color: "text-cyan-400",   bar: "bg-cyan-400" },
  copy_trade: { icon: Copy,           color: "text-orange-400", bar: "bg-orange-400" },
  withdrawal: { icon: Wallet,         color: "text-pink-400",   bar: "bg-pink-400" },
  buy:        { icon: Shield,         color: "text-green-400",  bar: "bg-green-400" },
};

function fmtUsd(n: number): string {
  if (!isFinite(n)) return "$0.00";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function PeriodTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
        active
          ? "bg-primary text-black font-bold shadow"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      )}
    >
      {label}
    </button>
  );
}

function TotalCard({ period, amount, label }: { period: string; amount: number; label: string }) {
  return (
    <div className="bg-[#0f1629] border border-white/10 rounded-2xl p-5 flex flex-col gap-2">
      <p className="text-xs text-white/40 uppercase tracking-widest font-semibold">{label}</p>
      <p className="text-3xl font-black text-white tracking-tight">{fmtUsd(amount)}</p>
      <p className="text-xs text-white/30">{PERIOD_LABELS[period as Period] ?? period}</p>
    </div>
  );
}

function SourceBar({ entry, maxAmount }: { entry: SourceEntry; maxAmount: number }) {
  const meta = SOURCE_META[entry.source] ?? { icon: DollarSign, color: "text-white/60", bar: "bg-white/20" };
  const Icon = meta.icon;
  const pct = maxAmount > 0 ? (entry.amount / maxAmount) * 100 : 0;

  return (
    <div className="group flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
      <div className={cn("p-2 rounded-lg bg-white/5 shrink-0", meta.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-white truncate">{entry.label}</span>
          <span className={cn("text-sm font-bold tabular-nums ml-3 shrink-0", entry.amount > 0 ? meta.color : "text-white/20")}>
            {fmtUsd(entry.amount)}
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", meta.bar)}
            style={{ width: `${Math.max(0.5, pct)}%`, opacity: entry.amount > 0 ? 1 : 0.15 }}
          />
        </div>
      </div>
      <span className="text-xs text-white/30 tabular-nums w-12 text-right shrink-0">
        {pct > 0 ? `${pct.toFixed(1)}%` : "—"}
      </span>
    </div>
  );
}

function BridgeCard({ bridge }: { bridge: ProfitsData["bridge"] }) {
  const rate = bridge.totalSwaps > 0
    ? ((bridge.finishedSwaps / bridge.totalSwaps) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="bg-[#0f1629] border border-emerald-500/20 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Droplets className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Bridge / Exchange</h3>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
          {bridge.commissionRatePct}% est. commission
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Total Swaps"        value={fmtNum(bridge.totalSwaps)} />
        <Metric label="Completed"          value={fmtNum(bridge.finishedSwaps)} accent />
        <Metric label="Completion Rate"    value={`${rate}%`} />
        <Metric label="Finished Volume"    value={fmtUsd(bridge.finishedVolumeUsd)} accent />
      </div>

      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-emerald-300/70">Estimated Affiliate Commission (all-time)</span>
          <span className="text-lg font-black text-emerald-400">{fmtUsd(bridge.estimatedCommissionUsd)}</span>
        </div>
        <p className="text-[11px] text-white/30 mt-1">
          ~{bridge.commissionRatePct}% of finished volume. Paid directly by exchange partners to your affiliate account.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-3">
      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className={cn("text-lg font-bold font-mono", accent ? "text-emerald-400" : "text-white")}>{value}</p>
    </div>
  );
}

export function AdminProfits() {
  const [period, setPeriod] = useState<Period>("30d");

  const { data, isFetching, error, refetch } = useQuery<ProfitsData>({
    queryKey: ["admin-profits"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/profits");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const breakdown = data?.breakdown[period] ?? [];
  const maxAmount = Math.max(...breakdown.map(e => e.amount), 0.01);
  const periodTotal = data?.totals[period] ?? 0;
  const activeSources = breakdown.filter(e => e.amount > 0).length;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Platform Profits
          </h1>
          <p className="text-sm text-white/40 mt-1">
            All revenue streams — spot fees, swaps, bridge commissions, P2P, LP — in one place
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-red-300 text-sm">
          Failed to load profit data. Check API server is running.
        </div>
      )}

      {/* Period selector */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit border border-white/10">
        {(["24h", "7d", "30d", "all"] as Period[]).map(p => (
          <PeriodTab key={p} active={period === p} label={p === "all" ? "All Time" : p} onClick={() => setPeriod(p)} />
        ))}
      </div>

      {/* Top-line totals */}
      {data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TotalCard period="24h"  amount={data.totals["24h"]}  label="24h Revenue" />
          <TotalCard period="7d"   amount={data.totals["7d"]}   label="7-Day Revenue" />
          <TotalCard period="30d"  amount={data.totals["30d"]}  label="30-Day Revenue" />
          <TotalCard period="all"  amount={data.totals["all"]}  label="All-Time Revenue" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="h-28 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Revenue breakdown */}
      <div className="bg-[#0f1629] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Revenue by Source — {PERIOD_LABELS[period]}
          </h2>
          <div className="flex items-center gap-3 text-xs text-white/30">
            <span>{activeSources} active streams</span>
            <span className="font-bold text-white/60">{fmtUsd(periodTotal)} total</span>
          </div>
        </div>

        {isFetching && !data ? (
          <div className="space-y-3 mt-4">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className="h-12 bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : breakdown.length === 0 ? (
          <p className="text-center text-sm text-white/30 py-8">No fees recorded yet — they'll appear as users trade.</p>
        ) : (
          <div className="mt-4">
            {breakdown
              .sort((a, b) => b.amount - a.amount)
              .map(entry => (
                <SourceBar key={entry.source} entry={entry} maxAmount={maxAmount} />
              ))}
          </div>
        )}
      </div>

      {/* Bridge / Exchange detail */}
      {data?.bridge && <BridgeCard bridge={data.bridge} />}

      {/* How revenue is generated */}
      <div className="bg-[#0f1629] border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-primary" />
          How Each Stream Generates Revenue
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/50 leading-relaxed">
          {[
            ["Spot Orderbook", "0.10% maker & taker fee on every matched trade. Collected at fill time."],
            ["AMM Swap", "0.30% fee on every AMM swap. 83% to LPs, 17% to platform."],
            ["Bridge / Exchange", "~0.30% estimated affiliate commission per cross-chain swap via our exchange partners."],
            ["P2P Trade", "0.05% platform cut on every P2P intent fill."],
            ["LP Spread", "Platform share (1/6) of pool swap fees from liquidity positions."],
            ["Copy Trading", "10% of vault manager performance fees when followers profit."],
            ["Withdrawal Fees", "Flat fees charged on fiat/token withdrawals where applicable."],
            ["Buy Orders", "Platform fee on fiat-to-crypto buy order execution."],
          ].map(([name, desc]) => (
            <div key={name} className="bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <p className="font-semibold text-white/70 mb-0.5">{name}</p>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
