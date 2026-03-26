import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Star, Share2, AlignJustify, Settings2, X, TrendingUp, CheckCircle2, AlertCircle, Info, Zap, Check, Wallet, Clock, ListOrdered, ChevronDown, ChevronRight, Plus, Minus, ArrowLeftRight, Download, Users2, CreditCard } from "lucide-react";
import { Chart } from "@/components/trading/Chart";
import { MobileMarketSelector } from "@/components/mobile/MobileMarketSelector";
import { ContractAddressBadge } from "@/components/ContractAddressBadge";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";

/* ── Notifications drawer ── */
const NOTIF_ICONS: Record<string, React.ReactNode> = {
  price:  <TrendingUp size={15} className="text-green-400" />,
  order:  <CheckCircle2 size={15} className="text-green-500" />,
  alert:  <AlertCircle size={15} className="text-red-400" />,
  system: <Info size={15} className="text-blue-400" />,
  promo:  <Zap size={15} className="text-purple-400" />,
};

const BASE_NOTIFS = [
  { id: 1, type: "order",  title: "Buy order filled",        body: "0.05 BTC bought at $65,200",          time: "2m ago",  read: false },
  { id: 2, type: "price",  title: "Price alert triggered",   body: "ETH/USDT crossed $3,400",             time: "18m ago", read: false },
  { id: 3, type: "alert",  title: "Stop-loss executed",      body: "SOL/USDT stop at $142 triggered",     time: "1h ago",  read: false },
  { id: 4, type: "promo",  title: "Fee rebate earned",       body: "You earned $2.34 in maker rebates",   time: "3h ago",  read: true  },
  { id: 5, type: "system", title: "Liquidity pool reward",   body: "Harvest 0.0084 BSV from BSV/USDT pool","time": "5h ago", read: true },
  { id: 6, type: "system", title: "System maintenance",      body: "Scheduled: Sunday 02:00–03:00 UTC",   time: "1d ago",  read: true  },
];

