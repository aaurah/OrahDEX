import { useState, useRef } from "react";
import { OrderBook as OrderBookType } from '@workspace/api-client-react';
import { formatPrice, formatVolume } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Trade } from '@workspace/api-client-react';
import { Zap, ArrowRight } from "lucide-react";

export interface OrderBookFill {
  price: string;
  amount: string;
  side: "buy" | "sell";
  ts: number;
}

type BookMode = "full" | "asks" | "bids";
type Panel = "book" | "trades";

interface LERate {
  rate: string;       // quote per 1 base
  minAmount: string;
  maxAmount: string;
}

interface OrderBookProps {
  data: OrderBookType;
  lastPrice?: number;
  onFill?: (fill: OrderBookFill) => void;
  symbol?: string;
  trades?: Trade[];
  /** Live LetsExchange rate — shown as virtual orders when liquidity is thin */
  leRate?: LERate | null;
  /** True when the internal orderbook has real orders */
  hasInternalLiquidity?: boolean;
  /** Called when user clicks the LE swap row — opens LetsExchange panel */
  onLeSwap?: () => void;
}

export function OrderBook({
  data,
  lastPrice,
  onFill,
  symbol = "BTC/USDT",
  trades: tradesProp = [],
  leRate,
  hasInternalLiquidity = true,
  onLeSwap,
}: OrderBookProps) {
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

  // LE cross-chain rate (parsed from prop)
  const leAskPrice = leRate ? parseFloat(leRate.rate) : null;

  const maxTotal = Math.max(
    ...data.bids.map(b => b.total),
    ...data.asks.map(a => a.total),
    1,
  );

  const showAsks = mode === "full" || mode === "asks";
  const showBids = mode === "full" || mode === "bids";
  const isPositive = lastPrice != null && lastPrice > 0;

  // Show LE card when rate is available
  const showLEOrders = !!leRate && !!leAskPrice;

  return (
    <div className="flex flex-col h-full bg-card font-mono tabular-nums overflow-hidden">
      {/* Top tabs */}
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
          <div className="flex justify-between px-2 py-1 text-[9px] text-muted-foreground border-b border-border shrink-0 font-sans">
            <span className="flex-1">Price({quote})</span>
            <span className="w-16 text-right">Amount({base})</span>
            <span className="w-16 text-right">Total({quote})</span>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Asks (sells) */}
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

            {/* Spread / current price + LE rate card */}
            {showAsks && showBids && (
              <div className="shrink-0">
                <div className="py-1.5 px-2 border-y border-border flex items-center justify-between bg-white/[0.02]">
                  <span className={cn("text-sm font-bold leading-none", isPositive ? "text-buy" : "text-sell")}>
                    {lastPrice ? formatPrice(lastPrice) : '—'}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 italic">Mark Price</span>
                </div>
                {/* LE rate card — always shown when rate is available */}
                {showLEOrders && leAskPrice && (
                  <button
                    onClick={onLeSwap}
                    className="w-full flex items-center gap-2 px-2 py-1.5 bg-yellow-500/8 hover:bg-yellow-500/15 border-b border-yellow-500/20 transition-colors group"
                  >
                    <Zap className="w-3 h-3 text-yellow-400 shrink-0" />
                    <span className="flex-1 text-left text-[9px] text-yellow-400/80">
                      Cross-chain rate
                    </span>
                    <span className="text-[10px] font-mono font-bold text-yellow-400">
                      {formatPrice(leAskPrice, 4)}
                    </span>
                    <span className="text-[8px] px-1 py-px rounded bg-yellow-500/20 text-yellow-400 font-bold shrink-0">⚡LE</span>
                    <ArrowRight className="w-2.5 h-2.5 text-yellow-400/50 group-hover:text-yellow-400 transition-colors shrink-0" />
                  </button>
                )}
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

                {/* No liquidity at all — show a clear LE CTA */}
                {!hasInternalLiquidity && showLEOrders && (
                  <button
                    onClick={onLeSwap}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                    No internal liquidity — swap cross-chain
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}

                {!hasInternalLiquidity && !showLEOrders && (
                  <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground">
                    No orders yet — be the first to provide liquidity
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
