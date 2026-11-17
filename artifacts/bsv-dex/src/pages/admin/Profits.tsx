import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, RefreshCw, DollarSign, Droplets, FileText, History, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/adminFetch";

type Period = "24h" | "7d" | "30d" | "all";
type FeeTotal = { source: string; asset: string; amount: string };
type FeeRow = {
  id: string;
  date: string;
  source: string;
  asset: string;
  amount: string;
  reference: string | null;
  type: "recorded" | "historical";
};
type TrendPoint = { date: string; source: string; asset: string; amount: number };
type ProfitsData = {
  period: Period;
  filters: { sources: string[]; assets: string[] };
  recorded: { totals: FeeTotal[]; rows: FeeRow[]; hasMore: boolean };
  historical: { totals: FeeTotal[]; rows: FeeRow[]; hasMore: boolean };
  trends: TrendPoint[];
  bridge: {
    totalSwaps: number;
    finishedSwaps: number;
    finishedSwapsWithoutUsd: number;
    totalVolumeUsd: number | null;
    finishedVolumeUsd: number | null;
    estimatedCommissionUsd: number | null;
    commissionRatePct: string;
  };
  note: string;
};

const PERIODS: { value: Period; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "all", label: "All Time" },
];
const SOURCE_LABELS: Record<string, string> = {
  orderbook: "Spot orderbook",
  swap: "AMM swap",
  bridge: "Bridge / exchange",
  p2p: "P2P trade",
  lp_spread: "LP spread",
  copy_trade: "Copy trading",
  withdrawal: "Withdrawal fee",
  buy: "Buy orders",
  historical_trade: "Historical trade fee",
};

function formatAmount(amount: string | number): string {
  const raw = String(amount);
  if (!Number.isFinite(Number(raw))) return raw;
  if (typeof amount === "string" && raw.includes(".")) {
    return raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  }
  return Number(raw).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatFeeAmount(amount: string, asset: string): string {
  return asset.toUpperCase() === "USD"
    ? formatUsd(Number(amount))
    : `${formatAmount(amount)} ${asset}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SourceAssetTotals({ title, totals }: { title: string; totals: FeeTotal[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1629]">
      <h2 className="border-b border-white/5 px-5 py-4 text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
      {totals.length ? (
        <div className="divide-y divide-white/5">
          {totals.map((row) => (
            <div key={`${row.source}:${row.asset}`} data-testid={`text-profit-total-${row.source}-${row.asset}`} className="flex items-center justify-between gap-4 px-5 py-3 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-white/80">{SOURCE_LABELS[row.source] ?? row.source}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">{row.asset}</p>
              </div>
              <p className="shrink-0 text-right font-mono font-semibold text-white">{formatFeeAmount(row.amount, row.asset)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-7 text-center text-sm text-white/40">No fees in this period.</p>
      )}
    </section>
  );
}

function TrendCharts({ trends }: { trends: TrendPoint[] }) {
  const assets = [...new Set(trends.map((point) => point.asset))].sort();
  const sourceColor = (source: string) => {
    const index = Object.keys(SOURCE_LABELS).indexOf(source);
    return ["#34d399", "#60a5fa", "#a78bfa", "#fbbf24", "#f472b6", "#22d3ee", "#fb923c", "#a3e635", "#94a3b8"][index % 9] ?? "#94a3b8";
  };
  if (!assets.length) {
    return <p className="py-8 text-center text-sm text-white/40">No fee activity to chart for this period.</p>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {assets.map((asset) => {
        const byDay = new Map<string, Record<string, string | number>>();
        const sources = [...new Set(trends.filter((point) => point.asset === asset).map((point) => point.source))].sort();
        for (const point of trends) {
          if (point.asset !== asset) continue;
          const day = new Date(point.date).toISOString().slice(0, 10);
          const row = byDay.get(day) ?? { date: day };
          row[point.source] = Number(row[point.source] ?? 0) + Number(point.amount);
          byDay.set(day, row);
        }
        const rows = [...byDay.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        return (
          <div key={asset} data-testid={`chart-profit-trend-${asset}`} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{asset} fees</h3>
              <span className="text-[10px] text-white/35">Daily source amounts · {asset} only</span>
            </div>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#ffffff12" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#ffffff66", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#ffffff66", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #ffffff20", borderRadius: 10 }}
                    labelStyle={{ color: "#fff" }}
                    formatter={(value, name) => [`${formatAmount(Number(value))} ${asset}`, SOURCE_LABELS[String(name)] ?? String(name)]}
                  />
                  <Legend
                    formatter={(value) => SOURCE_LABELS[String(value)] ?? String(value)}
                    wrapperStyle={{ color: "#ffffff99", fontSize: 10 }}
                  />
                  {sources.map((source) => (
                    <Bar key={source} dataKey={source} fill={sourceColor(source)} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeeTable({ title, icon: Icon, rows, hasMore, empty }: {
  title: string;
  icon: React.ElementType;
  rows: FeeRow[];
  hasMore: boolean;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1629]">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-white">{title}</h2>
        <span className="ml-auto text-xs text-white/40">{rows.length}{hasMore ? "+" : ""} rows</span>
      </div>
      {!rows.length ? (
        <p className="px-5 py-8 text-center text-sm text-white/40">{empty}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-5 py-3 font-semibold">Asset</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.type}:${row.id}`} data-testid={`row-profit-fee-${row.type}-${row.id}`} className="border-t border-white/5 text-white/75">
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(row.date)}</td>
                    <td className="px-5 py-3">{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td className="px-5 py-3 font-mono">{row.asset}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono font-semibold text-white">
                      {formatFeeAmount(row.amount, row.asset)}
                    </td>
                    <td className="max-w-[240px] truncate px-5 py-3 font-mono text-white/45" title={row.reference ?? ""}>
                      {row.reference || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && <p className="border-t border-white/5 px-5 py-3 text-xs text-white/40">Showing the latest 500 rows. Totals and trends include all matching records.</p>}
        </>
      )}
    </section>
  );
}

