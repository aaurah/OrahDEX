import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSEO } from "@/hooks/useSEO";
import { TrendingUp, DollarSign, BarChart3, Layers, ArrowUpDown, Users, Droplets, Zap, ChevronDown, ChevronUp, RefreshCw, Info } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Period = "24h" | "7d" | "30d" | "all";

interface BreakdownItem {
  source: string;
  amount: number;
}

interface RevenueData {
  breakdown: Record<Period, BreakdownItem[]>;
  totals: Record<Period, number>;
  currency: string;
}

interface FeeSchedule {
  spot: { maker: string; taker: string; description: string };
  swap: { fee: string; description: string };
  p2p: { fee: string; description: string };
  copyTrading: { performanceFee: string; platformCut: string; description: string };
  liquidity: { lpShare: string; platform: string; description: string };
  withdrawal: { bsv: string; evm: string };
  tiers: { tier: string; volume: string; maker: string; taker: string; discount: string }[];
}

const SOURCE_META: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  swap:        { label: "AMM Swap",     icon: ArrowUpDown, color: "text-blue-400",   bg: "bg-blue-500/10" },
  orderbook:   { label: "Order Book",   icon: BarChart3,   color: "text-green-400",  bg: "bg-green-500/10" },
  copy_trade:  { label: "Copy Trading", icon: Users,       color: "text-purple-400", bg: "bg-purple-500/10" },
  lp_spread:   { label: "LP Spread",    icon: Droplets,    color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  p2p:         { label: "P2P Trades",   icon: Layers,      color: "text-orange-400", bg: "bg-orange-500/10" },
  withdrawal:  { label: "Withdrawals",  icon: Zap,         color: "text-yellow-400", bg: "bg-yellow-500/10" },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(4)}`;
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    Standard: "bg-zinc-700/60 text-zinc-300",
    Silver:   "bg-slate-600/60 text-slate-200",
    Gold:     "bg-yellow-700/50 text-yellow-300",
    Platinum: "bg-purple-700/50 text-purple-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colors[tier] ?? "bg-zinc-700 text-zinc-300"}`}>
      {tier}
    </span>
  );
}

