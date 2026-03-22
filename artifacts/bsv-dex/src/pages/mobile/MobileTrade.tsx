import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Star, Share2, Settings2 } from "lucide-react";
import { useLocation } from "wouter";
import { Chart } from "@/components/trading/Chart";
import { cn } from "@/lib/utils";

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
  const [, navigate] = useLocation();
  const symbol = rawSymbol.replace(/-/g, "/");
  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1] ?? "USDT";
  const color = COIN_COLORS[base] ?? "#EAB308";

  const [interval, setInterval] = useState<string>("1h");
  const [activeIndicator, setActiveIndicator] = useState("MACD");
  const [bottomTab, setBottomTab] = useState<BottomTab>("orderbook");
  const [starred, setStarred] = useState(false);
  const [side, setSide] = useState<Side>("buy");
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
      <div className="shrink-0 flex items-center px-4 pt-3 pb-2 border-b border-border gap-3">
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{ backgroundColor: color + "22", color }}
          >
            {base[0]}
          </div>
          <span className="text-base font-bold">{base}<span className="text-muted-foreground font-normal text-sm">/{quote}</span></span>
          <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Bell size={17} />
          <button onClick={() => setStarred(s => !s)}>
            <Star size={17} className={starred ? "fill-amber-400 text-amber-400" : ""} />
          </button>
          <Share2 size={17} />
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

    </div>
  );
}
