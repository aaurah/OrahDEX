import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, Globe, ArrowUpRight, Search, RefreshCw,
  BarChart2, ShieldCheck, Layers, ExternalLink, Coins,
  ArrowUpDown, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmtUsd(n: number) {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3)  return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}
function fmtBtc(n: number) {
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
        <div key={i} className={cn("w-1.5 h-1.5 rounded-full",
          i < score
            ? score >= 8 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-400"
            : "bg-muted")} />
      ))}
    </div>
  );
}

// Chain colour map
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
function CexBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-blue-600/10 text-blue-300 border-blue-600/20">
      CEX
    </span>
  );
}

type ExType = "all" | "cex" | "dex";
type SortKey = "volume" | "marketcap" | "trust" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  volume:    "24h Volume",
  marketcap: "Market Cap",
  trust:     "Trust Score",
  name:      "Name (A–Z)",
};

export function DexHub() {
  const [search, setSearch]   = useState("");
  const [exType, setExType]   = useState<ExType>("all");
  const [sortBy, setSortBy]   = useState<SortKey>("volume");
  const [sortOpen, setSortOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["exchanges-all"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/dex/exchanges`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const allExchanges: any[] = data?.exchanges ?? [];

  const sortFn = (a: any, b: any) => {
    if (sortBy === "volume")    return b.tradeVolume24hUsd - a.tradeVolume24hUsd;
    if (sortBy === "marketcap") return b.marketCap - a.marketCap;
    if (sortBy === "trust")     return b.trustScore - a.trustScore;
    if (sortBy === "name")      return a.name.localeCompare(b.name);
    return 0;
  };

  // filtered = all rows that match search, then grouped so the selected type is on top
  const filtered = useMemo(() => {
    let rows = allExchanges;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.chain ?? "").toLowerCase().includes(q) ||
        (e.country ?? "").toLowerCase().includes(q)
      );
    }
    if (exType === "all") return [...rows].sort(sortFn);
    // Put selected type first (sorted by sortFn), then other type (also sorted)
    const primary   = [...rows.filter(e => e.type === exType)].sort(sortFn);
    const secondary = [...rows.filter(e => e.type !== exType)].sort(sortFn);
    return [...primary, ...secondary];
  }, [allExchanges, exType, search, sortBy]);

  const totalVolumeUsd: number  = data?.totalVolumeUsd ?? 0;
  const totalVolumeBtc: number  = data?.totalVolumeBtc ?? 0;
  const defiMarketCap: number   = data?.defiMarketCap ?? 0;
  const cefiMarketCap: number   = data?.cefiMarketCap ?? 0;
  const totalMarketCap: number  = data?.totalMarketCap ?? 0;
  const exchangeCount: number   = data?.exchangeCount ?? 0;
  const dexCount: number        = data?.dexCount ?? 0;
  const cexCount: number        = data?.cexCount ?? 0;
  const btcPrice: number        = data?.btcPrice ?? 0;

  const TAB_STYLE = (active: boolean, type?: ExType) => cn(
    "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
    active
      ? type === "dex"
        ? "bg-violet-500/15 border-violet-500/40 text-violet-400"
        : type === "cex"
        ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
        : "bg-primary/15 border-primary/40 text-primary"
      : "bg-card border-border text-muted-foreground hover:text-foreground"
  );

  return (
    <div className="p-4 lg:p-10 max-w-[1500px] mx-auto w-full">

      {/* ── Hero ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-5 h-5 text-primary" />
          <span className="text-primary font-semibold text-sm uppercase tracking-widest">Exchange Hub</span>
        </div>
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight mb-2">
          All Exchanges — CEX &amp; DEX
        </h1>
        <p className="text-primary/80 italic font-medium text-sm mb-3">✦ Trade means DEX</p>
        <p className="text-muted-foreground text-base lg:text-lg max-w-3xl">
          Every centralised and decentralised exchange ranked by volume &amp; market cap — live data from CoinGecko. Trade any pair on OrahDEX with on-chain BSV settlement.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Total Volume 24h
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
            Combined Market Cap
          </div>
          {isLoading ? <div className="h-8 w-28 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{fmtUsd(totalMarketCap)}</div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                <span className="text-blue-400">CEX {fmtUsd(cefiMarketCap)}</span>
                <span className="text-violet-400">DEX {fmtUsd(defiMarketCap)}</span>
              </div>
            </>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-secondary p-4 lg:p-5 rounded-2xl border border-border shadow-lg">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Globe className="w-4 h-4 text-blue-400" />
            Exchanges Tracked
          </div>
          {isLoading ? <div className="h-8 w-16 bg-muted animate-pulse rounded" /> : (
            <>
              <div className="text-xl lg:text-2xl font-mono font-bold">{exchangeCount}</div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                <span className="text-blue-400">{cexCount} CEX</span>
                <span className="text-violet-400">{dexCount} DEX</span>
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

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Type tabs */}
        <div className="flex items-center gap-2">
          {(["all", "cex", "dex"] as ExType[]).map(t => (
            <button key={t} onClick={() => setExType(t)} className={TAB_STYLE(exType === t, t)}>
              {t === "all" ? "All" : t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search exchange, chain, country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
          />
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <button
            onClick={() => setSortOpen(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort: {SORT_LABELS[sortBy]}
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", sortOpen && "rotate-180")} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden w-44">
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setSortBy(key); setSortOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm transition-colors",
                    sortBy === key
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>

        <span className="text-xs text-muted-foreground hidden xl:block ml-auto">
          Data from CoinGecko · refreshes every 5 min
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-10">#</th>
                <th className="px-4 py-3 font-medium">Exchange</th>
                <th className="px-4 py-3 font-medium">Type / Chain</th>
                <th className="px-4 py-3 font-medium text-right">24h Volume</th>
                <th className="px-4 py-3 font-medium text-right">Market Cap</th>
                <th className="px-4 py-3 font-medium">Trust Score</th>
                <th className="px-4 py-3 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 14 }).map((_, i) => (
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
                    No exchanges found matching your filters.
                  </td>
                </tr>
              )}

              {!isLoading && filtered.map((ex, idx) => {
                // Insert a section divider the moment we hit the first row of the secondary group
                const isFirstSecondary = exType !== "all" && ex.type !== exType &&
                  (idx === 0 || filtered[idx - 1]?.type === exType);
                return (
                <Fragment key={ex.id}>
                  {isFirstSecondary && (
                    <tr>
                      <td colSpan={7} className="px-4 pt-5 pb-2">
                        <div className={cn(
                          "flex items-center gap-2 text-xs font-semibold tracking-widest uppercase",
                          exType === "dex" ? "text-blue-400/70" : "text-violet-400/70"
                        )}>
                          <div className={cn("flex-1 h-px", exType === "dex" ? "bg-blue-500/20" : "bg-violet-500/20")} />
                          {exType === "dex" ? "Centralised Exchanges (CEX)" : "Decentralised Exchanges (DEX)"}
                          <div className={cn("flex-1 h-px", exType === "dex" ? "bg-blue-500/20" : "bg-violet-500/20")} />
                        </div>
                      </td>
                    </tr>
                  )}
                <tr
                  className={cn(
                    "border-b border-border/50 transition-colors group",
                    ex.type === "dex"
                      ? "hover:bg-violet-500/5"
                      : "hover:bg-blue-500/5"
                  )}
                >
                  <td className="px-4 py-3 text-muted-foreground text-sm font-mono">{idx + 1}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {ex.image && (
                        <img src={ex.image} alt={ex.name}
                          className="w-7 h-7 rounded-full object-cover bg-secondary shrink-0"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{ex.name}</p>
                        {ex.yearEstablished && (
                          <p className="text-[10px] text-muted-foreground">Est. {ex.yearEstablished}</p>
                        )}
                      </div>
                      {ex.url && (
                        <a href={ex.url} target="_blank" rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                        </a>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {ex.type === "dex" && ex.chain
                      ? <ChainBadge chain={ex.chain} />
                      : <CexBadge />
                    }
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                    {ex.tradeVolume24hUsd >= 1000 ? fmtUsd(ex.tradeVolume24hUsd) : ex.tradeVolume24hUsd > 0 ? "$" + ex.tradeVolume24hUsd.toFixed(0) : "—"}
                  </td>

                  <td className="px-4 py-3 text-right font-mono text-sm">
                    {ex.marketCap > 0
                      ? <span className={ex.type === "dex" ? "text-violet-400 font-semibold" : "text-blue-400 font-semibold"}>{fmtUsd(ex.marketCap)}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
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
                    <a
                      href={ex.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
                        ex.type === "dex"
                          ? "bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/20"
                          : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/20"
                      )}
                    >
                      Visit <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-border bg-secondary/20 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span>
              Showing {filtered.length} of {exchangeCount} exchanges
              {exType !== "all" && ` · ${exType.toUpperCase()} only`}
              {sortBy !== "volume" && ` · sorted by ${SORT_LABELS[sortBy]}`}
            </span>
            <span>Source: CoinGecko public API · OrahDEX on-chain settlement</span>
          </div>
        )}
      </div>
    </div>
  );
}
