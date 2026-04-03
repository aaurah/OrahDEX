import { useParams, Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import { useState, useMemo, useRef, useEffect } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders, useGetMarkets, useCancelOrder } from "@workspace/api-client-react";
import type { OrderBookFill } from "@/components/trading/OrderBook";
import type { OrderFormFill } from "@/components/trading/OrderForm";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades, generateTickerForSymbol, ALL_SPOT_MOCK } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { ExternalLink, CheckCircle2, Search, ChevronDown, X, Droplets, TrendingUp, BarChart3, Zap, Building2, ArrowUpDown } from "lucide-react";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { BuyCryptoModal } from "@/components/BuyCryptoModal";
import { AiTradeAnalysis } from "@/components/AiTradeAnalysis";

type BottomTab = "open" | "history" | "trades" | "liquidity";
type QuoteTab =
  | "USDT" | "USDC" | "BTC" | "ETH" | "BSV" | "BCH" | "BNB"
  | "ARB"  | "OP"   | "MATIC" | "AVAX" | "SOL" | "TRX"
  | "FTM"  | "CRO";

const QUOTE_TABS: { id: QuoteTab; label: string; color: string }[] = [
  { id: "USDT",  label: "USDT",  color: "text-green-400"  },
  { id: "USDC",  label: "USDC",  color: "text-blue-400"   },
  { id: "BTC",   label: "BTC",   color: "text-orange-400" },
  { id: "ETH",   label: "ETH",   color: "text-violet-400" },
  { id: "BSV",   label: "BSV",   color: "text-yellow-400" },
  { id: "BCH",   label: "BCH",   color: "text-emerald-400"},
  { id: "BNB",   label: "BNB",   color: "text-yellow-500" },
  { id: "ARB",   label: "ARB",   color: "text-blue-400"   },
  { id: "OP",    label: "OP",    color: "text-red-400"    },
  { id: "MATIC", label: "MATIC", color: "text-violet-400" },
  { id: "AVAX",  label: "AVAX",  color: "text-red-400"    },
  { id: "SOL",   label: "SOL",   color: "text-cyan-400"   },
  { id: "TRX",   label: "TRX",   color: "text-red-500"    },
  { id: "FTM",   label: "FTM",   color: "text-blue-500"   },
  { id: "CRO",   label: "CRO",   color: "text-indigo-400" },
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

const POOL_MAP: Record<string, { tvl: number; vol24: number; fee: number; farmApr: number }> = {
  "BTC/USDT":  { tvl: 423_600_000, vol24: 98_200_000,  fee: 0.3,  farmApr: 4.2  },
  "ETH/USDT":  { tvl: 187_400_000, vol24: 44_100_000,  fee: 0.3,  farmApr: 6.1  },
  "SOL/USDT":  { tvl: 95_700_000,  vol24: 21_300_000,  fee: 0.3,  farmApr: 8.4  },
  "BSV/USDT":  { tvl: 8_240_000,   vol24: 1_920_000,   fee: 0.2,  farmApr: 18.2 },
  "BNB/USDT":  { tvl: 67_300_000,  vol24: 14_800_000,  fee: 0.3,  farmApr: 5.9  },
  "XRP/USDT":  { tvl: 52_100_000,  vol24: 12_700_000,  fee: 0.3,  farmApr: 7.3  },
  "ADA/USDT":  { tvl: 29_800_000,  vol24: 6_400_000,   fee: 0.3,  farmApr: 9.1  },
  "DOGE/USDT": { tvl: 41_200_000,  vol24: 9_300_000,   fee: 0.25, farmApr: 7.8  },
  "DOT/USDT":  { tvl: 18_600_000,  vol24: 3_900_000,   fee: 0.3,  farmApr: 11.2 },
  "LINK/USDT": { tvl: 22_900_000,  vol24: 5_100_000,   fee: 0.3,  farmApr: 10.1 },
  "BSV/BTC":   { tvl: 4_100_000,   vol24: 980_000,     fee: 0.2,  farmApr: 22.8 },
  "ETH/BTC":   { tvl: 76_500_000,  vol24: 17_200_000,  fee: 0.3,  farmApr: 5.3  },
  "AVAX/USDT": { tvl: 31_400_000,  vol24: 8_200_000,   fee: 0.3,  farmApr: 9.8  },
  "MATIC/USDT":{ tvl: 22_100_000,  vol24: 5_600_000,   fee: 0.3,  farmApr: 10.5 },
};

const CEX_SOURCES: { name: string; share: number; depth: number }[] = [
  { name: "OrahDEX AMM",     share: 42.1, depth: 2.8 },
  { name: "OrahDEX P2P",     share: 24.3, depth: 2.0 },
  { name: "OrahDEX Vault",   share: 16.4, depth: 1.5 },
  { name: "OrahDEX Futures", share: 11.6, depth: 1.2 },
  { name: "OrahDEX Bridge",  share:  5.6, depth: 0.8 },
];

function fmtLiq(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

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
  // Resolve the current pair's quote asset from the URL for smart tab initialisation
  const urlQuote = (() => {
    const raw = rawSymbol?.replace(/-/g, '/') ?? "BSV/USDT";
    const q = raw.split('/')[1] ?? "USDT";
    return (QUOTE_TABS.some(t => t.id === q) ? q : "USDT") as QuoteTab;
  })();

  const [quoteTab, setQuoteTab] = useState<QuoteTab>(urlQuote);
  const [marketSearch, setMarketSearch] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const [orderBookFill, setOrderBookFill] = useState<OrderFormFill | null>(null);
  const [pairDropOpen, setPairDropOpen] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const [dropQuote, setDropQuote] = useState<QuoteTab>(urlQuote);
  const [hideOtherPairs, setHideOtherPairs] = useState(false);
  const [cancelPairOnly, setCancelPairOnly] = useState(false);
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

  // When navigating to a pair whose quote isn't in the current tab, auto-switch
  useEffect(() => {
    setDropQuote(urlQuote);
    setQuoteTab(urlQuote);
  }, [urlQuote]);

  const handleOrderBookFill = (fill: OrderBookFill) => {
    setOrderBookFill(fill as OrderFormFill);
  };

  // Handle both dash-separated (/trade/BTC-USDT) and URL-encoded slash (/trade/BTC%2FUSDT)
  const decodedRaw = decodeURIComponent(rawSymbol);
  const symbol = decodedRaw.includes('/') ? decodedRaw : decodedRaw.replace(/-/g, '/');
  const [base = '', quote = ''] = symbol.split('/');

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
    query: { refetchInterval: 4000, staleTime: 2000 },
  });
  const { data: apiTrades }    = useGetRecentTrades(encodeURIComponent(symbol), { limit: 50 });
  const { data: apiOrders, refetch: refetchOrders } = useGetOrders(
    { walletAddress: address || '' },
    { query: { enabled: !!address, refetchInterval: 5000 } }
  );
  const { data: apiMarkets } = useGetMarkets();

  const ticker     = (apiTicker?.lastPrice && apiTicker.lastPrice > 0 ? apiTicker : null)
    ?? MOCK_TICKER[rawSymbol]
    ?? generateTickerForSymbol(base, quote);
  const isPositive = ticker.priceChangePercent >= 0;
  const candles    = apiCandles || generateMockCandles(ticker.lastPrice);
  const trades     = Array.isArray(apiTrades) ? apiTrades : generateMockTrades(ticker.lastPrice);

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

  // Market list for pair selector — base is the full mock catalogue (all chains/quotes)
  // then API data replaces any matching pair with live data.
  const allMarkets = useMemo(() => {
    const apiNorm = ((apiMarkets && (apiMarkets as any[]).length > 0) ? (apiMarkets as any[]) : [])
      .map(normalise)
      .filter(m => m.type === "spot");
    const mockNorm = ALL_SPOT_MOCK.map(normalise);
    // deduplicate: API wins, then mock fills the rest
    const deduped = new Map<string, ReturnType<typeof normalise>>();
    mockNorm.forEach(m => { if (!deduped.has(m.symbol)) deduped.set(m.symbol, m); });
    apiNorm.forEach(m => { deduped.set(m.symbol, m); }); // API overrides mock
    return Array.from(deduped.values());
  }, [apiMarkets]);

  const currentMarket = useMemo(
    () => allMarkets.find(m => m.baseAsset === base && m.quoteAsset === quote) ?? null,
    [allMarkets, base, quote]
  );

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
          <div className="flex flex-col gap-0.5">
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
            <ContractAddressBadge
              baseAsset={base}
              dbAddresses={(currentMarket as any)?.contractAddresses}
              variant="full"
            />
          </div>

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
              {/* Quote tabs — only show tabs that have at least 1 pair */}
              <div className="flex gap-0.5 px-3 py-1.5 border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
                {QUOTE_TABS.filter(t => (quoteCounts[t.id] ?? 0) > 0).map(t => (
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
                    <span className="ml-1 text-[9px] opacity-60">{quoteCounts[t.id]}</span>
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
                    const isActive = m.symbol === symbol;
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

        {/* CENTER: Chart & Bottom Tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border-b border-border relative min-h-0" style={{ minHeight: "320px" }}>
            <Chart symbol={symbol} />
          </div>
          <div className="h-[220px] shrink-0 bg-card flex flex-col border-t border-border">
            {/* Tab bar + controls row */}
            <div className="flex items-center justify-between px-2 border-b border-border shrink-0">
              <div className="flex gap-0">
                {([
                  { key: "open",      label: `Open Orders(${openOrders.length})` },
                  { key: "history",   label: `Order History(${filledOrders.length})` },
                  { key: "trades",    label: "Trade History" },
                  { key: "liquidity", label: "Liquidity & CEX" },
                ] as { key: BottomTab; label: string }[]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setBottomTab(t.key)}
                    className={cn(
                      "py-2 px-3 border-b-2 transition-colors whitespace-nowrap text-[11px] font-medium",
                      bottomTab === t.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Right controls */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
                {bottomTab === "open" && openOrders.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                    <input
                      type="checkbox"
                      checked={cancelPairOnly}
                      onChange={e => setCancelPairOnly(e.target.checked)}
                      className="w-3 h-3 accent-primary"
                    />
                    Cancel orders of the current trading pair
                  </label>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    checked={hideOtherPairs}
                    onChange={e => setHideOtherPairs(e.target.checked)}
                    className="w-3 h-3 accent-primary"
                  />
                  Hide Other Pairs
                </label>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {/* ── Open Orders ── */}
              {bottomTab === "open" && (() => {
                const rows = hideOtherPairs
                  ? openOrders.filter((o: any) => o.symbol === symbol)
                  : openOrders;
                return rows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {address ? "No open orders." : "Log in or connect wallet to view open orders."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium text-right">Filled</th>
                        <th className="px-3 py-1.5 font-medium text-right">Unfilled</th>
                        <th className="px-3 py-1.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((o: any, i: number) => {
                        const qty = Number(o.quantity);
                        const filled = Number(o.filledQuantity ?? 0);
                        const unfilled = Math.max(0, qty - filled);
                        const total = Number(o.price ?? 0) * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="px-3 py-1.5 text-right">{formatPrice(o.price)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{filled.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right">{unfilled.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => cancelOrder.mutate({ orderId: String(o.id), data: { walletAddress: address || "" } })}
                                disabled={cancelOrder.isPending}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all disabled:opacity-40"
                              >
                                {cancelOrder.isPending ? "…" : "Cancel"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Order History ── */}
              {bottomTab === "history" && (() => {
                const rows = hideOtherPairs
                  ? filledOrders.filter((o: any) => o.symbol === symbol)
                  : filledOrders;
                return rows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {!address ? "Log in or connect wallet to view order history." : "No completed orders yet."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium">Status</th>
                        <th className="px-3 py-1.5 font-medium">BSV Settlement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((o: any, i: number) => {
                        const qty = Number(o.quantity);
                        const total = Number(o.price ?? 0) * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{new Date(o.updatedAt ?? o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="px-3 py-1.5 text-right">{formatPrice(o.price)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className={cn("px-3 py-1.5 capitalize font-semibold text-[10px]", o.status === "filled" ? "text-buy" : "text-muted-foreground")}>{o.status}</td>
                            <td className="px-3 py-1.5">
                              {o.txid ? (
                                <a href={`https://whatsonchain.com/tx/${o.txid}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span className="text-[10px] font-mono">{o.txid.slice(0, 8)}…</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Trade History (market trades) ── */}
              {bottomTab === "trades" && (
                trades.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    No trade history for this pair.
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {(trades as any[]).slice(0, 50).map((t: any, i: number) => (
                        <tr key={t.id ?? i} className="hover:bg-white/5 transition-colors">
                          <td className="px-3 py-1.5 text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                          <td className="px-3 py-1.5">{symbol}</td>
                          <td className={cn("px-3 py-1.5 font-semibold capitalize", t.side === "buy" ? "text-buy" : "text-sell")}>{t.side}</td>
                          <td className={cn("px-3 py-1.5 text-right font-mono", t.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(t.price)}</td>
                          <td className="px-3 py-1.5 text-right">{Number(t.quantity).toFixed(4)}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(t.price * t.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {/* ── Liquidity & CEX Panel ── */}
              {bottomTab === "liquidity" && (() => {
                const bids = (orderBook as any).bids ?? [];
                const asks = (orderBook as any).asks ?? [];
                const bidWall = bids.reduce((s: number, b: any) => s + (b.price * b.quantity), 0);
                const askWall = asks.reduce((s: number, a: any) => s + (a.price * a.quantity), 0);
                const bestBid = bids[0]?.price ?? 0;
                const bestAsk = asks[asks.length - 1]?.price ?? asks[0]?.price ?? 0;
                const spread = bestAsk > bestBid ? bestAsk - bestBid : 0;
                const midPrice = (bestBid + bestAsk) / 2;
                const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;
                const pool = POOL_MAP[symbol] ?? null;
                const dexVol24 = pool?.vol24 ?? (ticker.quoteVolume ?? 0);
                const dexTvl = pool?.tvl ?? (bidWall + askWall);
                const poolApr = pool ? ((pool.vol24 * (pool.fee / 100)) / pool.tvl) * 365 * 100 : 0;
                const totalCexVol = dexVol24 * 26; // DEX ~4% of total market
                return (
                  <div className="h-full overflow-y-auto">
                    <div className="p-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                      {/* Order Book Depth */}
                      <div className="col-span-2 md:col-span-4 xl:col-span-8">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <BarChart3 className="w-3 h-3" /> Live Order Book Depth
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="bg-buy/5 border border-buy/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Buy Wall (Bids)</p>
                            <p className="text-sm font-mono font-bold text-buy">{fmtLiq(bidWall)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{bids.length} bid levels</p>
                          </div>
                          <div className="bg-sell/5 border border-sell/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Sell Wall (Asks)</p>
                            <p className="text-sm font-mono font-bold text-sell">{fmtLiq(askWall)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{asks.length} ask levels</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Bid-Ask Spread</p>
                            <p className="text-sm font-mono font-bold text-foreground">{spread > 0 ? `$${spread.toFixed(4)}` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{spreadPct.toFixed(3)}% of mid</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">24h Volume</p>
                            <p className="text-sm font-mono font-bold text-foreground">{fmtLiq(ticker.quoteVolume ?? dexVol24)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{formatVolume(ticker.volume ?? 0)} {base}</p>
                          </div>
                        </div>
                      </div>
                      {/* DEX Pool Section */}
                      <div className="col-span-2 md:col-span-2 xl:col-span-4">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 mt-2">
                          <Droplets className="w-3 h-3 text-primary" /> DEX Liquidity Pool — {symbol}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool TVL</p>
                            <p className="text-sm font-mono font-bold text-primary">{fmtLiq(dexTvl)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Total Value Locked</p>
                          </div>
                          <div className="bg-green-400/5 border border-green-400/20 rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool APR</p>
                            <p className="text-sm font-mono font-bold text-green-400">{pool ? `${poolApr.toFixed(1)}%` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">LP fee income</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">Pool Fee</p>
                            <p className="text-sm font-mono font-bold text-foreground">{pool ? `${pool.fee}%` : "—"}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">per trade</p>
                          </div>
                          <div className="bg-card border border-border rounded-xl p-2.5">
                            <p className="text-[9px] text-muted-foreground mb-0.5">24h Pool Vol</p>
                            <p className="text-sm font-mono font-bold text-foreground">{fmtLiq(dexVol24)}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">LP earnings: {fmtLiq(dexVol24 * ((pool?.fee ?? 0.3) / 100) * (5 / 6))}</p>
                          </div>
                        </div>
                      </div>
                      {/* CEX Market Share */}
                      <div className="col-span-2 md:col-span-2 xl:col-span-4">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5 mt-2">
                          <Building2 className="w-3 h-3 text-blue-400" /> CEX Market Liquidity
                        </p>
                        <div className="space-y-1.5">
                          {CEX_SOURCES.map(cex => {
                            const vol = totalCexVol * (cex.share / 100);
                            const isOrah = cex.name === "OrahDEX";
                            return (
                              <div key={cex.name} className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[10px] font-semibold w-20 shrink-0",
                                  isOrah ? "text-primary" : "text-foreground"
                                )}>{cex.name}</span>
                                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all", isOrah ? "bg-primary" : "bg-blue-400/60")}
                                    style={{ width: `${cex.share}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{cex.share}%</span>
                                <span className="text-[10px] font-mono text-foreground w-16 text-right">{fmtLiq(vol)}</span>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between pt-1 border-t border-border mt-2">
                            <span className="text-[10px] text-muted-foreground">Est. Total Market</span>
                            <span className="text-[10px] font-mono font-bold text-foreground">{fmtLiq(totalCexVol)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* CENTER-RIGHT: Order Book + Market Trades */}
        <div className="hidden lg:flex w-[210px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          <OrderBook
            data={orderBook}
            lastPrice={ticker.lastPrice}
            onFill={handleOrderBookFill}
            symbol={symbol}
            trades={trades as any}
          />
        </div>

        {/* FAR-RIGHT: Order Form + AI Analysis */}
        <div className="hidden lg:flex w-[230px] shrink-0 border-l border-border flex-col min-h-0 bg-card overflow-y-auto">
          <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} />
          <div className="p-2 border-t border-border">
            <AiTradeAnalysis symbol={rawSymbol} baseAsset={base} />
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
