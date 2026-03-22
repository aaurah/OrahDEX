import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import { useLocation, useRoute } from "wouter";

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

  const encodedSymbol = encodeURIComponent(symbol);

  const { data: ticker } = useQuery({
    queryKey: ["ticker", symbol],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/markets/${encodedSymbol}/ticker`);
      return r.json();
    },
    refetchInterval: 5000,
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

  const asks = (orderBook?.asks ?? []).slice(0, 5).reverse();
  const bids = (orderBook?.bids ?? []).slice(0, 5);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pb-3 border-b border-border pt-3">
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
            <span className={`text-xs font-medium ${change >= 0 ? "text-green-500" : "text-red-500"}`}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {/* Ticker stats */}
        <div className="flex border-b border-border">
          {[
            { label: "24h High", val: fmt(parseFloat(ticker?.highPrice) || 0) },
            { label: "24h Low", val: fmt(parseFloat(ticker?.lowPrice) || 0) },
            { label: "24h Vol", val: ticker?.volume24h ?? "—" },
          ].map(s => (
            <div key={s.label} className="flex-1 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-foreground">{s.val}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Order book mini */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Order Book</p>
          <div className="flex gap-3">
            {/* Asks */}
            <div className="flex-1 space-y-0.5">
              {asks.map((a: any, i: number) => (
                <div key={i} className="flex justify-between text-[11px] relative">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm opacity-10"
                    style={{ backgroundColor: "#ef4444", width: `${Math.min((parseFloat(a[1]) / 200) * 100, 100)}%` }}
                  />
                  <span className="text-red-500 font-medium relative">{fmt(parseFloat(a[0]))}</span>
                  <span className="text-muted-foreground relative">{parseFloat(a[1]).toFixed(3)}</span>
                </div>
              ))}
              <div className="text-center py-1">
                <span className={`text-base font-bold ${change >= 0 ? "text-green-500" : "text-red-500"}`}>
                  ${fmt(lastPrice)}
                </span>
              </div>
              {bids.map((b: any, i: number) => (
                <div key={i} className="flex justify-between text-[11px] relative">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm opacity-10"
                    style={{ backgroundColor: "#22c55e", width: `${Math.min((parseFloat(b[1]) / 200) * 100, 100)}%` }}
                  />
                  <span className="text-green-500 font-medium relative">{fmt(parseFloat(b[0]))}</span>
                  <span className="text-muted-foreground relative">{parseFloat(b[1]).toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Order form */}
        <div className="px-4 pt-4">
          {/* Buy / Sell toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border mb-3">
            <button
              onClick={() => setSide("buy")}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                side === "buy" ? "bg-green-500/20 text-green-500" : "bg-card text-muted-foreground"
              }`}
            >
              Buy {base}
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                side === "sell" ? "bg-red-500/20 text-red-500" : "bg-card text-muted-foreground"
              }`}
            >
              Sell {base}
            </button>
          </div>

          {/* Order type */}
          <div className="flex gap-2 mb-3">
            {(["limit", "market"] as OrderType[]).map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                  orderType === t
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-card border-border text-muted-foreground"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Price field */}
          {orderType === "limit" && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1.5">Price ({quote})</p>
              <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11">
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
            <p className="text-xs text-muted-foreground mb-1.5">Amount ({base})</p>
            <div className="flex items-center bg-card border border-border rounded-xl px-3 h-11">
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
          <div className="flex gap-2 mb-3">
            {pcts.map(p => (
              <button
                key={p}
                className="flex-1 py-1.5 text-xs font-medium bg-card border border-border rounded-lg text-muted-foreground"
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
            className="w-full py-3.5 rounded-2xl text-sm font-bold transition-colors"
            style={{
              backgroundColor: side === "buy" ? "#22c55e" : "#ef4444",
              color: "#fff",
            }}
          >
            {side === "buy" ? `Buy ${base}` : `Sell ${base}`}
          </button>
        </div>
      </div>
    </div>
  );
}
