import { useParams, useLocation } from "wouter";
import { CoinLogo } from "@/components/CoinLogo";
import { useSEO } from "@/hooks/useSEO";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useGetTicker, useGetCandles, useGetOrderBook, useGetOrders, useCancelOrder } from "@workspace/api-client-react";
import { Chart } from "@/components/trading/Chart";
import { OrderBook } from "@/components/trading/OrderBook";
import { MOCK_TICKER, generateMockCandles, generateMockOrderBook, FUTURES_MARKETS } from "@/lib/mock-data";
import { formatPrice, formatPercent, cn } from "@/lib/utils";
import { X, ChevronDown, AlertTriangle, Wallet, Loader2, Search } from "lucide-react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";
import { useFuturesMargin } from "@/hooks/useFuturesMargin";

const LEVERAGE_OPTIONS = [2, 3, 5, 10, 20, 25, 50, 75, 100, 125];

function LeverageModal({
  current,
  onSelect,
  onClose,
}: {
  current: number;
  onSelect: (v: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(current);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[340px] shadow-2xl z-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold">Adjust Leverage</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Leverage</span>
            <span className="text-2xl font-black text-primary">{val}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={125}
            value={val}
            onChange={(e) => setVal(Number(e.target.value))}
            className="w-full accent-primary h-1.5 rounded-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>1×</span>
            <span>125×</span>
          </div>
        </div>

        {/* Quick-select buttons */}
        <div className="grid grid-cols-5 gap-1.5 mb-5">
          {LEVERAGE_OPTIONS.map((lv) => (
            <button
              key={lv}
              onClick={() => setVal(lv)}
              className={cn(
                "py-1.5 rounded-lg text-xs font-bold border transition-all",
                val === lv
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {lv}×
            </button>
          ))}
        </div>

        {/* Risk warning */}
        {val >= 20 && (
          <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4 text-xs text-orange-400">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {val >= 50
                ? "Extreme leverage — positions can be liquidated instantly on small moves."
                : "High leverage — ensure you understand the liquidation risk."}
            </span>
          </div>
        )}

        <button
          onClick={() => { onSelect(val); onClose(); }}
          className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
        >
          Confirm {val}× Leverage
        </button>
      </div>
    </div>
  );
}

function useFundingCountdown() {
  const [seconds, setSeconds] = useState(() => {
    const now = new Date();
    const nextSlot = new Date(now);
    nextSlot.setMinutes(now.getMinutes() >= 30 ? 60 : 30, 0, 0);
    return Math.floor((nextSlot.getTime() - now.getTime()) / 1000);
  });
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s <= 1 ? 28800 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FuturesTrading() {
  const { symbol: rawSymbol = "BSV-USDT-PERP" } = useParams();
  const symbol = rawSymbol.replace(/-PERP$/, "-PERP").replace(/^([^-]+)-([^-]+)(-PERP)?$/, "$1/$2$3");
  const seoBase = rawSymbol.split("-")[0];

  const { address, network, balance, chainId: walletChainId, provider, internalBsvAddress, internalEvmAddress } = useWalletStore();
  const isOrahDEXWallet = provider === 'orahdex-wallet';
  const usesApiBalance = isOrahDEXWallet;
  const openModal = useWalletModalStore((s) => s.open);
  const { toast } = useToast();

  // Alt address for cross-network order visibility (BSV ↔ EVM OrahDEX wallet users)
  const altAddress = (internalEvmAddress && internalEvmAddress !== address)
    ? internalEvmAddress
    : (internalBsvAddress && internalBsvAddress !== address)
      ? internalBsvAddress
      : null;

  useSEO({
    title: `${seoBase} Perpetual Futures — Up to 100x Leverage`,
    description: `Trade ${seoBase} perpetual futures on Orah with up to 100x leverage. Real-time funding rate, mark price, and liquidation tools. Cross & isolated margin.`,
    keywords: `${seoBase} futures, ${seoBase} perpetual, ${seoBase} leverage, crypto futures, perp trading, ${rawSymbol}, Orah futures`,
    url: `/futures/${rawSymbol}`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": `${seoBase} Perpetual Futures on Orah`,
      "description": `${seoBase} perpetual futures with up to 100x leverage, cross and isolated margin`,
      "url": `https://orah.replit.app/futures/${rawSymbol}`
    }
  });

  const { data: apiTicker } = useGetTicker(encodeURIComponent(symbol));
  const { data: apiCandles } = useGetCandles(encodeURIComponent(symbol), { interval: "1h", limit: 100 });
  const { data: apiOrderBook } = useGetOrderBook(encodeURIComponent(symbol), { depth: 50 });

  const [leverage, setLeverage] = useState(20);
  const [marginMode, setMarginMode] = useState<"cross" | "isolated">("cross");
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [orderType, setOrderType] = useState<"limit" | "market" | "stop">("limit");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [chartInterval, setChartInterval] = useState("1h");
  const [futuresSide, setFuturesSide] = useState<"buy" | "sell">("buy");
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "history">("positions");

  const [pairDropOpen, setPairDropOpen] = useState(false);
  const [dropSearch, setDropSearch] = useState("");
  const pairDropRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

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

  const { data: apiOrders, refetch: refetchOrders } = useGetOrders(
    { walletAddress: address || "" },
    { query: { enabled: !!address, refetchInterval: 5000 } }
  );
  const { data: altOrders, refetch: refetchAltOrders } = useGetOrders(
    { walletAddress: altAddress || "" },
    { query: { enabled: !!altAddress, refetchInterval: 5000 } }
  );
  const cancelOrder = useCancelOrder({
    mutation: { onSuccess: () => { refetchOrders(); refetchAltOrders(); } },
  });

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
  const openOrders = allOrders.filter((o: any) => o.status === "open");
  const filledOrders = allOrders.filter((o: any) => o.status === "filled" || o.status === "cancelled");

  // ── Futures positions (fetched from /api/futures/positions) ─────────────────
  const [positions, setPositions] = useState<any[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const fetchPositions = useCallback(async () => {
    if (!address) { setPositions([]); return; }
    setPositionsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/futures/positions?walletAddress=${encodeURIComponent(address)}&_t=${Date.now()}`);
      if (r.ok) setPositions(await r.json());
    } catch { /* silently ignore */ }
    finally { setPositionsLoading(false); }
  }, [address]);

  useEffect(() => {
    void fetchPositions();
    if (!address) return;
    const t = setInterval(() => void fetchPositions(), 5000);
    return () => clearInterval(t);
  }, [address, fetchPositions]);

  const countdown = useFundingCountdown();

  const isEvm = !address || network === "evm" || address.startsWith("0x");
  const nativeBal = balance ? parseFloat(balance) : 0;

  // ── Futures margin bucket (isolated from spot user_balances) ─────────────────
  // Futures orders MUST draw from futures_margin_accounts, never from spot ledger.
  const { margin: futuresMgn } = useFuturesMargin(usesApiBalance ? (address ?? undefined) : undefined);
  // Available margin for futures orders; falls back to 0 for external wallets
  const apiUsdtBal = futuresMgn.available;

  // Canonical L2 chain awareness — BaseETH/ArbETH/OPETH all = ETH at 1:1
  const CHAIN_INFO_FUT: Record<number, { nativeSymbol: string; l2Label: string | null }> = {
    1:      { nativeSymbol: "ETH",  l2Label: null      },
    8453:   { nativeSymbol: "ETH",  l2Label: "Base"    },  // BaseETH
    42161:  { nativeSymbol: "ETH",  l2Label: "Arb"     },  // ArbETH
    10:     { nativeSymbol: "ETH",  l2Label: "OP"      },  // OPETH
    137:    { nativeSymbol: "ETH",  l2Label: "Polygon"  },  // bridged ETH
    56:     { nativeSymbol: "BNB",  l2Label: null      },
    43114:  { nativeSymbol: "AVAX", l2Label: null      },
    59144:  { nativeSymbol: "ETH",  l2Label: "Linea"   },
    534352: { nativeSymbol: "ETH",  l2Label: "Scroll"  },
    5000:   { nativeSymbol: "MNT",  l2Label: null      },
  };
  const futChainInfo = walletChainId ? CHAIN_INFO_FUT[walletChainId] : null;
  const nativeSymbol: string = network === "bsv" ? "BSV"
    : network === "btc" ? "BTC"
    : network === "sol" ? "SOL"
    : futChainInfo?.nativeSymbol ?? "ETH";
  const balSourceLabel = futChainInfo?.l2Label ? `${nativeSymbol} (${futChainInfo.l2Label})` : nativeSymbol;

  const [futuresSubmitting, setFuturesSubmitting] = useState(false);

  const handleFuturesSubmit = async (side: "buy" | "sell") => {
    if (!address) { openModal(); return; }
    if (!size || parseFloat(size) <= 0) {
      toast({ title: "Enter size", description: "Please enter a position size.", variant: "destructive" });
      return;
    }
    setFuturesSide(side);
    setFuturesSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/futures/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: `${base}/USDT-PERP`,
          walletAddress: address,
          side: side === "buy" ? "long" : "short",
          leverage,
          quantity: parseFloat(size),
          price: orderType !== "market" && price ? parseFloat(price) : undefined,
          orderType: orderType === "stop" ? "limit" : orderType,
          marginMode,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      toast({
        title: `${side === "buy" ? "Long" : "Short"} Position Opened ✓`,
        description: `${base}-PERP ${side === "buy" ? "Long" : "Short"} ${leverage}× @ ${orderType === "market" ? "market price" : `$${price}`}`,
      });
      setSize("");
      // Refresh positions & balance after trade
      void fetchPositions();
    } catch (err: any) {
      toast({ title: "Order Failed", description: err.message ?? "Could not open futures position. Please try again.", variant: "destructive" });
    } finally {
      setFuturesSubmitting(false);
    }
  };

  const ticker = (apiTicker?.lastPrice && apiTicker.lastPrice > 0 ? apiTicker : null)
    ?? MOCK_TICKER[rawSymbol]
    ?? MOCK_TICKER["BSV-USDT"];
  const isPositive = ticker.priceChangePercent >= 0;
  const candles = apiCandles || generateMockCandles(ticker.lastPrice);

  function toEntries(raw: number[][], descending: boolean) {
    const sorted = [...raw].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]);
    let cum = 0;
    return sorted.map(([p, q]) => { cum += p * q; return { price: p, quantity: q, total: cum }; });
  }
  const rawOB = apiOrderBook as any;
  const orderBook = (rawOB?.bids && Array.isArray(rawOB.bids[0])
    ? { bids: toEntries(rawOB.bids, true), asks: toEntries(rawOB.asks, false) }
    : (apiOrderBook || generateMockOrderBook(ticker.lastPrice))) as import("@workspace/api-client-react").OrderBook;

  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1]?.replace("-PERP", "") ?? "USDT";

  const notional = parseFloat(size || "0") * parseFloat(price || String(ticker.lastPrice));
  const margin = notional / leverage;
  const liqPrice = parseFloat(price || String(ticker.lastPrice)) * (1 - 1 / leverage);

  const leverageColor =
    leverage >= 50 ? "text-red-400 border-red-500/40 bg-red-500/10"
    : leverage >= 20 ? "text-orange-400 border-orange-500/40 bg-orange-500/10"
    : "text-green-400 border-green-500/40 bg-green-500/10";

  return (
    <>
      {showLeverageModal && (
        <LeverageModal
          current={leverage}
          onSelect={setLeverage}
          onClose={() => setShowLeverageModal(false)}
        />
      )}

      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">

        {/* ── Ticker header ── */}
        <div className="flex items-center gap-6 px-4 py-2.5 border-b border-border bg-card shrink-0 overflow-x-auto">
          {/* Pair selector with dropdown */}
          <div className="relative shrink-0" ref={pairDropRef}>
            <button
              onClick={() => { setPairDropOpen(v => !v); setDropSearch(""); }}
              className="flex flex-col items-start group"
            >
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-bold group-hover:text-primary transition-colors">{base}/USDT Perpetual</h1>
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground group-hover:text-primary transition-all shrink-0",
                  pairDropOpen && "rotate-180"
                )} />
                <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] font-black rounded">PERP</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-primary">Funding {countdown}</span>
                <span>· Rate: <span className={cn("font-mono", ((ticker as any).fundingRatePct ?? 0.01) >= 0 ? "text-green-400" : "text-red-400")}>
                  {((ticker as any).fundingRatePct ?? 0.0100) >= 0 ? "+" : ""}{((ticker as any).fundingRatePct ?? 0.0100).toFixed(4)}%
                </span></span>
              </div>
            </button>

            {/* Futures pair dropdown */}
            {pairDropOpen && (
              <div className="absolute top-full left-0 mt-2 w-[300px] bg-card border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
                  <span className="text-xs font-semibold">Choose a futures pair</span>
                  <button onClick={() => setPairDropOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-3 py-2 border-b border-border shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search perpetuals…"
                      value={dropSearch}
                      onChange={e => setDropSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/60 border border-border rounded-lg outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <div className="flex items-center px-3 py-1 text-[9px] font-medium text-muted-foreground border-b border-border/50 shrink-0">
                  <span className="flex-1">Pair</span>
                  <span className="w-20 text-right">Price</span>
                  <span className="w-14 text-right">24h %</span>
                </div>
                <div className="overflow-y-auto max-h-64 min-h-0">
                  {(() => {
                    const q = dropSearch.toLowerCase();
                    const rows = FUTURES_MARKETS.filter(m =>
                      !q || m.baseAsset?.toLowerCase().includes(q) || m.symbol?.toLowerCase().includes(q)
                    );
                    if (rows.length === 0) return (
                      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">No pairs found</div>
                    );
                    return rows.map(m => {
                      const perpSymbol = `${m.baseAsset}-USDT-PERP`;
                      const isActive = perpSymbol === rawSymbol;
                      const isUp = (m.priceChangePercent24h ?? m.priceChangePercent ?? 0) >= 0;
                      return (
                        <button
                          key={m.symbol}
                          onClick={() => { navigate(`/futures/${perpSymbol}`); setPairDropOpen(false); setDropSearch(""); }}
                          className={cn(
                            "w-full flex items-center px-3 py-2 gap-2.5 hover:bg-white/5 cursor-pointer transition-colors text-left",
                            isActive && "bg-primary/10 border-l-2 border-l-primary"
                          )}
                        >
                          <CoinLogo symbol={m.baseAsset ?? ""} size={24} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold">{m.baseAsset}</span>
                            <span className="text-[10px] text-muted-foreground">/USDT PERP</span>
                          </div>
                          <span className="w-20 text-right text-[11px] font-mono tabular-nums">
                            {formatPrice(m.lastPrice)}
                          </span>
                          <span className={cn("w-14 text-right text-[10px] font-bold tabular-nums", isUp ? "text-green-400" : "text-red-400")}>
                            {isUp ? "+" : ""}{(m.priceChangePercent24h ?? m.priceChangePercent ?? 0).toFixed(2)}%
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col shrink-0 border-l border-border pl-5">
            <span className={cn("text-xl font-mono font-bold", isPositive ? "text-green-500" : "text-red-500")}>
              {formatPrice(ticker.lastPrice)}
            </span>
            <span className={cn("text-xs font-mono", isPositive ? "text-green-500" : "text-red-500")}>
              {isPositive ? "+" : ""}{formatPercent(ticker.priceChangePercent)}
            </span>
          </div>

          {[
            { label: "Mark Price", val: formatPrice((ticker as any).markPrice ?? ticker.lastPrice) },
            { label: "Index Price", val: formatPrice((ticker as any).indexPrice ?? ticker.lastPrice) },
            { label: "24h High", val: formatPrice((ticker as any).high24h ?? ticker.highPrice ?? ticker.lastPrice * 1.02) },
            { label: "24h Low", val: formatPrice((ticker as any).low24h ?? ticker.lowPrice ?? ticker.lastPrice * 0.98) },
            { label: "24h Volume", val: (() => { const v = (ticker as any).volume24h ?? ticker.volume; return v ? `${(v / 1e6).toFixed(1)}M` : "—"; })() },
            { label: "Open Interest", val: (() => { const oi = (ticker as any).openInterest; return oi ? `$${(oi / 1e6).toFixed(1)}M` : `$${(ticker.lastPrice * 4200 / 1e6).toFixed(1)}M`; })() },
          ].map((s) => (
            <div key={s.label} className="flex flex-col shrink-0">
              <span className="text-[10px] text-muted-foreground">{s.label}</span>
              <span className="text-sm font-mono mt-0.5">{s.val}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left: Order book ── */}
          <div className="w-[280px] border-r border-border shrink-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-0">
              <OrderBook data={orderBook} lastPrice={ticker.lastPrice} symbol={symbol} />
            </div>
          </div>

          {/* ── Center: Chart + Positions ── */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 border-b border-border relative">
              <Chart
                symbol={symbol}
                interval={chartInterval}
              />
            </div>
            <div className="h-[220px] shrink-0 bg-card flex flex-col">
              <div className="flex gap-0 px-3 border-b border-border text-xs font-medium shrink-0">
                {([
                  { key: "positions", label: `Positions (${positions.length})` },
                  { key: "orders",    label: `Open Orders (${openOrders.length})` },
                  { key: "history",   label: `Trade History (${filledOrders.length})` },
                ] as { key: "positions" | "orders" | "history"; label: string }[]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setBottomTab(t.key)}
                    className={cn(
                      "py-2 px-3 border-b-2 transition-colors whitespace-nowrap",
                      bottomTab === t.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto">
                {/* Positions tab */}
                {bottomTab === "positions" && (
                  !address ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      <button onClick={() => openModal()} className="flex items-center gap-2 text-primary hover:underline font-medium">
                        <Wallet className="w-4 h-4" /> Connect wallet to view positions
                      </button>
                    </div>
                  ) : positionsLoading && positions.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading positions…
                    </div>
                  ) : positions.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      No open positions · Place a trade to get started
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-muted-foreground font-sans border-b border-border">
                          <th className="p-2 font-medium">Pair</th>
                          <th className="p-2 font-medium">Side</th>
                          <th className="p-2 font-medium text-right">Size</th>
                          <th className="p-2 font-medium text-right">Entry</th>
                          <th className="p-2 font-medium text-right">Mark</th>
                          <th className="p-2 font-medium text-right">Liq.</th>
                          <th className="p-2 font-medium text-right">PnL</th>
                          <th className="p-2 font-medium text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {positions.map((p: any) => {
                          const pnl = parseFloat(p.unrealizedPnl ?? "0");
                          return (
                            <tr key={p.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-2">{p.symbol}</td>
                              <td className={cn("p-2 font-semibold capitalize", p.side === "long" ? "text-green-400" : "text-red-400")}>
                                {p.side} {p.leverage}×
                              </td>
                              <td className="p-2 text-right">{Number(p.quantity).toFixed(4)}</td>
                              <td className="p-2 text-right">{formatPrice(parseFloat(p.entryPrice))}</td>
                              <td className="p-2 text-right">{formatPrice(parseFloat(p.markPrice))}</td>
                              <td className="p-2 text-right text-orange-400">{formatPrice(parseFloat(p.liquidationPrice))}</td>
                              <td className={cn("p-2 text-right font-bold", pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                              </td>
                              <td className="p-2 text-right">{Number(p.margin).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                )}

                {/* Open Orders tab */}
                {bottomTab === "orders" && (
                  openOrders.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      {address ? "No open orders." : (
                        <button onClick={() => openModal()} className="flex items-center gap-2 text-primary hover:underline font-medium">
                          <Wallet className="w-4 h-4" /> Connect wallet to view orders
                        </button>
                      )}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-muted-foreground font-sans border-b border-border">
                          <th className="p-2 font-medium">Date</th>
                          <th className="p-2 font-medium">Pair</th>
                          <th className="p-2 font-medium">Side</th>
                          <th className="p-2 font-medium text-right">Price</th>
                          <th className="p-2 font-medium text-right">Size</th>
                          <th className="p-2 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {openOrders.map((o: any, i: number) => (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="p-2 text-muted-foreground">{new Date(o.createdAt).toLocaleTimeString()}</td>
                            <td className="p-2">{o.symbol}</td>
                            <td className={cn("p-2 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="p-2 text-right">{formatPrice(o.price)}</td>
                            <td className="p-2 text-right">{Number(o.quantity).toFixed(4)}</td>
                            <td className="p-2 text-right">
                              <button
                                onClick={() => cancelOrder.mutate({ orderId: String(o.id), data: { walletAddress: String(o.walletAddress || address || "") } })}
                                disabled={cancelOrder.isPending}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 transition-all disabled:opacity-40"
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

                {/* Trade History tab */}
                {bottomTab === "history" && (
                  filledOrders.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      {address ? "No trade history yet." : (
                        <button onClick={() => openModal()} className="flex items-center gap-2 text-primary hover:underline font-medium">
                          <Wallet className="w-4 h-4" /> Connect wallet to view history
                        </button>
                      )}
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-muted-foreground font-sans border-b border-border">
                          <th className="p-2 font-medium">Date</th>
                          <th className="p-2 font-medium">Pair</th>
                          <th className="p-2 font-medium">Side</th>
                          <th className="p-2 font-medium text-right">Price</th>
                          <th className="p-2 font-medium text-right">Size</th>
                          <th className="p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filledOrders.map((o: any, i: number) => (
                          <tr key={o.id ?? i} className="hover:bg-white/5 transition-colors">
                            <td className="p-2 text-muted-foreground">{new Date(o.updatedAt ?? o.createdAt).toLocaleTimeString()}</td>
                            <td className="p-2">{o.symbol}</td>
                            <td className={cn("p-2 font-semibold capitalize", o.side === "buy" ? "text-buy" : "text-sell")}>{o.side}</td>
                            <td className="p-2 text-right">{formatPrice(o.price)}</td>
                            <td className="p-2 text-right">{Number(o.quantity).toFixed(4)}</td>
                            <td className={cn("p-2 capitalize text-[10px] font-semibold", o.status === "filled" ? "text-green-400" : "text-muted-foreground")}>
                              {o.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Order form ── */}
          <div className="w-[300px] shrink-0 flex flex-col min-h-0 border-l border-border bg-card overflow-y-auto">

            {/* Margin mode + Leverage */}
            <div className="p-3 border-b border-border flex items-center gap-2">
              <button
                onClick={() => setMarginMode((m) => (m === "cross" ? "isolated" : "cross"))}
                className="flex items-center gap-1 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-xs font-bold transition-colors"
              >
                {marginMode === "cross" ? "Cross" : "Isolated"}
                <ChevronDown size={12} />
              </button>
              <button
                onClick={() => setShowLeverageModal(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border transition-all",
                  leverageColor
                )}
              >
                {leverage}× <ChevronDown size={12} />
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">
                Max: 125×
              </span>
            </div>

            {/* Quick leverage buttons */}
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Quick Select</p>
              <div className="flex flex-wrap gap-1">
                {[2, 5, 10, 20, 50, 100].map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setLeverage(lv)}
                    className={cn(
                      "px-2.5 py-1 rounded text-[11px] font-bold border transition-all",
                      leverage === lv
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {lv}×
                  </button>
                ))}
              </div>
            </div>

            {/* Order type */}
            <div className="px-3 py-3 border-b border-border">
              <div className="flex gap-1.5 bg-secondary p-1 rounded-xl text-xs font-semibold">
                {(["limit", "market", "stop"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg capitalize transition-all",
                      orderType === t
                        ? "bg-card shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 flex flex-col gap-3">
              {/* Futures margin balance — shows futures bucket, NOT spot ledger */}
              <div className="flex flex-col gap-0.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="text-blue-400/80 font-medium">Margin Available</span>
                  {address ? (
                    <div className="flex items-center gap-1.5">
                      {usesApiBalance ? (
                        <>
                          <span className="font-mono text-blue-300 font-semibold">{apiUsdtBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="font-mono text-muted-foreground">USDT</span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono text-foreground">{nativeBal.toFixed(4)}</span>
                          <span className="font-mono text-foreground">{nativeSymbol}</span>
                          {futChainInfo?.l2Label && (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-none">
                              {futChainInfo.l2Label}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => openModal()} className="text-primary text-xs font-semibold hover:underline flex items-center gap-1">
                      <Wallet className="w-3 h-3" /> Connect Wallet
                    </button>
                  )}
                </div>
                {/* Locked margin sub-row */}
                {usesApiBalance && address && futuresMgn.locked > 0 && (
                  <div className="flex justify-between text-[10px] text-muted-foreground/70">
                    <span>In positions</span>
                    <span className="font-mono text-amber-400/70">-{futuresMgn.locked.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
                  </div>
                )}
              </div>

              {/* Price input */}
              {orderType !== "market" && (
                <div className="bg-secondary border border-border rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-primary/50 transition-colors">
                  <span className="text-muted-foreground text-xs w-10 shrink-0">Price</span>
                  <input
                    type="number"
                    className="flex-1 min-w-0 bg-transparent text-right text-sm font-mono outline-none"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder={String(ticker.lastPrice)}
                  />
                  <span className="text-muted-foreground text-xs shrink-0">USDT</span>
                </div>
              )}

              {/* Size input */}
              <div className="bg-secondary border border-border rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-primary/50 transition-colors">
                <span className="text-muted-foreground text-xs w-10 shrink-0">Size</span>
                <input
                  type="number"
                  className="flex-1 min-w-0 bg-transparent text-right text-sm font-mono outline-none"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="0"
                />
                <span className="text-muted-foreground text-xs shrink-0">{base}</span>
              </div>

              {/* PCT quick-fill */}
              <div className="flex gap-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      // Use USDT ledger balance for OrahDEX wallets, native balance for external EVM wallets
                      const availBal = usesApiBalance ? apiUsdtBal : nativeBal;
                      const portion = availBal * (pct / 100);
                      const entryPrice = parseFloat(price || String(ticker.lastPrice)) || ticker.lastPrice;
                      setSize((portion * leverage / entryPrice).toFixed(4));
                    }}
                    className="flex-1 py-1 text-[10px] font-semibold bg-secondary border border-border rounded-lg text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Order stats */}
              <div className="space-y-1.5 text-xs">
                {[
                  { label: "Notional Value", val: notional > 0 ? `${notional.toFixed(2)} USDT` : "—" },
                  { label: `Margin (${leverage}×)`, val: margin > 0 ? `${margin.toFixed(4)} USDT` : "—" },
                  { label: "Est. Liq. Price", val: liqPrice > 0 ? formatPrice(liqPrice) : "—", warn: leverage >= 20 },
                  { label: "Taker Fee (0.04%)", val: notional > 0 ? `${(notional * 0.0004).toFixed(4)} USDT` : "—" },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={cn("font-mono", r.warn && liqPrice > 0 ? "text-orange-400" : "text-foreground")}>
                      {r.val}
                    </span>
                  </div>
                ))}
              </div>

              {/* Buy / Sell buttons */}
              {address ? (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleFuturesSubmit("buy")}
                    disabled={futuresSubmitting}
                    className="flex-1 bg-green-500 hover:bg-green-500/90 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-green-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {futuresSubmitting && futuresSide === "buy" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Buy / Long
                  </button>
                  <button
                    onClick={() => handleFuturesSubmit("sell")}
                    disabled={futuresSubmitting}
                    className="flex-1 bg-red-500 hover:bg-red-500/90 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-red-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {futuresSubmitting && futuresSide === "sell" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Sell / Short
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => openModal()}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet to Trade
                  </button>
                  <button
                    onClick={() => openModal()}
                    className="w-full flex items-center justify-center gap-2 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/20 hover:border-yellow-500 py-2.5 rounded-xl font-semibold text-sm transition-all"
                  >
                    Connect Wallet to Trade
                  </button>
                </div>
              )}

              {/* Settle note */}
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                Positions settle on-chain via BSV smart contract · Funding every 8h
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
