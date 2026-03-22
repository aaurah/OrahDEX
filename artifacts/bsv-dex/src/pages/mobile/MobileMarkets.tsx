import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, TrendingUp, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { MobileWalletSheet } from "@/components/mobile/MobileWalletSheet";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MOCK_MARKETS = [
  { symbol: "BSV/USDT", base: "BSV", quote: "USDT", price: 55.42, change: 4.41, volume: "18.5M", type: "spot" },
  { symbol: "BTC/USDT", base: "BTC", quote: "USDT", price: 65234.50, change: -1.85, volume: "1.24B", type: "spot" },
  { symbol: "ETH/USDT", base: "ETH", quote: "USDT", price: 3198.70, change: 1.53, volume: "420M", type: "spot" },
  { symbol: "SOL/USDT", base: "SOL", quote: "USDT", price: 148.32, change: 3.21, volume: "58M", type: "spot" },
  { symbol: "XRP/USDT", base: "XRP", quote: "USDT", price: 0.5842, change: -0.64, volume: "110M", type: "spot" },
  { symbol: "BNB/USDT", base: "BNB", quote: "USDT", price: 408.90, change: 0.88, volume: "95M", type: "spot" },
  { symbol: "ADA/USDT", base: "ADA", quote: "USDT", price: 0.4421, change: -2.10, volume: "45M", type: "spot" },
  { symbol: "BSV/USDT-PERP", base: "BSV", quote: "USDT", price: 55.85, change: 4.12, volume: "8.2M", type: "futures" },
  { symbol: "BTC/USDT-PERP", base: "BTC", quote: "USDT", price: 65180.00, change: -1.90, volume: "980M", type: "futures" },
  { symbol: "ETH/USDT-PERP", base: "ETH", quote: "USDT", price: 3195.00, change: 1.48, volume: "340M", type: "futures" },
];

const COIN_COLORS: Record<string, string> = {
  BSV: "#EAB308", BTC: "#F97316", ETH: "#8B5CF6",
  SOL: "#06B6D4", XRP: "#3B82F6", BNB: "#EAB308",
  ADA: "#2563EB",
};

