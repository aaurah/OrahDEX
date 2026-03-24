import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Star, ChevronUp, ChevronDown, CreditCard } from "lucide-react";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";

import { MobileWalletSheet } from "@/components/mobile/MobileWalletSheet";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
  BASE_MARKETS, LINEA_MARKETS, ZK_MARKETS, SCR_MARKETS, MNT_MARKETS,
  AI_MARKETS, SOL_MARKETS, MEME_MARKETS, DEFI_MARKETS, NEW_MARKETS,
  FUTURES_MARKETS,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(p: number): string {
  if (!p && p !== 0) return "—";
  if (p >= 10000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 100)    return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.01)   return p.toFixed(4);
  if (p >= 0.0001) return p.toFixed(6);
  return p.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function normalise(m: any): MktRow {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const vol   = parseFloat(m.volume24h ?? m.volume) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  return { symbol: m.symbol ?? `${base}-${quote}`, base, quote, price, chg, vol, type };
}

interface MktRow { symbol: string; base: string; quote: string; price: number; chg: number; vol: number; type: string; }

type SortKey = "base" | "price" | "chg";
type SortDir = "asc" | "desc";
type UsdSub  = "USDT" | "USDC" | "TUSD" | "USDD";

const USD_SUBS: UsdSub[] = ["USDT", "USDC", "TUSD", "USDD"];

const STABLE_MOCK: Record<UsdSub, any[]> = {
  USDT: USDT_MARKETS, USDC: USDC_MARKETS, TUSD: TUSD_MARKETS, USDD: USDD_MARKETS,
};

type Cat = "favorites" | "new" | "usd" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "base" | "linea" | "zk" | "scr" | "mnt" | "bch" | "bsv" | "sol" | "ai" | "meme" | "defi" | "futures";

const CATS: { id: Cat; label: string }[] = [
  { id: "favorites", label: "Favs" },
  { id: "new",       label: "NEW" },
  { id: "usd",       label: "USD" },
  { id: "btc",       label: "BTC" },
  { id: "eth",       label: "ETH" },
  { id: "bnb",       label: "BNB" },
  { id: "matic",     label: "MATIC" },
  { id: "avax",      label: "AVAX" },
  { id: "arb",       label: "ARB" },
  { id: "op",        label: "OP" },
  { id: "ftm",       label: "FTM" },
  { id: "cro",       label: "CRO" },
  { id: "base",      label: "BASE" },
  { id: "linea",     label: "LINEA" },
  { id: "zk",        label: "ZK" },
  { id: "scr",       label: "SCROLL" },
  { id: "mnt",       label: "MNT" },
  { id: "sol",       label: "SOL" },
  { id: "bch",       label: "BCH" },
  { id: "bsv",       label: "BSV" },
  { id: "ai",        label: "AI" },
  { id: "meme",      label: "MEME" },
  { id: "defi",      label: "DEFI" },
  { id: "sol",       label: "SOL" },
  { id: "futures",   label: "Futures" },
];

function getCatRows(cat: Cat, usdSub: UsdSub, apiAll: MktRow[], favorites: Set<string>): MktRow[] {
  const hasApi = apiAll.length > 0;

  /** Returns API-filtered rows when available; falls back to mock when the API
   *  has no pairs for that quote asset (e.g. new L2 chains not yet in DB). */
  const apiOrMock = (quote: string, mock: MktRow[]): MktRow[] => {
    if (!hasApi) return mock;
    const filtered = apiAll.filter(m => m.quote === quote);
    return filtered.length > 0 ? filtered : mock;
  };

  switch (cat) {
    case "favorites": {
      const pool = hasApi ? apiAll : [
        ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
        ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
        ...AI_MARKETS, ...SOL_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
      ].map(normalise);
      return pool.filter(m => favorites.has(m.symbol));
    }
    case "new":     return NEW_MARKETS.map(normalise);
    case "usd":     return hasApi
      ? apiAll.filter(m => m.quote === usdSub && m.type === "spot")
      : STABLE_MOCK[usdSub].map(normalise);
    case "btc":     return apiOrMock("BTC",   BTC_MARKETS.map(normalise));
    case "eth":     return apiOrMock("ETH",   ETH_MARKETS.map(normalise));
    case "bnb":     return apiOrMock("BNB",   BNB_MARKETS.map(normalise));
    case "matic":   return apiOrMock("MATIC", MATIC_MARKETS.map(normalise));
    case "avax":    return apiOrMock("AVAX",  AVAX_MARKETS.map(normalise));
    case "arb":     return apiOrMock("ARB",   ARB_MARKETS.map(normalise));
    case "op":      return apiOrMock("OP",    OP_MARKETS.map(normalise));
    case "ftm":     return apiOrMock("FTM",   FTM_MARKETS.map(normalise));
    case "cro":     return apiOrMock("CRO",   CRO_MARKETS.map(normalise));
    case "base":    return apiOrMock("BASE",  BASE_MARKETS.map(normalise));
    case "linea":   return apiOrMock("LINEA", LINEA_MARKETS.map(normalise));
    case "zk":      return apiOrMock("ZK",    ZK_MARKETS.map(normalise));
    case "scr":     return apiOrMock("SCR",   SCR_MARKETS.map(normalise));
    case "mnt":     return apiOrMock("MNT",   MNT_MARKETS.map(normalise));
    case "sol":     return SOL_MARKETS.map(normalise);
    case "bch":     return apiOrMock("BCH",   BCH_MARKETS.map(normalise));
    case "bsv":     return apiOrMock("BSV",   BSV_MARKETS.map(normalise));
    case "ai":      return AI_MARKETS.map(normalise);
    case "meme":    return MEME_MARKETS.map(normalise);
    case "defi":    return DEFI_MARKETS.map(normalise);
    case "futures": return hasApi ? apiAll.filter(m => m.type === "futures") : FUTURES_MARKETS.map(normalise);
    default:        return [];
  }
}

