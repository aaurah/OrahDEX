import { useState, useEffect, useRef } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { useSEO } from "@/hooks/useSEO";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
  BASE_MARKETS, ZORA_MARKETS, LINEA_MARKETS, ZK_MARKETS, SCR_MARKETS, MNT_MARKETS,
  AI_MARKETS, SOL_MARKETS, MEME_MARKETS, DEFI_MARKETS, NEW_MARKETS,
  FUTURES_MARKETS,
} from "@/lib/mock-data";
import { formatPrice, formatVolume, cn } from "@/lib/utils";
import { Search, Star, ArrowRightLeft, CreditCard, Zap, TrendingUp, Wallet, X } from "lucide-react";
import { useLocation } from "wouter";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { useWalletStore } from "@/store/useWalletStore";
import { getWalletMarketTab } from "@/lib/walletMarket";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type UsdSub = "USDT" | "USDC" | "TUSD" | "USDD";
type Tab = "favorites" | "new" | "usd" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "base" | "zora" | "linea" | "zk" | "scr" | "mnt" | "bch" | "bsv" | "sol" | "ai" | "meme" | "defi" | "futures";

const USD_SUBS: { id: UsdSub; label: string }[] = [
  { id: "USDT", label: "USDT" },
  { id: "USDC", label: "USDC" },
  { id: "TUSD", label: "TUSD" },
  { id: "USDD", label: "USDD" },
];

const COIN_COLORS: Record<string, string> = {
  BSV:"#EAB308", BTC:"#F97316", ETH:"#8B5CF6", SOL:"#06B6D4",
  XRP:"#3B82F6", BNB:"#EAB308", ADA:"#2563EB", DOGE:"#EAB308",
  DOT:"#E11D48", AVAX:"#EF4444", MATIC:"#7C3AED", LINK:"#2563EB",
  UNI:"#EC4899", ATOM:"#6366F1", LTC:"#6B7280", BCH:"#22C55E",
  TRX:"#EF4444", NEAR:"#10B981", APT:"#06B6D4", ARB:"#60A5FA",
  OP:"#EF4444", SUI:"#3B82F6", INJ:"#2563EB", PEPE:"#22C55E",
  SHIB:"#F97316", MKR:"#22C55E", AAVE:"#7C3AED", CRV:"#F43F5E",
  FET:"#06B6D4", AGIX:"#7C3AED", OCEAN:"#2563EB", RNDR:"#F97316",
};

interface TabMeta { id: Tab; label: string; color: string; desc: string }
const TAB_META: TabMeta[] = [
  { id: "favorites", label: "★ Favorites", color: "text-green-400",   desc: "Your starred pairs" },
  { id: "new",       label: "NEW",          color: "text-green-400",   desc: "Recently listed" },
  { id: "usd",       label: "USD",          color: "text-blue-400",    desc: "Stablecoin markets" },
  { id: "btc",       label: "BTC",          color: "text-orange-400",  desc: "All pairs quoted in BTC" },
  { id: "eth",       label: "ETH",          color: "text-violet-400",  desc: "All pairs quoted in ETH" },
  { id: "bnb",       label: "BNB",          color: "text-green-400",  desc: "All pairs quoted in BNB · BSC" },
  { id: "matic",     label: "MATIC",        color: "text-purple-400",  desc: "All pairs quoted in MATIC · Polygon" },
  { id: "avax",      label: "AVAX",         color: "text-red-400",     desc: "All pairs quoted in AVAX · Avalanche" },
  { id: "arb",       label: "ARB",          color: "text-sky-400",     desc: "All pairs quoted in ARB · Arbitrum" },
  { id: "op",        label: "OP",           color: "text-red-400",     desc: "All pairs quoted in OP · Optimism" },
  { id: "ftm",       label: "FTM",          color: "text-blue-400",    desc: "All pairs quoted in FTM · Fantom" },
  { id: "cro",       label: "CRO",          color: "text-indigo-400",  desc: "All pairs quoted in CRO · Cronos" },
  { id: "base",      label: "BASE",         color: "text-blue-400",    desc: "Curated Base L2 pairs · Excludes Zora social coins" },
  { id: "zora",      label: "ZORA",         color: "text-pink-400",    desc: "Zora social / creator coins · Every post is a coin" },
  { id: "linea",     label: "LINEA",        color: "text-violet-400",  desc: "All pairs quoted in LINEA · MetaMask L2" },
  { id: "zk",        label: "ZK",           color: "text-indigo-300",  desc: "All pairs quoted in ZK · zkSync Era" },
  { id: "scr",       label: "SCROLL",       color: "text-orange-300",  desc: "All pairs quoted in SCR · Scroll L2" },
  { id: "mnt",       label: "MNT",          color: "text-teal-400",    desc: "All pairs quoted in MNT · Mantle L2" },
  { id: "sol",       label: "SOL",          color: "text-purple-400",  desc: "All pairs quoted in SOL · Solana" },
  { id: "bch",       label: "BCH",          color: "text-green-400",   desc: "All pairs quoted in Bitcoin Cash" },
  { id: "bsv",       label: "BSV",          color: "text-green-400",   desc: "All pairs quoted in BSV · On-chain settlement" },
  { id: "ai",        label: "AI",           color: "text-cyan-400",    desc: "Artificial Intelligence tokens" },
  { id: "meme",      label: "MEME",         color: "text-pink-400",    desc: "Meme tokens" },
  { id: "defi",      label: "DEFI",         color: "text-emerald-400", desc: "DeFi protocols" },
  { id: "futures",   label: "Futures",      color: "text-red-400",     desc: "Perpetual futures · Up to 100× leverage" },
];

