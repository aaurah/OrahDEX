import { useState, useEffect } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { formatPrice, formatVolume, formatPercent, cn } from "@/lib/utils";
import { Search, Star, TrendingUp, ArrowRightLeft, BarChart2, Globe, Coins, Wheat, LineChart } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Category = "crypto" | "stocks" | "indices" | "forex" | "commodities";

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "crypto",      label: "Crypto",      icon: <Coins className="w-4 h-4" />,     color: "amber" },
  { key: "stocks",      label: "Stocks",      icon: <BarChart2 className="w-4 h-4" />, color: "blue" },
  { key: "indices",     label: "Indices",     icon: <LineChart className="w-4 h-4" />, color: "violet" },
  { key: "forex",       label: "Forex",       icon: <Globe className="w-4 h-4" />,     color: "green" },
  { key: "commodities", label: "Commodities", icon: <Wheat className="w-4 h-4" />,     color: "orange" },
];

const CAT_ACTIVE: Record<string, string> = {
  amber:  "bg-amber-500/15 border-amber-500/50 text-amber-400",
  blue:   "bg-blue-500/15 border-blue-500/50 text-blue-400",
  violet: "bg-violet-500/15 border-violet-500/50 text-violet-400",
  green:  "bg-green-500/15 border-green-500/50 text-green-400",
  orange: "bg-orange-500/15 border-orange-500/50 text-orange-400",
};

const ASSET_ICONS: Record<string, string> = {
  AAPL:"🍎",TSLA:"⚡",NVDA:"🟩",MSFT:"🪟",AMZN:"📦",GOOGL:"🔍",META:"👥",NFLX:"🎬",AMD:"💻",INTC:"🔵",
  SPX:"📊",NDX:"💹",DJI:"🏦",FTSE:"🇬🇧",DAX:"🇩🇪",NKY:"🇯🇵",
  EUR:"🇪🇺",GBP:"🇬🇧",USD:"🇺🇸",AUD:"🇦🇺",NZD:"🇳🇿",
  XAU:"🥇",XAG:"🥈",OIL:"🛢️",BRENT:"🛢️",NG:"🔥",XPT:"⚗️",WHEAT:"🌾",CORN:"🌽",
  BSV:"₿",BTC:"₿",ETH:"Ξ",SOL:"◎",BNB:"🔶",XRP:"✕",ADA:"🔵",
};

function assetIcon(baseAsset: string): string {
  return ASSET_ICONS[baseAsset] ?? baseAsset[0];
}

function formatPriceByCategory(price: number, cat: Category): string {
  if (cat === "forex") {
    if (price > 100) return price.toFixed(2);
    if (price > 1)   return price.toFixed(4);
    return price.toFixed(6);
  }
  if (cat === "commodities" && price < 10) return price.toFixed(3);
  return formatPrice(price);
}