export function AdminProfits() {
  const [period, setPeriod] = useState<Period>("30d");
  const [source, setSource] = useState("all");
  const [asset, setAsset] = useState("all");
  const { data, isLoading, isFetching, error, refetch } = useQuery<ProfitsData>({
    queryKey: ["admin-profits", period, source, asset],
    queryFn: async () => {
      const params = new URLSearchParams({ period, source, asset });
      const response = await adminFetch(`/api/admin/profits?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const feeRows = data?.recorded.rows ?? [];
  const tradeRows = data?.historical.rows ?? [];
  const sourceOptions = [...new Set([
    "orderbook", "swap", "bridge", "p2p", "lp_spread", "copy_trade", "withdrawal", "buy",
    ...(data?.filters.sources ?? []), "historical_trade",
  ])].sort();

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <TrendingUp className="h-6 w-6 text-primary" />
            Profit Details
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/45">
            Recorded fees and historical trade fees remain asset-specific. Estimated bridge affiliate commission is shown separately.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-profit-refresh"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="Profit period">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              data-testid={`button-profit-period-${item.value}`}
              onClick={() => setPeriod(item.value)}
              aria-pressed={period === item.value}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                period === item.value ? "bg-primary font-bold text-black" : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
          Source
          <select data-testid="select-profit-source" value={source} onChange={(event) => setSource(event.target.value)} className="bg-transparent text-white outline-none">
            <option value="all" className="bg-[#0f1629]">All sources</option>
            {sourceOptions.map((item) => (
              <option key={item} value={item} className="bg-[#0f1629]">{SOURCE_LABELS[item] ?? item}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
          Asset
          <select data-testid="select-profit-asset" value={asset} onChange={(event) => setAsset(event.target.value)} className="bg-transparent text-white outline-none">
            <option value="all" className="bg-[#0f1629]">All assets</option>
            {(data?.filters.assets ?? []).map((item) => (
              <option key={item} value={item} className="bg-[#0f1629]">{item}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" data-testid="status-profit-error" className="rounded-xl border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-300">
          Profit data could not be loaded. Refresh to try again.
        </div>
      )}

      {isLoading && !data ? (
        <div className="space-y-4" aria-label="Loading profit data">
          {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-white/5" />)}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <SourceAssetTotals title="Recorded fees by source and asset" totals={data.recorded.totals} />
            <SourceAssetTotals title="Historical trade fees by asset" totals={data.historical.totals} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-[#0f1629] p-5">
            <div className="mb-4 flex items-start gap-3">
              <BarChart3 className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">Daily fee trends</h2>
                <p className="mt-1 text-xs text-white/40">Each chart uses one asset only; different tokens are never added together.</p>
              </div>
            </div>
            <TrendCharts trends={data.trends} />
          </section>

          <FeeTable
            title="Recorded Platform Fee Rows"
            icon={FileText}
            rows={feeRows}
            hasMore={data.recorded.hasMore}
            empty="No recorded platform fees match these filters."
          />
          <FeeTable
            title="Historical Trade Fee Rows"
            icon={History}
            rows={tradeRows}
            hasMore={data.historical.hasMore}
            empty="No historical trade fees match these filters."
          />

          <section className="rounded-2xl border border-amber-500/20 bg-[#0f1629] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Droplets className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Estimated bridge affiliate commission</h2>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                Estimate · {data.bridge.commissionRatePct}%
              </span>
            </div>
            <p className="mt-2 text-xs text-white/40">
              All-time estimate, independent of the fee filters above. It is not a recorded fee and is not included in either fee total.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <BridgeMetric label="All swaps" value={data.bridge.totalSwaps.toLocaleString()} />
              <BridgeMetric label="Completed" value={data.bridge.finishedSwaps.toLocaleString()} />
              <BridgeMetric label="Completed without USD basis" value={data.bridge.finishedSwapsWithoutUsd.toLocaleString()} />
              <BridgeMetric label="Finished volume · all-time" value={formatUsd(data.bridge.finishedVolumeUsd)} />
              <BridgeMetric label="Estimate · all-time" value={formatUsd(data.bridge.estimatedCommissionUsd)} />
            </div>
          </section>
          <p className="flex items-center gap-2 text-[11px] text-white/35">
            <DollarSign className="h-3.5 w-3.5 shrink-0" /> {data.note}
          </p>
        </>
      ) : !error ? (
        <p className="py-12 text-center text-sm text-white/40">No profit data available.</p>
      ) : null}
    </main>
  );
}

function BridgeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="break-words text-sm font-bold text-white">{value}</p>
    </div>
  );
}
