import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Star, ChevronUp, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
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

function normalise(m: any) {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  const symbol = m.symbol ?? `${base}-${quote}`;
  return { symbol, base, quote, price, chg, type };
}

type UsdSub = "USDT" | "USDC" | "TUSD" | "USDD";
const USD_SUBS: UsdSub[] = ["USDT", "USDC", "TUSD", "USDD"];
const STABLE_MOCK: Record<UsdSub, any[]> = {
  USDT: USDT_MARKETS, USDC: USDC_MARKETS, TUSD: TUSD_MARKETS, USDD: USDD_MARKETS,
};

type Cat = "favorites" | "usd" | "new" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "bch" | "bsv" | "ai" | "sol" | "meme" | "defi" | "futures";

const CATS: { id: Cat; label: string }[] = [
  { id: "favorites", label: "Favorites" },
  { id: "usd",       label: "USD" },
  { id: "new",       label: "NEW" },
  { id: "btc",       label: "BTC" },
  { id: "eth",       label: "ETH" },
  { id: "bnb",       label: "BNB" },
  { id: "matic",     label: "MATIC" },
  { id: "avax",      label: "AVAX" },
  { id: "arb",       label: "ARB" },
  { id: "op",        label: "OP" },
  { id: "ftm",       label: "FTM" },
  { id: "cro",       label: "CRO" },
  { id: "bch",       label: "BCH" },
  { id: "bsv",       label: "BSV" },
  { id: "ai",        label: "AI" },
  { id: "sol",       label: "SOL" },
  { id: "meme",      label: "MEME" },
  { id: "defi",      label: "DEFI" },
  { id: "futures",   label: "Futures" },
];

/**
 * Always use mock data as the full pair list; enrich prices from the live API where available.
 */
