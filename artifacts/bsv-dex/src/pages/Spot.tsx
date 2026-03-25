import { useParams, Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { useState, useMemo, useRef, useEffect } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders, useGetMarkets, useCancelOrder } from "@workspace/api-client-react";
import type { OrderBookFill } from "@/components/trading/OrderBook";
import type { OrderFormFill } from "@/components/trading/OrderForm";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { ExternalLink, CheckCircle2, Search, ChevronDown, X } from "lucide-react";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";

type BottomTab = "open" | "history" | "trades";
type QuoteTab = "USDT" | "ETH" | "BTC" | "BSV" | "BCH";

const QUOTE_TABS: { id: QuoteTab; label: string; color: string }[] = [
  { id: "USDT", label: "USDT", color: "text-green-400" },
  { id: "BTC",  label: "BTC",  color: "text-orange-400" },
  { id: "ETH",  label: "ETH",  color: "text-violet-400" },
  { id: "BCH",  label: "BCH",  color: "text-emerald-400" },
  { id: "BSV",  label: "BSV",  color: "text-green-400" },
];

const COIN_COLORS: Record<string, string> = {
  BSV:"#EAB308", BTC:"#F97316", ETH:"#8B5CF6", SOL:"#06B6D4",
  XRP:"#3B82F6", BNB:"#EAB308", ADA:"#2563EB", DOGE:"#EAB308",
  DOT:"#E11D48", AVAX:"#EF4444", MATIC:"#7C3AED", LINK:"#2563EB",
  UNI:"#EC4899", ATOM:"#6366F1", LTC:"#6B7280", BCH:"#22C55E",
  TRX:"#EF4444", NEAR:"#10B981", APT:"#06B6D4", ARB:"#60A5FA",
  OP:"#EF4444",  SUI:"#3B82F6", INJ:"#2563EB", PEPE:"#22C55E",
  SHIB:"#F97316",MKR:"#22C55E", AAVE:"#7C3AED", CRV:"#F43F5E",
  FET:"#06B6D4",
};

function normalise(m: any) {
  const base  = m.baseAsset  ?? m.base  ?? m.symbol?.split(/[-/]/)[0] ?? "";
  const quote = m.quoteAsset ?? m.quote ?? "USDT";
  const price = parseFloat(m.lastPrice ?? m.price) || 0;
  const chg   = parseFloat(m.priceChangePercent24h ?? m.priceChangePercent ?? m.change) || 0;
  const type  = m.type ?? (m.symbol?.includes("PERP") ? "futures" : "spot");
  return { ...m, symbol: m.symbol ?? `${base}-${quote}`, baseAsset: base, quoteAsset: quote,
    lastPrice: price, priceChangePercent24h: chg, type };
}

