import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ExternalLink, TrendingUp, Zap, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

type SubTab = "top" | "new" | "search";

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(decimals)}`;
}

function fmtPrice(p: string | undefined): string {
  if (!p) return "—";
  const n = parseFloat(p);
  if (isNaN(n)) return "—";
  if (n >= 1_000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 1)     return `$${n.toFixed(4)}`;
  if (n >= 0.01)  return `$${n.toFixed(6)}`;
  return `$${n.toFixed(8)}`;
}

function timeAgo(ms: number | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return "<1h";
  if (h < 24) return `${h}h`;
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

const DEX_LABEL: Record<string, string> = {
  uniswap:   "Uni",
  aerodrome: "Aero",
  sushiswap: "Sushi",
  pancakeswap: "Cake",
  baseswap:  "Base",
  alienbase: "Alien",
  swapbased: "Swap",
};

const DEX_COLOR: Record<string, string> = {
  uniswap:   "bg-pink-500/20 text-pink-400",
  aerodrome: "bg-red-500/20 text-red-400",
  sushiswap: "bg-blue-500/20 text-blue-400",
  pancakeswap: "bg-yellow-500/20 text-yellow-400",
  baseswap:  "bg-blue-400/20 text-blue-300",
  alienbase: "bg-purple-500/20 text-purple-400",
};

function TokenLogo({ pair }: { pair: DexPair }) {
  const sym = pair.baseToken.symbol;
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-red-500",
    "bg-yellow-500", "bg-orange-500", "bg-pink-500", "bg-teal-500",
  ];
  const idx = sym.charCodeAt(0) % colors.length;
  return (
    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[12px] shrink-0", colors[idx])}>
      {sym.slice(0, 2).toUpperCase()}
    </div>
  );
}

function PairRow({ pair, onClick }: { pair: DexPair; onClick: () => void }) {
  const chg = pair.priceChange?.h24;
  const isUp = (chg ?? 0) >= 0;
  const dexLabel = DEX_LABEL[pair.dexId] ?? pair.dexId;
  const dexColor = DEX_COLOR[pair.dexId] ?? "bg-gray-500/20 text-gray-400";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-left"
    >
      <TokenLogo pair={pair} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-foreground truncate">
            {pair.baseToken.symbol}
          </span>
          <span className="text-xs text-muted-foreground">/</span>
          <span className="text-xs text-muted-foreground">{pair.quoteToken.symbol}</span>
          <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium ml-0.5", dexColor)}>
            {dexLabel}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {pair.baseToken.name}
          {pair.liquidity?.usd != null && (
            <> · <span className="text-muted-foreground/70">Liq {fmt(pair.liquidity.usd)}</span></>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-foreground">{fmtPrice(pair.priceUsd)}</div>
        <div className={cn("text-[11px] font-medium mt-0.5", isUp ? "text-green-400" : "text-red-400")}>
          {chg != null ? `${isUp ? "+" : ""}${chg.toFixed(2)}%` : "—"}
        </div>
      </div>

      <div className="text-right shrink-0 min-w-[52px]">
        <div className="text-[11px] text-muted-foreground">{fmt(pair.volume?.h24)}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-0.5">24h vol</div>
      </div>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
        <TrendingUp className="w-5 h-5" />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function MobileBaseMarket() {
  const [subTab, setSubTab] = useState<SubTab>("top");
  const [searchQ, setSearchQ]  = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQ), 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  const topQuery = useQuery({
    queryKey: ["dexscreener", "base", "top"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/dexscreener/base/top`);
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ pairs: DexPair[] }>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: subTab === "top",
  });

  const newQuery = useQuery({
    queryKey: ["dexscreener", "base", "new"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/dexscreener/base/new`);
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ pairs: DexPair[] }>;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: subTab === "new",
  });

  const searchQuery = useQuery({
    queryKey: ["dexscreener", "base", "search", debouncedQ],
    queryFn: async () => {
      if (!debouncedQ.trim()) return { pairs: [] };
      const r = await fetch(`${BASE_URL}/api/dexscreener/base/search?q=${encodeURIComponent(debouncedQ)}`);
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ pairs: DexPair[] }>;
    },
    staleTime: 30_000,
    enabled: subTab === "search" && debouncedQ.length > 0,
  });

  const activePairs: DexPair[] =
    subTab === "top"    ? (topQuery.data?.pairs ?? []) :
    subTab === "new"    ? (newQuery.data?.pairs ?? []) :
    subTab === "search" ? (searchQuery.data?.pairs ?? []) :
    [];

  const isLoading =
    (subTab === "top"    && topQuery.isLoading) ||
    (subTab === "new"    && newQuery.isLoading) ||
    (subTab === "search" && searchQuery.isFetching);

  const openPair = (pair: DexPair) => {
    window.open(pair.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Base chain header banner ── */}
      <div className="mx-4 mt-2 mb-1 flex items-center gap-3 px-3 py-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
          <span className="text-white font-extrabold text-[13px]">⬡</span>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-blue-400 leading-tight">Base Chain · Live DEX Markets</p>
          <p className="text-[10px] text-blue-300/60 leading-tight mt-0.5">
            Real-time data from Uniswap, Aerodrome &amp; more · Powered by DexScreener
          </p>
        </div>
      </div>

      {/* ── Sub-tabs: Top / New / Search ── */}
      <div className="flex items-center gap-0 px-4 pt-1">
        {([
          { id: "top"    as SubTab, label: "Top Pairs", icon: <TrendingUp className="w-3 h-3" /> },
          { id: "new"    as SubTab, label: "New",       icon: <Clock className="w-3 h-3" /> },
          { id: "search" as SubTab, label: "Search",    icon: <Search className="w-3 h-3" /> },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); if (t.id === "search") setTimeout(() => inputRef.current?.focus(), 100); }}
            className={cn(
              "flex items-center gap-1 px-3 py-2 text-[12px] font-medium rounded-lg mr-1 transition-colors",
              subTab === t.id
                ? "bg-blue-500/20 text-blue-400"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Search input (shown when Search tab active) ── */}
      {subTab === "search" && (
        <div className="mx-4 mt-2 mb-1 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9">
          <Search size={13} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
            placeholder="Token symbol or 0x address…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          {searchQ && <button onClick={() => setSearchQ("")}><X size={13} className="text-muted-foreground" /></button>}
        </div>
      )}

      {/* ── Column headers ── */}
      <div className="flex items-center px-4 py-1.5 text-[10px] text-muted-foreground/60 font-medium border-b border-border/20">
        <div className="w-9 mr-3 shrink-0" />
        <div className="flex-1">
          {subTab === "new"
            ? <span>TOKEN <span className="text-muted-foreground/40 ml-1">age</span></span>
            : "TOKEN"
          }
        </div>
        <div className="text-right w-20 mr-3">PRICE</div>
        <div className="text-right w-14">VOLUME</div>
      </div>

      {/* ── Pair list ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col gap-0">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-secondary shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-secondary rounded w-28 mb-1.5" />
                  <div className="h-2.5 bg-secondary/60 rounded w-20" />
                </div>
                <div className="text-right">
                  <div className="h-3.5 bg-secondary rounded w-16 mb-1.5" />
                  <div className="h-2.5 bg-secondary/60 rounded w-10 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && subTab === "search" && !debouncedQ && (
          <EmptyState label="Type a token name or paste a contract address" />
        )}

        {!isLoading && activePairs.length === 0 && (subTab !== "search" || debouncedQ) && (
          <EmptyState label="No pairs found" />
        )}

        {!isLoading && activePairs.map(pair => (
          <div key={pair.pairAddress}>
            {subTab === "new" && (
              <div className="px-4 -mb-1">
                <span className="text-[9px] text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  {timeAgo(pair.pairCreatedAt)} ago
                </span>
              </div>
            )}
            <PairRow pair={pair} onClick={() => openPair(pair)} />
          </div>
        ))}

        {!isLoading && activePairs.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-4 text-[10px] text-muted-foreground/40">
            <ExternalLink className="w-3 h-3" />
            Data from DexScreener · Tap any pair to view on DexScreener
          </div>
        )}
      </div>
    </div>
  );
}