function getRows(cat: Cat, usdSub: UsdSub, livePrice: Map<string, ReturnType<typeof normalise>>, favorites: Set<string>) {
  const enrich = (mock: any[]): ReturnType<typeof normalise>[] =>
    mock.map(m => {
      const n = normalise(m);
      const live = livePrice.get(n.symbol);
      if (!live) return n;
      return { ...n, price: live.price, chg: live.chg };
    });

  const ALL_POOL = [
    ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
    ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
  ];

  switch (cat) {
    case "favorites": return enrich(ALL_POOL).filter(m => favorites.has(m.symbol));
    case "usd":       return enrich(STABLE_MOCK[usdSub]);
    case "new":       return NEW_MARKETS.map(normalise);
    case "btc":       return enrich(BTC_MARKETS);
    case "eth":       return enrich(ETH_MARKETS);
    case "bnb":       return enrich(BNB_MARKETS);
    case "matic":     return enrich(MATIC_MARKETS);
    case "avax":      return enrich(AVAX_MARKETS);
    case "arb":       return enrich(ARB_MARKETS);
    case "op":        return enrich(OP_MARKETS);
    case "ftm":       return enrich(FTM_MARKETS);
    case "cro":       return enrich(CRO_MARKETS);
    case "bch":       return enrich(BCH_MARKETS);
    case "bsv":       return enrich(BSV_MARKETS);
    case "ai":        return enrich(AI_MARKETS);
    case "sol":       return enrich(SOL_MARKETS);
    case "meme":      return enrich(MEME_MARKETS);
    case "defi":      return enrich(DEFI_MARKETS);
    case "futures":   return enrich(FUTURES_MARKETS);
    default:          return [];
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentSymbol?: string;
}

export function MobileMarketSelector({ open, onClose, currentSymbol }: Props) {
  const [, navigate] = useLocation();
  const [cat, setCat]         = useState<Cat>("usd");
  const [usdSub, setUsdSub]   = useState<UsdSub>("USDT");
  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<"base"|"price"|"chg">("base");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const { data: apiData } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const livePrice = new Map(
    (apiData && Array.isArray(apiData) ? apiData : [])
      .map(normalise)
      .map((m: ReturnType<typeof normalise>) => [m.symbol, m])
  );

  let rows = getRows(cat, usdSub, livePrice, favorites);

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

  const toggleSort = (k: "base"|"price"|"chg") => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const toggleFav = (sym: string) =>
    setFavorites(prev => { const n = new Set(prev); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const pick = (m: ReturnType<typeof normalise>) => {
    const slug = m.symbol.replace(/\//g, "-").replace(/-PERP$/, "");
    navigate(m.type === "futures" ? `/futures/${slug}` : `/trade/${slug}`);
    onClose();
  };

  function SortIcon({ k }: { k: "base"|"price"|"chg" }) {
    if (sortKey !== k) return (
      <span className="inline-flex flex-col ml-0.5 opacity-30">
        <ChevronUp className="w-2.5 h-2.5" />
        <ChevronDown className="w-2.5 h-2.5 -mt-1" />
      </span>
    );
    return sortDir === "asc"
      ? <ChevronUp className="inline w-3 h-3 ml-0.5 text-primary" />
      : <ChevronDown className="inline w-3 h-3 ml-0.5 text-primary" />;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in drawer from left */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-[88vw] max-w-sm bg-background flex flex-col shadow-2xl transition-transform duration-250 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 border-b border-border shrink-0">
          <span className="text-base font-bold">Markets</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2 bg-secondary/60 border border-border/60 rounded-xl px-3 h-9">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              className="flex-1 bg-transparent text-[13px] placeholder:text-muted-foreground/60 outline-none"
              placeholder="Search pair"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}><X size={12} className="text-muted-foreground" /></button>
            )}
          </div>
        </div>

        {/* Category tabs — horizontal scroll */}
        <div className="flex overflow-x-auto no-scrollbar px-2 border-b border-border/40 shrink-0">
          {CATS.map(c => (
            <button
              key={c.id}
              onClick={() => { setCat(c.id); setSearch(""); }}
              className={cn(
                "shrink-0 px-3 py-2.5 text-[12px] font-medium whitespace-nowrap relative transition-colors",
                cat === c.id ? "text-foreground font-bold" : "text-muted-foreground"
              )}
            >
              {c.label}
              {cat === c.id && (
                <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* USD sub-tabs (USDT / USDC / TUSD / USDD) */}
        {cat === "usd" && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 shrink-0">
            {USD_SUBS.map(s => (
              <button
                key={s}
                onClick={() => setUsdSub(s)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors",
                  usdSub === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Column headers */}
        <div className="flex items-center px-4 py-1.5 border-b border-border/30 shrink-0">
          <button
            onClick={() => toggleSort("base")}
            className="flex-1 flex items-center text-[10px] text-muted-foreground font-medium"
          >
            Pair <SortIcon k="base" />
          </button>
          <button
            onClick={() => toggleSort("price")}
            className="w-24 flex items-center justify-end text-[10px] text-muted-foreground font-medium"
          >
            Price <SortIcon k="price" />
          </button>
          <button
            onClick={() => toggleSort("chg")}
            className="w-16 flex items-center justify-end text-[10px] text-muted-foreground font-medium"
          >
            Chg% <SortIcon k="chg" />
          </button>
        </div>

        {/* Market rows */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              {cat === "favorites" ? "No favorites yet" : search ? `No results` : "Loading…"}
            </div>
          ) : (
            rows.map(m => {
              const isActive = m.symbol === currentSymbol?.replace(/\//g, "-");
              const isUp = m.chg >= 0;
              return (
                <div
                  key={m.symbol}
                  className={cn(
                    "flex items-center px-4 py-[10px] border-b border-border/20 cursor-pointer",
                    isActive ? "bg-primary/8" : "active:bg-secondary/40"
                  )}
                >
                  {/* Star */}
                  <button
                    onClick={() => toggleFav(m.symbol)}
                    className="mr-2 shrink-0"
                  >
                    <Star
                      size={12}
                      className={favorites.has(m.symbol) ? "fill-green-400 text-green-400" : "text-muted-foreground/30"}
                    />
                  </button>

                  {/* Pair */}
                  <button onClick={() => pick(m)} className="flex-1 text-left">
                    <span className={cn("text-[13px] font-semibold", isActive ? "text-primary" : "text-foreground")}>
                      {m.base}
                    </span>
                    <span className="text-[11px] text-muted-foreground">/{m.quote}</span>
                    {m.type === "futures" && (
                      <span className="ml-1 text-[8px] font-bold text-green-400 bg-green-500/15 px-1 py-0.5 rounded">PERP</span>
                    )}
                    {isActive && (
                      <span className="ml-1.5 text-[8px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded">●</span>
                    )}
                  </button>

                  {/* Price */}
                  <button onClick={() => pick(m)} className="w-24 text-right pr-2">
                    <span className="text-[12px] font-semibold text-foreground tabular-nums">{fmt(m.price)}</span>
                  </button>

                  {/* Change pill */}
                  <button
                    onClick={() => pick(m)}
                    className={cn(
                      "w-[58px] h-[30px] rounded flex items-center justify-center shrink-0",
                      isUp ? "bg-green-500" : "bg-red-500"
                    )}
                  >
                    <span className="text-[11px] font-bold text-white">
                      {isUp ? "+" : ""}{m.chg.toFixed(2)}%
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
