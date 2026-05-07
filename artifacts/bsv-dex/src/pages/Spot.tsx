import { useParams, Link } from "wouter";
import { CoinLogo } from "@/components/CoinLogo";
import { useSEO } from "@/hooks/useSEO";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetRecentTrades, useGetOrders, useCancelOrder, getGetOrdersQueryKey } from "@workspace/api-client-react";
import { useStagedMarkets as useGetMarkets } from "@/hooks/useStagedMarkets";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import type { OrderBookFill } from "@/components/trading/OrderBook";
import type { OrderFormFill } from "@/components/trading/OrderForm";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import type { ExternalFlash } from "@/components/trading/OrderBook";
import { OrderForm } from "@/components/trading/OrderForm";
import { LetsExchangePanel } from "@/components/LetsExchangePanel";
import { useLetsExchangeCoins } from "@/hooks/useLetsExchangeCoins";
import { useLetsExchangeRate } from "@/hooks/useLetsExchangeRate";
import { useLetsExchangePairs } from "@/hooks/useLetsExchangePairs";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, generateMockTrades, generateTickerForSymbol, ALL_SPOT_MOCK } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn, formatVolume, marketMatchesQuery } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { ExternalLink, CheckCircle2, Search, ChevronDown, X, Droplets, TrendingUp, BarChart3, Zap, Building2, ArrowUpDown, ArrowLeftRight, BookOpen, RefreshCw } from "lucide-react";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { AiTradeAnalysis } from "@/components/AiTradeAnalysis";
import { useWalletPrices } from "@/hooks/useWalletPrices";

type BottomTab = "open" | "history" | "trades" | "liquidity";
type QuoteTab =
  | "USDT" | "USDC" | "BTC" | "ETH" | "BSV" | "BCH" | "BNB"
  | "ARB"  | "OP"   | "MATIC" | "AVAX" | "SOL" | "TRX"
  | "FTM"  | "CRO"  | "MNT"  | "ZK"  | "SCR" | "LINEA";

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
  { id: "MNT",   label: "MNT",   color: "text-teal-400"   },
  { id: "ZK",    label: "ZK",    color: "text-purple-400" },
  { id: "SCR",   label: "SCR",   color: "text-orange-300" },
  { id: "LINEA", label: "LINEA", color: "text-sky-400"    },
];


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

