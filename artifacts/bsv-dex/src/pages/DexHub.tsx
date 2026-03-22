import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  TrendingUp, Globe, ArrowUpRight, Search, RefreshCw,
  BarChart2, ShieldCheck, Layers, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmtUsd(n: number) {
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

const TRUST_COLORS: Record<number, string> = {};
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
      (e.country ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalVolumeUsd: number = data?.totalVolumeUsd ?? 0;
  const totalVolumeBtc: number = data?.totalVolumeBtc ?? 0;
  const exchangeCount: number = data?.exchangeCount ?? 0;
  const btcPrice: number = data?.btcPrice ?? 0;

  const top3Volume = exchanges.slice(0, 3).reduce((s: number, e: any) => s + e.tradeVolume24hUsd, 0);

  return (
    <div className="flex-1 p-6 lg:p-10 max-w-[1400px] mx-auto w-full">

      {/* ── Hero ── */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-primary" />
          <span className="text-primary font-semibold text-sm uppercase tracking-widest">DEX Aggregator</span>
        </div>
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight mb-2">
          All DEX Exchanges — One Place
        </h1>
        <p className="text-primary/80 italic font-medium text-sm mb-3">✦ Trade means DEX</p>
        <p className="text-muted-foreground text-lg max-w-3xl">
          Live volume, trust scores, and trade activity from every major decentralised exchange — aggregated from CoinGecko. Trade any pair directly on OrahDEX with on-chain settlement.
        </p>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-card to-secondary p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Total DEX Volume 24h
          </div>
          {isLoading ? (
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <div className="text-2xl font-mono font-bold">{fmtUsd(totalVolumeUsd)}</div>
              <div className="text-xs text-muted-foreground mt-1">{fmtBtc(totalVolumeBtc)}</div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Globe className="w-4 h-4 text-blue-400" />
            DEX Exchanges Tracked
          </div>
          {isLoading ? (
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          ) : (
            <div className="text-2xl font-mono font-bold">{exchangeCount}</div>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            Top 3 DEX Volume
          </div>
          {isLoading ? (
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          ) : (
            <div className="text-2xl font-mono font-bold">{fmtUsd(top3Volume)}</div>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            BTC Price (live)
          </div>
          {isLoading ? (
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          ) : (
            <div className="text-2xl font-mono font-bold">${btcPrice.toLocaleString()}</div>
          )}
        </div>
      </div>

      {/* ── Search + refresh ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search DEX exchanges..."
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
          Data from CoinGecko · refreshes every 5 min
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
                <th className="px-4 py-3 font-medium text-right">24h Volume (USD)</th>
                <th className="px-4 py-3 font-medium text-right">24h Volume (BTC)</th>
                <th className="px-4 py-3 font-medium">Trust Score</th>
                <th className="px-4 py-3 font-medium text-center">Country</th>
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
                filtered.map((ex, idx) => {
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
                              className="w-7 h-7 rounded-full object-cover bg-secondary"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{ex.name}</p>
                            {ex.yearEstablished && (
                              <p className="text-[10px] text-muted-foreground">Est. {ex.yearEstablished}</p>
                            )}
                          </div>
                          {ex.url && (
                            <a
                              href={ex.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                        {ex.tradeVolume24hUsd >= 1000
                          ? fmtUsd(ex.tradeVolume24hUsd)
                          : ex.tradeVolume24hUsd > 0
                          ? "$" + ex.tradeVolume24hUsd.toFixed(0)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {ex.tradeVolume24hBtc > 0 ? fmtBtc(ex.tradeVolume24hBtc) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TrustDots score={ex.trustScore} />
                          <span className={cn("text-xs font-bold", trustColor(ex.trustScore))}>
                            {ex.trustScore || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {ex.country ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href="/trade/BSV-USDT"
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

        {/* Table footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex items-center justify-between">
            <span>Showing {filtered.length} of {exchangeCount} DEX exchanges</span>
            <span>Source: CoinGecko public API · Non-custodial settlement on OrahDEX</span>
          </div>
        )}
      </div>
    </div>
  );
}
