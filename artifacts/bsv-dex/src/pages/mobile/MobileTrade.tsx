import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Star, Share2, AlignJustify, Settings2, X, TrendingUp, CheckCircle2, AlertCircle, Info, Zap, Check } from "lucide-react";
import { Chart } from "@/components/trading/Chart";
import { MobileMarketSelector } from "@/components/mobile/MobileMarketSelector";
import { cn } from "@/lib/utils";

/* ── Notifications drawer ── */
const NOTIF_ICONS: Record<string, React.ReactNode> = {
  price:  <TrendingUp size={15} className="text-amber-400" />,
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
  if (!p) return "—";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
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

type BottomTab = "orderbook" | "trades";
type Side = "buy" | "sell";
type OrderType = "limit" | "market";

export function MobileTrade({ symbol: rawSymbol }: { symbol: string }) {
  const symbol = rawSymbol.replace(/-/g, "/");
  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1] ?? "USDT";
  const color = COIN_COLORS[base] ?? "#EAB308";

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
  const [price, setPrice] = useState("");
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

  const total = (parseFloat(price || "0") * parseFloat(amount || "0")).toFixed(4);

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
        </button>

        {/* Right icons */}
        <div className="flex items-center gap-2.5 text-muted-foreground shrink-0">
          {/* Bell with unread badge */}
          <button onClick={() => setNotifOpen(true)} className="relative p-0.5">
            <Bell size={17} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-background" />
          </button>
          <button onClick={() => setStarred(s => !s)}>
            <Star size={17} className={starred ? "fill-amber-400 text-amber-400" : ""} />
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

        {/* ── BOTTOM TABS: ORDER BOOK / MARKET TRADES ── */}
        <div className="flex border-b border-border">
          {([
            { key: "orderbook" as BottomTab, label: "Order Book" },
            { key: "trades"    as BottomTab, label: "Market Trades" },
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
                    {/* BID — depth bar fills from right edge inward (toward center) */}
                    <div className="flex-1 relative flex items-center px-3 h-full overflow-hidden">
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
                    </div>

                    {/* Center vertical divider */}
                    <div className="w-px self-stretch bg-border/60 shrink-0" />

                    {/* ASK — depth bar fills from left edge inward (toward center) */}
                    <div className="flex-1 relative flex items-center px-3 h-full overflow-hidden">
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
                    </div>
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

        {/* ── ORDER FORM (slide-up panel) ── */}
        {showOrderForm && (
          <div className="px-4 pt-4 pb-2 border-t border-border mt-2">
            <div className="flex gap-2 mb-3">
              {(["limit", "market"] as OrderType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    orderType === t
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {orderType === "limit" && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Price ({quote})</p>
                <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11 focus-within:border-primary/50">
                  <input
                    className="flex-1 bg-transparent text-sm outline-none"
                    placeholder={fmt(lastPrice)}
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    inputMode="decimal"
                  />
                  <span className="text-xs text-muted-foreground">{quote}</span>
                </div>
              </div>
            )}
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Amount ({base})</p>
              <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11 focus-within:border-primary/50">
                <input
                  className="flex-1 bg-transparent text-sm outline-none"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                />
                <span className="text-xs text-muted-foreground">{base}</span>
              </div>
            </div>
            <div className="flex gap-2 mb-3">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  onClick={() => setAmount((10 * p / 100).toFixed(3))}
                  className="flex-1 py-1 text-xs font-semibold bg-card border border-border rounded-lg text-muted-foreground"
                >
                  {p}%
                </button>
              ))}
            </div>
            {orderType === "limit" && (
              <div className="flex justify-between text-xs text-muted-foreground mb-2 px-1">
                <span>Estimated Total</span>
                <span className="font-semibold text-foreground">{total} {quote}</span>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── STICKY BOTTOM BAR ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {/* Order type quick pills */}
        <div className="flex gap-1.5 mr-1">
          {(["limit", "market"] as OrderType[]).map(t => (
            <button
              key={t}
              onClick={() => { setOrderType(t); setShowOrderForm(true); }}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all",
                orderType === t && showOrderForm
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "bg-card border-border text-muted-foreground"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Buy button */}
        <button
          onClick={() => { setSide("buy"); setShowOrderForm(true); }}
          className={cn(
            "flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity active:opacity-80",
            side === "buy" && showOrderForm ? "opacity-100" : "opacity-85"
          )}
          style={{ backgroundColor: "#16a34a" }}
        >
          Buy
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
          Sell
        </button>
      </div>

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
