import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
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

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

export function MobileTrade({ symbol: rawSymbol }: { symbol: string }) {
  const [, navigate] = useLocation();
  const symbol = rawSymbol.replace(/-/g, "/");
  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1];
  const color = COIN_COLORS[base] ?? "#EAB308";

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState("1h");

  const encodedSymbol = encodeURIComponent(symbol);

  const { data: ticker } = useQuery({
    queryKey: ["ticker", symbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets/${encodedSymbol}/ticker`);
      return r.json();
    },
    refetchInterval: 5000,
  });

  const { data: candles = [] } = useQuery({
    queryKey: ["candles", symbol, interval],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets/${encodedSymbol}/candles?interval=${interval}&limit=150`);
      return r.json();
    },
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: orderBook } = useQuery({
    queryKey: ["orderbook", symbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets/${encodedSymbol}/orderbook`);
      return r.json();
    },
    refetchInterval: 3000,
  });

  const lastPrice = parseFloat(ticker?.lastPrice) || 0;
  const change = parseFloat(ticker?.priceChangePercent) || 0;
  const total = (parseFloat(price || "0") * parseFloat(amount || "0")).toFixed(2);

  const asks = (orderBook?.asks ?? []).slice(0, 6).reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 6);

  const handleIntervalChange = useCallback((iv: string) => setInterval(iv), []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-border shrink-0">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: color + "22", color }}
        >
          {base[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-tight">
            {base}<span className="text-muted-foreground font-normal text-sm">/{quote}</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">${fmt(lastPrice)}</span>
            <span className={cn("text-xs font-semibold", change >= 0 ? "text-green-500" : "text-red-500")}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-4 shrink-0 text-right">
          <div>
            <p className="text-[9px] text-muted-foreground">24h High</p>
            <p className="text-[11px] font-semibold">${fmt(parseFloat(ticker?.highPrice) || 0)}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">24h Low</p>
            <p className="text-[11px] font-semibold">${fmt(parseFloat(ticker?.lowPrice) || 0)}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Volume</p>
            <p className="text-[11px] font-semibold">{ticker?.volume ? fmt(parseFloat(ticker.volume)) : "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Single scrollable page ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ══ SECTION 1: CHART ══ */}
        <div className="h-[280px] border-b border-border">
          <Chart data={candles} interval={interval} onIntervalChange={handleIntervalChange} />
        </div>

        {/* ══ SECTION 2: ORDER BOOK ══ */}
        <div className="border-b border-border px-4 pt-3 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Order Book</p>

          {/* Column headers */}
          <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-0.5">
            <span>Price ({quote})</span>
            <span>Amount ({base})</span>
            <span>Total</span>
          </div>

          {/* Asks (sell side) */}
          <div className="space-y-0.5 mb-1">
            {asks.map((a: any, i: number) => {
              const p = parseFloat(a.price ?? a[0]);
              const q = parseFloat(a.quantity ?? a[1]);
              const t = parseFloat(a.total ?? (p * q).toString());
              const pct = Math.min((q / 500) * 100, 100);
              return (
                <div key={i} className="flex justify-between text-[11px] relative py-[3px] px-0.5 rounded">
                  <div className="absolute inset-y-0 right-0 bg-red-500/10 rounded-sm" style={{ width: `${pct}%` }} />
                  <span className="text-red-400 font-medium relative z-10 w-[30%]">{fmt(p)}</span>
                  <span className="text-muted-foreground relative z-10 w-[30%] text-center">{q.toFixed(3)}</span>
                  <span className="text-muted-foreground/60 relative z-10 w-[30%] text-right">{fmt(t)}</span>
                </div>
              );
            })}
          </div>

          {/* Mid price */}
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-border" />
            <span className={cn("text-sm font-bold tabular-nums", change >= 0 ? "text-green-500" : "text-red-500")}>
              ${fmt(lastPrice)}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Bids (buy side) */}
          <div className="space-y-0.5">
            {bids.map((b: any, i: number) => {
              const p = parseFloat(b.price ?? b[0]);
              const q = parseFloat(b.quantity ?? b[1]);
              const t = parseFloat(b.total ?? (p * q).toString());
              const pct = Math.min((q / 500) * 100, 100);
              return (
                <div key={i} className="flex justify-between text-[11px] relative py-[3px] px-0.5 rounded">
                  <div className="absolute inset-y-0 right-0 bg-green-500/10 rounded-sm" style={{ width: `${pct}%` }} />
                  <span className="text-green-400 font-medium relative z-10 w-[30%]">{fmt(p)}</span>
                  <span className="text-muted-foreground relative z-10 w-[30%] text-center">{q.toFixed(3)}</span>
                  <span className="text-muted-foreground/60 relative z-10 w-[30%] text-right">{fmt(t)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ SECTION 3: TRADE FORM ══ */}
        <div className="px-4 pt-4 pb-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Place Order</p>

          {/* Buy / Sell toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border mb-3">
            <button
              onClick={() => setSide("buy")}
              className={cn(
                "flex-1 py-3 text-sm font-bold transition-colors",
                side === "buy" ? "bg-green-500/20 text-green-500" : "bg-card text-muted-foreground"
              )}
            >
              Buy {base}
            </button>
            <button
              onClick={() => setSide("sell")}
              className={cn(
                "flex-1 py-3 text-sm font-bold transition-colors",
                side === "sell" ? "bg-red-500/20 text-red-500" : "bg-card text-muted-foreground"
              )}
            >
              Sell {base}
            </button>
          </div>

          {/* Order type */}
          <div className="flex gap-2 mb-4">
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

          {/* Price field */}
          {orderType === "limit" && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Price ({quote})</p>
              <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11 focus-within:border-primary/50 transition-colors">
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

          {/* Amount field */}
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Amount ({base})</p>
            <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11 focus-within:border-primary/50 transition-colors">
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

          {/* PCT quick-fill */}
          <div className="flex gap-2 mb-4">
            {[25, 50, 75, 100].map(p => (
              <button
                key={p}
                onClick={() => setAmount((10 * p / 100).toFixed(3))}
                className="flex-1 py-1.5 text-xs font-semibold bg-card border border-border rounded-lg text-muted-foreground active:bg-primary/10 active:border-primary/30 transition-all"
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Total row */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-card border border-border rounded-xl mb-4">
            <span className="text-xs text-muted-foreground">Estimated Total</span>
            <span className="text-sm font-bold">{total} {quote}</span>
          </div>

          {/* Submit button */}
          <button
            className="w-full py-4 rounded-2xl text-sm font-bold text-white shadow-lg active:opacity-80 transition-opacity"
            style={{ backgroundColor: side === "buy" ? "#22c55e" : "#ef4444" }}
          >
            {side === "buy" ? `Buy ${base}` : `Sell ${base}`}
          </button>

          <p className="text-center text-[10px] text-muted-foreground mt-3">
            Taker fee: 0.1% · Settled on-chain · Non-custodial
          </p>
        </div>

      </div>
    </div>
  );
}
