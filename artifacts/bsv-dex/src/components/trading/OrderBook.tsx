import { useState, useRef } from "react";
import { OrderBook as OrderBookType } from '@workspace/api-client-react';
import { formatPrice, formatVolume } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { RecentTrades } from './RecentTrades';
import type { Trade } from '@workspace/api-client-react';

export interface OrderBookFill {
  price: string;
  amount: string;
  side: "buy" | "sell";
  ts: number;
}

type BookMode = "full" | "asks" | "bids";
type Panel = "book" | "trades";

interface OrderBookProps {
  data: OrderBookType;
  lastPrice?: number;
  onFill?: (fill: OrderBookFill) => void;
  symbol?: string;
  trades?: Trade[];
}

export function OrderBook({ data, lastPrice, onFill, symbol = "BTC/USDT", trades: tradesProp = [] }: OrderBookProps) {
  const trades = Array.isArray(tradesProp) ? tradesProp : [];
  const [mode, setMode] = useState<BookMode>("full");
  const [panel, setPanel] = useState<Panel>("book");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleFill(fill: OrderBookFill, key: string) {
    onFill?.(fill);
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 600);
  }

  const parts = symbol.split(/[/-]/);
  const base = parts[0] ?? "BTC";
  const quote = parts[1] ?? "USDT";

  const maxTotal = Math.max(
    ...data.bids.map(b => b.total),
    ...data.asks.map(a => a.total),
    1,
  );

  const showAsks = mode === "full" || mode === "asks";
  const showBids = mode === "full" || mode === "bids";
  const isPositive = lastPrice != null && lastPrice > 0;

  return (
    <div className="flex flex-col h-full bg-card font-mono tabular-nums overflow-hidden">
      {/* Top tabs: Order Book | Market Trades */}
      <div className="flex items-center border-b border-border shrink-0">
        {(["book", "trades"] as Panel[]).map(p => (
          <button
            key={p}
            onClick={() => setPanel(p)}
            className={cn(
              "flex-1 py-2 text-[10px] font-semibold transition-colors border-b-2",
              panel === p
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p === "book" ? "Order Book" : "Market Trades"}
          </button>
        ))}

        {/* View-mode switcher — only for order book panel */}
        {panel === "book" && (
          <div className="flex items-center gap-0.5 px-2 shrink-0">
            {(["full", "asks", "bids"] as BookMode[]).map(m => (
              <button
                key={m}
                title={m === "full" ? "Full book" : m === "asks" ? "Asks only" : "Bids only"}
                onClick={() => setMode(m)}
                className={cn(
                  "w-5 h-5 rounded flex items-center justify-center transition-colors",
                  mode === m ? "bg-secondary" : "hover:bg-secondary/50"
                )}
              >
                {m === "full" && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="4" rx="0.5" fill="#ef4444" fillOpacity="0.7"/>
                    <rect x="1" y="7" width="10" height="4" rx="0.5" fill="#22c55e" fillOpacity="0.7"/>
                  </svg>
                )}
                {m === "asks" && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="10" rx="0.5" fill="#ef4444" fillOpacity="0.7"/>
                  </svg>
                )}
                {m === "bids" && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="10" rx="0.5" fill="#22c55e" fillOpacity="0.7"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Market Trades panel */}
      {panel === "trades" && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex justify-between px-2 py-1 text-[9px] text-muted-foreground border-b border-border shrink-0 font-sans">
            <span>Price({quote})</span>
            <span>Amount({base})</span>
            <span>Time</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {trades.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground">No trades yet</div>
            ) : (
              trades.slice(0, 50).map((t: Trade, i) => (
                <div key={t.id ?? i} className="flex justify-between px-2 py-px hover:bg-white/5 transition-colors">
                  <span className={cn("text-[10px]", t.side === "buy" ? "text-buy" : "text-sell")}>{formatPrice(t.price)}</span>
                  <span className="text-[10px] text-foreground">{t.quantity.toFixed(3)}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Order Book panel */}
      {panel === "book" && (
        <>
          {/* Column headers */}
          <div className="flex justify-between px-2 py-1 text-[9px] text-muted-foreground border-b border-border shrink-0 font-sans">
            <span className="flex-1">Price({quote})</span>
            <span className="w-16 text-right">Amount({base})</span>
            <span className="w-16 text-right">Total({quote})</span>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Asks (sells) — shown at top, reversed so lowest ask is nearest the spread */}
            {showAsks && (
              <div className={cn("overflow-hidden flex flex-col justify-end", showBids ? "flex-1" : "flex-1")}>
                {data.asks.slice(-20).reverse().map((ask, i) => {
                  const key = `ask-${i}`;
                  const pct = (ask.total / maxTotal) * 100;
                  const isFlash = flashKey === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative flex items-center px-2 py-px cursor-pointer group transition-colors duration-100",
                        isFlash ? "bg-sell/30" : "hover:bg-sell/10"
                      )}
                      onClick={() => handleFill({ price: ask.price.toFixed(2), amount: ask.quantity.toFixed(4), side: "buy", ts: Date.now() }, key)}
                    >
                      <div className="absolute right-0 top-0 h-full bg-sell/12 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className="flex-1 text-sell text-[10px] relative z-10">{formatPrice(ask.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{ask.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-muted-foreground text-[10px] relative z-10">{formatVolume(ask.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Spread / current price */}
            {showAsks && showBids && (
              <div className="py-1.5 px-2 border-y border-border flex items-center justify-between bg-white/[0.02] shrink-0">
                <span className={cn("text-sm font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
                  {lastPrice ? formatPrice(lastPrice) : '—'}
                </span>
                <span className="text-[9px] text-muted-foreground/50 italic">Mark Price</span>
              </div>
            )}

            {/* Bids (buys) */}
            {showBids && (
              <div className={cn("overflow-hidden", showAsks ? "flex-1" : "flex-1")}>
                {data.bids.slice(0, 20).map((bid, i) => {
                  const key = `bid-${i}`;
                  const pct = (bid.total / maxTotal) * 100;
                  const isFlash = flashKey === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative flex items-center px-2 py-px cursor-pointer group transition-colors duration-100",
                        isFlash ? "bg-buy/30" : "hover:bg-buy/10"
                      )}
                      onClick={() => handleFill({ price: bid.price.toFixed(2), amount: bid.quantity.toFixed(4), side: "sell", ts: Date.now() }, key)}
                    >
                      <div className="absolute right-0 top-0 h-full bg-buy/12 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className="flex-1 text-buy text-[10px] relative z-10">{formatPrice(bid.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{bid.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-muted-foreground text-[10px] relative z-10">{formatVolume(bid.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
