import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart2, BookOpen, Zap } from "lucide-react";
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
type Tab = "chart" | "book" | "trade";

export function MobileTrade({ symbol: rawSymbol }: { symbol: string }) {
  const [, navigate] = useLocation();
  const symbol = rawSymbol.replace(/-/g, "/");
  const base = symbol.split("/")[0];
  const quote = symbol.split("/")[1];
  const color = COIN_COLORS[base] ?? "#EAB308";

  const [tab, setTab] = useState<Tab>("chart");
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
  const pcts = [25, 50, 75, 100];

  const asks = (orderBook?.asks ?? []).slice(0, 8).reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 8);

  const handleIntervalChange = useCallback((iv: string) => setInterval(iv), []);

  const TABS: { id: Tab; label: string; icon: typeof BarChart2 }[] = [
    { id: "chart", label: "Chart", icon: BarChart2 },
    { id: "book",  label: "Book",  icon: BookOpen },
    { id: "trade", label: "Trade", icon: Zap },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-border shrink-0">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shrink-0"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: color + "22", color }}
        >
          {base[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground leading-tight">
            {base}<span className="text-muted-foreground font-normal text-sm">/{quote}</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">${fmt(lastPrice)}</span>
            <span className={cn("text-xs font-medium", change >= 0 ? "text-green-500" : "text-red-500")}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 24h stats inline */}
        <div className="hidden xs:flex gap-3 text-right shrink-0">
          <div>
            <p className="text-[10px] text-muted-foreground">High</p>
            <p className="text-xs font-semibold text-foreground">${fmt(parseFloat(ticker?.highPrice) || 0)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Low</p>
            <p className="text-xs font-semibold text-foreground">${fmt(parseFloat(ticker?.lowPrice) || 0)}</p>
          </div>
        </div>
      </div>

      {/* ── 24h ticker bar ── */}
      <div className="flex border-b border-border shrink-0">
        {[
          { label: "24h High", val: "$" + fmt(parseFloat(ticker?.highPrice) || 0) },
          { label: "24h Low",  val: "$" + fmt(parseFloat(ticker?.lowPrice) || 0) },
          { label: "Volume",   val: ticker?.volume ? fmt(parseFloat(ticker.volume)) : "—" },
          { label: "Change",   val: (change >= 0 ? "+" : "") + change.toFixed(2) + "%", color: change >= 0 ? "text-green-500" : "text-red-500" },
        ].map(s => (
          <div key={s.label} className="flex-1 px-2 py-2 text-center border-r border-border last:border-r-0">
            <p className={cn("text-xs font-semibold text-foreground", s.color)}>{s.val}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors relative",
              tab === t.id ? "text-primary" : "text-muted-foreground"
            )}
          >
            <t.icon size={13} />
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {/* CHART TAB */}
        {tab === "chart" && (
          <div className="h-full flex flex-col">
            <Chart
              data={candles}
              interval={interval}
              onIntervalChange={handleIntervalChange}
            />
          </div>
        )}

        {/* ORDER BOOK TAB */}
        {tab === "book" && (
          <div className="h-full overflow-y-auto">
            <div className="px-4 pt-3">
              {/* Headers */}
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">
                <span>Price ({quote})</span>
                <span>Amount ({base})</span>
                <span>Total</span>
              </div>

              {/* Asks */}
              <div className="space-y-0.5 mb-2">
                {asks.map((a: any, i: number) => {
                  const p = parseFloat(a.price ?? a[0]);
                  const q = parseFloat(a.quantity ?? a[1]);
                  const total = parseFloat(a.total ?? (p * q).toString());
                  const maxVol = 500;
                  const pct = Math.min((q / maxVol) * 100, 100);
                  return (
                    <div key={i} className="flex justify-between text-[11px] relative py-1 px-1 rounded">
                      <div className="absolute inset-y-0 right-0 bg-red-500/8 rounded-sm" style={{ width: `${pct}%` }} />
                      <span className="text-red-500 font-medium relative z-10 w-24">{fmt(p)}</span>
                      <span className="text-muted-foreground relative z-10 w-16 text-right">{q.toFixed(3)}</span>
                      <span className="text-muted-foreground/70 relative z-10 w-20 text-right">{fmt(total)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Mid price */}
              <div className="flex items-center gap-3 py-2 px-1 my-1">
                <div className="flex-1 h-px bg-border" />
                <span className={cn("text-base font-bold", change >= 0 ? "text-green-500" : "text-red-500")}>
                  ${fmt(lastPrice)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Bids */}
              <div className="space-y-0.5">
                {bids.map((b: any, i: number) => {
                  const p = parseFloat(b.price ?? b[0]);
                  const q = parseFloat(b.quantity ?? b[1]);
                  const total = parseFloat(b.total ?? (p * q).toString());
                  const maxVol = 500;
                  const pct = Math.min((q / maxVol) * 100, 100);
                  return (
                    <div key={i} className="flex justify-between text-[11px] relative py-1 px-1 rounded">
                      <div className="absolute inset-y-0 right-0 bg-green-500/8 rounded-sm" style={{ width: `${pct}%` }} />
                      <span className="text-green-500 font-medium relative z-10 w-24">{fmt(p)}</span>
                      <span className="text-muted-foreground relative z-10 w-16 text-right">{q.toFixed(3)}</span>
                      <span className="text-muted-foreground/70 relative z-10 w-20 text-right">{fmt(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TRADE TAB */}
        {tab === "trade" && (
          <div className="h-full overflow-y-auto px-4 pt-4 pb-8">
            {/* Buy / Sell toggle */}
            <div className="flex rounded-xl overflow-hidden border border-border mb-3">
              <button
                onClick={() => setSide("buy")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-bold transition-colors",
                  side === "buy" ? "bg-green-500/20 text-green-500" : "bg-card text-muted-foreground"
                )}
              >
                Buy {base}
              </button>
              <button
                onClick={() => setSide("sell")}
                className={cn(
                  "flex-1 py-2.5 text-sm font-bold transition-colors",
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
                    className="flex-1 bg-transparent text-sm text-foreground outline-none"
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
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  inputMode="decimal"
                />
                <span className="text-xs text-muted-foreground">{base}</span>
              </div>
            </div>

            {/* PCT buttons */}
            <div className="flex gap-2 mb-4">
              {pcts.map(p => (
                <button
                  key={p}
                  className="flex-1 py-1.5 text-xs font-semibold bg-card border border-border rounded-lg text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  onClick={() => setAmount((10 * p / 100).toFixed(3))}
                >
                  {p}%
                </button>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-card border border-border rounded-xl mb-4">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-bold text-foreground">{total} {quote}</span>
            </div>

            {/* Submit */}
            <button
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white shadow-lg transition-opacity active:opacity-80"
              style={{ backgroundColor: side === "buy" ? "#22c55e" : "#ef4444" }}
            >
              {side === "buy" ? `Buy ${base}` : `Sell ${base}`}
            </button>

            {/* Fee note */}
            <p className="text-center text-[10px] text-muted-foreground mt-3">
              Taker fee: 0.1% · Settled on-chain · Non-custodial
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
