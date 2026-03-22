import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, TrendingUp, Wallet, CreditCard, Zap, LineChart } from "lucide-react";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { MobileWalletSheet } from "@/components/mobile/MobileWalletSheet";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { USDT_MARKETS, BSV_MARKETS, FUTURES_MARKETS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COIN_COLORS: Record<string, string> = {
  BSV:"#EAB308", BTC:"#F97316", ETH:"#8B5CF6", SOL:"#06B6D4",
  XRP:"#3B82F6", BNB:"#EAB308", ADA:"#2563EB", DOGE:"#EAB308",
  DOT:"#E11D48", AVAX:"#EF4444", MATIC:"#7C3AED", LINK:"#2563EB",
  UNI:"#EC4899", ATOM:"#6366F1", LTC:"#6B7280", BCH:"#22C55E",
  TRX:"#EF4444", NEAR:"#10B981", APT:"#06B6D4", ARB:"#60A5FA",
  OP:"#EF4444",  SUI:"#3B82F6", INJ:"#2563EB", PEPE:"#22C55E",
  SHIB:"#F97316",MKR:"#22C55E", AAVE:"#7C3AED", CRV:"#F43F5E",
  ENS:"#5B8DEF", LDO:"#34D399", GRT:"#6F55FF", FTM:"#1969FF",
  ALGO:"#000000",XLM:"#1C97E0", HBAR:"#222222",ZEC:"#ECB244",
  XMR:"#FF6600",
};

function fmt(p: number) {
  if (!p) return "0.00";
  if (p >= 1000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1)     return p.toFixed(2);
  if (p >= 0.01)  return p.toFixed(4);
  return p.toFixed(8);
}

function fmtVol(v: number) {
  if (!v) return "—";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(2);
}

type Filter = "usdt" | "bsv" | "futures";

function normalise(m: any): any {
  return {
    symbol: m.symbol,
    base: m.baseAsset ?? m.base ?? m.symbol?.split(/[-/]/)[0],
    quote: m.quoteAsset ?? m.quote ?? "USDT",
    price: parseFloat(m.lastPrice ?? m.price) || 0,
    change: parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0,
    volume: parseFloat(m.volume24h ?? m.volume) || 0,
    type: m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot"),
  };
}

export function MobileMarkets() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("usdt");
  const { address, network, chainId } = useWalletStore();
  const openWalletModal = useWalletModalStore((s) => s.open);
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoin, setBuyCoin] = useState("BSV");

  const { balances: evmBalances } = useEvmBalances(
    network === "evm" ? address : null,
    network === "evm" ? chainId : null
  );
  const totalUsd = evmBalances.reduce((s, b) => s + b.usdValue, 0);
  const TOTAL_BALANCE = totalUsd >= 0.01
    ? "$" + totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "$0.00";

  const { data: apiData } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      return r.json();
    },
  });

  function getRaw(): any[] {
    if (apiData && Array.isArray(apiData) && apiData.length > 0) {
      const all = apiData.map(normalise);
      if (filter === "usdt")    return all.filter(m => m.quote === "USDT" && m.type === "spot");
      if (filter === "bsv")     return all.filter(m => m.quote === "BSV");
      if (filter === "futures") return all.filter(m => m.type === "futures");
    }
    if (filter === "usdt")    return USDT_MARKETS.map(normalise);
    if (filter === "bsv")     return BSV_MARKETS.map(normalise);
    return FUTURES_MARKETS.map(normalise);
  }

  function getCounts(all: any[]) {
    if (apiData && Array.isArray(apiData) && apiData.length > 0) {
      const n = apiData.map(normalise);
      return {
        usdt: n.filter(m => m.quote === "USDT" && m.type === "spot").length,
        bsv:  n.filter(m => m.quote === "BSV").length,
        futures: n.filter(m => m.type === "futures").length,
      };
    }
    return { usdt: USDT_MARKETS.length, bsv: BSV_MARKETS.length, futures: FUTURES_MARKETS.length };
  }

  const rawMarkets = getRaw();
  const counts = getCounts(rawMarkets);

  const filtered = rawMarkets.filter(m => {
    const q = search.toLowerCase();
    return m.symbol.toLowerCase().includes(q) || m.base.toLowerCase().includes(q);
  });

  // Top movers — unique base, highest abs change
  const seen = new Set<string>();
  const topMovers = [...(USDT_MARKETS.map(normalise))]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .filter(m => { if (seen.has(m.base)) return false; seen.add(m.base); return true; })
    .slice(0, 5);

  const goTrade = (m: any) => {
    const slug = m.symbol.replace(/\//g, "-").replace(/-PERP$/, "");
    if (m.type === "futures") navigate(`/futures/${slug}`);
    else navigate(`/trade/${slug}`);
  };

  const TABS: { id: Filter; label: string; icon: React.ReactNode; count: number; color: string }[] = [
    { id: "usdt",    label: "USDT",    icon: <Zap size={12} />,        count: counts.usdt,    color: "text-blue-400 bg-blue-500/15 border-blue-500/30" },
    { id: "bsv",     label: "BSV",     icon: <TrendingUp size={12} />, count: counts.bsv,     color: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
    { id: "futures", label: "Futures", icon: <LineChart size={12} />,  count: counts.futures, color: "text-red-400 bg-red-500/15 border-red-500/30" },
  ];

  return (
    <>
    <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 pt-safe-top pb-3">
        <div className="flex items-center justify-between mb-3 pt-3">
          <div>
            <span className="text-xl font-bold text-foreground">Orah<span className="text-primary">DEX</span></span>
            <p className="text-[10px] text-primary/80">✦ Trade means DEX</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBuyOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-semibold"
            >
              <CreditCard size={13} /> Buy
            </button>
            <button
              onClick={() => address ? setWalletSheetOpen(true) : openWalletModal()}
              className={address
                ? "flex flex-col items-end px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400"
                : "flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-primary text-white text-xs font-semibold shadow-md"
              }
            >
              {address ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-green-400/70">Connected</span>
                  </div>
                  <span className="text-sm font-bold text-green-400 leading-tight">{TOTAL_BALANCE}</span>
                </>
              ) : (
                <><Wallet size={13.5} /> Connect</>
              )}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 h-9 mb-3">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground outline-none"
            placeholder={`Search ${filter.toUpperCase()} markets…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch("")}><X size={14} className="text-muted-foreground" /></button>}
        </div>

        {/* USDT / BSV / Futures tabs */}
        <div className="flex gap-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setFilter(t.id); setSearch(""); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl border transition-all",
                filter === t.id ? t.color : "text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
              <span className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                filter === t.id ? "bg-white/20" : "bg-secondary"
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Top Movers (only on USDT tab and no search) */}
        {filter === "usdt" && !search && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary" /> Top Movers
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
                      style={{ background: (COIN_COLORS[m.base] ?? "#EAB308") + "25", color: COIN_COLORS[m.base] ?? "#EAB308" }}
                    >
                      {m.base[0]}
                    </div>
                    <span className="text-xs font-semibold">{m.base}</span>
                  </div>
                  <p className="text-xs font-bold">${fmt(m.price)}</p>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md mt-1 inline-block"
                    style={{
                      background: m.change >= 0 ? "#22c55e18" : "#ef444418",
                      color: m.change >= 0 ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* BSV market info banner */}
        {filter === "bsv" && !search && (
          <div className="mb-3 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
            <span className="text-amber-400 text-lg">₿</span>
            <div>
              <p className="text-xs font-bold text-amber-300">BSV Settlement Market</p>
              <p className="text-[10px] text-amber-400/70">All prices in BSV · On-chain settlement</p>
            </div>
          </div>
        )}

        {/* Market list */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden mb-4">
          {/* Column headers */}
          <div className="flex items-center px-4 py-2 border-b border-border bg-secondary/30">
            <span className="flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pair</span>
            <span className="w-28 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">
              Price {filter === "bsv" ? "(BSV)" : "(USDT)"}
            </span>
            <span className="w-16 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-right">24h</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {search ? `No results for "${search}"` : "Loading…"}
            </div>
          ) : (
            filtered.map((m: any, i: number) => (
              <MarketRow
                key={m.symbol}
                m={m}
                isLast={i === filtered.length - 1}
                isFutures={filter === "futures"}
                isBsv={filter === "bsv"}
                goTrade={goTrade}
                onBuy={() => { setBuyCoin(m.base); setBuyOpen(true); }}
              />
            ))
          )}
        </div>
      </div>
    </div>

    {walletSheetOpen && <MobileWalletSheet onClose={() => setWalletSheetOpen(false)} />}
    <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin={buyCoin} />
    </>
  );
}

function MarketRow({
  m, isLast, isFutures, isBsv, goTrade, onBuy
}: { m: any; isLast: boolean; isFutures?: boolean; isBsv?: boolean; goTrade: (m: any) => void; onBuy: () => void }) {
  const color = COIN_COLORS[m.base] ?? "#EAB308";
  return (
    <div className={cn("flex items-center w-full px-4 py-3 text-left", !isLast && "border-b border-border")}>
      {/* Coin icon + name */}
      <button onClick={() => goTrade(m)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
          style={{ background: color + "22", color }}
        >
          {m.base.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-foreground leading-tight">{m.base}</span>
            <span className="text-muted-foreground text-xs font-normal">/{m.quote}</span>
            {isFutures && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 leading-none">PERP</span>}
            {isBsv     && <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-400/10 text-amber-400/80 leading-none">₿SV</span>}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Vol {m.volume >= 1e9 ? (m.volume/1e9).toFixed(1)+"B" : m.volume >= 1e6 ? (m.volume/1e6).toFixed(0)+"M" : m.volume >= 1e3 ? (m.volume/1e3).toFixed(0)+"K" : m.volume.toFixed(0)}
          </p>
        </div>
      </button>

      {/* Price */}
      <button onClick={() => goTrade(m)} className="w-24 text-right">
        <p className="text-sm font-bold text-foreground">{isBsv ? "" : "$"}{fmt(m.price)}</p>
      </button>

      {/* 24h % + Buy */}
      <div className="w-16 flex flex-col items-end gap-1">
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-lg"
          style={{ background: m.change >= 0 ? "#22c55e18" : "#ef444418", color: m.change >= 0 ? "#22c55e" : "#ef4444" }}
        >
          {m.change >= 0 ? "+" : ""}{m.change.toFixed(2)}%
        </span>
        {!isFutures && (
          <button
            onClick={onBuy}
            className="text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-md flex items-center gap-0.5"
          >
            <CreditCard size={8} /> Buy
          </button>
        )}
      </div>
    </div>
  );
}