export function MobileMarkets() {
  const [, navigate] = useLocation();
  const [search, setSearch]       = useState("");
  const [cat, setCat]             = useState<Cat>("usd");
  const [usdSub, setUsdSub]       = useState<UsdSub>("USDT");
  const [sortKey, setSortKey]     = useState<SortKey>("base");
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [buyOpen, setBuyOpen]     = useState(false);
  const [buyCoin, setBuyCoin]     = useState("BSV");
  const handleBuy = (coin: string) => {
    setBuyCoin(coin);
    setBuyOpen(true);
  };
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const { address } = useWalletStore();

  const { data: apiData } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const apiAll: MktRow[] = (apiData && Array.isArray(apiData) && apiData.length > 0)
    ? apiData.map(normalise)
    : [];

  let rows = getCatRows(cat, usdSub, apiAll, favorites);

  if (search) {
    const q = search.toUpperCase();
    rows = rows.filter(m => m.base.includes(q) || m.symbol.includes(q));
  }

  rows = [...rows].sort((a, b) => {
    let v = 0;
    if (sortKey === "base")  v = a.base.localeCompare(b.base);
    if (sortKey === "price") v = a.price - b.price;
    if (sortKey === "chg")   v = a.chg - b.chg;
    return sortDir === "asc" ? v : -v;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleFav = (sym: string) =>
    setFavorites(prev => { const n = new Set(prev); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const goTrade = (m: MktRow) => {
    const slug = m.symbol.replace(/\//g, "-").replace(/-PERP$/, "");
    navigate(m.type === "futures" ? `/futures/${slug}` : `/trade/${slug}`);
  };

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="inline-flex flex-col ml-0.5 opacity-30 text-[8px]"><ChevronUp className="w-2.5 h-2.5" /><ChevronDown className="w-2.5 h-2.5 -mt-1" /></span>;
    return sortDir === "asc"
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-primary" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-primary" />;
  }

  return (
    <>
    <div className="flex flex-col h-full overflow-y-auto pb-24 bg-background">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/30">
        {/* Spot label + Search bar + Buy on one line */}
        <div className="flex items-center gap-2 px-4 pt-1 pb-1">
          <span className="text-base font-bold shrink-0">Spot</span>
          <div className="flex-1 flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 outline-none"
              placeholder="Search coins…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button onClick={() => setSearch("")}><X size={13} className="text-muted-foreground" /></button>}
          </div>
          <button
            onClick={() => handleBuy("BSV")}
            className="flex items-center gap-1 px-3 py-[6px] rounded-lg bg-green-500 text-white text-[12px] font-bold shadow-sm shadow-green-500/30 active:scale-95 transition-transform shrink-0"
          >
            <CreditCard size={12} />
            Buy
          </button>
        </div>

        {/* Main category tabs */}
        <div ref={tabsRef} className="flex overflow-x-auto no-scrollbar px-4 pb-0 gap-0">
          {CATS.map(c => {
            const isBsv = c.id === "bsv";
            const isActive = cat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { setCat(c.id); setSearch(""); }}
                className={cn(
                  "shrink-0 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap relative transition-colors",
                  isActive && isBsv ? "text-amber-400 font-bold"
                  : isActive ? "text-foreground font-bold"
                  : isBsv ? "text-amber-500/80 hover:text-amber-400"
                  : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                {isBsv ? "⚡ BSV" : c.label}
                {isActive && !isBsv && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full" />
                )}
                {isActive && isBsv && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-amber-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* BSV fastest settlement banner — mobile */}
        {cat === "bsv" && (
          <div className="mx-4 mt-2 mb-0 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl">
            <span className="text-base leading-none">⚡</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-amber-400 leading-tight">World's Fastest Settlement — BSV</p>
              <p className="text-[10px] text-amber-300/60 leading-tight mt-0.5">On-chain in &lt;5s · ~$0.001 fee · No bridges</p>
            </div>
          </div>
        )}

        {/* USD sub-tabs — only visible when USD tab is active */}
        {cat === "usd" && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border/20 bg-secondary/20">
            {USD_SUBS.map(s => (
              <button
                key={s}
                onClick={() => setUsdSub(s)}
                className={cn(
                  "px-3.5 py-1 rounded-lg text-[12px] font-semibold border transition-all",
                  usdSub === s
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "text-muted-foreground border-border/40 hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Column headers ── aligned to match MexcRow exactly ── */}
      <div className="flex items-center px-4 py-2 border-b border-border/30 bg-background/80">
        {/* Spacer matching the star button (13px icon + mr-2.5 = ~23px) */}
        <div className="w-[23px] mr-2.5 shrink-0" />
        <button
          onClick={() => toggleSort("base")}
          className="flex items-center text-[11px] text-muted-foreground font-semibold flex-1"
        >
          Pair <SortIcon k="base" />
        </button>
        <button
          onClick={() => toggleSort("price")}
          className="flex items-center justify-end text-[11px] text-muted-foreground font-semibold w-32 pr-3"
        >
          Price <SortIcon k="price" />
        </button>
        <button
          onClick={() => toggleSort("chg")}
          className="flex items-center justify-center text-[11px] text-muted-foreground font-semibold w-[68px]"
        >
          Change <SortIcon k="chg" />
        </button>
      </div>

      {/* ── Market list ── */}
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground text-sm">
          {cat === "favorites" ? "Star coins to add favorites" : search ? `No results for "${search}"` : "Loading…"}
        </div>
      ) : (
        <div>
          {rows.map((m) => (
            <MexcRow
              key={m.symbol}
              m={m}
              isFav={favorites.has(m.symbol)}
              onFav={() => toggleFav(m.symbol)}
              onTrade={() => goTrade(m)}
              onBuy={() => handleBuy(m.base)}
            />
          ))}
        </div>
      )}
    </div>

    {walletSheetOpen && <MobileWalletSheet onClose={() => setWalletSheetOpen(false)} />}
    <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin={buyCoin} />
    </>
  );
}

function MexcRow({
  m, isFav, onFav, onTrade, onBuy
}: { m: MktRow; isFav: boolean; onFav: () => void; onTrade: () => void; onBuy: () => void }) {
  const isUp = m.chg >= 0;

  return (
    <div className="flex items-center px-4 py-[11px] border-b border-border/20 active:bg-secondary/30 transition-colors">
      <button onClick={onFav} className="mr-2.5 shrink-0">
        <Star size={13} className={isFav ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
      </button>

      <button onClick={onTrade} className="flex-1 text-left min-w-0">
        <span className="text-[14px] font-semibold text-foreground leading-tight">{m.base}</span>
        <span className="text-[12px] text-muted-foreground font-normal">/{m.quote}</span>
        {m.type === "futures" && (
          <span className="ml-1.5 text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded border border-amber-500/25">PERP</span>
        )}
      </button>

      <button onClick={onTrade} className="w-32 text-right pr-3">
        <span className="text-[14px] font-semibold text-foreground tabular-nums leading-tight">{fmt(m.price)}</span>
      </button>

      <button
        onClick={onBuy}
        className={cn(
          "w-[68px] h-[36px] rounded-md flex items-center justify-center shrink-0",
          isUp ? "bg-green-500" : "bg-red-500"
        )}
      >
        <span className="text-[12px] font-bold text-white leading-none">
          {isUp ? "+" : ""}{m.chg.toFixed(2)}%
        </span>
      </button>
    </div>
  );
}
