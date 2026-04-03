import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Star, ChevronUp, ChevronDown, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { useWalletStore } from "@/store/useWalletStore";
import { getWalletMarketTab } from "@/lib/walletMarket";
import { useSettingsStore, convertFromUsd, getCurrencySymbol, FIAT_CURRENCIES } from "@/store/useSettingsStore";

import { MobileWalletSheet } from "@/components/mobile/MobileWalletSheet";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { MobileBaseMarket } from "@/components/mobile/MobileBaseMarket";
import { MobileNetworksExplorer } from "@/components/mobile/MobileNetworksExplorer";
import { MobileCoinVote } from "@/components/mobile/MobileCoinVote";
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

function fmtShort(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000)     return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)         return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)             return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function normalise(m: any): MktRow {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const vol   = parseFloat(m.volume24h ?? m.volume) || 0;
  const cap   = parseFloat(m.marketCap ?? m.market_cap) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  return { symbol: m.symbol ?? `${base}-${quote}`, base, quote, price, chg, vol, cap, type };
}

interface MktRow { symbol: string; base: string; quote: string; price: number; chg: number; vol: number; cap: number; type: string; }

type SortKey = "base" | "price" | "chg";
type SortDir = "asc" | "desc";
type UsdSub  = "USDT" | "USDC" | "TUSD" | "USDD";

const USD_SUBS: UsdSub[] = ["USDT", "USDC", "TUSD", "USDD"];

const STABLE_MOCK: Record<UsdSub, any[]> = {
  USDT: USDT_MARKETS, USDC: USDC_MARKETS, TUSD: TUSD_MARKETS, USDD: USDD_MARKETS,
};

type Cat = "favorites" | "new" | "chains" | "usd" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "base" | "linea" | "zk" | "scr" | "mnt" | "bch" | "bsv" | "sol" | "ai" | "meme" | "defi" | "futures" | "vote";

const CATS: { id: Cat; label: string }[] = [
  { id: "vote",      label: "🗳️ Vote" },
  { id: "favorites", label: "Favs" },
  { id: "new",       label: "NEW" },
  { id: "chains",    label: "🌐 Chains" },
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
  { id: "base",      label: "⬡ Base" },
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
  { id: "futures",   label: "Futures" },
];

/**
 * Always use mock data as the full pair list; enrich prices from API where available.
 * This ensures all pairs are visible even when the API DB only tracks a small subset.
 */