function normalise(m: any): any {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const vol   = parseFloat(m.volume24h ?? m.volume) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  return { ...m, symbol: m.symbol ?? `${base}-${quote}`, baseAsset: base, quoteAsset: quote,
    lastPrice: price, priceChangePercent24h: chg, volume24h: vol, type };
}

function coinBadge(base: string) {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow"
      style={{ background: COIN_COLORS[base] ?? "#6B7280" }}
    >
      {base.slice(0, 2)}
    </div>
  );
}

const STABLE_MOCK: Record<UsdSub, any[]> = {
  USDT: USDT_MARKETS, USDC: USDC_MARKETS, TUSD: TUSD_MARKETS, USDD: USDD_MARKETS,
};

const ALL_MOCK = () => [
  ...USDT_MARKETS, ...USDC_MARKETS, ...TUSD_MARKETS, ...USDD_MARKETS,
  ...BSV_MARKETS, ...BTC_MARKETS, ...ETH_MARKETS, ...BCH_MARKETS,
  ...AI_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
].map(normalise);

export function Markets() {
  useSEO({
    title: "Crypto Markets — 226+ Trading Pairs",
    description: "Live cryptocurrency prices and markets on OrahDEX. Trade 226+ spot pairs including BTC, ETH, BSV, BCH, SOL, BNB and more with real-time CoinGecko data.",
    keywords: "crypto markets, bitcoin price, ethereum price, BSV price, live crypto prices, spot trading pairs, OrahDEX markets",
    url: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "OrahDEX Cryptocurrency Markets",
      "description": "Live cryptocurrency trading pairs on OrahDEX",
      "url": "https://orahdex.replit.app/"
    }
  });

  const { address, network, chainId } = useWalletStore();
  const [tab, setTab] = useState<Tab>("usd");
  const [usdSub, setUsdSub] = useState<UsdSub>("USDT");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoin, setBuyCoin] = useState("BSV");
  const [walletBannerDismissed, setWalletBannerDismissed] = useState(false);
  const prevAddressRef = useRef<string | null>(null);

  /* Auto-switch to the correct market tab when wallet connects or changes chain */
  useEffect(() => {
    const prev = prevAddressRef.current;
    prevAddressRef.current = address;
    const { tab: walletTab, isAutoSelected } = getWalletMarketTab(address, network, chainId);
    if (isAutoSelected) {
      setTab(walletTab as Tab);
      setWalletBannerDismissed(false);
    } else if (!address && prev) {
      // wallet disconnected — go back to USD
      setTab("usd");
      setWalletBannerDismissed(false);
    }
  }, [address, network, chainId]);

  const { tab: walletTab, label: walletChainLabel, isAutoSelected: isWalletTab } = getWalletMarketTab(address, network, chainId);
  /* Show banner only when the visible tab is the wallet's auto-selected tab */
  const showWalletBanner = isWalletTab && !walletBannerDismissed && tab === walletTab;

  const handleBuy = (coin: string) => {
    setBuyCoin(coin);
    setBuyOpen(true);
  };

  const [, navigate] = useLocation();

  const handleTrade = (href: string) => {
    navigate(href);
  };

  const { data: apiMarkets } = useGetMarkets({ query: { refetchInterval: 15_000 } });
  const raw = ((apiMarkets && apiMarkets.length > 0 ? apiMarkets : []) as any[]).map(normalise);

  /**
   * Build a symbol → live-price map from the API response.
   * Mock data always provides the FULL pair list; API prices enrich it.
   */
  const livePrice = new Map<string, any>(raw.map((m: any) => [m.symbol, m]));

  /** Enrich a mock pair list with live prices from the API where available. */
  const enrich = (mock: any[]): any[] =>
    mock.map(m => {
      const live = livePrice.get(m.symbol);
      if (!live) return m;
      return { ...m, lastPrice: live.lastPrice, priceChangePercent24h: live.priceChangePercent24h, volume24h: live.volume24h, marketCap: live.marketCap ?? m.marketCap };
    });

  function getMarkets(): any[] {
    switch (tab) {
      case "favorites": return enrich(ALL_MOCK()).filter(m => stars.has(m.symbol));
      case "new":       return NEW_MARKETS.map(normalise);
      case "usd":       return enrich(STABLE_MOCK[usdSub].map(normalise));
      case "btc":       return enrich(BTC_MARKETS.map(normalise));
      case "eth":       return enrich(ETH_MARKETS.map(normalise));
      case "bnb":       return enrich(BNB_MARKETS.map(normalise));
      case "matic":     return enrich(MATIC_MARKETS.map(normalise));
      case "avax":      return enrich(AVAX_MARKETS.map(normalise));
      case "arb":       return enrich(ARB_MARKETS.map(normalise));
      case "op":        return enrich(OP_MARKETS.map(normalise));
      case "ftm":       return enrich(FTM_MARKETS.map(normalise));
      case "cro":       return enrich(CRO_MARKETS.map(normalise));
      case "base":      return enrich(BASE_MARKETS.map(normalise));
      case "zora":      return enrich(ZORA_MARKETS.map(normalise));
      case "linea":     return enrich(LINEA_MARKETS.map(normalise));
      case "zk":        return enrich(ZK_MARKETS.map(normalise));
      case "scr":       return enrich(SCR_MARKETS.map(normalise));
      case "mnt":       return enrich(MNT_MARKETS.map(normalise));
      case "sol":       return enrich(SOL_MARKETS.map(normalise));
      case "bch":       return enrich(BCH_MARKETS.map(normalise));
      case "bsv":       return enrich(BSV_MARKETS.map(normalise));
      case "ai":        return enrich(AI_MARKETS.map(normalise));
      case "meme":      return enrich(MEME_MARKETS.map(normalise));
      case "defi":      return enrich(DEFI_MARKETS.map(normalise));
      case "futures":   return enrich(FUTURES_MARKETS.map(normalise));
      default:          return [];
    }
  }

  function tabCount(t: Tab): number {
    switch (t) {
      case "favorites": return ALL_MOCK().filter(m => stars.has(m.symbol)).length;
      case "new":       return NEW_MARKETS.length;
      case "usd":       return STABLE_MOCK[usdSub].length;
      case "btc":       return BTC_MARKETS.length;
      case "eth":       return ETH_MARKETS.length;
      case "bnb":       return BNB_MARKETS.length;
      case "matic":     return MATIC_MARKETS.length;
      case "avax":      return AVAX_MARKETS.length;
      case "arb":       return ARB_MARKETS.length;
      case "op":        return OP_MARKETS.length;
      case "ftm":       return FTM_MARKETS.length;
      case "cro":       return CRO_MARKETS.length;
      case "base":      return BASE_MARKETS.length;
      case "zora":      return ZORA_MARKETS.length;
      case "linea":     return LINEA_MARKETS.length;
      case "zk":        return ZK_MARKETS.length;
      case "scr":       return SCR_MARKETS.length;
      case "mnt":       return MNT_MARKETS.length;
      case "sol":       return SOL_MARKETS.length;
      case "bch":       return BCH_MARKETS.length;
      case "bsv":       return BSV_MARKETS.length;
      case "ai":        return AI_MARKETS.length;
      case "meme":      return MEME_MARKETS.length;
      case "defi":      return DEFI_MARKETS.length;
      case "futures":   return FUTURES_MARKETS.length;
      default:          return 0;
    }
  }

  const markets  = getMarkets();
  const filtered = markets.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    (m.baseAsset ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const toggleStar = (symbol: string) =>
    setStars(prev => { const n = new Set(prev); n.has(symbol) ? n.delete(symbol) : n.add(symbol); return n; });

  const meta = TAB_META.find(t => t.id === tab)!;
  const isCrossQuote = ["bsv","btc","eth","bnb","matic","avax","arb","op","ftm","cro","bch"].includes(tab);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-0 pb-4 border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto">
          {/* Main tabs — slim Poloniex-style */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {TAB_META.map(t => {
              const isBsv    = t.id === "bsv";
              const isFav    = t.id === "favorites";
              const isUsd    = t.id === "usd";
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setSearch(""); }}
                  style={isBsv && !isActive ? { animation: "bsv-glow 2.5s ease-in-out infinite" } : undefined}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all border",
                    isActive && isFav
                      ? "bg-green-500 text-black border-green-400 shadow shadow-green-500/30"
                      : isActive && isBsv
                      ? "bg-green-500 text-black border-green-400 shadow shadow-green-500/30"
                      : isActive && isUsd
                      ? "bg-primary text-primary-foreground border-primary shadow shadow-primary/20"
                      : isActive
                      ? "bg-primary/90 text-primary-foreground border-primary shadow shadow-primary/20"
                      : isFav
                      ? "text-green-400 border-green-500/40 bg-green-500/8 hover:bg-green-500/15"
                      : isBsv
                      ? "text-green-400 border-green-500/40 bg-green-500/8 hover:bg-green-500/15"
                      : "text-muted-foreground border-border/50 hover:border-primary/30 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {isBsv && <span className="text-[11px] leading-none">⚡</span>}
                  {isFav && <Star className="w-2.5 h-2.5" />}
                  <span>{isFav ? "Favorites" : t.label}</span>
                  <span className={cn(
                    "text-[9px] font-black px-1 py-px rounded min-w-[16px] text-center",
                    (isActive && (isFav || isBsv)) ? "bg-black/20 text-black"
                    : isActive ? "bg-white/20 text-white"
                    : isFav || isBsv ? "bg-green-500/20 text-green-300"
                    : "bg-white/8 text-muted-foreground"
                  )}>
                    {tabCount(t.id)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Wallet-aware market banner */}
          {showWalletBanner && (
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-xl">
              <Wallet className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary">
                  Showing {walletChainLabel} Markets
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Markets automatically filtered for your connected {walletChainLabel} wallet. You can switch to any tab manually.
                </p>
              </div>
              <button
                onClick={() => setWalletBannerDismissed(true)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* BSV fastest settlement callout */}
          {tab === "bsv" && (
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-green-500/10 border border-green-500/30 rounded-xl">
              <span className="text-xl leading-none">⚡</span>
              <div>
                <p className="text-xs font-bold text-green-400">BSV — World's Fastest Settlement Chain</p>
                <p className="text-[11px] text-green-300/70 mt-0.5">Every OrahDEX trade settles instantly on-chain via BSV. No bridges. No Layer 2s. True finality in seconds.</p>
              </div>
              <div className="ml-auto flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className="text-[10px] text-green-500/60 uppercase tracking-wider">Settlement</p>
                  <p className="text-sm font-black text-green-400">&lt; 5s</p>
                </div>
                <div className="w-px h-8 bg-green-500/20" />
                <div className="text-center">
                  <p className="text-[10px] text-green-500/60 uppercase tracking-wider">Fees</p>
                  <p className="text-sm font-black text-green-400">~$0.001</p>
                </div>
              </div>
            </div>
          )}

          {/* BASE curated notice */}
          {tab === "base" && (
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <span className="text-xl leading-none">🔵</span>
              <div>
                <p className="text-xs font-bold text-blue-400">Base L2 — Curated Pairs Only</p>
                <p className="text-[11px] text-blue-300/70 mt-0.5">Showing verified Base-native tokens (AERO, BRETT, TOSHI, DEGEN…) and bridged blue-chips. Zora social/creator coins are listed separately under the ZORA tab.</p>
              </div>
            </div>
          )}

          {/* ZORA social coins notice */}
          {tab === "zora" && (
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-pink-500/10 border border-pink-500/30 rounded-xl">
              <span className="text-xl leading-none">🎨</span>
              <div>
                <p className="text-xs font-bold text-pink-400">Zora Social Coins — Creator Economy</p>
                <p className="text-[11px] text-pink-300/70 mt-0.5">On Zora Network, every post, photo, or artwork mints a tradeable ERC-20 coin. Sorted by 24h volume. Extremely high volatility — trade carefully.</p>
              </div>
              <div className="ml-auto shrink-0">
                <span className="px-2 py-1 rounded-lg bg-pink-500/20 border border-pink-500/30 text-[10px] font-bold text-pink-400 uppercase tracking-wider">High Risk</span>
              </div>
            </div>
          )}

          {/* USD sub-tabs */}
          {tab === "usd" && (
            <div className="flex items-center gap-2 mt-3">
              {USD_SUBS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setUsdSub(s.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold border transition-all",
                    usdSub === s.id
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                      : "text-muted-foreground border-border hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {s.label}
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-1">
                · {STABLE_MOCK[usdSub].length} pairs
              </span>
            </div>
          )}

          {/* Search + descriptor + Buy row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={tab === "usd" ? `Search ${usdSub} pairs…` : `Search ${meta.label} pairs…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-border rounded-xl">
              <Zap className={cn("w-3.5 h-3.5", meta.color)} />
              <span className="text-xs font-semibold text-foreground/70">
                {tab === "usd" ? `All pairs quoted in ${usdSub}` : meta.desc}
                {" · "}<span className={meta.color}>{filtered.length} markets</span>
              </span>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => handleBuy("BSV")}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg"
              >
                <CreditCard className="w-4 h-4" />
                Buy Crypto
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4">
          <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Pair</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">24h %</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h High</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h Low</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Volume 24h</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Market Cap</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => {
                  const base  = m.baseAsset ?? m.symbol.split(/[-/]/)[0];
                  const quote = m.quoteAsset ?? m.symbol.split(/[-/]/)[1];
                  const price = parseFloat(m.lastPrice) || 0;
                  const chg   = parseFloat(m.priceChangePercent24h) || 0;
                  const isUp  = chg >= 0;
                  const tradeHref = tab === "futures"
                    ? `/futures/${m.symbol.replace(/\//g, "-")}`
                    : `/trade/${m.symbol.replace(/\//g, "-")}`;

                  return (
                    <tr key={m.symbol} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleStar(m.symbol)} className="text-muted-foreground hover:text-green-400 transition-colors">
                          <Star className={cn("w-3.5 h-3.5", stars.has(m.symbol) && "fill-green-400 text-green-400")} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground/50 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {coinBadge(base)}
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-foreground">{base}</span>
                            <span className="text-muted-foreground text-xs">/{quote}</span>
                            {tab === "futures" && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">PERP</span>
                            )}
                            {tab === "new" && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">NEW</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold">
                        {formatPrice(price)}
                        {isCrossQuote && (
                          <span className="text-[10px] text-muted-foreground ml-1">{quote}</span>
                        )}
                      </td>
                      <td className={cn("px-4 py-3.5 text-right font-mono text-sm font-semibold", isUp ? "text-green-400" : "text-red-400")}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {formatPrice(parseFloat(m.high24h) || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {formatPrice(parseFloat(m.low24h) || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
                        {formatVolume(parseFloat(m.volume24h) || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
                        {m.marketCap ? formatVolume(parseFloat(m.marketCap) || 0) : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleBuy(base)}
                            className="inline-flex items-center gap-0.5 bg-white/5 text-muted-foreground border border-border px-2 py-1 rounded-md font-semibold text-[10px] hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <CreditCard className="w-2.5 h-2.5" /> Buy
                          </button>
                          <button
                            onClick={() => handleTrade(tradeHref)}
                            className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1 rounded-md font-bold text-[11px] hover:brightness-110 transition-all active:scale-95"
                          >
                            <TrendingUp className="w-3 h-3" /> Trade
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-muted-foreground text-sm">
                      {search ? `No results for "${search}"` : tab === "favorites" ? "Star pairs to see them here" : "Loading markets…"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground/50 mt-3 text-center">
            Live prices via CoinGecko · On-chain settlement via Bitcoin SV · 0.1% maker fee
          </p>
        </div>
      </div>

      <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin={buyCoin} />
    </div>
  );
}
