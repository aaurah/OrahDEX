import { useState } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { useSEO } from "@/hooks/useSEO";
import {
  USDT_MARKETS, USDC_MARKETS, TUSD_MARKETS, USDD_MARKETS,
  BSV_MARKETS, BTC_MARKETS, ETH_MARKETS, BCH_MARKETS, BNB_MARKETS,
  MATIC_MARKETS, AVAX_MARKETS, ARB_MARKETS, OP_MARKETS, FTM_MARKETS, CRO_MARKETS,
  AI_MARKETS, SOL_MARKETS, MEME_MARKETS, DEFI_MARKETS, NEW_MARKETS,
  FUTURES_MARKETS,
} from "@/lib/mock-data";
import { formatPrice, formatVolume, cn } from "@/lib/utils";
import { Search, Star, ArrowRightLeft, CreditCard, Zap } from "lucide-react";
import { Link } from "wouter";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type UsdSub = "USDT" | "USDC" | "TUSD" | "USDD";
type Tab = "favorites" | "new" | "usd" | "btc" | "eth" | "bnb" | "matic" | "avax" | "arb" | "op" | "ftm" | "cro" | "bch" | "bsv" | "ai" | "meme" | "defi" | "futures";

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
  { id: "favorites", label: "★ Favorites", color: "text-amber-400",   desc: "Your starred pairs" },
  { id: "new",       label: "NEW",          color: "text-green-400",   desc: "Recently listed" },
  { id: "usd",       label: "USD",          color: "text-blue-400",    desc: "Stablecoin markets" },
  { id: "btc",       label: "BTC",          color: "text-orange-400",  desc: "All pairs quoted in BTC" },
  { id: "eth",       label: "ETH",          color: "text-violet-400",  desc: "All pairs quoted in ETH" },
  { id: "bnb",       label: "BNB",          color: "text-yellow-400",  desc: "All pairs quoted in BNB · BSC" },
  { id: "matic",     label: "MATIC",        color: "text-purple-400",  desc: "All pairs quoted in MATIC · Polygon" },
  { id: "avax",      label: "AVAX",         color: "text-red-400",     desc: "All pairs quoted in AVAX · Avalanche" },
  { id: "arb",       label: "ARB",          color: "text-sky-400",     desc: "All pairs quoted in ARB · Arbitrum" },
  { id: "op",        label: "OP",           color: "text-red-400",     desc: "All pairs quoted in OP · Optimism" },
  { id: "ftm",       label: "FTM",          color: "text-blue-400",    desc: "All pairs quoted in FTM · Fantom" },
  { id: "cro",       label: "CRO",          color: "text-indigo-400",  desc: "All pairs quoted in CRO · Cronos" },
  { id: "bch",       label: "BCH",          color: "text-green-400",   desc: "All pairs quoted in Bitcoin Cash" },
  { id: "bsv",       label: "BSV",          color: "text-amber-400",   desc: "All pairs quoted in BSV · On-chain settlement" },
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

  const [tab, setTab] = useState<Tab>("usd");
  const [usdSub, setUsdSub] = useState<UsdSub>("USDT");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoin, setBuyCoin] = useState("BSV");
  const handleBuy = (coin: string) => {
    setBuyCoin(coin);
    setBuyOpen(true);
  };

  const { data: apiMarkets } = useGetMarkets();
  const raw = ((apiMarkets && apiMarkets.length > 0 ? apiMarkets : []) as any[]).map(normalise);
  const hasApi = raw.length > 0;

  function getMarkets(): any[] {
    switch (tab) {
      case "favorites": return (hasApi ? raw : ALL_MOCK()).filter(m => stars.has(m.symbol));
      case "new":       return NEW_MARKETS.map(normalise);
      case "usd":       return hasApi
        ? raw.filter(m => m.quoteAsset === usdSub && m.type === "spot")
        : STABLE_MOCK[usdSub].map(normalise);
      case "btc":       return hasApi ? raw.filter(m => m.quoteAsset === "BTC")   : BTC_MARKETS.map(normalise);
      case "eth":       return hasApi ? raw.filter(m => m.quoteAsset === "ETH")   : ETH_MARKETS.map(normalise);
      case "bnb":       return hasApi ? raw.filter(m => m.quoteAsset === "BNB")   : BNB_MARKETS.map(normalise);
      case "matic":     return hasApi ? raw.filter(m => m.quoteAsset === "MATIC") : MATIC_MARKETS.map(normalise);
      case "avax":      return hasApi ? raw.filter(m => m.quoteAsset === "AVAX")  : AVAX_MARKETS.map(normalise);
      case "arb":       return hasApi ? raw.filter(m => m.quoteAsset === "ARB")   : ARB_MARKETS.map(normalise);
      case "op":        return hasApi ? raw.filter(m => m.quoteAsset === "OP")    : OP_MARKETS.map(normalise);
      case "ftm":       return hasApi ? raw.filter(m => m.quoteAsset === "FTM")   : FTM_MARKETS.map(normalise);
      case "cro":       return hasApi ? raw.filter(m => m.quoteAsset === "CRO")   : CRO_MARKETS.map(normalise);
      case "bch":       return hasApi ? raw.filter(m => m.quoteAsset === "BCH")   : BCH_MARKETS.map(normalise);
      case "bsv":       return hasApi ? raw.filter(m => m.quoteAsset === "BSV")   : BSV_MARKETS.map(normalise);
      case "ai":        return AI_MARKETS.map(normalise);
      case "meme":      return MEME_MARKETS.map(normalise);
      case "defi":      return DEFI_MARKETS.map(normalise);
      case "futures":   return hasApi ? raw.filter(m => m.type === "futures")     : FUTURES_MARKETS.map(normalise);
      default:          return [];
    }
  }

  function tabCount(t: Tab): number {
    switch (t) {
      case "favorites": return (hasApi ? raw : ALL_MOCK()).filter(m => stars.has(m.symbol)).length;
      case "new":       return NEW_MARKETS.length;
      case "usd":       return hasApi
        ? raw.filter(m => ["USDT","USDC","TUSD","USDD"].includes(m.quoteAsset) && m.type === "spot").length
        : USDT_MARKETS.length + USDC_MARKETS.length + TUSD_MARKETS.length + USDD_MARKETS.length;
      case "btc":       return hasApi ? raw.filter(m => m.quoteAsset === "BTC").length  : BTC_MARKETS.length;
      case "eth":       return hasApi ? raw.filter(m => m.quoteAsset === "ETH").length  : ETH_MARKETS.length;
      case "bnb":       return hasApi ? raw.filter(m => m.quoteAsset === "BNB").length   : BNB_MARKETS.length;
      case "matic":     return hasApi ? raw.filter(m => m.quoteAsset === "MATIC").length : MATIC_MARKETS.length;
      case "avax":      return hasApi ? raw.filter(m => m.quoteAsset === "AVAX").length  : AVAX_MARKETS.length;
      case "arb":       return hasApi ? raw.filter(m => m.quoteAsset === "ARB").length   : ARB_MARKETS.length;
      case "op":        return hasApi ? raw.filter(m => m.quoteAsset === "OP").length    : OP_MARKETS.length;
      case "ftm":       return hasApi ? raw.filter(m => m.quoteAsset === "FTM").length   : FTM_MARKETS.length;
      case "cro":       return hasApi ? raw.filter(m => m.quoteAsset === "CRO").length   : CRO_MARKETS.length;
      case "bch":       return hasApi ? raw.filter(m => m.quoteAsset === "BCH").length  : BCH_MARKETS.length;
      case "bsv":       return hasApi ? raw.filter(m => m.quoteAsset === "BSV").length  : BSV_MARKETS.length;
      case "ai":        return AI_MARKETS.length;
      case "meme":      return MEME_MARKETS.length;
      case "defi":      return DEFI_MARKETS.length;
      case "futures":   return hasApi ? raw.filter(m => m.type === "futures").length    : FUTURES_MARKETS.length;
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
      <div className="px-6 lg:px-10 pt-8 pb-4 border-b border-border bg-card/40">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Markets</h1>
              <p className="text-xs text-primary/70 italic mt-0.5">✦ Trade means DEX</p>
            </div>
            <button
              onClick={() => handleBuy("BSV")}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg"
            >
              <CreditCard className="w-4 h-4" />
              Buy Crypto
            </button>
          </div>

          {/* Main tabs */}
          <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TAB_META.map(t => {
              const isBsv = t.id === "bsv";
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setSearch(""); }}
                  style={isBsv && !isActive ? { animation: "bsv-glow 2.5s ease-in-out infinite" } : undefined}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border",
                    isActive && isBsv
                      ? "bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/40"
                      : isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                      : isBsv
                      ? "text-amber-400 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20"
                      : "text-muted-foreground border-border hover:border-primary/40 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {isBsv && <span className="text-[13px] leading-none">⚡</span>}
                  {t.label}
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                    isActive && isBsv ? "bg-black/20 text-black"
                    : isActive ? "bg-white/20 text-white"
                    : isBsv ? "bg-amber-500/20 text-amber-300"
                    : "bg-secondary text-muted-foreground"
                  )}>
                    {tabCount(t.id)}
                  </span>
                  {isBsv && !isActive && (
                    <span className="text-[8px] font-black uppercase tracking-wider bg-amber-500 text-black px-1 py-0.5 rounded ml-0.5">FASTEST</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* BSV fastest settlement callout */}
          {tab === "bsv" && (
            <div className="mt-3 flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <span className="text-xl leading-none">⚡</span>
              <div>
                <p className="text-xs font-bold text-amber-400">BSV — World's Fastest Settlement Chain</p>
                <p className="text-[11px] text-amber-300/70 mt-0.5">Every OrahDEX trade settles instantly on-chain via BSV. No bridges. No Layer 2s. True finality in seconds.</p>
              </div>
              <div className="ml-auto flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className="text-[10px] text-amber-500/60 uppercase tracking-wider">Settlement</p>
                  <p className="text-sm font-black text-amber-400">&lt; 5s</p>
                </div>
                <div className="w-px h-8 bg-amber-500/20" />
                <div className="text-center">
                  <p className="text-[10px] text-amber-500/60 uppercase tracking-wider">Fees</p>
                  <p className="text-sm font-black text-amber-400">~$0.001</p>
                </div>
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
                · {hasApi ? raw.filter(m => m.quoteAsset === usdSub && m.type === "spot").length : STABLE_MOCK[usdSub].length} pairs
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
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h High</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h Low</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m, idx) => {
                  const base  = m.baseAsset ?? m.symbol.split("-")[0];
                  const quote = m.quoteAsset ?? m.symbol.split("-")[1];
                  const price = parseFloat(m.lastPrice) || 0;
                  const chg   = parseFloat(m.priceChangePercent24h) || 0;
                  const isUp  = chg >= 0;
                  const tradeHref = tab === "futures"
                    ? `/futures/${m.symbol.replace(/\//g, "-")}`
                    : `/trade/${m.symbol.replace(/\//g, "-")}`;

                  return (
                    <tr key={m.symbol} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3.5">
                        <button onClick={() => toggleStar(m.symbol)} className="text-muted-foreground hover:text-amber-400 transition-colors">
                          <Star className={cn("w-3.5 h-3.5", stars.has(m.symbol) && "fill-amber-400 text-amber-400")} />
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
                              <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">PERP</span>
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
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground">
                        {formatVolume(parseFloat(m.volume24h) || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleBuy(base)}
                            className="inline-flex items-center gap-1 bg-green-500/15 text-green-400 border border-green-500/25 px-2.5 py-1.5 rounded-lg font-semibold text-[11px] hover:bg-green-500/25 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <CreditCard className="w-3 h-3" /> Buy
                          </button>
                          <Link
                            href={tradeHref}
                            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3.5 py-1.5 rounded-lg font-semibold text-xs hover:opacity-90 transition-opacity"
                          >
                            Trade <ArrowRightLeft className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-muted-foreground text-sm">
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
