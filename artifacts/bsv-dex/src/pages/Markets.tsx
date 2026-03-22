import { useState } from "react";
import { useGetMarkets } from "@workspace/api-client-react";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { formatPrice, formatVolume, cn } from "@/lib/utils";
import { Search, Star, ArrowRightLeft, LineChart } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Tab = "spot" | "futures";

const ASSET_ICONS: Record<string, string> = {
  BSV:"₿",BTC:"₿",ETH:"Ξ",SOL:"◎",BNB:"🔶",XRP:"✕",ADA:"🔵",
  DOGE:"🐶",DOT:"⬤",AVAX:"🔺",MATIC:"⬟",LINK:"🔗",UNI:"🦄",
};

function assetIcon(base: string) {
  return ASSET_ICONS[base] ?? base[0];
}

export function Markets() {
  const [tab, setTab] = useState<Tab>("spot");
  const [search, setSearch] = useState("");
  const [stars, setStars] = useState<Set<string>>(new Set());

  const { data: apiMarkets } = useGetMarkets();
  const raw = (apiMarkets && apiMarkets.length > 0 ? apiMarkets : MOCK_MARKETS) as any[];

  const spotMarkets = raw.filter(m => !m.symbol.includes("PERP") && (m.type === "spot" || !m.type));
  const futuresMarkets = raw.filter(m => m.symbol.includes("PERP") || m.type === "futures");

  const markets = tab === "spot" ? spotMarkets : futuresMarkets;

  const filtered = markets.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    (m.baseAsset ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleStar = (symbol: string) =>
    setStars(prev => { const n = new Set(prev); n.has(symbol) ? n.delete(symbol) : n.add(symbol); return n; });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-4 border-b border-border bg-card/40">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Markets</h1>
          <p className="text-xs text-primary/70 italic mt-0.5">✦ Trade means DEX</p>

          {/* Tabs + Search row */}
          <div className="flex items-center gap-4 mt-5">
            <div className="flex gap-0 border border-border rounded-xl overflow-hidden shrink-0">
              <button
                onClick={() => { setTab("spot"); setSearch(""); }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors",
                  tab === "spot"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Spot
              </button>
              <button
                onClick={() => { setTab("futures"); setSearch(""); }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors border-l border-border",
                  tab === "futures"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                <LineChart className="w-3.5 h-3.5" />
                Futures
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Search ${tab}…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary transition-all"
              />
            </div>

            <div className="ml-auto hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <span><span className="font-semibold text-foreground">{spotMarkets.length}</span> Spot</span>
              <span><span className="font-semibold text-foreground">{futuresMarkets.length}</span> Futures</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4">
          <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">24h %</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h High</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">24h Low</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">Trade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(m => {
                  const isUp = (m.priceChangePercent24h ?? 0) >= 0;
                  const icon = assetIcon(m.baseAsset ?? m.symbol.split("/")[0]);
                  const isEmoji = /\p{Emoji}/u.test(icon);
                  const tradeHref = tab === "spot"
                    ? `/trade/${m.symbol.replace(/\//g, "-")}`
                    : `/futures/${m.symbol.replace(/\//g, "-")}`;

                  return (
                    <tr key={m.symbol} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => toggleStar(m.symbol)}
                          className="text-muted-foreground hover:text-amber-400 transition-colors"
                        >
                          <Star className={cn("w-3.5 h-3.5", stars.has(m.symbol) && "fill-amber-400 text-amber-400")} />
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm shrink-0 font-bold text-primary">
                            {isEmoji ? icon : <span className="text-xs">{icon}</span>}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground text-sm">{m.baseAsset ?? m.symbol.split("/")[0]}</span>
                            <span className="text-muted-foreground text-xs ml-1">/{m.quoteAsset ?? m.symbol.split("/")[1]}</span>
                            {tab === "futures" && (
                              <span className="ml-2 text-[10px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30">PERP</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold">
                        ${formatPrice(m.lastPrice)}
                      </td>
                      <td className={cn("px-4 py-3.5 text-right font-mono text-sm font-semibold", isUp ? "text-buy" : "text-sell")}>
                        {isUp ? "+" : ""}{(m.priceChangePercent24h ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        ${formatPrice(m.high24h)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        ${formatPrice(m.low24h)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-sm text-muted-foreground">
                        {formatVolume(m.volume24h)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={tradeHref}
                          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3.5 py-1.5 rounded-lg font-semibold text-xs hover:opacity-90 transition-opacity"
                        >
                          Trade <ArrowRightLeft className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-muted-foreground text-sm">
                      {search ? `No results for "${search}"` : `Loading ${tab} markets…`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground/50 mt-3 text-center">
            Live prices via CoinGecko · On-chain settlement via Bitcoin SV · 0.1% fee
          </p>
        </div>
      </div>
    </div>
  );
}
