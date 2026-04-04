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
  GAMING_MARKETS, COSMOS_MARKETS, L1_MARKETS, L2_MARKETS,
  RWA_MARKETS, EXCHANGE_MARKETS, DEPIN_MARKETS, BRC20_MARKETS,
  UNISWAP_MARKETS, PANCAKE_MARKETS,
} from "@/lib/mock-data";
import { formatPrice, formatVolume, cn } from "@/lib/utils";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { Search, Star, ArrowRightLeft, CreditCard, Zap, TrendingUp, Wallet, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { useWalletStore } from "@/store/useWalletStore";
import { getWalletMarketTab } from "@/lib/walletMarket";
import { AiInsightsBar } from "@/components/AiInsightsBar";
import { useSettingsStore, convertFromUsd, getCurrencySymbol, FIAT_CURRENCIES } from "@/store/useSettingsStore";
import { useWalletPrices } from "@/hooks/useWalletPrices";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type UsdSub = "USDT" | "USDC" | "TUSD" | "USDD";
type Tab = "favorites" | "new" | "usd" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "base" | "zora" | "linea" | "zk" | "scr" | "mnt" | "bch" | "bsv" | "sol" | "ai" | "meme" | "defi" | "uniswap" | "pancake" | "futures" | "l1" | "l2" | "gaming" | "cosmos" | "rwa" | "exchange" | "depin" | "brc20";

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
  { id: "bsv",       label: "BSV",          color: "text-green-400",   desc: "All pairs quoted in BSV · On-chain settlement" },
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
  { id: "ai",        label: "AI",           color: "text-cyan-400",    desc: "Artificial Intelligence tokens" },
  { id: "depin",     label: "DePIN",        color: "text-teal-400",    desc: "Decentralized Physical Infrastructure · compute, storage, wireless" },
  { id: "meme",      label: "MEME",         color: "text-pink-400",    desc: "Meme tokens" },
  { id: "defi",      label: "DEFI",         color: "text-emerald-400", desc: "DeFi protocols · DEXs, lending, yield" },
  { id: "uniswap",   label: "UNISWAP",      color: "text-pink-400",    desc: "Uniswap v2 & v3 pools · Ethereum + multi-chain" },
  { id: "pancake",   label: "PANCAKE",      color: "text-yellow-400",  desc: "PancakeSwap v2 & v3 · BNB Smart Chain + multi-chain" },
  { id: "gaming",    label: "GAMING",       color: "text-violet-400",  desc: "Gaming & Metaverse · P2E, NFT games, virtual worlds" },
  { id: "cosmos",    label: "COSMOS",       color: "text-purple-400",  desc: "Cosmos IBC ecosystem · app-chains, DEXs, data availability" },
  { id: "l1",        label: "LAYER 1",      color: "text-amber-400",   desc: "Layer 1 blockchains · all major base chains" },
  { id: "l2",        label: "LAYER 2",      color: "text-sky-400",     desc: "Layer 2 scaling · rollups, bridges, interop" },
  { id: "rwa",       label: "RWA",          color: "text-yellow-400",  desc: "Real World Assets · tokenized gold, T-bills, real estate" },
  { id: "exchange",  label: "EXCHANGE",     color: "text-orange-400",  desc: "Exchange tokens · CEX utility & governance tokens" },
  { id: "brc20",     label: "BRC-20",       color: "text-orange-400",  desc: "BRC-20 tokens & Bitcoin Ordinals · on-chain Bitcoin assets" },
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
  ...AI_MARKETS, ...DEPIN_MARKETS, ...MEME_MARKETS, ...DEFI_MARKETS,
  ...UNISWAP_MARKETS, ...PANCAKE_MARKETS,
  ...BASE_MARKETS, ...ZORA_MARKETS,
  ...GAMING_MARKETS, ...COSMOS_MARKETS, ...L1_MARKETS, ...L2_MARKETS,
  ...RWA_MARKETS, ...EXCHANGE_MARKETS, ...BRC20_MARKETS,
].map(normalise);