export default function Revenue() {
  useSEO({
    title: "Fee Revenue & Keeper Rewards — OrahDEX",
    description: "OrahDEX fee revenue distribution and Keeper reward schedule. Earn trading fee rebates by holding ORAH tokens — Standard, Guardian, Elder, and Archon tiers.",
    keywords: "OrahDEX fees, Keeper rewards, trading fee rebate, ORAH token, fee revenue, DEX revenue sharing",
  });
  const [period, setPeriod] = useState<Period>("30d");
  const [scheduleOpen, setScheduleOpen] = useState(true);

  const { data: rev, isLoading: revLoading, refetch } = useQuery<RevenueData>({
    queryKey: ["revenue"],
    queryFn: () => fetch(`${BASE}/api/revenue`).then(r => r.json()),
    staleTime: 60_000,
  });

  const { data: schedule } = useQuery<FeeSchedule>({
    queryKey: ["fee-schedule"],
    queryFn: () => fetch(`${BASE}/api/fee-schedule`).then(r => r.json()),
    staleTime: 300_000,
  });

  const breakdown = rev?.breakdown[period] ?? [];
  const total = rev?.totals[period] ?? 0;
  const maxAmt = Math.max(...breakdown.map(b => b.amount), 1);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            Exchange Revenue & Fees
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Live platform fee revenue across all trading surfaces. All amounts in USD-equivalent.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors border border-zinc-700 rounded-lg px-3 py-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Period Selector + Total Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Period</div>
          <div className="flex gap-2 flex-wrap">
            {(["24h", "7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "text-zinc-400 border border-zinc-700 hover:border-zinc-500"
                }`}
              >
                {p === "all" ? "All Time" : p}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-700/30 rounded-xl p-5 flex flex-col justify-between">
          <div className="text-xs text-emerald-400/70 uppercase tracking-widest">Total Revenue ({period === "all" ? "All Time" : period})</div>
          <div className="mt-3">
            {revLoading ? (
              <div className="h-8 w-28 bg-zinc-800 rounded animate-pulse" />
            ) : (
              <div className="text-3xl font-bold text-emerald-400">{fmt(total)}</div>
            )}
            <div className="text-xs text-zinc-500 mt-1">USD-equivalent collected by platform</div>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-white">Revenue by Source</span>
          <span className="text-xs text-zinc-500 ml-auto">({period === "all" ? "All Time" : period})</span>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {revLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
                    <div className="h-2 w-full bg-zinc-800/50 rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
                </div>
              ))
            : breakdown.map((item) => {
                const meta = SOURCE_META[item.source];
                const Icon = meta?.icon ?? BarChart3;
                const pct = maxAmt > 0 ? (item.amount / maxAmt) * 100 : 0;
                return (
                  <div key={item.source} className="px-5 py-4 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta?.bg ?? "bg-zinc-800"}`}>
                      <Icon className={`w-4 h-4 ${meta?.color ?? "text-zinc-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-white">{meta?.label ?? item.source}</span>
                        <span className={`text-sm font-semibold tabular-nums ${meta?.color ?? "text-zinc-300"}`}>
                          {fmt(item.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            meta?.color.replace("text-", "bg-") ?? "bg-zinc-600"
                          }`}
                          style={{ width: `${pct}%`, opacity: 0.7 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      {/* Fee Schedule Accordion */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setScheduleOpen(!scheduleOpen)}
          className="w-full px-5 py-4 flex items-center gap-2 hover:bg-zinc-800/30 transition-colors"
        >
          <Info className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-white flex-1 text-left">Fee Schedule</span>
          {scheduleOpen ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </button>

        {scheduleOpen && (
          <div className="px-5 pb-6 space-y-6 border-t border-zinc-800">
            {/* Spot / Order Book */}
            <div className="pt-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-green-400" />
                <span className="text-sm font-semibold text-white">Spot Order Book</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Maker Fee</div>
                  <div className="text-lg font-bold text-green-400">{schedule?.spot.maker ?? "0.10%"}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Taker Fee</div>
                  <div className="text-lg font-bold text-green-400">{schedule?.spot.taker ?? "0.10%"}</div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">{schedule?.spot.description}</p>
            </div>

            {/* Swap */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpDown className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">AMM Swap</span>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 inline-flex flex-col">
                <div className="text-xs text-zinc-500 mb-1">Swap Fee</div>
                <div className="text-lg font-bold text-blue-400">{schedule?.swap.fee ?? "0.30%"}</div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">{schedule?.swap.description}</p>
            </div>

            {/* Copy Trading */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Copy Trading</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Performance Fee</div>
                  <div className="text-sm font-bold text-purple-400">{schedule?.copyTrading.performanceFee ?? "5–20% of PnL"}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Platform Cut</div>
                  <div className="text-sm font-bold text-purple-400">{schedule?.copyTrading.platformCut ?? "10% of perf fee"}</div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">{schedule?.copyTrading.description}</p>
            </div>

            {/* Liquidity */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Liquidity Pools</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">LP Share</div>
                  <div className="text-sm font-bold text-cyan-400">{schedule?.liquidity.lpShare ?? "0.25% per swap"}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">Platform Fee</div>
                  <div className="text-sm font-bold text-cyan-400">{schedule?.liquidity.platform ?? "0.05% per swap"}</div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">{schedule?.liquidity.description}</p>
            </div>

            {/* P2P */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold text-white">P2P Direct Trade</span>
              </div>
              <div className="bg-zinc-800/50 rounded-lg p-3 inline-flex flex-col">
                <div className="text-xs text-zinc-500 mb-1">Fill Fee</div>
                <div className="text-lg font-bold text-orange-400">{schedule?.p2p.fee ?? "0.05%"}</div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">{schedule?.p2p.description}</p>
            </div>

            {/* Withdrawals */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-semibold text-white">Withdrawals</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">BSV</div>
                  <div className="text-sm font-bold text-yellow-400">{schedule?.withdrawal.bsv ?? "Free"}</div>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">EVM Chains</div>
                  <div className="text-sm font-bold text-yellow-400">{schedule?.withdrawal.evm ?? "Gas only"}</div>
                </div>
              </div>
            </div>

            {/* Tier Table */}
            <div>
              <div className="text-sm font-semibold text-white mb-3">Volume-Based Fee Tiers (30-day rolling)</div>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">Tier</th>
                      <th className="px-4 py-2.5 text-left text-xs text-zinc-500 font-medium">30d Volume</th>
                      <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">Maker</th>
                      <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">Taker</th>
                      <th className="px-4 py-2.5 text-right text-xs text-zinc-500 font-medium">Discount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {(schedule?.tiers ?? [
                      { tier: "Standard", volume: "< $10k",     maker: "0.10%", taker: "0.10%", discount: "—" },
                      { tier: "Silver",   volume: "$10k–$100k", maker: "0.08%", taker: "0.09%", discount: "10%" },
                      { tier: "Gold",     volume: "$100k–$1M",  maker: "0.05%", taker: "0.07%", discount: "30%" },
                      { tier: "Platinum", volume: "> $1M",      maker: "0.02%", taker: "0.04%", discount: "60%" },
                    ]).map((row) => (
                      <tr key={row.tier} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                        <td className="px-4 py-3 text-zinc-300 text-xs">{row.volume}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-mono text-xs">{row.maker}</td>
                        <td className="px-4 py-3 text-right text-green-400 font-mono text-xs">{row.taker}</td>
                        <td className="px-4 py-3 text-right text-zinc-400 text-xs">{row.discount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