export function Markets() {
  const [category, setCategory] = useState<Category>("crypto");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [globalData, setGlobalData] = useState<any[]>([]);

  const { data: apiMarkets, isLoading: cryptoLoading } = useGetMarkets();

  // Fetch global markets (stocks/forex/commodities/indices)
  useEffect(() => {
    const load = () =>
      fetch(`${BASE}/api/global-markets`)
        .then(r => r.json())
        .then(setGlobalData)
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const cryptoMarkets = (apiMarkets && apiMarkets.length > 0 ? apiMarkets : MOCK_MARKETS).map(m => ({
    symbol: m.symbol,
    baseAsset: m.baseAsset,
    quoteAsset: m.quoteAsset,
    category: "crypto" as Category,
    lastPrice: m.lastPrice,
    priceChangePercent24h: m.priceChangePercent24h,
    high24h: m.high24h,
    low24h: m.low24h,
    volume24h: m.volume24h,
    description: `${m.baseAsset} / ${m.quoteAsset}`,
  }));

  const currentMarkets = category === "crypto"
    ? cryptoMarkets
    : globalData.filter(m => m.category === category);

  const filtered = currentMarkets.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    m.baseAsset.toLowerCase().includes(search.toLowerCase()) ||
    (m.description?.toLowerCase() ?? "").includes(search.toLowerCase())
  );

  const totalVolume = currentMarkets.reduce((s, m) => s + (m.volume24h ?? 0), 0);

  const toggleStar = (symbol: string) =>
    setStars(prev => { const n = new Set(prev); n.has(symbol) ? n.delete(symbol) : n.add(symbol); return n; });

  const cat = CATEGORIES.find(c => c.key === category)!;

  return (
    <div className="flex-1 p-6 lg:p-10 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl lg:text-5xl font-bold tracking-tight mb-2">Markets Overview</h1>
        <p className="text-primary/80 italic font-medium text-sm mb-3">✦ Trade means DEX</p>
        <p className="text-muted-foreground max-w-2xl">
          Trade crypto, stocks, indices, forex &amp; commodities — all in one place. Live on-chain settlement on BSV with automatic fee routing.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-7">
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg">
          <div className="text-muted-foreground mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-buy" /> 24h Volume ({cat.label})</div>
          <div className="text-3xl font-mono font-bold">${totalVolume > 1e9 ? (totalVolume / 1e9).toFixed(2) + "B" : totalVolume > 1e6 ? (totalVolume / 1e6).toFixed(1) + "M" : totalVolume.toFixed(0)}</div>
        </div>
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg">
          <div className="text-muted-foreground mb-2">{cat.label} Markets Listed</div>
          <div className="text-3xl font-mono font-bold">{currentMarkets.length}</div>
        </div>
        <div className="bg-gradient-to-br from-card to-secondary p-6 rounded-2xl border border-border shadow-lg flex flex-col justify-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder={`Search ${cat.label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => { setCategory(c.key); setSearch(""); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all",
              category === c.key
                ? CAT_ACTIVE[c.color]
                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Market table */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-sm">
                <th className="p-4 font-medium w-10"></th>
                <th className="p-4 font-medium">Asset</th>
                <th className="p-4 font-medium text-right">Price</th>
                <th className="p-4 font-medium text-right">24h Change</th>
                <th className="p-4 font-medium text-right hidden md:table-cell">24h High</th>
                <th className="p-4 font-medium text-right hidden md:table-cell">24h Low</th>
                <th className="p-4 font-medium text-right">24h Volume</th>
                <th className="p-4 font-medium text-right">Trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(market => {
                const isPositive = market.priceChangePercent24h >= 0;
                const icon = assetIcon(market.baseAsset);
                const isEmoji = /\p{Emoji}/u.test(icon);
                return (
                  <tr key={market.symbol} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 text-center">
                      <button onClick={() => toggleStar(market.symbol)} className="text-muted-foreground hover:text-amber-400 transition-colors">
                        <Star className={cn("w-4 h-4", stars.has(market.symbol) && "fill-amber-400 text-amber-400")} />
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                          {isEmoji ? icon : <span className="text-xs">{icon}</span>}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{market.baseAsset}</span>
                            <span className="text-muted-foreground text-sm">/{market.quoteAsset}</span>
                          </div>
                          <div className="text-xs text-muted-foreground/70 max-w-[180px] truncate">{market.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-mono font-semibold">
                      ${formatPriceByCategory(market.lastPrice, category)}
                    </td>
                    <td className={cn("p-4 text-right font-mono font-semibold", isPositive ? "text-buy" : "text-sell")}>
                      {isPositive ? "+" : ""}{market.priceChangePercent24h.toFixed(2)}%
                    </td>
                    <td className="p-4 text-right font-mono text-muted-foreground hidden md:table-cell">
                      ${formatPriceByCategory(market.high24h, category)}
                    </td>
                    <td className="p-4 text-right font-mono text-muted-foreground hidden md:table-cell">
                      ${formatPriceByCategory(market.low24h, category)}
                    </td>
                    <td className="p-4 text-right font-mono text-foreground">
                      {formatVolume(market.volume24h)}
                    </td>
                    <td className="p-4 text-right">
                      {category === "crypto" ? (
                        <Link
                          href={`/trade/${market.symbol.replace(/\//g, '-')}`}
                          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
                        >
                          Trade <ArrowRightLeft className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <button className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity">
                          Trade <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    {search ? `No ${cat.label.toLowerCase()} found matching "${search}"` : `Loading ${cat.label.toLowerCase()} markets…`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live data note */}
      <p className="text-xs text-muted-foreground/60 mt-4 text-center">
        Crypto prices from CoinGecko · Stocks / Indices / Forex / Commodities refreshed every 15 s · Platform fee 0.1% automatically credited to OrahDEX fee wallet on every trade
      </p>
    </div>
  );
}
