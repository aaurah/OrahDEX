import { useState } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { USDT_MARKETS, BSV_MARKETS, FUTURES_MARKETS } from "@/lib/mock-data";
import { formatPrice, formatVolume, cn } from "@/lib/utils";
import { Search, Star, ArrowRightLeft, LineChart, CreditCard, TrendingUp, Zap } from "lucide-react";
import { Link } from "wouter";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "usdt" | "bsv" | "futures";

const COIN_COLORS: Record<string, string> = {
  BSV:"#EAB308", BTC:"#F97316", ETH:"#8B5CF6", SOL:"#06B6D4",
  XRP:"#3B82F6", BNB:"#EAB308", ADA:"#2563EB", DOGE:"#EAB308",
  DOT:"#E11D48", AVAX:"#EF4444", MATIC:"#7C3AED", LINK:"#2563EB",
  UNI:"#EC4899", ATOM:"#6366F1", LTC:"#6B7280", BCH:"#22C55E",
  TRX:"#EF4444", NEAR:"#10B981", APT:"#06B6D4", ARB:"#60A5FA",
  OP:"#EF4444", SUI:"#3B82F6", INJ:"#2563EB", PEPE:"#22C55E",
  SHIB:"#F97316", MKR:"#22C55E", AAVE:"#7C3AED", CRV:"#F43F5E",
};

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

export function Markets() {
  const [tab, setTab] = useState<Tab>("usdt");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyCoin, setBuyCoin] = useState("BSV");

  const { data: apiMarkets } = useGetMarkets();
  const raw = (apiMarkets && apiMarkets.length > 0 ? apiMarkets : []) as any[];

  function getMarkets(): any[] {
    if (raw.length > 0) {
      if (tab === "usdt")    return raw.filter(m => m.quoteAsset === "USDT" && m.type === "spot");
      if (tab === "bsv")     return raw.filter(m => m.quoteAsset === "BSV");
      if (tab === "futures") return raw.filter(m => m.type === "futures");
    }
    if (tab === "usdt")    return USDT_MARKETS;
    if (tab === "bsv")     return BSV_MARKETS;
    return FUTURES_MARKETS;
  }

  const markets = getMarkets();

  const filtered = markets.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    (m.baseAsset ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleStar = (symbol: string) =>
    setStars(prev => { const n = new Set(prev); n.has(symbol) ? n.delete(symbol) : n.add(symbol); return n; });

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "usdt",    label: "USDT Market",    icon: <Zap className="w-3.5 h-3.5" />,        count: raw.length ? raw.filter(m => m.quoteAsset === "USDT" && m.type === "spot").length : USDT_MARKETS.length },
    { id: "bsv",     label: "BSV Market",     icon: <TrendingUp className="w-3.5 h-3.5" />, count: raw.length ? raw.filter(m => m.quoteAsset === "BSV").length : BSV_MARKETS.length },
    { id: "futures", label: "Futures",         icon: <LineChart className="w-3.5 h-3.5" />,  count: raw.length ? raw.filter(m => m.type === "futures").length : FUTURES_MARKETS.length },
  ];

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
              onClick={() => { setBuyCoin("BSV"); setBuyOpen(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg"
            >
              <CreditCard className="w-4 h-4" />
              Buy Crypto
            </button>
          </div>

          {/* Tabs + Search */}
          <div className="flex items-center gap-4 mt-5 flex-wrap">
            <div className="flex gap-0 border border-border rounded-xl overflow-hidden shrink-0">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setSearch(""); }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    i > 0 && "border-l border-border",
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {t.icon}
                  {t.label}
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    tab === t.id ? "bg-white/20 text-white" : "bg-secondary text-muted-foreground"
                  )}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Search ${tab === "futures" ? "futures" : tab.toUpperCase() + " pairs"}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-4">

          {/* Market label */}
          <div className="mb-3 flex items-center gap-2">
            {tab === "usdt" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-blue-300">All pairs quoted in USDT · {filtered.length} markets</span>
              </div>
            )}
            {tab === "bsv" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-300">All pairs quoted in BSV · On-chain settlement · {filtered.length} markets</span>
              </div>
            )}
            {tab === "futures" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <LineChart className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-300">Perpetual futures · Up to 100× leverage · {filtered.length} markets</span>
              </div>
            )}
          </div>

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
                  const base = m.baseAsset ?? m.symbol.split("-")[0];
                  const quote = m.quoteAsset ?? m.symbol.split("-")[1];
                  const price = parseFloat(m.lastPrice) || m.lastPrice || 0;
                  const chg = parseFloat(m.priceChangePercent24h) || m.priceChangePercent24h || 0;
                  const isUp = chg >= 0;
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
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-foreground">{base}</span>
                              <span className="text-muted-foreground text-xs">/{quote}</span>
                              {tab === "futures" && (
                                <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">PERP</span>
                              )}
                              {tab === "bsv" && (
                                <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400/80 px-1 py-0.5 rounded">₿SV</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold">
                        {tab === "bsv" ? "" : "$"}{formatPrice(price)}
                        {tab === "bsv" && <span className="text-[10px] text-muted-foreground ml-1">BSV</span>}
                      </td>
                      <td className={cn("px-4 py-3.5 text-right font-mono text-sm font-semibold", isUp ? "text-green-400" : "text-red-400")}>
                        {isUp ? "+" : ""}{chg.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {tab === "bsv" ? "" : "$"}{formatPrice(parseFloat(m.high24h) || m.high24h || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {tab === "bsv" ? "" : "$"}{formatPrice(parseFloat(m.low24h) || m.low24h || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground">
                        {formatVolume(parseFloat(m.volume24h) || m.volume24h || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setBuyCoin(base); setBuyOpen(true); }}
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
                      {search ? `No results for "${search}"` : "Loading markets…"}
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