export function Markets() {
  useSEO({
    title: "Crypto Markets — 500+ Trading Pairs · Every Coin",
    description: "Trade every cryptocurrency on OrahDEX — 500+ spot pairs across BTC, ETH, SOL, all Layer 1s, Layer 2s, DeFi, Gaming, Cosmos, AI/DePIN, Meme, RWA, BRC-20 & more. Live prices from CoinGecko.",
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
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [tabCanScrollLeft, setTabCanScrollLeft] = useState(false);
  const [tabCanScrollRight, setTabCanScrollRight] = useState(true);

  function updateTabScrollState() {
    const el = tabScrollRef.current;
    if (!el) return;
    setTabCanScrollLeft(el.scrollLeft > 4);
    setTabCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  function scrollTabsBy(delta: number) {
    const el = tabScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
    setTimeout(updateTabScrollState, 350);
  }

  /* Initialize tab scroll state after mount */
  useEffect(() => {
    updateTabScrollState();
    const el = tabScrollRef.current;
    if (!el) return;
    const onResize = () => updateTabScrollState();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  /** Live markets from API grouped by quote asset (for full pair display). */
  const liveByQuote = (quote: string) => {
    const live = raw.filter(m => m.quoteAsset === quote && m.type !== "futures");
    return live.length > 0 ? live : null;
  };
  const liveBsv   = liveByQuote("BSV");
  const liveBtc   = liveByQuote("BTC");
  const liveEth   = liveByQuote("ETH");
  const liveBnb   = liveByQuote("BNB");
  const liveBch   = liveByQuote("BCH");
  const liveMatic = liveByQuote("MATIC");
  const liveAvax  = liveByQuote("AVAX");
  const liveArb   = liveByQuote("ARB");
  const liveOp    = liveByQuote("OP");
  const liveFtm   = liveByQuote("FTM");
  const liveCro   = liveByQuote("CRO");

  function getMarkets(): any[] {
    switch (tab) {
      case "favorites": {
        const favLive = raw.filter(m => stars.has(m.symbol));
        return favLive.length > 0 ? favLive : enrich(ALL_MOCK()).filter(m => stars.has(m.symbol));
      }
      case "new":       return NEW_MARKETS.map(normalise);
      case "usd": {
        /* Use live API data when available — shows ALL pairs in DB */
        const live = raw.filter(m => m.quoteAsset === usdSub && m.type !== "futures");
        return live.length > 0 ? live : enrich(STABLE_MOCK[usdSub].map(normalise));
      }
      case "btc":       return liveBtc ?? enrich(BTC_MARKETS.map(normalise));
      case "eth":       return liveEth ?? enrich(ETH_MARKETS.map(normalise));
      case "bnb":       return liveBnb ?? enrich(BNB_MARKETS.map(normalise));
      case "matic":     return liveMatic ?? enrich(MATIC_MARKETS.map(normalise));
      case "avax":      return liveAvax  ?? enrich(AVAX_MARKETS.map(normalise));
      case "arb":       return liveArb   ?? enrich(ARB_MARKETS.map(normalise));
      case "op":        return liveOp    ?? enrich(OP_MARKETS.map(normalise));
      case "ftm":       return liveFtm   ?? enrich(FTM_MARKETS.map(normalise));
      case "cro":       return liveCro   ?? enrich(CRO_MARKETS.map(normalise));
      case "base":      return enrich(BASE_MARKETS.map(normalise));
      case "zora":      return enrich(ZORA_MARKETS.map(normalise));
      case "linea":     return enrich(LINEA_MARKETS.map(normalise));
      case "zk":        return enrich(ZK_MARKETS.map(normalise));
      case "scr":       return enrich(SCR_MARKETS.map(normalise));
      case "mnt":       return enrich(MNT_MARKETS.map(normalise));
      case "sol":       return enrich(SOL_MARKETS.map(normalise));
      case "bch":       return liveBch ?? enrich(BCH_MARKETS.map(normalise));
      case "bsv":       return liveBsv ?? enrich(BSV_MARKETS.map(normalise));
      case "ai":        return enrich(AI_MARKETS.map(normalise));
      case "depin":     return enrich(DEPIN_MARKETS.map(normalise));
      case "meme":      return enrich(MEME_MARKETS.map(normalise));
      case "defi":      return enrich(DEFI_MARKETS.map(normalise));
      case "uniswap":   return enrich(UNISWAP_MARKETS.map(normalise));
      case "pancake":   return enrich(PANCAKE_MARKETS.map(normalise));
      case "gaming":    return enrich(GAMING_MARKETS.map(normalise));
      case "cosmos":    return enrich(COSMOS_MARKETS.map(normalise));
      case "l1":        return enrich(L1_MARKETS.map(normalise));
      case "l2":        return enrich(L2_MARKETS.map(normalise));
      case "rwa":       return enrich(RWA_MARKETS.map(normalise));
      case "exchange":  return enrich(EXCHANGE_MARKETS.map(normalise));
      case "brc20":     return enrich(BRC20_MARKETS.map(normalise));
      case "futures":   return enrich(FUTURES_MARKETS.map(normalise));
      default:          return [];
    }
  }

  function tabCount(t: Tab): number {
    const liveCount = (q: string) => raw.filter(m => m.quoteAsset === q && m.type !== "futures").length;
    switch (t) {
      case "favorites": return raw.filter(m => stars.has(m.symbol)).length || ALL_MOCK().filter(m => stars.has(m.symbol)).length;
      case "new":       return NEW_MARKETS.length;
      case "usd":       return liveCount(usdSub) || STABLE_MOCK[usdSub].length;
      case "btc":       return liveCount("BTC") || BTC_MARKETS.length;
      case "eth":       return liveCount("ETH") || ETH_MARKETS.length;
      case "bnb":       return liveCount("BNB") || BNB_MARKETS.length;
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
      case "bch":       return liveCount("BCH") || BCH_MARKETS.length;
      case "bsv":       return liveCount("BSV") || BSV_MARKETS.length;
      case "ai":        return AI_MARKETS.length;
      case "depin":     return DEPIN_MARKETS.length;
      case "meme":      return MEME_MARKETS.length;
      case "defi":      return DEFI_MARKETS.length;
      case "uniswap":   return UNISWAP_MARKETS.length;
      case "pancake":   return PANCAKE_MARKETS.length;
      case "gaming":    return GAMING_MARKETS.length;
      case "cosmos":    return COSMOS_MARKETS.length;
      case "l1":        return L1_MARKETS.length;
      case "l2":        return L2_MARKETS.length;
      case "rwa":       return RWA_MARKETS.length;
      case "exchange":  return EXCHANGE_MARKETS.length;
      case "brc20":     return BRC20_MARKETS.length;
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

  const { quoteCurrency } = useSettingsStore();
  const isFiatTarget = FIAT_CURRENCIES.some(c => c.code === quoteCurrency);
  const isCryptoQuoteCurrency = ["BTC","ETH","BNB","SOL","BSV"].includes(quoteCurrency);
  const qSym = getCurrencySymbol(quoteCurrency);

  /* ── Cross-rate: BTC price & BSV price for every row ── */
  const { prices: liveCrossRates } = useWalletPrices();
  const BTC_USD = liveCrossRates.BTC.usd || 83000;
  const BSV_USD = liveCrossRates.BSV.usd || 14;
  const ETH_USD = liveCrossRates.ETH.usd || 1800;

  const QUOTE_USD: Record<string, number> = {
    USDT: 1, USDC: 1, TUSD: 1, USDD: 1, FDUSD: 1,
    BTC: BTC_USD, ETH: ETH_USD, BSV: BSV_USD,
    BNB: 580, BCH: 320, SOL: 130, MATIC: 0.32,
    AVAX: 18, ARB: 0.42, OP: 0.70, FTM: 0.51,
    CRO: 0.085, TRX: 0.24, DOT: 6.8, ATOM: 4.2,
    NEAR: 2.4, SUI: 2.2, APT: 5.0, INJ: 16,
    XRP: 0.52, ADA: 0.44, DOGE: 0.12, LINK: 14.5,
    UNI: 6.2, SAND: 0.25, MANA: 0.25,
  };

  function toUSD(price: number, quoteAsset: string): number {
    return price * (QUOTE_USD[quoteAsset] ?? 1);
  }

  function fmtBTC(usd: number): string {
    if (!usd) return "—";
    const v = usd / BTC_USD;
    if (v >= 1)      return v.toFixed(4);
    if (v >= 0.001)  return v.toFixed(6);
    return v.toFixed(8);
  }

  function fmtBSV(usd: number): string {
    if (!usd) return "—";
    const v = usd / BSV_USD;
    if (v >= 1000)  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (v >= 1)     return v.toFixed(4);
    if (v >= 0.001) return v.toFixed(6);
    return v.toFixed(8);
  }

  const meta = TAB_META.find(t => t.id === tab)!;
  const isCrossQuote = ["bsv","btc","eth","bnb","matic","avax","arb","op","ftm","cro","bch"].includes(tab);
  // Apply fiat/crypto conversion only for USD-quoted tabs (not cross-rate tabs)
  const applyQConversion = !isCrossQuote && (isFiatTarget || isCryptoQuoteCurrency) && quoteCurrency !== "USDT" && quoteCurrency !== "USDC";

  function qPrice(p: number): string {
    if (!p) return "—";
    if (!applyQConversion) return formatPrice(p);
    const c = convertFromUsd(p, quoteCurrency);
    if (c >= 10000) return c.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (c >= 1)     return c.toFixed(2);
    if (c >= 0.01)  return c.toFixed(4);
    if (c >= 0.0001) return c.toFixed(6);
    return c.toFixed(8);
  }

  return (
    <div className="flex flex-col h-full">
      {/* AI Insights banner */}
      <AiInsightsBar />

      {/* Header */}
      <div className="px-6 lg:px-10 pt-0 pb-4 border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto">
          {/* Main tabs — slim Poloniex-style with desktop scroll arrows */}
          <div className="mt-3 relative flex items-center gap-0">
            {/* Left arrow — desktop only */}
            <button
              onClick={() => scrollTabsBy(-240)}
              className={cn(
                "hidden md:flex shrink-0 items-center justify-center w-7 h-7 rounded-lg border border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10 transition-all mr-1",
                !tabCanScrollLeft && "opacity-30 pointer-events-none"
              )}
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Scrollable tab row */}
            <div
              ref={tabScrollRef}
              onScroll={updateTabScrollState}
              className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide flex-1"
            >
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

            {/* Right arrow — desktop only */}
            <button
              onClick={() => scrollTabsBy(240)}
              className={cn(
                "hidden md:flex shrink-0 items-center justify-center w-7 h-7 rounded-lg border border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10 transition-all ml-1",
                !tabCanScrollRight && "opacity-30 pointer-events-none"
              )}
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
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
                · {tabCount("usd")} pairs
              </span>
            </div>
          )}

          {/* Search + descriptor row */}
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
                  <th className="px-4 py-3 text-right hidden xl:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <span className="w-3 h-3 rounded-full inline-block" style={{background:"#F97316"}} />
                      BTC Price
                    </span>
                  </th>
                  <th className="px-4 py-3 text-right hidden xl:table-cell">
                    <span className="flex items-center justify-end gap-1">
                      <span className="w-3 h-3 rounded-full inline-block" style={{background:"#EAB308"}} />
                      BSV Price
                    </span>
                  </th>
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

                  const priceUSD = toUSD(price, quote);
                  const btcCellVal = base === "BTC" ? "1 BTC" : fmtBTC(priceUSD);
                  const bsvCellVal = base === "BSV" ? "1 BSV" : fmtBSV(priceUSD);

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
                          <div className="flex flex-col gap-0.5">
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
                            <ContractAddressBadge
                              baseAsset={base}
                              dbAddresses={(m as any).contractAddresses}
                              variant="full"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold">
                        {applyQConversion && <span className="text-muted-foreground/60 text-[10px] mr-0.5">{qSym}</span>}
                        {qPrice(price)}
                        {isCrossQuote && !applyQConversion && (
                          <span className="text-[10px] text-muted-foreground ml-1">{quote}</span>
                        )}
                      </td>
                      <td className={cn("px-4 py-3.5 text-right font-mono text-sm font-semibold", isUp ? "text-green-400" : "text-red-400")}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs hidden xl:table-cell">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-orange-400 font-semibold tabular-nums">{btcCellVal}</span>
                          <span className="text-muted-foreground/50 text-[10px]">BTC</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs hidden xl:table-cell">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-yellow-400 font-semibold tabular-nums">{bsvCellVal}</span>
                          <span className="text-muted-foreground/50 text-[10px]">BSV</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {qPrice(parseFloat(m.high24h) || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {qPrice(parseFloat(m.low24h) || 0)}
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
                    <td colSpan={12} className="py-16 text-center text-muted-foreground text-sm">
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