function fmt(p: number) {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

type Filter = "all" | "spot" | "futures";

export function MobileMarkets() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const { address } = useWalletStore();
  const openWalletModal = useWalletModalStore((s) => s.open);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);

  const TOTAL_BALANCE = "$3,340.85";

  const { data: apiData, refetch, isFetching } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      return r.json();
    },
  });

  const markets = (apiData && Array.isArray(apiData) && apiData.length > 0)
    ? apiData.map((m: any) => ({
        symbol: m.symbol,
        base: m.baseAsset ?? m.symbol?.split("/")[0],
        quote: (m.quoteAsset ?? m.symbol?.split("/")[1] ?? "USDT").replace(/-PERP$/, ""),
        price: parseFloat(m.lastPrice) || 0,
        change: parseFloat(m.priceChangePercent24h ?? m.priceChangePercent) || 0,
        volume: m.volume24h ?? m.volume ?? "—",
        type: m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot"),
      }))
    : MOCK_MARKETS;

  const spotMarkets = markets.filter((m: any) => m.type === "spot");

  const filtered = markets.filter((m: any) => {
    const q = search.toLowerCase();
    return (m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q))
      && (filter === "all" || m.type === filter);
  });

  // Top movers: spot only, unique base asset, sorted by absolute change descending
  const seenBases = new Set<string>();
  const topMovers = [...spotMarkets]
    .sort((a: any, b: any) => Math.abs(b.change) - Math.abs(a.change))
    .filter((m: any) => { if (seenBases.has(m.base)) return false; seenBases.add(m.base); return true; })
    .slice(0, 4);

  const goTrade = (m: any) => {
    const slug = m.symbol.replace(/\//g, "-").replace(/-PERP$/, "");
    if (m.type === "futures") navigate(`/futures/${slug}`);
    else navigate(`/trade/${slug}`);
  };

  return (
    <>
    <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 pt-safe-top pb-3">
        <div className="flex items-center justify-between mb-3 pt-3">
          <div>
            <span className="text-xl font-bold text-foreground">Orah<span className="text-primary">DEX</span></span>
            <p className="text-[10px] text-primary opacity-80">✦ Trade means DEX</p>
          </div>
          <button
            onClick={() => address ? setWalletSheetOpen(true) : openWalletModal()}
            className={address
              ? "flex flex-col items-end px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400"
              : "flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white text-xs font-semibold shadow-md shadow-primary/20"
            }
          >
            {address ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-medium text-green-400/70">Connected</span>
                </div>
                <span className="text-sm font-bold text-green-400 leading-tight">{TOTAL_BALANCE}</span>
              </>
            ) : (
              <>
                <Wallet className="w-3.5 h-3.5" />
                Connect
              </>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-2 mb-3">
          {[{ label: "24h Vol", val: "$1.24B" }, { label: "Markets", val: `${spotMarkets.length}` }, { label: "TVL", val: "$845M" }].map(s => (
            <div key={s.label} className="flex-1 bg-card border border-border rounded-xl p-2.5 text-center">
              <p className="text-xs font-bold text-foreground">{s.val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 h-9">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Search markets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch("")}><X size={14} className="text-muted-foreground" /></button>}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Top Movers */}
        <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <TrendingUp size={14} className="text-primary" /> Top Movers
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
          {topMovers.map((m: any) => (
            <button
              key={m.symbol}
              onClick={() => goTrade(m)}
              className="shrink-0 bg-card border border-border rounded-xl p-3 w-28 text-left"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: (COIN_COLORS[m.base] ?? "#EAB308") + "22", color: COIN_COLORS[m.base] ?? "#EAB308" }}
                >
                  {m.base[0]}
                </div>
                <span className="text-xs font-semibold text-foreground">{m.base}</span>
              </div>
              <p className="text-xs font-bold text-foreground">${fmt(m.price)}</p>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-1 inline-block"
                style={{
                  backgroundColor: m.change >= 0 ? "#22c55e18" : "#ef444418",
                  color: m.change >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4 mb-3">
          {(["all", "spot", "futures"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f && f === "futures"
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                  : filter === f
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              {f === "futures" ? "Futures" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Market list */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
          <div className="flex items-center px-4 py-2 border-b border-border">
            <span className="flex-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pair</span>
            <span className="w-24 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Price</span>
            <span className="w-16 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">24h</span>
          </div>
          {(() => {
            const spotRows = filtered.filter((m: any) => m.type === "spot");
            const futuresRows = filtered.filter((m: any) => m.type === "futures");
            const showDivider = filter === "all" && spotRows.length > 0 && futuresRows.length > 0;
            return (
              <>
                {spotRows.map((m: any, i: number) => (
                  <MarketRow key={m.symbol} m={m} isLast={!showDivider && i === spotRows.length - 1} goTrade={goTrade} />
                ))}
                {showDivider && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/8 border-y border-amber-500/20">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Futures — Perpetual Contracts</span>
                  </div>
                )}
                {futuresRows.map((m: any, i: number) => (
                  <MarketRow key={m.symbol} m={m} isLast={i === futuresRows.length - 1} goTrade={goTrade} isFutures />
                ))}
              </>
            );
          })()}
        </div>
      </div>
    </div>

    {walletSheetOpen && (
      <MobileWalletSheet onClose={() => setWalletSheetOpen(false)} />
    )}
    </>
  );
}

function MarketRow({ m, isLast, goTrade, isFutures }: { m: any; isLast: boolean; goTrade: (m: any) => void; isFutures?: boolean }) {
  return (
    <button
      onClick={() => goTrade(m)}
      className={`flex items-center w-full px-4 py-3.5 text-left transition-colors ${
        isFutures ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-secondary/40"
      } ${!isLast ? "border-b border-border" : ""}`}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${isFutures ? "ring-1 ring-amber-500/30" : ""}`}
          style={{ backgroundColor: (COIN_COLORS[m.base] ?? "#EAB308") + "22", color: COIN_COLORS[m.base] ?? "#EAB308" }}
        >
          {m.base[0]}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1 leading-tight">
            <p className={`text-sm font-semibold ${isFutures ? "text-amber-50" : "text-foreground"}`}>
              {m.base}<span className="text-muted-foreground font-normal">/{m.quote}</span>
            </p>
            {isFutures && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none shrink-0">PERP</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Vol {m.volume}</p>
        </div>
      </div>
      <div className="w-24 text-right">
        <p className={`text-sm font-bold ${isFutures ? "text-amber-100" : "text-foreground"}`}>${fmt(m.price)}</p>
      </div>
      <div className="w-16 flex justify-end">
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-lg"
          style={{
            backgroundColor: m.change >= 0 ? "#22c55e18" : "#ef444418",
            color: m.change >= 0 ? "#22c55e" : "#ef4444",
          }}
        >
          {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
        </span>
      </div>
    </button>
  );
}
