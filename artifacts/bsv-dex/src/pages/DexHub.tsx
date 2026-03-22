import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  TrendingUp, Globe, ArrowUpRight, Search, RefreshCw,
  BarChart2, ShieldCheck, Layers, ExternalLink, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmtUsd(n: number) {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function fmtBtc(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M BTC";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K BTC";
  return n.toFixed(2) + " BTC";
}

function trustColor(score: number) {
  if (score >= 8) return "text-green-500";
  if (score >= 5) return "text-yellow-500";
  return "text-red-400";
}

function TrustDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            i < score
              ? score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-400"
              : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

// Chain badge colours
const CHAIN_STYLE: Record<string, string> = {
  "Ethereum":      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Ethereum L2":   "bg-blue-400/10 text-blue-300 border-blue-400/20",
  "BSC":           "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "Polygon":       "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Arbitrum":      "bg-sky-500/10 text-sky-400 border-sky-500/20",
  "Base/Optimism": "bg-red-500/10 text-red-400 border-red-500/20",
  "Optimism":      "bg-red-500/10 text-red-400 border-red-500/20",
  "Base":          "bg-blue-600/10 text-blue-400 border-blue-600/20",
  "Avalanche":     "bg-red-600/10 text-red-400 border-red-600/20",
  "Solana":        "bg-green-500/10 text-green-400 border-green-500/20",
  "Cosmos":        "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "THORChain":     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Fantom":        "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "NEAR":          "bg-teal-500/10 text-teal-400 border-teal-500/20",
  "Tron":          "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Multi-chain":   "bg-muted/60 text-muted-foreground border-border",
};
function ChainBadge({ chain }: { chain: string }) {
  const style = CHAIN_STYLE[chain] ?? "bg-muted/60 text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border", style)}>
      {chain}
    </span>
  );
}

export function DexHub() {
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dex-exchanges"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dex/exchanges`);
      if (!r.ok) throw new Error("Failed to load DEX data");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const exchanges: any[] = data?.exchanges ?? [];
  const filtered = exchanges.filter(
    (e) =>
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.chain.toLowerCase().includes(search.toLowerCase())
  );

  const totalVolumeUsd: number = data?.totalVolumeUsd ?? 0;
  const totalVolumeBtc: number = data?.totalVolumeBtc ?? 0;
  const exchangeCount: number = data?.exchangeCount ?? 0;
  const btcPrice: number = data?.btcPrice ?? 0;
  const totalMarketCap: number = data?.totalMarketCap ?? 0;

  // Chain distribution for summary
  const chainCounts = exchanges.reduce((acc: Record<string, number>, e) => {
    acc[e.chain] = (acc[e.chain] ?? 0) + 1;
    return acc;
  }, {});
  const topChains = Object.entries(chainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="p-4 lg:p-10 max-w-[1400px] mx-auto w-full">

      {/* ── Hero ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-primary" />
          <span className="text-primary font-semibold text-sm uppercase tracking-widest">DEX Aggregator</span>
        </div>
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight mb-2">
          All DEX Exchanges — One Place
        </h1>
        <p className="text-primary/80 italic font-medium text-sm mb-3">✦ Trade means DEX</p>
        <p className="text-muted-foreground text-base lg:text-lg max-w-3xl">
          Live volume, market cap &amp; trust scores from every major decentralised exchange — powered by CoinGecko. Trade any pair on OrahDEX with on-chain settlement.
        </p>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Total DEX Volume 24h
          </div>
          {isLoading ? <div className="h-8 w-32 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{fmtUsd(totalVolumeUsd)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtBtc(totalVolumeBtc)}</div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Coins className="w-4 h-4 text-violet-400" />
            DeFi Market Cap
          </div>
          {isLoading ? <div className="h-8 w-28 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{fmtUsd(totalMarketCap)}</div>
              <div className="text-xs text-muted-foreground mt-1">DEX token aggregate</div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Globe className="w-4 h-4 text-blue-400" />
            DEX Exchanges Tracked
          </div>
          {isLoading ? <div className="h-8 w-16 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{exchangeCount}</div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                {topChains.map(([chain, cnt]) => (
                  <span key={chain} className="text-[9px]">{chain} {cnt}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            BTC Price (live)
          </div>
          {isLoading ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">${btcPrice.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">via CoinGecko</div>
            </>
          )}
        </div>
      </div>

      {/* ── Search + refresh ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search exchange or chain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
        <span className="text-xs text-muted-foreground hidden lg:block">
          Market cap from CoinGecko DeFi · refreshes every 5 min
        </span>
      </div>

      {/* ── Exchange table ── */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-10">#</th>
                <th className="px-4 py-3 font-medium">Exchange</th>
                <th className="px-4 py-3 font-medium">Chain</th>
                <th className="px-4 py-3 font-medium text-right">24h Volume</th>
                <th className="px-4 py-3 font-medium text-right">Market Cap</th>
                <th className="px-4 py-3 font-medium">Trust Score</th>
                <th className="px-4 py-3 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted animate-pulse rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No DEX exchanges found.
                  </td>
                </tr>
              )}

              {!isLoading &&
                filtered.map((ex) => {
                  const rank = exchanges.indexOf(ex) + 1;
                  return (
                    <tr
                      key={ex.id}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors group"
                    >
                      <td className="px-4 py-3 text-muted-foreground text-sm font-mono">{rank}</td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {ex.image && (
                            <img
                              src={ex.image}
                              alt={ex.name}
                              className="w-7 h-7 rounded-full object-cover bg-secondary shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-foreground leading-tight">{ex.name}</p>
                            {ex.yearEstablished && (
                              <p className="text-[10px] text-muted-foreground">Est. {ex.yearEstablished}</p>
                            )}
                          </div>
                          {ex.url && (
                            <a
                              href={ex.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <ChainBadge chain={ex.chain} />
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                        {ex.tradeVolume24hUsd >= 1000
                          ? fmtUsd(ex.tradeVolume24hUsd)
                          : ex.tradeVolume24hUsd > 0
                          ? "$" + ex.tradeVolume24hUsd.toFixed(0)
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-sm">
                        {ex.marketCap > 0 ? (
                          <span className="text-violet-400 font-semibold">{fmtUsd(ex.marketCap)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TrustDots score={ex.trustScore} />
                          <span className={cn("text-xs font-bold", trustColor(ex.trustScore))}>
                            {ex.trustScore || "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          href="/spot/BSV-USDT"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 transition-all"
                        >
                          Trade <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>Showing {filtered.length} of {exchangeCount} DEX exchanges</span>
            <span>Source: CoinGecko · DeFi market cap · non-custodial settlement on OrahDEX</span>
          </div>
        )}
      </div>
    </div>
  );
}