function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifs, setNotifs] = useState(BASE_NOTIFS);
  const unread = notifs.filter(n => !n.read).length;

  const markAll = () => setNotifs(n => n.map(x => ({ ...x, read: true })));
  const dismiss = (id: number) => setNotifs(n => n.filter(x => x.id !== id));

  return (
    <>
      <div
        className={cn("fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}
        onClick={onClose}
      />
      <div className={cn(
        "fixed top-0 right-0 bottom-0 z-50 w-[85vw] max-w-xs bg-background flex flex-col shadow-2xl transition-transform duration-250 ease-out border-l border-border",
        open ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-foreground" />
            <span className="font-bold text-base">Notifications</span>
            {unread > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded-full">{unread}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary font-semibold">Mark all read</button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Notif list */}
        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-border/50">
          {notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Bell size={32} className="opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : notifs.map(n => (
            <div key={n.id} className={cn("flex gap-3 px-4 py-3.5 relative", !n.read && "bg-primary/4")}>
              {!n.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />}
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                {NOTIF_ICONS[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className={cn("text-[13px] font-semibold leading-snug", !n.read ? "text-foreground" : "text-muted-foreground")}>{n.title}</p>
                  <button onClick={() => dismiss(n.id)} className="shrink-0 p-0.5 text-muted-foreground/50 hover:text-muted-foreground">
                    <X size={11} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">{n.time}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <button onClick={() => setNotifs([])} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear all notifications
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Share toast ── */
function ShareToast({ visible, copied }: { visible: boolean; copied: boolean }) {
  return (
    <div className={cn(
      "fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold shadow-xl transition-all duration-300",
      visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
    )}>
      {copied ? <><Check size={14} /> Link copied!</> : <><Share2 size={14} /> Shared!</>}
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const COIN_COLORS: Record<string, string> = {
  BSV: "#EAB308", BTC: "#F97316", ETH: "#8B5CF6",
  SOL: "#06B6D4", XRP: "#3B82F6", BNB: "#EAB308",
  ADA: "#2563EB",
};

function fmt(p: number) {
  if (!p || !isFinite(p)) return "—";
  if (p >= 1000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1)     return p.toFixed(2);
  if (p >= 0.01)  return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}
function fmtVol(v: number) {
  if (!v) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

const INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;
const INDICATORS = ["MA", "EMA", "BOLL", "MACD", "KDJ", "RSI"] as const;
const PERIODS = [
  { label: "Today", key: "today" },
  { label: "7D",    key: "7d" },
  { label: "30D",   key: "30d" },
  { label: "90D",   key: "90d" },
  { label: "180D",  key: "180d" },
  { label: "1Y",    key: "1y" },
] as const;

type BottomTab = "orderbook" | "trades" | "orders";
type Side = "buy" | "sell";
type OrderType = "limit" | "market" | "stop-limit" | "stop-market" | "trailing-stop" | "post-only";

const ORDER_TYPES: OrderType[] = ["limit", "market", "stop-limit", "stop-market", "trailing-stop", "post-only"];
const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  "limit":         "Limit",
  "market":        "Market",
  "stop-limit":    "Stop-Limit",
  "stop-market":   "Stop-Market",
  "trailing-stop": "Trailing Stop",
  "post-only":     "Post Only",
};


export function MobileTrade({ symbol: rawSymbol }: { symbol: string }) {
  const symbol = rawSymbol.replace(/-/g, "/");
  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1]?.replace("-PERP", "") ?? "USDT";
  const isFutures = rawSymbol.toUpperCase().includes("PERP");
  const color = COIN_COLORS[base] ?? "#EAB308";

  const { address, balance: walletBalance, chainId: walletChainId, network } = useWalletStore();
  const isEvm = network === "evm" || (!network && !!walletChainId);
  const { balances: evmTokenBalances } = useEvmBalances(isEvm ? address : null, walletChainId ?? null);
  const { open: openWallet } = useWalletModalStore();
  const queryClient = useQueryClient();

  const { data: myOrdersData } = useQuery({
    queryKey: ["orders", address],
    queryFn: () => fetch(`${BASE}/api/orders?walletAddress=${encodeURIComponent(address || "")}`).then(r => r.json()),
    enabled: !!address,
    refetchInterval: 5000,
  });

  const myOrders: any[] = Array.isArray(myOrdersData) ? myOrdersData : [];
  const openOrders = myOrders.filter(o => o.status === "open");
  const historyOrders = myOrders.filter(o => o.status !== "open");

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`${BASE}/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onMutate: (orderId) => setCancellingId(orderId),
    onSettled: () => {
      setCancellingId(null);
      queryClient.invalidateQueries({ queryKey: ["orders", address] });
    },
  });

  const [interval, setInterval] = useState<string>("1h");
  const [activeIndicator, setActiveIndicator] = useState("MACD");
  const [bottomTab, setBottomTab] = useState<BottomTab>("orderbook");
  const [starred, setStarred] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [side, setSide] = useState<Side>("buy");

  const handleShare = async () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}trade/${rawSymbol}`;
    const text = `Trade ${symbol} on OrahDEX — Trade means DEX`;
    if (navigator.share) {
      try { await navigator.share({ title: `OrahDEX — ${symbol}`, text, url }); } catch {}
      setShareCopied(false);
    } else {
      try { await navigator.clipboard.writeText(url); } catch {}
      setShareCopied(true);
    }
    setShareToastVisible(true);
    setTimeout(() => setShareToastVisible(false), 2200);
  };
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [orderTypeOpen, setOrderTypeOpen] = useState(false);
  const [fundingSheetOpen, setFundingSheetOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailingRate, setTrailingRate] = useState("");
  const [amount, setAmount] = useState("");
  const [showOrderForm, setShowOrderForm] = useState(false);

  const encodedSymbol = encodeURIComponent(symbol);

  const { data: ticker } = useQuery({
    queryKey: ["ticker", symbol],
    queryFn: () => fetch(`${BASE}/api/markets/${encodedSymbol}/ticker`).then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: candles = [] } = useQuery({
    queryKey: ["candles", symbol, interval],
    queryFn: () => fetch(`${BASE}/api/markets/${encodedSymbol}/candles?interval=${interval}&limit=150`).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: orderBook } = useQuery({
    queryKey: ["orderbook", symbol],
    queryFn: () => fetch(`${BASE}/api/markets/${encodedSymbol}/orderbook`).then(r => r.json()),
    refetchInterval: 3000,
  });

  const { data: recentTrades = [] } = useQuery({
    queryKey: ["trades", symbol],
    queryFn: () => fetch(`${BASE}/api/markets/${encodedSymbol}/trades`).then(r => r.json()),
    refetchInterval: 5000,
  });

  const lastPrice = parseFloat(ticker?.lastPrice) || 0;
  const change = parseFloat(ticker?.priceChangePercent) || 0;
  const high24 = parseFloat(ticker?.highPrice) || 0;
  const low24  = parseFloat(ticker?.lowPrice)  || 0;
  const vol24  = parseFloat(ticker?.volume)    || 0;
  const volQuote = lastPrice * vol24;

  const asks = (orderBook?.asks ?? []).slice(0, 8).reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 8);

  const handleIntervalChange = useCallback((iv: string) => setInterval(iv), []);

  const needsLimitPrice = orderType === "limit" || orderType === "stop-limit" || orderType === "post-only";
  const effectivePrice  = needsLimitPrice
    ? (parseFloat(price || "0") || lastPrice)
    : lastPrice;
  const amtNum  = parseFloat(amount || "0");
  const total   = (effectivePrice * amtNum).toFixed(4);
  const FEE_RATE = 0.001;
  const estFee  = amtNum > 0 ? (parseFloat(total) * FEE_RATE).toFixed(4) + " " + quote : "--";

  // ── Canonical L2 chain awareness ──────────────────────────────────────────
  // Each L2 chain carries a canonical native asset that's 1:1 with its L1.
  // e.g. ETH on Base (BaseETH) = ETH. ETH on Arb (ArbETH) = ETH. All tradeable in ETH markets.
  const CHAIN_INFO: Record<number, { name: string; nativeSymbol: string; l2Label: string | null }> = {
    1:      { name: "Ethereum",  nativeSymbol: "ETH",  l2Label: null },
    8453:   { name: "Base",      nativeSymbol: "ETH",  l2Label: "Base" },     // BaseETH = canonical ETH
    42161:  { name: "Arbitrum",  nativeSymbol: "ETH",  l2Label: "Arb"  },     // ArbETH = canonical ETH
    10:     { name: "Optimism",  nativeSymbol: "ETH",  l2Label: "OP"   },     // OPETH = canonical ETH
    137:    { name: "Polygon",   nativeSymbol: "ETH",  l2Label: "Polygon" },   // bridged ETH
    56:     { name: "BSC",       nativeSymbol: "BNB",  l2Label: null },
    43114:  { name: "Avalanche", nativeSymbol: "AVAX", l2Label: null },
    59144:  { name: "Linea",     nativeSymbol: "ETH",  l2Label: "Linea" },
    534352: { name: "Scroll",    nativeSymbol: "ETH",  l2Label: "Scroll" },
    5000:   { name: "Mantle",    nativeSymbol: "MNT",  l2Label: null },
  };
  const chainInfo = walletChainId ? CHAIN_INFO[walletChainId] : null;
  // Native symbol for non-EVM networks (BSV, BTC, SOL)
  const nativeSymbol: string = network === "bsv" ? "BSV"
    : network === "btc" ? "BTC"
    : network === "sol" ? "SOL"
    : chainInfo?.nativeSymbol ?? "ETH";
  const walletBal = address && walletBalance ? parseFloat(walletBalance) : 0;

  // Resolve ERC-20 balances for base and quote tokens
  const erc20BaseBalance  = evmTokenBalances.find(t => t.symbol.toUpperCase() === base.toUpperCase())?.amount  ?? 0;
  const erc20QuoteBalance = evmTokenBalances.find(t => t.symbol.toUpperCase() === quote.toUpperCase())?.amount ?? 0;

  // Native token is usable as base (e.g. ETH on Base selling in ETH/USDT)
  const isNativeBase  = nativeSymbol === base;
  // Native token is usable as quote spend (e.g. ETH on Arbitrum buying in TOKEN/ETH)
  const isNativeQuote = nativeSymbol === quote;

  // Effective balances per side
  const sellBalance = isNativeBase  ? walletBal          : erc20BaseBalance;   // what the user can sell
  const buyBalance  = isNativeQuote ? walletBal          : erc20QuoteBalance;  // what the user can spend to buy

  const available    = side === "sell" ? sellBalance : buyBalance;
  const availableSym = side === "sell" ? base        : quote;

  const maxBuyNum = effectivePrice > 0 ? (buyBalance / effectivePrice) : 0;
  const maxBuy = maxBuyNum > 0 ? maxBuyNum.toFixed(6) : "0";

  // Click available → fill max amount
  const handleFillMax = () => {
    if (!address || available <= 0 || effectivePrice <= 0) return;
    if (side === "buy") {
      const maxBase = (buyBalance * 0.999) / effectivePrice;
      setAmount(maxBase.toFixed(6));
    } else {
      setAmount((sellBalance * 0.999).toFixed(6));
    }
  };

  function stepPrice(delta: number) {
    const cur = parseFloat(price || String(lastPrice)) || lastPrice;
    const step = lastPrice > 1000 ? 0.1 : lastPrice > 1 ? 0.0001 : 0.00001;
    setPrice((cur + delta * step).toFixed(step < 0.001 ? 5 : step < 0.01 ? 4 : 1));
  }
  function stepStopPrice(delta: number) {
    const cur = parseFloat(stopPrice || String(lastPrice)) || lastPrice;
    const step = lastPrice > 1000 ? 0.1 : lastPrice > 1 ? 0.0001 : 0.00001;
    setStopPrice((cur + delta * step).toFixed(step < 0.001 ? 5 : step < 0.01 ? 4 : 1));
  }
  function stepAmount(delta: number) {
    const cur = parseFloat(amount || "0");
    const step = 0.001;
    setAmount(Math.max(0, cur + delta * step).toFixed(3));
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── HEADER ── */}
      <div className="shrink-0 flex items-center px-3 pt-3 pb-2 border-b border-border gap-2">
        {/* ≡ Three-lines market selector button */}
        <button
          onClick={() => setSelectorOpen(true)}
          className="p-1.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Select market"
        >
          <AlignJustify size={19} />
        </button>

        {/* Pair name — tapping also opens selector */}
        <button
          onClick={() => setSelectorOpen(true)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
            style={{ backgroundColor: color + "22", color }}
          >
            {base[0]}
          </div>
          <span className="text-base font-bold truncate">
            {base}<span className="text-muted-foreground font-normal text-sm">/{quote}</span>
          </span>
          {isFutures && (
            <span className="shrink-0 text-[9px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">PERP</span>
          )}
        </button>

        {/* Right icons */}
        <div className="flex items-center gap-2.5 text-muted-foreground shrink-0">
          {/* Bell with unread badge */}
          <button onClick={() => setNotifOpen(true)} className="relative p-0.5">
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-background" />
          </button>
          <button onClick={() => setStarred(s => !s)}>
            <Star size={17} className={starred ? "fill-green-400 text-green-400" : ""} />
          </button>
          <button onClick={handleShare}>
            <Share2 size={17} />
          </button>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-20">

        {/* ── PRICE BLOCK ── */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <span className={cn("text-3xl font-bold tabular-nums", change >= 0 ? "text-green-500" : "text-red-500")}>
              {fmt(lastPrice)}
            </span>
            <span className={cn("text-sm font-semibold", change >= 0 ? "text-green-500" : "text-red-500")}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">≈${fmt(lastPrice)}</p>
          <ContractAddressBadge baseAsset={base} variant="inline" className="mt-1" />

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">24h High</span>
              <span className="font-medium text-foreground">{fmt(high24)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">24h Low</span>
              <span className="font-medium text-foreground">{fmt(low24)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Vol({base})</span>
              <span className="font-medium text-foreground">{fmtVol(vol24)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Vol({quote})</span>
              <span className="font-medium text-foreground">{fmtVol(volQuote)}</span>
            </div>
          </div>
        </div>

        {/* ── TIMEFRAME BAR ── */}
        <div className="flex items-center gap-0 px-4 pb-1 border-b border-border overflow-x-auto no-scrollbar">
          {INTERVALS.map(iv => (
            <button
              key={iv}
              onClick={() => handleIntervalChange(iv)}
              className={cn(
                "shrink-0 px-3 py-1.5 text-xs font-medium transition-colors",
                interval === iv
                  ? "text-foreground font-semibold border-b-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              {iv}
            </button>
          ))}
          <div className="flex-1" />
          <button className="shrink-0 p-1.5 text-muted-foreground">
            <Settings2 size={14} />
          </button>
        </div>

        {/* ── CHART ── */}
        <div className="h-[230px]">
          <Chart data={candles} interval={interval} onIntervalChange={handleIntervalChange} hideIntervalBar />
        </div>

        {/* ── INDICATOR TABS ── */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-border px-1">
          {INDICATORS.map(ind => (
            <button
              key={ind}
              onClick={() => setActiveIndicator(ind)}
              className={cn(
                "shrink-0 px-3.5 py-2 text-xs font-semibold transition-colors",
                activeIndicator === ind
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              {ind}
            </button>
          ))}
        </div>

        {/* ── PERFORMANCE ROW ── */}
        <div className="flex overflow-x-auto no-scrollbar px-4 py-2 gap-5 border-b border-border">
          {PERIODS.map(({ label }) => {
            const pct = (Math.random() * 20 - 10);
            return (
              <div key={label} className="shrink-0 text-center">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={cn("text-[11px] font-semibold mt-0.5", pct >= 0 ? "text-green-500" : "text-red-500")}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </p>
              </div>
            );
          })}
        </div>

        {/* ── BOTTOM TABS: ORDER BOOK / MARKET TRADES / MY ORDERS ── */}
        <div className="flex border-b border-border">
          {([
            { key: "orderbook" as BottomTab, label: "Order Book",    Icon: ListOrdered },
            { key: "trades"    as BottomTab, label: "Market Trades", Icon: Clock },
            { key: "orders"    as BottomTab, label: "My Orders",     Icon: Wallet },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setBottomTab(t.key)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2",
                bottomTab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── ORDER BOOK — SPLIT FACE-TO-FACE ── */}
        {bottomTab === "orderbook" && (() => {
          const ROWS = 10;
          // Bids: highest price first (best bid at top)
          const bidRows = (orderBook?.bids ?? []).slice(0, ROWS);
          // Asks: lowest price first (best ask at top) — they face the bids
          const askRows = (orderBook?.asks ?? []).slice(0, ROWS);
          const allQ = [
            ...bidRows.map((b: any) => parseFloat(b.quantity ?? b[1])),
            ...askRows.map((a: any) => parseFloat(a.quantity ?? a[1])),
          ];
          const maxQ = Math.max(...allQ, 1);

          return (
            <div className="pb-2">
              {/* Headers */}
              <div className="flex text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-1.5 border-b border-border/40">
                <div className="flex-1 flex justify-between">
                  <span>Amount</span>
                  <span className="text-green-500">Bid</span>
                </div>
                <div className="w-px bg-border mx-2" />
                <div className="flex-1 flex justify-between">
                  <span className="text-red-400">Ask</span>
                  <span>Amount</span>
                </div>
              </div>

              {/* Rows — bid on left, ask on right, same row index */}
              {Array.from({ length: ROWS }).map((_, i) => {
                const bid = bidRows[i];
                const ask = askRows[i];
                const bP = bid ? parseFloat(bid.price ?? bid[0]) : null;
                const bQ = bid ? parseFloat(bid.quantity ?? bid[1]) : null;
                const aP = ask ? parseFloat(ask.price ?? ask[0]) : null;
                const aQ = ask ? parseFloat(ask.quantity ?? ask[1]) : null;
                const bidPct = bQ != null ? (bQ / maxQ) * 100 : 0;
                const askPct = aQ != null ? (aQ / maxQ) * 100 : 0;

                return (
                  <div key={i} className="flex items-center text-[11px] h-[22px]">
                    {/* BID — clickable, fills buy form */}
                    <button
                      className="flex-1 relative flex items-center px-3 h-full overflow-hidden text-left active:bg-green-500/10 transition-colors"
                      onClick={() => {
                        if (bP == null) return;
                        setPrice(String(bP));
                        setAmount(bQ != null ? bQ.toFixed(3) : "");
                        setSide("buy");
                        setShowOrderForm(true);
                      }}
                    >
                      <div
                        className="absolute inset-y-0 right-0 bg-green-500/12"
                        style={{ width: `${bidPct}%` }}
                      />
                      {bP != null ? (
                        <>
                          <span className="relative z-10 text-muted-foreground/60 flex-1 tabular-nums text-[10.5px]">
                            {bQ!.toFixed(3)}
                          </span>
                          <span className="relative z-10 text-green-400 font-semibold tabular-nums">
                            {fmt(bP)}
                          </span>
                        </>
                      ) : <span className="flex-1" />}
                    </button>

                    {/* Center vertical divider */}
                    <div className="w-px self-stretch bg-border/60 shrink-0" />

                    {/* ASK — clickable, fills sell form */}
                    <button
                      className="flex-1 relative flex items-center px-3 h-full overflow-hidden text-left active:bg-red-500/10 transition-colors"
                      onClick={() => {
                        if (aP == null) return;
                        setPrice(String(aP));
                        setAmount(aQ != null ? aQ.toFixed(3) : "");
                        setSide("sell");
                        setShowOrderForm(true);
                      }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-red-500/12"
                        style={{ width: `${askPct}%` }}
                      />
                      {aP != null ? (
                        <>
                          <span className="relative z-10 text-red-400 font-semibold tabular-nums">
                            {fmt(aP)}
                          </span>
                          <span className="relative z-10 text-muted-foreground/60 flex-1 text-right tabular-nums text-[10.5px]">
                            {aQ!.toFixed(3)}
                          </span>
                        </>
                      ) : <span className="flex-1" />}
                    </button>
                  </div>
                );
              })}

              {/* Mid price bar */}
              <div className="flex items-center justify-center gap-3 py-2 border-y border-border/50 mx-0 my-0.5 bg-secondary/30">
                <span className={cn(
                  "text-sm font-bold tabular-nums",
                  change >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {change >= 0 ? "▲" : "▼"} {fmt(lastPrice)}
                </span>
                <span className="text-[11px] text-muted-foreground">=</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">${fmt(lastPrice)}</span>
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                  change >= 0 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                )}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })()}

        {/* ── MARKET TRADES — POLONIEX STYLE ── */}
        {bottomTab === "trades" && (
          <div className="pt-1 pb-2">
            {/* Column headers */}
            <div className="flex text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-1.5 border-b border-border/50">
              <span className="flex-1">Price ({quote})</span>
              <span className="w-24 text-right">Amount ({base})</span>
              <span className="w-20 text-right">Time</span>
            </div>
            {((recentTrades as any[]) ?? []).slice(0, 25).map((t: any, i: number) => {
              const isBuy = t.side === "buy";
              return (
                <div key={i} className="flex items-center px-4 py-[4px]">
                  <span className={cn(
                    "flex-1 text-[12px] font-semibold tabular-nums",
                    isBuy ? "text-green-400" : "text-red-400"
                  )}>
                    {fmt(parseFloat(t.price))}
                  </span>
                  <span className="w-24 text-right text-[11px] text-muted-foreground tabular-nums">
                    {parseFloat(t.quantity).toFixed(4)}
                  </span>
                  <span className="w-20 text-right text-[10px] text-muted-foreground/60">
                    {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MY ORDERS ── */}
        {bottomTab === "orders" && (
          <div className="pb-2">
            {!address ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Wallet size={22} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">Connect to view orders</p>
                <p className="text-xs text-muted-foreground">Connect your wallet to see open and filled orders.</p>
                <button
                  onClick={() => openWallet()}
                  className="mt-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-primary text-white text-sm font-bold active:opacity-80"
                >
                  Connect Wallet
                </button>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <ListOrdered size={28} className="opacity-30" />
                <p className="text-sm">No orders yet</p>
                <p className="text-xs opacity-60">Place a trade to see your orders here</p>
              </div>
            ) : (
              <>
                {/* Open Orders section */}
                {openOrders.length > 0 && (
                  <>
                    <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Open Orders ({openOrders.length})</span>
                      <button
                        onClick={() => openOrders.forEach(o => cancelMutation.mutate(String(o.id)))}
                        className="text-[10px] font-semibold text-red-400 hover:text-red-300"
                      >
                        Cancel All
                      </button>
                    </div>
                    <div className="border-b border-border/50" />
                    {openOrders.map((o: any) => (
                      <div key={o.id} className="flex items-center px-4 py-3 border-b border-border/20 gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={cn("text-[10px] font-bold uppercase", o.side === "buy" ? "text-green-400" : "text-red-400")}>
                              {o.side}
                            </span>
                            <span className="text-xs text-foreground font-semibold">{o.symbol}</span>
                            <span className="text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{o.type ?? "limit"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span>Price: <span className="text-foreground font-mono">{Number(o.price).toLocaleString()}</span></span>
                            <span>Qty: <span className="text-foreground font-mono">{Number(o.quantity).toFixed(4)}</span></span>
                          </div>
                        </div>
                        <button
                          onClick={() => cancelMutation.mutate(String(o.id))}
                          disabled={cancellingId === String(o.id)}
                          className="shrink-0 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-[11px] font-bold active:bg-red-500/10 disabled:opacity-40 transition-all"
                        >
                          {cancellingId === String(o.id) ? "…" : "Cancel"}
                        </button>
                      </div>
                    ))}
                  </>
                )}

                {/* History section */}
                {historyOrders.length > 0 && (
                  <>
                    <div className="px-4 pt-3 pb-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">History ({historyOrders.length})</span>
                    </div>
                    <div className="border-b border-border/50" />
                    <div className="flex text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-4 py-1.5 border-b border-border/30">
                      <span className="flex-1">Pair</span>
                      <span className="w-16 text-right">Price</span>
                      <span className="w-14 text-right">Qty</span>
                      <span className="w-16 text-right">Status</span>
                    </div>
                    {historyOrders.map((o: any) => (
                      <div key={o.id} className="flex items-center px-4 py-2 border-b border-border/20">
                        <div className="flex-1 min-w-0 flex items-center gap-1">
                          <span className={cn("text-[10px] font-bold uppercase", o.side === "buy" ? "text-green-400" : "text-red-400")}>{o.side}</span>
                          <span className="text-[11px] text-foreground font-medium truncate">{o.symbol}</span>
                        </div>
                        <span className="w-16 text-right text-[11px] font-mono text-foreground">{Number(o.price).toLocaleString()}</span>
                        <span className="w-14 text-right text-[11px] font-mono text-muted-foreground">{Number(o.quantity).toFixed(3)}</span>
                        <span className={cn(
                          "w-16 text-right text-[10px] font-semibold",
                          o.status === "filled" ? "text-primary" : "text-muted-foreground/60"
                        )}>
                          {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ORDER FORM (slide-up panel) ── */}
        {showOrderForm && (
          <div className="px-3 pt-3 pb-2 border-t border-border mt-2 space-y-2.5">

            {/* Order type dropdown row */}
            <div className="flex items-center gap-2">
              <button className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <Info size={13} />
              </button>
              <button
                onClick={() => setOrderTypeOpen(true)}
                className="flex-1 h-9 bg-card border border-border rounded-xl px-3 flex items-center justify-between text-sm font-semibold text-foreground"
              >
                <span>{ORDER_TYPE_LABELS[orderType]}</span>
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>
            </div>

            {/* Stop Price — for stop-limit & stop-market */}
            {(orderType === "stop-limit" || orderType === "stop-market") && (
              <div className="flex items-center gap-1.5 h-11 bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => stepStopPrice(-1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-r border-border shrink-0 active:bg-border/40">
                  <Minus size={14} />
                </button>
                <div className="flex-1 flex items-center px-1">
                  <input
                    className="flex-1 bg-transparent text-sm text-center outline-none tabular-nums"
                    placeholder={`Stop (${quote})`}
                    value={stopPrice}
                    onChange={e => setStopPrice(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <button onClick={() => stepStopPrice(1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-l border-border shrink-0 active:bg-border/40">
                  <Plus size={14} />
                </button>
              </div>
            )}

            {/* Trailing rate — for trailing-stop */}
            {orderType === "trailing-stop" && (
              <div className="flex items-center gap-1.5 h-11 bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => setTrailingRate(r => String(Math.max(0, parseFloat(r||"0") - 0.1).toFixed(1)) as string)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-r border-border shrink-0 active:bg-border/40">
                  <Minus size={14} />
                </button>
                <div className="flex-1 flex items-center px-1">
                  <input
                    className="flex-1 bg-transparent text-sm text-center outline-none tabular-nums"
                    placeholder="Callback Rate (%)"
                    value={trailingRate}
                    onChange={e => setTrailingRate(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <button onClick={() => setTrailingRate(r => String((parseFloat(r||"0") + 0.1).toFixed(1)) as string)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-l border-border shrink-0 active:bg-border/40">
                  <Plus size={14} />
                </button>
              </div>
            )}

            {/* Limit Price — for limit, stop-limit, post-only */}
            {needsLimitPrice && (
              <div className="flex items-center gap-1.5 h-11 bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => stepPrice(-1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-r border-border shrink-0 active:bg-border/40">
                  <Minus size={14} />
                </button>
                <div className="flex-1 flex items-center px-1">
                  <input
                    className="flex-1 bg-transparent text-sm text-center outline-none tabular-nums"
                    placeholder={fmt(lastPrice)}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <button onClick={() => stepPrice(1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-l border-border shrink-0 active:bg-border/40">
                  <Plus size={14} />
                </button>
              </div>
            )}

            {/* Amount */}
            <div className="flex items-center gap-1.5 h-11 bg-card border border-border rounded-xl overflow-hidden">
              <button onClick={() => stepAmount(-1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-r border-border shrink-0 active:bg-border/40">
                <Minus size={14} />
              </button>
              <div className="flex-1 flex items-center px-1">
                <input
                  className="flex-1 bg-transparent text-sm text-center outline-none tabular-nums"
                  placeholder={`Amount (${base})`}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <button onClick={() => stepAmount(1)} className="w-10 h-full flex items-center justify-center text-muted-foreground border-l border-border shrink-0 active:bg-border/40">
                <Plus size={14} />
              </button>
            </div>

            {/* % quick-fill bar */}
            <div className="relative pt-1 pb-1">
              <div className="flex justify-between px-1 mb-1">
                {[25, 50, 75, 100].map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      if (side === "buy" && buyBalance > 0 && effectivePrice > 0) {
                        const maxBase = (buyBalance * 0.999) / effectivePrice;
                        setAmount((maxBase * p / 100).toFixed(6));
                      } else if (side === "sell" && sellBalance > 0) {
                        setAmount((sellBalance * 0.999 * p / 100).toFixed(6));
                      }
                    }}
                    className="text-[10px] text-muted-foreground font-semibold"
                  >{p}%</button>
                ))}
              </div>
              <div className="h-[2px] bg-border rounded-full mx-1">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, (amtNum / 0.1) * 100)}%` }}
                />
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center h-10 bg-card/50 border border-border rounded-xl px-3">
              <span className="text-sm text-muted-foreground flex-1">Total ({quote})</span>
              <span className="text-sm font-semibold tabular-nums">{amtNum > 0 ? total : ""}</span>
            </div>

            {/* Available / Max Buy / Est. Fee */}
            <div className="space-y-1.5 px-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground border-b border-dashed border-muted-foreground/40">Available</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFillMax}
                    disabled={!address || available <= 0}
                    className="text-xs font-semibold tabular-nums disabled:text-foreground text-primary active:opacity-70 transition-opacity flex items-center gap-1"
                  >
                    {available > 0 ? available.toFixed(4) : "0.00"}&nbsp;{availableSym}
                    {side === "sell" && isNativeBase && chainInfo?.l2Label && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary leading-none">
                        {chainInfo.l2Label}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setFundingSheetOpen(true)}
                    className="rounded-full border-2 border-primary text-primary shrink-0 inline-flex items-center justify-center active:bg-primary/20 transition-colors"
                    style={{ width: 22, height: 22, minWidth: 22, minHeight: 22 }}
                  >
                    <Plus size={10} strokeWidth={3} />
                  </button>
                </div>
              </div>
              {/* Low / zero balance hint */}
              {address && available === 0 && (
                <div className="text-[10px] text-amber-400 leading-tight px-0.5">
                  {side === "buy"
                    ? `No ${quote} balance found. Deposit ${quote} to place a buy order.`
                    : `No ${base} balance found. Deposit ${base} to place a sell order.`
                  }
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground border-b border-dashed border-muted-foreground/40">Max {side === "buy" ? "Buy" : "Sell"}</span>
                <span className="text-xs font-semibold text-foreground tabular-nums">{maxBuy}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground border-b border-dashed border-muted-foreground/40">Est. Trading Fee</span>
                <span className="text-xs text-foreground tabular-nums">{estFee}</span>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {/* Order type quick selector */}
        <button
          onClick={() => { setOrderTypeOpen(true); setShowOrderForm(true); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border bg-card border-border text-foreground shrink-0"
        >
          {ORDER_TYPE_LABELS[orderType]}
          <ChevronDown size={11} className="text-muted-foreground" />
        </button>

        {!address ? (
          /* Connect Wallet CTA */
          <button
            onClick={() => openWallet()}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-red-500 to-primary active:opacity-80 transition-opacity flex items-center justify-center gap-2"
          >
            <Wallet size={16} />
            Connect Wallet
          </button>
        ) : (
          <>
            {/* Buy button */}
            <button
              onClick={() => { setSide("buy"); setShowOrderForm(true); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80",
                side === "buy" && showOrderForm ? "opacity-100" : "opacity-85"
              )}
              style={{ backgroundColor: "#16a34a" }}
            >
              Buy {base}
            </button>

            {/* Sell button */}
            <button
              onClick={() => { setSide("sell"); setShowOrderForm(true); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80",
                side === "sell" && showOrderForm ? "opacity-100" : "opacity-85"
              )}
              style={{ backgroundColor: "#dc2626" }}
            >
              Sell {base}
            </button>
          </>
        )}
      </div>

      {/* ── FUNDING METHOD SHEET ── */}
      {fundingSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setFundingSheetOpen(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            {/* Handle */}
            <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 mb-4">
              <h2 className="text-base font-bold text-foreground">Select a Method</h2>
              <button
                onClick={() => setFundingSheetOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-muted-foreground"
              >
                <X size={15} />
              </button>
            </div>

            {/* Options */}
            {([
              {
                icon: <ArrowLeftRight size={20} />,
                label: "Transfer",
                desc: "Move funds between your OrahDEX accounts",
                href: "/portfolio",
              },
              {
                icon: <Download size={20} />,
                label: "Deposit",
                desc: "Transfer in crypto from your on-chain wallet or exchange",
                href: "/portfolio",
              },
              {
                icon: <Users2 size={20} />,
                label: "P2P",
                desc: "Multiple fiats, zero fees, and the best prices",
                href: "/p2p",
              },
              {
                icon: <CreditCard size={20} />,
                label: "Buy Crypto",
                desc: "Simplex, Mercuryo, Banxa",
                href: "/dex",
              },
            ] as const).map(({ icon, label, desc, href }) => (
              <button
                key={label}
                onClick={() => {
                  setFundingSheetOpen(false);
                  window.location.hash = "";
                  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                  window.location.href = base + href;
                }}
                className="w-full flex items-center gap-4 px-5 py-4 border-t border-border/50 hover:bg-white/5 active:bg-white/8 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground leading-snug">{label}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── ORDER TYPE SHEET ── */}
      {orderTypeOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setOrderTypeOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}
          >
            <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-2" />
            {ORDER_TYPES.map((t, i) => (
              <button
                key={t}
                onClick={() => { setOrderType(t); setOrderTypeOpen(false); }}
                className={cn(
                  "w-full px-6 py-4 text-left text-[15px] font-medium transition-colors",
                  i < ORDER_TYPES.length - 1 && "border-b border-border/50",
                  orderType === t ? "text-primary font-semibold" : "text-foreground hover:bg-white/5"
                )}
              >
                {ORDER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── MARKET SELECTOR DRAWER ── */}
      <MobileMarketSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        currentSymbol={symbol}
      />

      {/* ── NOTIFICATIONS DRAWER ── */}
      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* ── SHARE TOAST ── */}
      <ShareToast visible={shareToastVisible} copied={shareCopied} />

    </div>
  );
}
