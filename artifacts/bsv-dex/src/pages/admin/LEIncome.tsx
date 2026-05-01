import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, DollarSign, ArrowRightLeft, RefreshCw,
  CheckCircle, Clock, BarChart3, Calendar, Copy, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

type Swap = {
  id: string;
  coinFrom: string;
  coinTo: string;
  networkFrom: string | null;
  networkTo: string | null;
  depositAmount: string;
  withdrawalAmount: string | null;
  depositAmountUsd: string | null;
  status: string;
  withdrawal: string;
  createdAt: string;
  completedAt: string | null;
};

type Pair = { coin_from: string; coin_to: string; count: string; volume_usd: string };
type Month = { month: string; count: string; volume_usd: string };

type IncomeData = {
  summary: {
    totalSwaps: number;
    finishedSwaps: number;
    totalVolumeUsd: number;
    finishedVolumeUsd: number;
    estimatedCommissionUsd: number;
    commissionRatePct: string;
  };
  topPairs: Pair[];
  monthly: Month[];
  recent: Swap[];
};

const fmtUsd = (n: number | string) => {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!isFinite(v)) return "$—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_COLORS: Record<string, string> = {
  finished:   "text-green-400",
  waiting:    "text-yellow-400",
  confirming: "text-blue-400",
  exchanging: "text-purple-400",
  sending:    "text-cyan-400",
  refunded:   "text-orange-400",
  overdue:    "text-red-400",
  emergency:  "text-red-500",
};

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export function AdminLEIncome() {
  const [tab, setTab] = useState<"overview" | "pairs" | "monthly" | "recent">("overview");

  const { data, isFetching, error, refetch } = useQuery<IncomeData>({
    queryKey: ["admin-le-income"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/le-income");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const s = data?.summary;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            Swap Income
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            LetsExchange affiliate commission tracker — affiliate commissions are paid directly by LE
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          Failed to load income data.
        </div>
      )}

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon={<ArrowRightLeft className="w-5 h-5 text-blue-400" />}
            label="Total Swaps"
            value={s.totalSwaps.toLocaleString()}
            sub={`${s.finishedSwaps} completed`}
          />
          <SummaryCard
            icon={<BarChart3 className="w-5 h-5 text-purple-400" />}
            label="Total Volume"
            value={fmtUsd(s.totalVolumeUsd)}
            sub={`${fmtUsd(s.finishedVolumeUsd)} finished`}
          />
          <SummaryCard
            icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
            label="Est. Commission"
            value={fmtUsd(s.estimatedCommissionUsd)}
            sub={`~${s.commissionRatePct}% of finished volume`}
            highlight
          />
          <SummaryCard
            icon={<CheckCircle className="w-5 h-5 text-green-400" />}
            label="Completion Rate"
            value={s.totalSwaps > 0 ? `${((s.finishedSwaps / s.totalSwaps) * 100).toFixed(1)}%` : "—"}
            sub={`${s.finishedSwaps} / ${s.totalSwaps} swaps`}
          />
        </div>
      )}

      {/* Commission note */}
      <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-lg p-4 text-sm text-emerald-300">
        <strong>How affiliate income works:</strong> LetsExchange pays ~50% of their fee per swap to affiliates.
        At ~0.35% exchange fee, your estimated commission is ~{s?.commissionRatePct ?? "0.17"}% of completed swap volume.
        Commissions are tracked by LE and paid to your affiliate account directly — check your LE affiliate dashboard for actual payouts.
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit">
        {(["overview", "pairs", "monthly", "recent"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors",
              tab === t ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            {t === "overview" ? "Overview" : t === "pairs" ? "Top Pairs" : t === "monthly" ? "Monthly" : "Recent"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && s && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Volume Breakdown</h3>
            <div className="space-y-3">
              <BarRow label="Finished" value={s.finishedVolumeUsd} total={s.totalVolumeUsd} color="bg-emerald-500" />
              <BarRow label="In Progress" value={s.totalVolumeUsd - s.finishedVolumeUsd} total={s.totalVolumeUsd} color="bg-yellow-500" />
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">Top Pairs</h3>
            {(data?.topPairs ?? []).slice(0, 5).map(p => (
              <div key={`${p.coin_from}-${p.coin_to}`} className="flex items-center justify-between">
                <span className="text-zinc-300 text-sm font-mono">{p.coin_from} → {p.coin_to}</span>
                <div className="text-right">
                  <div className="text-white text-sm font-semibold">{fmtUsd(parseFloat(p.volume_usd))}</div>
                  <div className="text-zinc-500 text-xs">{p.count} swaps</div>
                </div>
              </div>
            ))}
            {!data?.topPairs?.length && <p className="text-zinc-500 text-sm">No swaps yet.</p>}
          </div>
        </div>
      )}

      {tab === "pairs" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Pair</th>
                <th className="text-right px-4 py-3">Swaps</th>
                <th className="text-right px-4 py-3">Volume</th>
                <th className="text-right px-4 py-3">Est. Commission</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topPairs ?? []).map(p => {
                const vol = parseFloat(p.volume_usd);
                const comm = vol * 0.0017;
                return (
                  <tr key={`${p.coin_from}-${p.coin_to}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-zinc-200">{p.coin_from} → {p.coin_to}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{p.count}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{fmtUsd(vol)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtUsd(comm)}</td>
                  </tr>
                );
              })}
              {!data?.topPairs?.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No swap pairs recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "monthly" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Month</th>
                <th className="text-right px-4 py-3">Swaps</th>
                <th className="text-right px-4 py-3">Volume</th>
                <th className="text-right px-4 py-3">Est. Commission</th>
              </tr>
            </thead>
            <tbody>
              {(data?.monthly ?? []).map(m => {
                const vol = parseFloat(m.volume_usd);
                const comm = vol * 0.0017;
                return (
                  <tr key={m.month} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 flex items-center gap-2 text-zinc-200">
                      <Calendar className="w-4 h-4 text-zinc-500" /> {m.month}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300">{m.count}</td>
                    <td className="px-4 py-3 text-right text-zinc-300">{fmtUsd(vol)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-semibold">{fmtUsd(comm)}</td>
                  </tr>
                );
              })}
              {!data?.monthly?.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No monthly data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "recent" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Pair</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-right px-4 py-3">USD</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).map(swap => (
                <tr key={swap.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">
                    {swap.id.slice(0, 10)}…
                    <CopyBtn text={swap.id} />
                  </td>
                  <td className="px-4 py-3 font-mono text-zinc-300 text-xs">
                    {swap.coinFrom} → {swap.coinTo}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 text-xs">
                    {parseFloat(swap.depositAmount).toFixed(6)} {swap.coinFrom}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 text-xs">
                    {swap.depositAmountUsd ? fmtUsd(parseFloat(swap.depositAmountUsd)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                      swap.status === "finished" ? "bg-green-900/40 border border-green-700/40" : "bg-zinc-800 border border-zinc-700",
                      STATUS_COLORS[swap.status] ?? "text-zinc-400"
                    )}>
                      {swap.status === "finished"
                        ? <CheckCircle className="w-3 h-3" />
                        : <Clock className="w-3 h-3" />}
                      {swap.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400 text-xs whitespace-nowrap">
                    {fmtDate(swap.createdAt)}
                  </td>
                </tr>
              ))}
              {!data?.recent?.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No swaps recorded yet — new swaps will appear here as users trade.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function SummaryCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-1",
      highlight
        ? "bg-emerald-900/20 border-emerald-800/50"
        : "bg-zinc-900 border-zinc-800"
    )}>
      <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wider">
        {icon} {label}
      </div>
      <div className={cn("text-2xl font-bold", highlight ? "text-emerald-400" : "text-white")}>{value}</div>
      {sub && <div className="text-zinc-500 text-xs">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max(2, (value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>{fmtUsd(value)}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