export function SpotTrading() {
  const { symbol: rawSymbol = "BSV-USDT" } = useParams();
  const { address } = useWalletStore();
  const [bottomTab, setBottomTab] = useState<BottomTab>("open");
  const [quoteTab, setQuoteTab] = useState<QuoteTab>("USDT");
  const [marketSearch, setMarketSearch] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [orderBookFill, setOrderBookFill] = useState<OrderFormFill | null>(null);
  const [pairDropOpen, setPairDropOpen] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const [dropQuote, setDropQuote] = useState<QuoteTab>("USDT");
  const pairDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pairDropRef.current && !pairDropRef.current.contains(e.target as Node)) {
        setPairDropOpen(false);
        setDropSearch("");
      }
    }
    if (pairDropOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pairDropOpen]);

  const handleOrderBookFill = (fill: OrderBookFill) => {
    setOrderBookFill(fill as OrderFormFill);
  };

  const symbol = rawSymbol.replace(/-/g, '/');
  const [base, quote] = rawSymbol.split("-");

  useSEO({
    title: `${base}/${quote} Spot Trading — Live Price & Chart`,
    description: `Trade ${base}/${quote} on OrahDEX spot market. Real-time price chart, order book, and depth data. Place limit, market, and stop orders instantly.`,
    keywords: `${base} ${quote} trading, ${base} price, buy ${base}, sell ${base}, ${rawSymbol} spot, OrahDEX spot`,
    url: `/trade/${rawSymbol}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${base}/${quote} Spot Trading on OrahDEX`,
      "description": `Live ${base}/${quote} spot trading with real-time charts and order book`,
      "url": `https://orahdex.replit.app/trade/${rawSymbol}`
    }
  });

  const { data: apiTicker }    = useGetTicker(encodeURIComponent(symbol));
  const { data: apiCandles }   = useGetCandles(encodeURIComponent(symbol), { interval: '1h', limit: 100 });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 }, {
    query: { refetchInterval: 2000, staleTime: 0 },
  });
  const { data: apiTrades }    = useGetRecentTrades(encodeURIComponent(symbol), { limit: 50 });
  const { data: apiOrders, refetch: refetchOrders } = useGetOrders(
    { walletAddress: address || '' },
    { query: { enabled: !!address, refetchInterval: 5000 } }
  );
  const { data: apiMarkets } = useGetMarkets();

  const ticker     = (apiTicker?.lastPrice && apiTicker.lastPrice > 0 ? apiTicker : null)
    ?? MOCK_TICKER[rawSymbol]
    ?? MOCK_TICKER["BSV-USDT"];
  const isPositive = ticker.priceChangePercent >= 0;
  const candles    = apiCandles || generateMockCandles(ticker.lastPrice);
  const trades     = apiTrades  || generateMockTrades(ticker.lastPrice);

  function toEntries(raw: number[][], descending: boolean) {
    const sorted = [...raw].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
    let cum = 0;
    return sorted.map(([p, q]) => { cum += p * q; return { price: p, quantity: q, total: cum }; });
  }
  const rawOB = apiOrderBook as any;
  const orderBook = (rawOB?.bids && Array.isArray(rawOB.bids[0])
    ? { bids: toEntries(rawOB.bids, true), asks: toEntries(rawOB.asks, false) }
    : (apiOrderBook || generateMockOrderBook(ticker.lastPrice))) as import("@workspace/api-client-react").OrderBook;

  const cancelOrder = useCancelOrder({
    mutation: {
      onSuccess: () => { refetchOrders(); },
    },
  });

  const allOrders    = (apiOrders as any[]) || [];
  const openOrders   = allOrders.filter((o: any) => o.status === "open");
  const filledOrders = allOrders.filter((o: any) => o.status === "filled" || o.status === "cancelled");

  // Market list for pair selector
  const allMarkets = useMemo(() => {
    const raw = ((apiMarkets && (apiMarkets as any[]).length > 0) ? (apiMarkets as any[]) : []).map(normalise);
    return raw.filter(m => m.type === "spot");
  }, [apiMarkets]);

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.toLowerCase();
    return allMarkets
      .filter(m => m.quoteAsset === quoteTab)
      .filter(m => !q || m.baseAsset.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q));
  }, [allMarkets, quoteTab, marketSearch]);

  const quoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    QUOTE_TABS.forEach(t => {
      counts[t.id] = allMarkets.filter(m => m.quoteAsset === t.id).length;
    });
    return counts;
  }, [allMarkets]);

  const dropFiltered = useMemo(() => {
    const q = dropSearch.toLowerCase();
    return allMarkets
      .filter(m => m.quoteAsset === dropQuote)
      .filter(m => !q || m.baseAsset.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q));
  }, [allMarkets, dropQuote, dropSearch]);

  return (
    <div className="flex flex-col h-[calc(100vh-5.75rem)] bg-background overflow-hidden">
      {/* Ticker Header */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-card shrink-0">
        {/* Pair selector trigger + dropdown */}
        <div className="relative shrink-0" ref={pairDropRef}>
          <button
            onClick={() => { setPairDropOpen(v => !v); setDropSearch(""); }}
            className="flex items-center gap-1.5 group"
          >
            <h1 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
              {symbol.replace('-', '/')}
            </h1>
            <ChevronDown className={cn(
              "w-4 h-4 text-muted-foreground group-hover:text-primary transition-all",
              pairDropOpen && "rotate-180"
            )} />
          </button>

          {/* Dropdown panel */}
          {pairDropOpen && (
            <div className="absolute top-full left-0 mt-2 w-[340px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
                <span className="text-xs font-semibold text-foreground">Choose a trading pair</span>
                <button onClick={() => setPairDropOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Search */}
              <div className="px-3 py-2 border-b border-border shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search pairs…"
                    value={dropSearch}
                    onChange={e => setDropSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/60 border border-border rounded-lg outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              {/* Quote tabs */}
              <div className="flex gap-0.5 px-3 py-1.5 border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
                {QUOTE_TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setDropQuote(t.id)}
                    className={cn(
                      "shrink-0 px-2.5 py-0.5 rounded text-[10px] font-bold transition-all",
                      dropQuote === t.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.id === "BSV" ? "⚡BSV" : t.label}
                    <span className="ml-1 text-[9px] opacity-60">{quoteCounts[t.id] ?? 0}</span>
                  </button>
                ))}
              </div>
              {/* Column headers */}
              <div className="flex items-center px-3 py-1 text-[9px] font-medium text-muted-foreground border-b border-border/50 shrink-0">
                <span className="flex-1">Pair</span>
                <span className="w-20 text-right">Price</span>
                <span className="w-14 text-right">24h %</span>
              </div>
              {/* Pair list */}
              <div className="overflow-y-auto max-h-64 min-h-0">
                {dropFiltered.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">No pairs found</div>
                ) : (
                  dropFiltered.map(m => {
                    const urlSymbol = m.symbol.replace('/', '-');
                    const isActive = urlSymbol === rawSymbol;
                    const isUp = m.priceChangePercent24h >= 0;
                    const bgColor = COIN_COLORS[m.baseAsset] ?? "#6B7280";
                    return (
                      <Link
                        key={m.symbol}
                        href={`/trade/${urlSymbol}`}
                        onClick={() => { setPairDropOpen(false); setDropSearch(""); }}
                        className={cn(
                          "flex items-center px-3 py-2 gap-2.5 hover:bg-white/5 cursor-pointer transition-colors",
                          isActive && "bg-primary/10 border-l-2 border-l-primary"
                        )}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0"
                          style={{ background: bgColor }}
                        >
                          {m.baseAsset.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-foreground">{m.baseAsset}</span>
                          <span className="text-[10px] text-muted-foreground">/{m.quoteAsset}</span>
                        </div>
                        <span className="w-20 text-right text-[11px] font-mono text-foreground tabular-nums">
                          {formatPrice(m.lastPrice)}
                        </span>
                        <span className={cn(
                          "w-14 text-right text-[10px] font-bold tabular-nums",
                          isUp ? "text-buy" : "text-sell"
                        )}>
                          {isUp ? "+" : ""}{m.priceChangePercent24h.toFixed(2)}%
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col">
          <span className={cn("text-lg font-mono font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
            {formatPrice(ticker.lastPrice)}
          </span>
          <span className="text-xs text-foreground font-mono mt-1">${formatPrice(ticker.lastPrice)}</span>
        </div>

        <div className="hidden sm:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Change</span>
          <span className={cn("text-sm font-mono mt-0.5", isPositive ? "text-buy" : "text-sell")}>
            {formatPercent(ticker.priceChangePercent)}
          </span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h High</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.highPrice)}</span>
        </div>

        <div className="hidden md:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Low</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatPrice(ticker.lowPrice)}</span>
        </div>

        <div className="hidden lg:flex flex-col">
          <span className="text-xs text-muted-foreground">24h Vol({symbol.split('-')[0]})</span>
          <span className="text-sm font-mono text-foreground mt-0.5">{formatVolume(ticker.volume)}</span>
        </div>

        {/* BSV Settlement Badge — always visible, since all trades settle on BSV */}
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/25 rounded-xl shrink-0">
          <span className="text-sm leading-none animate-pulse">⚡</span>
          <div className="hidden sm:block">
            <p className="text-[10px] font-black text-green-400 uppercase tracking-wider leading-tight">BSV Settlement</p>
            <p className="text-[9px] text-green-300/60 leading-tight">Fastest · &lt;5s · ~$0.001</p>
          </div>
          <span className="sm:hidden text-[10px] font-bold text-green-400">BSV</span>
        </div>
      </div>

      {/* Main Trading Area — Poloniex-style: Pairs | Chart | OrderBook+Form */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Pair Selector — always visible, slim */}
        <div className="hidden lg:flex w-[200px] shrink-0 border-r border-border flex-col min-h-0 bg-card">
          {/* Search + Quote tabs */}
          <div className="px-1.5 pt-1.5 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={marketSearch}
                onChange={e => setMarketSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1 text-[10px] bg-secondary/60 border border-border rounded-md outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          <div className="flex px-1.5 pb-1 gap-0.5 shrink-0 overflow-x-auto scrollbar-hide">
            {QUOTE_TABS.map(t => {
              const isBsv = t.id === "BSV";
              const isActive = quoteTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setQuoteTab(t.id)}
                  className={cn(
                    "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all",
                    isActive && isBsv
                      ? "bg-green-500/20 text-green-400"
                      : isActive
                      ? "bg-primary/15 text-primary"
                      : isBsv
                      ? "text-green-500/70 hover:text-green-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isBsv ? "⚡BSV" : t.label}
                </button>
              );
            })}
          </div>
          {/* Column headers */}
          <div className="flex items-center px-1.5 py-0.5 text-[9px] text-muted-foreground font-medium shrink-0 border-b border-border/50">
            <span className="flex-1">Pair</span>
            <span className="w-16 text-right">Price</span>
            <span className="w-10 text-right">%</span>
          </div>
          {/* Pair list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredMarkets.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground">No pairs</div>
            ) : (
              filteredMarkets.map(m => {
                const urlSymbol = m.symbol.replace('/', '-');
                const isActivePair = urlSymbol === rawSymbol;
                const isUp = m.priceChangePercent24h >= 0;
                const bgColor = COIN_COLORS[m.baseAsset] ?? "#6B7280";
                return (
                  <Link
                    key={m.symbol}
                    href={`/trade/${urlSymbol}`}
                    className={cn(
                      "flex items-center px-1.5 py-1 gap-1 hover:bg-white/5 cursor-pointer transition-colors",
                      isActivePair && "bg-primary/10 border-l-2 border-l-primary"
                    )}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black text-white shrink-0"
                      style={{ background: bgColor }}
                    >
                      {m.baseAsset.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <span className="text-[10px] font-semibold text-foreground">{m.baseAsset}</span>
                      <span className="text-[9px] text-muted-foreground">/{m.quoteAsset}</span>
                    </div>
                    <span className="w-16 text-right text-[9px] font-mono text-foreground truncate">
                      {formatPrice(m.lastPrice)}
                    </span>
                    <span className={cn(
                      "w-10 text-right text-[9px] font-bold",
                      isUp ? "text-buy" : "text-sell"
                    )}>
                      {isUp ? "+" : ""}{m.priceChangePercent24h.toFixed(1)}%
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER: Chart & Bottom Tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border-b border-border relative min-h-0" style={{ minHeight: "320px" }}>
            <Chart data={candles} />
          </div>
          <div className="h-[200px] shrink-0 bg-card flex flex-col">
            {/* Tab bar */}
            <div className="flex gap-0 px-3 border-b border-border text-xs font-medium shrink-0">
              {([
                { key: "open",    label: `Open Orders (${openOrders.length})` },
                { key: "history", label: `History (${filledOrders.length})` },
                { key: "trades",  label: "Market Trades" },
              ] as { key: BottomTab; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setBottomTab(t.key)}
                  className={cn(
                    "py-2 px-3 border-b-2 transition-colors whitespace-nowrap text-xs",
                    bottomTab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {/* ── Open Orders ── */}
              {bottomTab === "open" && (
                openOrders.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    {address ? "No open orders." : "Connect your wallet to view open orders."}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 font-medium">Pair</th>
                        <th className="p-3 font-medium">Side</th>
                        <th className="p-3 font-medium text-right">Price</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                        <th className="p-3 font-medium text-right">Network</th>
                        <th className="p-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {openOrders.map((o: any, i: number) => (
                        <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString()}</td>
                          <td className="p-3">{o.symbol}</td>
                          <td className={cn("p-3 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                          <td className="p-3 text-right">{formatPrice(o.price)}</td>
                          <td className="p-3 text-right">{Number(o.quantity).toFixed(4)}</td>
                          <td className="p-3 text-right">
                            <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
                              o.networkType === "evm"
                                ? "text-violet-400 border-violet-500/30"
                                : "text-green-400 border-green-500/30"
                            )}>
                              {o.networkType === "evm" ? "EVM" : "BSV"}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => cancelOrder.mutate({ orderId: String(o.id), data: { walletAddress: address || "" } })}
                              disabled={cancelOrder.isPending}
                              className="text-[10px] font-semibold px-2.5 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {cancelOrder.isPending ? "…" : "Cancel"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Order History ── */}
              {bottomTab === "history" && (
                filledOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground text-sm">
                    {!address
                      ? "Connect your wallet to view order history."
                      : <><span>No completed orders yet.</span><span className="text-xs opacity-60">Filled orders show BSV settlement txid.</span></>
                    }
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="p-3 font-medium">Date</th>
                        <th className="p-3 font-medium">Pair</th>
                        <th className="p-3 font-medium">Side</th>
                        <th className="p-3 font-medium text-right">Price</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                        <th className="p-3 font-medium">BSV Settlement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filledOrders.map((o: any, i: number) => (
                        <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 text-muted-foreground">{new Date(o.updatedAt ?? o.createdAt).toLocaleTimeString()}</td>
                          <td className="p-3">{o.symbol}</td>
                          <td className={cn("p-3 font-semibold capitalize", o.side === "buy" ? "text-buy" : o.side === "sell" ? "text-sell" : "text-muted-foreground")}>{o.side}</td>
                          <td className="p-3 text-right">{formatPrice(o.price)}</td>
                          <td className="p-3 text-right">{Number(o.quantity).toFixed(4)}</td>
                          <td className="p-3">
                            {o.status === "filled" && o.txid ? (
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                                <span className="text-green-400 font-mono text-[10px]">
                                  {o.txid.slice(0, 10)}…{o.txid.slice(-6)}
                                </span>
                                <a
                                  href={`https://whatsonchain.com/tx/${o.txid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ) : o.status === "cancelled" ? (
                              <span className="text-muted-foreground text-[10px]">Cancelled</span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Pending…</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Trade History ── */}
              {bottomTab === "trades" && (
                trades.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    No trades to show.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="p-3 font-medium">Time</th>
                        <th className="p-3 font-medium">Side</th>
                        <th className="p-3 font-medium text-right">Price</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                        <th className="p-3 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(trades as any[]).slice(0, 30).map((t: any, i: number) => (
                        <tr key={t.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString()}</td>
                          <td className={cn("p-3 font-semibold capitalize", t.side === "buy" ? "text-buy" : "text-sell")}>{t.side}</td>
                          <td className={cn("p-3 text-right", t.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(t.price)}</td>
                          <td className="p-3 text-right">{Number(t.quantity).toFixed(4)}</td>
                          <td className="p-3 text-right text-muted-foreground">{formatPrice(t.price * t.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Order Book (top) + Order Form (bottom) — Poloniex style */}
        <div className="hidden lg:flex w-[280px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          {/* Order Book — takes top ~55% of right panel */}
          <div className="border-b border-border" style={{ height: "55%" }}>
            <OrderBook data={orderBook} lastPrice={ticker.lastPrice} onFill={handleOrderBookFill} />
          </div>
          {/* Order Form — takes bottom ~45% */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} />
          </div>
        </div>

        {/* MOBILE: full-width order form below chart */}
        <div className="lg:hidden w-full shrink-0 border-t border-border bg-card">
          <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} />
        </div>
      </div>

      <BuyCryptoModal open={buyOpen} onClose={() => setBuyOpen(false)} defaultCoin={base} />
    </div>
  );
}