function getCatRows(cat: Cat, usdSub: UsdSub, livePrice: Map<string, MktRow>, favorites: Set<string>): MktRow[] {
  const enrich = (mock: any[]): MktRow[] =>
    mock.map(m => {
      const n = normalise(m);
      const live = livePrice.get(n.symbol);
      if (!live) return n;
      return { ...n, price: live.price, chg: live.chg, vol: live.vol };
    });

  const ALL_POOL = [
    ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
    ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
    ...AI_MARKETS, ...SOL_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
  ];

  switch (cat) {
    case "favorites": return enrich(ALL_POOL).filter(m => favorites.has(m.symbol));
    case "new":       return NEW_MARKETS.map(normalise);
    case "usd":       return enrich(STABLE_MOCK[usdSub]);
    case "btc":       return enrich(BTC_MARKETS);
    case "eth":       return enrich(ETH_MARKETS);
    case "bnb":       return enrich(BNB_MARKETS);
    case "matic":     return enrich(MATIC_MARKETS);
    case "avax":      return enrich(AVAX_MARKETS);
    case "arb":       return enrich(ARB_MARKETS);
    case "op":        return enrich(OP_MARKETS);
    case "ftm":       return enrich(FTM_MARKETS);
    case "cro":       return enrich(CRO_MARKETS);
    case "base":      return enrich(BASE_MARKETS);
    case "linea":     return enrich(LINEA_MARKETS);
    case "zk":        return enrich(ZK_MARKETS);
    case "scr":       return enrich(SCR_MARKETS);
    case "mnt":       return enrich(MNT_MARKETS);
    case "sol":       return enrich(SOL_MARKETS);
    case "bch":       return enrich(BCH_MARKETS);
    case "bsv":       return enrich(BSV_MARKETS);
    case "ai":        return enrich(AI_MARKETS);
    case "meme":      return enrich(MEME_MARKETS);
    case "defi":      return enrich(DEFI_MARKETS);
    case "futures":   return enrich(FUTURES_MARKETS);
    default:          return [];
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
  const [walletBannerDismissed, setWalletBannerDismissed] = useState(false);
  const prevAddressRef = useRef<string | null>(null);
  const handleBuy = (coin: string) => {
    setBuyCoin(coin);
    setBuyOpen(true);
  };
  const [walletSheetOpen, setWalletSheetOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const { address, network, chainId } = useWalletStore();

  /* Auto-switch to correct market category when wallet connects / chain changes */
  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = address;
    const { tab: walletCat, isAutoSelected } = getWalletMarketTab(address, network, chainId);
    if (isAutoSelected) {
      setCat(walletCat as Cat);
      setWalletBannerDismissed(false);
    } else if (!address && prev) {
      setCat("usd");
      setWalletBannerDismissed(false);
    }
  }, [address, network, chainId]);

  const { tab: walletCatTab, label: walletChainLabel, isAutoSelected: isWalletCat } = getWalletMarketTab(address, network, chainId);
  /* Show banner only when the visible tab is the wallet's auto-selected category */
  const showWalletBanner = isWalletCat && !walletBannerDismissed && cat === walletCatTab;

  const { data: apiData } = useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const livePrice = new Map<string, MktRow>(
    (apiData && Array.isArray(apiData) ? apiData : [])
      .map(normalise)
      .map((m: MktRow) => [m.symbol, m])
  );

  let rows = getCatRows(cat, usdSub, livePrice, favorites);

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
    <div className={cn("flex flex-col bg-background", (cat === "base" || cat === "chains" || cat === "vote") ? "h-full" : "h-full overflow-y-auto pb-24")}>
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/30">
        {/* Spot label + Search bar */}
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
                  isActive && isBsv ? "text-green-400 font-bold"
                  : isActive ? "text-foreground font-bold"
                  : isBsv ? "text-green-500/80 hover:text-green-400"
                  : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                {isBsv ? "⚡ BSV" : c.label}
                {isActive && !isBsv && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-full" />
                )}
                {isActive && isBsv && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-green-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Wallet-aware market banner */}
        {showWalletBanner && (
          <div className="mx-4 mt-2 mb-0 flex items-center gap-2 px-3 py-2.5 bg-primary/10 border border-primary/25 rounded-xl">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-primary leading-tight">Showing {walletChainLabel} Markets</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Auto-filtered for your wallet · tap any tab to browse all</p>
            </div>
            <button
              onClick={() => setWalletBannerDismissed(true)}
              className="text-muted-foreground p-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* BSV fastest settlement banner — mobile */}
        {cat === "bsv" && (
          <div className="mx-4 mt-2 mb-0 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/25 rounded-xl">
            <span className="text-base leading-none">⚡</span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-green-400 leading-tight">World's Fastest Settlement — BSV</p>
              <p className="text-[10px] text-green-300/60 leading-tight mt-0.5">On-chain in &lt;5s · ~$0.001 fee · No bridges</p>
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

      {/* ── Special full-screen views ── */}
      {cat === "chains" ? (
        <MobileNetworksExplorer />
      ) : cat === "base" ? (
        <MobileBaseMarket />
      ) : cat === "vote" ? (
        <MobileCoinVote />
      ) : (
        <>
          {/* ── Column headers ── aligned to match MexcRow exactly ── */}
          <div className="flex items-center px-4 py-2 border-b border-border/30 bg-background/80">
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
        </>
      )}
    </div>

    {walletSheetOpen && <MobileWalletSheet onClose={() => setWalletSheetOpen(false)} />}
    <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin={buyCoin} />
    </>
  );
}

const STABLE_QUOTE_SET = new Set(["USDT", "USDC", "TUSD", "USDD", "USD", "BUSD"]);

function MexcRow({
  m, isFav, onFav, onTrade, onBuy
}: { m: MktRow; isFav: boolean; onFav: () => void; onTrade: () => void; onBuy: () => void }) {
  const isUp = m.chg >= 0;
  const { quoteCurrency } = useSettingsStore();

  // Apply currency conversion only when the pair's quote is a stablecoin (price is in USD)
  const isStableQuote = STABLE_QUOTE_SET.has(m.quote);
  const isFiatTarget  = FIAT_CURRENCIES.some(c => c.code === quoteCurrency);
  const showConverted = isStableQuote && (isFiatTarget || ["BTC","ETH","BNB","SOL","BSV"].includes(quoteCurrency));

  const displayPrice = showConverted ? convertFromUsd(m.price, quoteCurrency) : m.price;
  const currSym      = showConverted ? getCurrencySymbol(quoteCurrency) : "";

  return (
    <div className="flex items-center px-4 py-[9px] active:bg-secondary/30 transition-colors">
      <button onClick={onFav} className="mr-2.5 shrink-0 self-start mt-1">
        <Star size={13} className={isFav ? "fill-green-400 text-green-400" : "text-muted-foreground/30"} />
      </button>

      <div className="flex-1 text-left min-w-0 flex flex-col gap-[2px]">
        <button onClick={onTrade} className="text-left">
          <div className="flex items-center gap-1">
            <span className="text-[14px] font-semibold text-foreground leading-tight">{m.base}</span>
            <span className="text-[12px] text-muted-foreground font-normal">/{m.quote}</span>
            {m.type === "futures" && (
              <span className="ml-1 text-[9px] font-bold text-green-400 bg-green-500/15 px-1 py-0.5 rounded border border-green-500/25">PERP</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-medium leading-none">
            <span>Vol {fmtShort(m.vol)}</span>
            {m.cap > 0 && (
              <>
                <span className="opacity-30">·</span>
                <span>Cap {fmtShort(m.cap)}</span>
              </>
            )}
          </div>
        </button>
        <ContractAddressBadge baseAsset={m.base} variant="inline" className="mt-[1px]" />
      </div>

      <button onClick={onTrade} className="text-right pr-3">
        <span className="text-[14px] font-semibold text-foreground tabular-nums leading-tight">
          {currSym}{fmt(displayPrice)}
        </span>
      </button>

      <button
        onClick={onBuy}
        className={cn(
          "px-2 py-[3px] rounded-md flex items-center justify-center shrink-0 tabular-nums",
          isUp
            ? "bg-green-500/15 text-green-400 border border-green-500/30"
            : "bg-red-500/15 text-red-400 border border-red-500/30"
        )}
      >
        <span className="text-[11px] font-bold leading-none">
          {isUp ? "+" : ""}{m.chg.toFixed(2)}%
        </span>
      </button>
    </div>
  );
}