function formatDateTime(value: string | Date) {
  const dt = new Date(value);
  return dt.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getOrderExplorerUrl(order: any): string | null {
  if (order?.explorerUrl) return String(order.explorerUrl);
  if (!order?.txid) return null;
  const txid = String(order.txid);
  if (txid.startsWith("htlc-pending-")) return null;
  return txid.startsWith("0x")
    ? `https://etherscan.io/tx/${txid}`
    : `https://whatsonchain.com/tx/${txid}`;
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
  const { address, internalBsvAddress, internalEvmAddress } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  // Alt address: Orah wallet users have both a BSV and an EVM address.
  // Orders placed on the BSV network are stored against the BSV address, and
  // orders placed on the EVM network are stored against the EVM address.
  // We must query both so orders don't disappear when the user switches networks.
  const altAddress = (internalEvmAddress && internalEvmAddress !== address)
    ? internalEvmAddress
    : (internalBsvAddress && internalBsvAddress !== address)
      ? internalBsvAddress
      : null;
  const [bottomTab, setBottomTab] = useState<BottomTab>("open");
  // Resolve the current pair's quote asset from the URL for smart tab initialisation
  const urlQuote = (() => {
    const raw = rawSymbol?.replace(/-/g, '/') ?? "BSV/USDT";
    const q = raw.split('/')[1] ?? "USDT";
    return (QUOTE_TABS.some(t => t.id === q) ? q : "USDT") as QuoteTab;
  })();

  const [quoteTab, setQuoteTab] = useState<QuoteTab>(urlQuote);
  const [candleInterval, setCandleInterval] = useState(() => {
    const saved = localStorage.getItem('orahdex-spot-interval');
    const valid = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','3d','1w','1M','1Y','2Y','5Y','10Y','All'];
    return saved && valid.includes(saved) ? saved : "1h";
  });
  const [marketSearch, setMarketSearch] = useState("");
  const [orderBookFill, setOrderBookFill] = useState<OrderFormFill | null>(null);
  const [obFlash, setObFlash] = useState<ExternalFlash | null>(null);
  const [pairDropOpen, setPairDropOpen] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const [dropQuote, setDropQuote] = useState<QuoteTab>(urlQuote);
  const [hideOtherPairs, setHideOtherPairs] = useState(false);
  const [cancelPairOnly, setCancelPairOnly] = useState(false);
  // Track whether to highlight the LE panel (set when user clicks LE orderbook rows)
  const [lePanelKey, setLePanelKey] = useState(0);
  const lePanelRef = useRef<HTMLDivElement>(null);
  const pairDropRef = useRef<HTMLDivElement>(null);

  // ── Trade mode: "order" = internal DEX, "swap" = LetsExchange routing ─────
  type TradeMode = "order" | "swap";
  const [tradeMode, setTradeMode] = useState<TradeMode>("order");
  const [tradeModeLockedByUser, setTradeModeLockedByUser] = useState(false);

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

  // Persist candle interval across page refreshes
  useEffect(() => { localStorage.setItem('orahdex-spot-interval', candleInterval); }, [candleInterval]);

  const handleOrderBookFill = (fill: OrderBookFill) => {
    setOrderBookFill(fill as OrderFormFill);
  };

  // Flash the OrderBook spread row when a trade is placed or LE swap confirmed
  const handleTradeFlash = useCallback((fill: { price: number; side: "buy" | "sell"; source?: "order" | "letsexchange" }) => {
    setObFlash({ price: fill.price, side: fill.side, ts: Date.now(), source: fill.source ?? "order" });
  }, []);

  const handleLeExchangeCreated = useCallback((fill: { price: number; side: "buy" | "sell" }) => {
    handleTradeFlash({ ...fill, source: "letsexchange" });
  }, [handleTradeFlash]);

  // Handle both dash-separated (/trade/BTC-USDT) and URL-encoded slash (/trade/BTC%2FUSDT)
  const decodedRaw = decodeURIComponent(rawSymbol);
  const symbol = decodedRaw.includes('/') ? decodedRaw : decodedRaw.replace(/-/g, '/');
  const [base = '', quote = ''] = symbol.split('/');

  const noStoreRequest = { cache: "no-store" as const };
  const { data: apiTicker }    = useGetTicker(encodeURIComponent(symbol), { request: noStoreRequest });
  const { data: apiCandles }   = useGetCandles(encodeURIComponent(symbol), { interval: candleInterval as any, limit: 300 }, { request: noStoreRequest });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 }, {
    request: noStoreRequest,
    query: { refetchInterval: 4000, staleTime: 2000 },
  });
  const { data: apiTrades }    = useGetRecentTrades(encodeURIComponent(symbol), { limit: 50 }, { request: noStoreRequest });
  const { data: apiOrders, refetch: refetchOrders } = useGetOrders(
    { walletAddress: address || '' },
    { query: { enabled: !!address, refetchInterval: 5000 } }
  );
  // Also fetch orders placed under the alternate address (BSV ↔ EVM cross-network)
  const { data: altOrders, refetch: refetchAltOrders } = useGetOrders(
    { walletAddress: altAddress || '' },
    { query: { enabled: !!altAddress, refetchInterval: 5000 } }
  );
  const { data: apiMarkets } = useGetMarkets();

  // ── LetsExchange integration ──────────────────────────────────────────────
  const { getCoin: getLECoin, isLECoin } = useLetsExchangeCoins();
  // Server-provided pairs — all LE coins against all supported quote assets.
  // Fetched once per quote tab on demand; falls back to [] while loading.
  const { pairs: lePairs } = useLetsExchangePairs({ all: true });

  // Get primary LE coin entries for the current pair (null if not supported)
  const fromLECoin = useMemo(() => getLECoin(base),  [getLECoin, base]);
  const toLECoin   = useMemo(() => getLECoin(quote), [getLECoin, quote]);

  // Live LE rate for the current pair — null when pair unsupported on LE
  const { rate: leRateData } = useLetsExchangeRate(
    fromLECoin ? { symbol: fromLECoin.symbol, network: fromLECoin.network } : null,
    toLECoin   ? { symbol: toLECoin.symbol,   network: toLECoin.network   } : null,
  );

  // Callback for OrderBook LE rows — switch to swap mode and remount LE panel
  const handleLeSwap = useCallback(() => {
    setLePanelKey(k => k + 1);
    setTradeMode("swap");
    setTradeModeLockedByUser(true);
  }, []);

  const ticker     = (apiTicker?.lastPrice && apiTicker.lastPrice > 0 ? apiTicker : null)
    ?? MOCK_TICKER[rawSymbol]
    ?? generateTickerForSymbol(base, quote);
  const isPositive = ticker.priceChangePercent >= 0;

  /* ── Cross-rate: USD equivalent of the quoted price ── */
  const { prices: crossRates } = useWalletPrices();
  const STABLES = new Set(["USDT", "USDC", "TUSD", "USDD", "FDUSD", "BUSD", "DAI"]);
  const QUOTE_TO_USD: Record<string, number> = {
    USDT: 1, USDC: 1, TUSD: 1, USDD: 1, FDUSD: 1, BUSD: 1, DAI: 1,
    BTC:  crossRates.BTC?.usd  || 83000,
    ETH:  crossRates.ETH?.usd  || 2400,
    BSV:  crossRates.BSV?.usd  || 14,
    BNB: 580, BCH: 320, SOL: 130, MATIC: 0.32,
    AVAX: 18, ARB: 0.42, OP: 0.70, FTM: 0.51, CRO: 0.085, TRX: 0.24,
  };
  const isStableQuote  = STABLES.has(quote);
  const quoteMultiplier = QUOTE_TO_USD[quote] ?? 1;
  const priceInUsd     = ticker.lastPrice * quoteMultiplier;
  /* For stablecoin pairs the price IS the USD price, so just show $price.
     For cross-rate pairs show the approximate USD equivalent. */
  const usdEquivalent  = isStableQuote
    ? `$${formatPrice(ticker.lastPrice)}`
    : `≈$${formatPrice(priceInUsd)}`;

  /* ── SEO + live browser-tab title (price in title so it updates as price changes) ── */
  const seoJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `${base}/${quote} Spot Trading on OrahDEX`,
    "description": `Live ${base}/${quote} spot trading with real-time charts and order book`,
    "url": `https://orahdex.replit.app/trade/${rawSymbol}`
  }), [base, quote, rawSymbol]);

  const priceSign = ticker.priceChangePercent >= 0 ? "▲" : "▼";
  useSEO({
    title: `${priceSign} ${formatPrice(ticker.lastPrice)} | ${base}/${quote}`,
    description: `Trade ${base}/${quote} on OrahDEX spot market. Real-time price chart, order book, and depth data. Place limit, market, and stop orders instantly.`,
    keywords: `${base} ${quote} trading, ${base} price, buy ${base}, sell ${base}, ${rawSymbol} spot, OrahDEX spot`,
    url: `/trade/${rawSymbol}`,
    jsonLd: seoJsonLd,
  });

  const candles    = (apiCandles && apiCandles.length > 0) ? apiCandles : generateMockCandles(ticker.lastPrice);
  const trades     = (Array.isArray(apiTrades) && apiTrades.length > 0) ? apiTrades : generateMockTrades(ticker.lastPrice);

  function toEntries(raw: number[][], descending: boolean) {
    const sorted = [...raw].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
    let cum = 0;
    return sorted.map(([p, q]) => { cum += p * q; return { price: p, quantity: q, total: cum }; });
  }
  const rawOB = apiOrderBook as any;
  const hasRealOB = rawOB?.bids?.length > 0 || rawOB?.asks?.length > 0;

  // Auto-switch trade mode based on liquidity, unless the user manually picked
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tradeModeLockedByUser) {
      setTradeMode(hasRealOB ? "order" : "swap");
    }
  }, [hasRealOB, symbol]); // reset on symbol change too

  // When pair changes, unlock user preference so auto-routing kicks in fresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTradeModeLockedByUser(false); }, [symbol]);

  const orderBook = (hasRealOB && Array.isArray(rawOB.bids[0])
    ? { bids: toEntries(rawOB.bids, true), asks: toEntries(rawOB.asks, false) }
    : (hasRealOB ? apiOrderBook : generateMockOrderBook(ticker.lastPrice))) as import("@workspace/api-client-react").OrderBook;

  const queryClient = useQueryClient();
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());

  // Optimistic cancel: immediately mark order as cancelled in cache so the user
  // sees the change on the first click; refetch afterward to reconcile.
  const cancelOrder = useMutation({
    mutationFn: async ({ orderId, walletAddress: ownerWallet }: { orderId: string; walletAddress: string }) => {
      const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ownerWallet }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to cancel order");
      return res.json();
    },
    onMutate: async ({ orderId }) => {
      setCancellingIds(prev => { const n = new Set(prev); n.add(orderId); return n; });
      const keys = [
        getGetOrdersQueryKey({ walletAddress: address || "" }),
        ...(altAddress ? [getGetOrdersQueryKey({ walletAddress: altAddress })] : []),
      ];
      await Promise.all(keys.map(k => queryClient.cancelQueries({ queryKey: k })));
      const snapshots = keys.map(k => [k, queryClient.getQueryData(k)] as const);
      keys.forEach(k => {
        queryClient.setQueryData(k, (old: any) =>
          Array.isArray(old)
            ? old.map((o: any) => String(o.id) === orderId ? { ...o, status: "cancelled" } : o)
            : old
        );
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([k, v]: any) => queryClient.setQueryData(k, v));
    },
    onSettled: (_d, _e, vars) => {
      setCancellingIds(prev => { const n = new Set(prev); n.delete(vars.orderId); return n; });
      refetchOrders();
      refetchAltOrders();
    },
  });

  // Merge orders from both addresses, deduplicated by id, so BSV-network orders
  // remain visible even when the user's active network is EVM (and vice versa).
  const allOrders = useMemo(() => {
    const primary = (apiOrders as any[]) || [];
    const alt     = (altOrders  as any[]) || [];
    const seen    = new Set<string>();
    return [...primary, ...alt].filter(o => {
      const key = String(o.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [apiOrders, altOrders]);
  const openOrders   = allOrders.filter((o: any) => o.status === "open");
  const filledOrders = allOrders.filter((o: any) => o.status === "filled" || o.status === "cancelled");

  // Market list for pair selector — base is the full mock catalogue (all chains/quotes)
  // then API data replaces any matching pair with live data.
  // Then server-provided LetsExchange pairs are merged in (API wins over LE).
  const allMarkets = useMemo(() => {
    const apiNorm = ((apiMarkets && (apiMarkets as any[]).length > 0) ? (apiMarkets as any[]) : [])
      .map(normalise)
      .filter(m => m.type === "spot");
    const mockNorm = ALL_SPOT_MOCK.map(normalise);
    // deduplicate: API wins on price, mock fills the rest.
    // If API returns exactly 0 change (unseeded pair), prefer the mock's realistic change.
    const deduped = new Map<string, ReturnType<typeof normalise>>();
    mockNorm.forEach(m => { if (!deduped.has(m.symbol)) deduped.set(m.symbol, m); });
    apiNorm.forEach(m => {
      const mock = deduped.get(m.symbol);
      const chg = m.priceChangePercent24h !== 0
        ? m.priceChangePercent24h
        : (mock?.priceChangePercent24h ?? 0);
      deduped.set(m.symbol, { ...m, priceChangePercent24h: chg });
    });

    // Merge server-provided LE pairs — skip pairs that already exist natively
    lePairs.forEach(p => {
      if (!deduped.has(p.symbol)) {
        deduped.set(p.symbol, normalise(p as any));
      }
    });

    return Array.from(deduped.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMarkets, lePairs]);

  const currentMarket = useMemo(
    () => allMarkets.find(m => m.baseAsset === base && m.quoteAsset === quote) ?? null,
    [allMarkets, base, quote]
  );

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim();
    if (q) {
      // When actively searching, drop the quoteTab filter and search ALL markets
      return allMarkets.filter(m =>
        marketMatchesQuery(m.baseAsset, m.quoteAsset, m.symbol, q)
      );
    }
    return allMarkets.filter(m => m.quoteAsset === quoteTab);
  }, [allMarkets, quoteTab, marketSearch]);

  const quoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    QUOTE_TABS.forEach(t => {
      counts[t.id] = allMarkets.filter(m => m.quoteAsset === t.id).length;
    });
    return counts;
  }, [allMarkets]);

  const dropFiltered = useMemo(() => {
    const q = dropSearch.trim();
    if (q) {
      // When actively searching, ignore the quote tab and search ALL markets
      return allMarkets.filter(m =>
        marketMatchesQuery(m.baseAsset, m.quoteAsset, m.symbol, q)
      );
    }
    return allMarkets.filter(m => m.quoteAsset === dropQuote);
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
              className="flex items-center gap-2 group"
            >
              {/* Overlapping base + quote logos */}
              <div className="flex items-center shrink-0">
                <CoinLogo symbol={base} size={26} ring />
                <CoinLogo symbol={quote} size={20} ring className="-ml-2" />
              </div>
              <h1 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                {base}/{quote}
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
                    placeholder="Search by coin, name or chain (e.g. APE, ethereum, ETH)…"
                    value={dropSearch}
                    onChange={e => setDropSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/60 border border-border rounded-lg outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>
              {/* Quote tabs — collapse to "All markets" pill when searching */}
              {dropSearch.trim() ? (
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
                  <span className="text-[10px] font-bold text-primary bg-primary/15 px-2 py-0.5 rounded-full">
                    🔍 All markets · {dropFiltered.length} result{dropFiltered.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[9px] text-muted-foreground">Searching every chain &amp; quote</span>
                </div>
              ) : (
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
              )}
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
                    const isLEPair = (m as any).leSource === true || (m as any).type === "letsexchange";
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
                        <CoinLogo symbol={m.baseAsset} size={24} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-foreground">{m.baseAsset}</span>
                            <span className="text-[10px] text-muted-foreground">/{m.quoteAsset}</span>
                            {isLEPair && (
                              <span className="text-[8px] px-1 py-px rounded bg-yellow-500/20 text-yellow-400 font-bold leading-none">⚡ SWAP</span>
                            )}
                          </div>
                        </div>
                        <span className="w-20 text-right text-[11px] font-mono text-foreground tabular-nums">
                          {isLEPair && m.lastPrice === 0 ? "—" : formatPrice(m.lastPrice)}
                        </span>
                        <span className={cn(
                          "w-14 text-right text-[10px] font-bold tabular-nums",
                          isUp ? "text-buy" : "text-sell"
                        )}>
                          {isLEPair && m.priceChangePercent24h === 0 ? "—" : `${isUp ? "+" : ""}${m.priceChangePercent24h.toFixed(2)}%`}
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
          <span className="text-xs text-muted-foreground font-mono mt-1">{usdEquivalent}</span>
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
            <Chart
              symbol={symbol}
              interval={candleInterval}
              onIntervalChange={setCandleInterval}
              data={candles}
            />
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
                        <th className="px-3 py-1.5 font-medium">Date & Time</th>
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
                                onClick={() => {
                                  const id = String(o.id);
                                  if (cancellingIds.has(id)) return;
                                  cancelOrder.mutate({ orderId: id, walletAddress: String(o.walletAddress || address || "") });
                                }}
                                disabled={cancellingIds.has(String(o.id))}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all disabled:opacity-40"
                              >
                                {cancellingIds.has(String(o.id)) ? "…" : "Cancel"}
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
                        <th className="px-3 py-1.5 font-medium">Date & Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium">Status</th>
                        <th className="px-3 py-1.5 font-medium">Tx / ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((o: any, i: number) => {
                        const qty = Number(o.quantity);
                        const total = Number(o.price ?? 0) * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{formatDateTime(o.updatedAt ?? o.createdAt)}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="px-3 py-1.5 text-right">{formatPrice(o.price)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5">
                              {String(o.txid ?? "").startsWith("htlc-pending-") ? (
                                <span className="capitalize font-semibold text-[10px] text-amber-400 flex items-center gap-0.5">
                                  <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                  Settling
                                </span>
                              ) : (
                                <span className={cn("capitalize font-semibold text-[10px]", o.status === "filled" ? "text-buy" : "text-muted-foreground")}>{o.status}</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">#{String(o.id).slice(0, 8)}</span>
                                {o.txid && getOrderExplorerUrl(o) ? (
                                  <a href={getOrderExplorerUrl(o)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="text-[10px] font-mono">{o.txid.slice(0, 12)}…</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Trade History (user's own filled orders) ── */}
              {bottomTab === "trades" && (() => {
                const myTrades = (hideOtherPairs
                  ? filledOrders.filter((o: any) => o.symbol === symbol)
                  : filledOrders
                ).filter((o: any) => o.status === "filled");
                return myTrades.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    {!address ? "Log in or connect wallet to view trade history." : "No filled trades yet. Place an order to get started."}
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground font-sans border-b border-border">
                        <th className="px-3 py-1.5 font-medium">Time</th>
                        <th className="px-3 py-1.5 font-medium">Pair</th>
                        <th className="px-3 py-1.5 font-medium">Type</th>
                        <th className="px-3 py-1.5 font-medium">Side</th>
                        <th className="px-3 py-1.5 font-medium text-right">Fill Price</th>
                        <th className="px-3 py-1.5 font-medium text-right">Amount</th>
                        <th className="px-3 py-1.5 font-medium text-right">Total</th>
                        <th className="px-3 py-1.5 font-medium">Tx / ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {myTrades.slice(0, 50).map((o: any, i: number) => {
                        const qty   = Number(o.quantity);
                        const px    = Number(o.price ?? 0);
                        const total = px * qty;
                        return (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="px-3 py-1.5 text-muted-foreground">{formatDateTime(o.updatedAt ?? o.createdAt)}</td>
                            <td className="px-3 py-1.5">{o.symbol}</td>
                            <td className="px-3 py-1.5 capitalize text-muted-foreground">{o.type ?? "limit"}</td>
                            <td className={cn("px-3 py-1.5 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className={cn("px-3 py-1.5 text-right font-mono", o.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(px)}</td>
                            <td className="px-3 py-1.5 text-right">{qty.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPrice(total)}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-mono text-muted-foreground">#{String(o.id).slice(0, 8)}</span>
                                {o.txid && getOrderExplorerUrl(o) ? (
                                  <a href={getOrderExplorerUrl(o)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="text-[10px] font-mono">{o.txid.slice(0, 12)}…</span>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">pending</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              {/* ── Liquidity & CEX Panel ── */}
              {bottomTab === "liquidity" && (() => {
                const bids = (orderBook as any).bids ?? [];
                const asks = (orderBook as any).asks ?? [];
                const bidWall = bids.reduce((s: number, b: any) => s + (b.price * b.quantity), 0);
                const askWall = asks.reduce((s: number, a: any) => s + (a.price * a.quantity), 0);
                const bestBid = bids[0]?.price ?? 0;
                // asks are sorted ascending (lowest first) — index 0 is the best (cheapest) ask
                const bestAsk = asks[0]?.price ?? 0;
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
        <div className="hidden lg:flex w-[240px] xl:w-[260px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          <OrderBook
            data={orderBook}
            lastPrice={ticker.lastPrice}
            onFill={handleOrderBookFill}
            symbol={symbol}
            trades={trades as any}
            leRate={leRateData ? {
              rate:      leRateData.rate,
              minAmount: leRateData.minAmount,
              maxAmount: leRateData.maxAmount,
            } : null}
            hasInternalLiquidity={hasRealOB}
            onLeSwap={handleLeSwap}
            externalFlash={obFlash}
          />
        </div>

        {/* FAR-RIGHT: Smart-routed Trade Panel */}
        <div className="hidden lg:flex w-[270px] xl:w-[300px] shrink-0 border-l border-border flex-col min-h-0 bg-card">
          {/* ── Mode selector ─────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border px-2 pt-2 pb-0">
            {/* Route indicator */}
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-lg mb-2 text-[10px]",
              hasRealOB
                ? "bg-buy/8 text-buy border border-buy/20"
                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/25"
            )}>
              {hasRealOB ? (
                <>
                  <Droplets className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">Liquidity available</span>
                  <span className="text-muted-foreground ml-auto">DEX order book</span>
                </>
              ) : leRateData ? (
                <>
                  <Zap className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">Auto-routed → Swap</span>
                  <span className="text-muted-foreground ml-auto text-[9px]">no DEX depth</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span className="font-semibold">No liquidity yet</span>
                  <span className="text-muted-foreground ml-auto">place first order</span>
                </>
              )}
            </div>
            {/* Toggle tabs */}
            <div className="flex rounded-lg overflow-hidden border border-border mb-2">
              <button
                onClick={() => { setTradeMode("order"); setTradeModeLockedByUser(true); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all",
                  tradeMode === "order"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <BookOpen className="w-3 h-3" />
                Limit / Market
              </button>
              <button
                onClick={() => { setTradeMode("swap"); setTradeModeLockedByUser(true); setLePanelKey(k => k + 1); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold transition-all border-l border-border",
                  tradeMode === "swap"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <ArrowLeftRight className="w-3 h-3" />
                Cross-chain Swap
              </button>
            </div>
          </div>

          {/* ── Trade mode content ────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tradeMode === "order" ? (
              <>
                <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} onOrderPlaced={refetchOrders} onTradeFlash={handleTradeFlash} />
                {/* Swap nudge when no internal OB liquidity */}
                {!hasRealOB && leRateData && (
                  <button
                    onClick={handleLeSwap}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-500/8 hover:bg-yellow-500/15 border-t border-yellow-500/20 transition-colors group"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-[10px] font-bold text-yellow-400 leading-tight">No DEX liquidity — switch to swap?</p>
                      <p className="text-[9px] text-yellow-400/70 leading-tight">
                        1 {base} ≈ {parseFloat(leRateData.rate).toFixed(6)} {quote}
                      </p>
                    </div>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-yellow-400/50 group-hover:text-yellow-400 transition-colors shrink-0" />
                  </button>
                )}
                <div className="p-2 border-t border-border">
                  <AiTradeAnalysis symbol={rawSymbol} baseAsset={base} />
                </div>
              </>
            ) : (
              <div ref={lePanelRef} className="p-2">
                {/* Swap rate summary */}
                {leRateData && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/8 border border-yellow-500/20 rounded-xl mb-2">
                    <RefreshCw className="w-3 h-3 text-yellow-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] text-yellow-400/70 leading-none mb-0.5">Live swap rate</p>
                      <p className="text-[11px] font-bold text-yellow-400 leading-none">
                        1 {base} = {parseFloat(leRateData.rate).toFixed(6)} {quote}
                      </p>
                    </div>
                    <button
                      onClick={() => { setTradeMode("order"); setTradeModeLockedByUser(true); }}
                      className="ml-auto text-[9px] text-muted-foreground hover:text-foreground underline shrink-0"
                    >
                      Trade instead
                    </button>
                  </div>
                )}
                {!leRateData && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-secondary/60 border border-border rounded-xl mb-2">
                    <Zap className="w-3 h-3 text-muted-foreground shrink-0" />
                    <p className="text-[10px] text-muted-foreground">Swap rate not available for this pair</p>
                  </div>
                )}
                <LetsExchangePanel
                  key={lePanelKey}
                  initialFrom={base}
                  initialTo={quote}
                  walletAddress={address}
                  onConnectWallet={openWalletModal}
                  onExchangeCreated={handleLeExchangeCreated}
                />
              </div>
            )}
          </div>
        </div>

        {/* MOBILE: Smart-routed Trade Panel */}
        <div className="lg:hidden w-full shrink-0 border-t border-border bg-card">
          {/* Mobile mode selector */}
          <div className="flex border-b border-border">
            <button
              onClick={() => { setTradeMode("order"); setTradeModeLockedByUser(true); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all",
                tradeMode === "order"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {hasRealOB ? "Trade" : "Provide Liquidity"}
            </button>
            <button
              onClick={() => { setTradeMode("swap"); setTradeModeLockedByUser(true); setLePanelKey(k => k + 1); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all border-l border-border",
                tradeMode === "swap"
                  ? "border-b-2 border-yellow-400 text-yellow-400"
                  : "text-muted-foreground"
              )}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {!hasRealOB ? "Swap (Recommended)" : "Cross-chain Swap"}
            </button>
          </div>

          {/* Liquidity badge */}
          {!hasRealOB && leRateData && (
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[10px]",
              tradeMode === "swap"
                ? "bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20"
                : "bg-secondary/40 text-muted-foreground border-b border-border"
            )}>
              <Zap className="w-3 h-3 shrink-0" />
              <span>Auto-routed: no DEX liquidity — swap recommended</span>
            </div>
          )}

          {tradeMode === "order" ? (
            <OrderForm symbol={symbol} currentPrice={ticker.lastPrice} externalFill={orderBookFill} onOrderPlaced={refetchOrders} onTradeFlash={handleTradeFlash} />
          ) : (
            <div className="p-3">
              <LetsExchangePanel
                key={lePanelKey}
                initialFrom={base}
                initialTo={quote}
                walletAddress={address}
                onConnectWallet={openWalletModal}
                onExchangeCreated={handleLeExchangeCreated}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
