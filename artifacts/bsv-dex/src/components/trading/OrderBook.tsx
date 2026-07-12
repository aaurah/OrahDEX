import { useState, useRef, useEffect, useMemo } from "react";
import { OrderBook as OrderBookType } from '@workspace/api-client-react';
import { formatPrice, formatVolume } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Trade } from '@workspace/api-client-react';
import { Zap, ArrowRight, CheckCircle2, ArrowLeftRight } from "lucide-react";
import { useSettingsStore } from '@/store/useSettingsStore';

export interface OrderBookFill {
  price: string;
  amount: string;
  side: "buy" | "sell";
  ts: number;
}

export interface ExternalFlash {
  price: number;
  side: "buy" | "sell";
  ts: number;
  source?: "order" | "letsexchange";
}

type BookMode = "full" | "asks" | "bids";
type Panel = "book" | "trades";

interface LERate {
  rate: string;       // quote per 1 base
  minAmount: string;
  maxAmount: string;
}

interface BridgeLevel {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookProps {
  data: OrderBookType;
  lastPrice?: number;
  onFill?: (fill: OrderBookFill) => void;
  symbol?: string;
  trades?: Trade[];
  /** Live LetsExchange / SimpleSwap rate — shown as virtual orders when liquidity is thin */
  leRate?: LERate | null;
  /** Which bridge provider supplies the quote — 'letsexchange' | 'simpleswap' */
  bridgeProvider?: "letsexchange" | "simpleswap";
  /** True when the internal orderbook has real orders */
  hasInternalLiquidity?: boolean;
  /** Called when user clicks the LE swap row — opens LetsExchange panel */
  onLeSwap?: () => void;
  /** External flash trigger — fired when a buy/sell order is placed or LE swap confirmed */
  externalFlash?: ExternalFlash | null;
}

// ── Bridge level generation ───────────────────────────────────────────────────
// Builds 5 virtual bid/ask levels from a live bridge quote.
// Each level represents a real swap amount the provider can fill,
// with a widening spread to mimic realistic market depth.
function genBridgeLevels(rate: string, minAmt: string, maxAmt: string): { bids: BridgeLevel[]; asks: BridgeLevel[] } {
  const r    = parseFloat(rate);
  const minQ = parseFloat(minAmt);
  const maxQ = parseFloat(maxAmt);
  if (!r || r <= 0 || !minQ || minQ <= 0) return { bids: [], asks: [] };

  const N = 5;
  const cap         = maxQ > 0 && maxQ < minQ * 500 ? maxQ : minQ * 100;
  const step        = (cap - minQ) / Math.max(N - 1, 1);
  const halfSpread  = 0.005;   // 0.5% half-spread — typical swap provider fee
  const spreadStep  = 0.001;   // widens 0.1% per level deeper into the book

  const asks: BridgeLevel[] = [];
  const bids: BridgeLevel[] = [];
  let askTotal = 0;
  let bidTotal = 0;

  for (let i = 0; i < N; i++) {
    const qty   = minQ + step * i;
    const askPx = r * (1 + halfSpread + i * spreadStep);
    const bidPx = r * (1 - halfSpread - i * spreadStep);
    askTotal += askPx * qty;
    bidTotal += bidPx * qty;
    asks.push({ price: askPx, quantity: qty, total: askTotal });
    bids.push({ price: bidPx, quantity: qty, total: bidTotal });
  }

  // Asks: lowest first (standard ask ordering)
  // Bids: highest first (standard bid ordering — already generated that way)
  return { asks, bids: bids.reverse() };
}

export function OrderBook({
  data,
  lastPrice,
  onFill,
  symbol = "BTC/USDT",
  trades: tradesProp = [],
  leRate,
  bridgeProvider = "letsexchange",
  hasInternalLiquidity = true,
  onLeSwap,
  externalFlash,
}: OrderBookProps) {
  const trades = Array.isArray(tradesProp) ? tradesProp : [];
  const { compactOrderBook, animatePriceChanges, highContrastPrices } = useSettingsStore();
  const [mode, setMode] = useState<BookMode>("full");
  const [panel, setPanel] = useState<Panel>("book");
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [spreadFlash, setSpreadFlash] = useState<"buy" | "sell" | null>(null);
  const [spreadLabel, setSpreadLabel] = useState<string>("");
  const spreadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevTradeCountRef = useRef(trades.length);
  const [newTradeIdx, setNewTradeIdx] = useState<number | null>(null);
  const newTradeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (trades.length > prevTradeCountRef.current) {
      setNewTradeIdx(0);
      if (newTradeTimer.current) clearTimeout(newTradeTimer.current);
      newTradeTimer.current = setTimeout(() => setNewTradeIdx(null), 900);
    }
    prevTradeCountRef.current = trades.length;
  }, [trades.length]);

  useEffect(() => {
    if (!externalFlash) return;
    const { side, source } = externalFlash;
    setSpreadFlash(side);
    setSpreadLabel(source === "letsexchange" ? "⚡ Swap confirmed" : side === "buy" ? "✓ Buy filled" : "✓ Sell filled");
    if (spreadTimer.current) clearTimeout(spreadTimer.current);
    spreadTimer.current = setTimeout(() => { setSpreadFlash(null); setSpreadLabel(""); }, 1200);

    if (side === "buy" && data.asks.length > 0) {
      const key = `ask-${data.asks.length - 1}`;
      setFlashKey(key);
    } else if (side === "sell" && data.bids.length > 0) {
      setFlashKey("bid-0");
    }
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 900);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFlash?.ts]);

  function handleFill(fill: OrderBookFill, key: string) {
    onFill?.(fill);
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 600);
  }

  const parts = symbol.split(/[/-]/);
  const base  = parts[0] ?? "BTC";
  const quote = parts[1] ?? "USDT";

  const leAskPrice = leRate ? parseFloat(leRate.rate) : null;

  const maxTotal = Math.max(
    ...data.bids.map(b => b.total),
    ...data.asks.map(a => a.total),
    1,
  );

  const showAsks = mode === "full" || mode === "asks";
  const showBids = mode === "full" || mode === "bids";
  const isPositive = lastPrice != null && lastPrice > 0;

  const showLEOrders = !!leRate && !!leAskPrice;

  // Bridge mode: no internal liquidity AND a live bridge quote is available
  const isBridgeMode = !hasInternalLiquidity && showLEOrders;

  // Virtual bridge levels built from the live LE/SS quote
  const bridgeLevels = useMemo(() => {
    if (!leRate) return { bids: [], asks: [] };
    return genBridgeLevels(leRate.rate, leRate.minAmount, leRate.maxAmount);
  }, [leRate?.rate, leRate?.minAmount, leRate?.maxAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  const providerLabel = bridgeProvider === "simpleswap" ? "SS" : "LE";
  const providerFull  = bridgeProvider === "simpleswap" ? "SimpleSwap" : "LetsExchange";

  const bridgeMaxTotal = Math.max(
    ...bridgeLevels.bids.map(b => b.total),
    ...bridgeLevels.asks.map(a => a.total),
    1,
  );

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
                <div
                  key={t.id ?? i}
                  className={cn(
                    "flex justify-between px-2 transition-all duration-300",
                    compactOrderBook ? "py-px" : "py-1",
                    i === newTradeIdx && animatePriceChanges
                      ? (t.side === "buy" ? "bg-buy/25 animate-in fade-in slide-in-from-top-1 duration-200" : "bg-sell/25 animate-in fade-in slide-in-from-top-1 duration-200")
                      : i === newTradeIdx
                        ? (t.side === "buy" ? "bg-buy/25" : "bg-sell/25")
                        : "hover:bg-white/5"
                  )}
                >
                  <span className={cn(
                    "text-[10px] font-medium",
                    highContrastPrices
                      ? (t.side === "buy" ? "text-green-400" : "text-red-400")
                      : (t.side === "buy" ? "text-buy" : "text-sell")
                  )}>{formatPrice(t.price)}</span>
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
          {/* Bridge mode banner */}
          {isBridgeMode && (
            <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border-b border-amber-500/20">
              <Zap className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[9px] text-amber-400 font-semibold">
                Swap via {providerFull}
              </span>
              <span className="ml-auto text-[8px] text-amber-400/60">
                click any level to swap
              </span>
            </div>
          )}

          <div className="flex justify-between px-2 py-1 text-[9px] text-muted-foreground border-b border-border shrink-0 font-sans">
            <span className="flex-1">
              Price({quote})
              {isBridgeMode && (
                <span className="ml-1 text-[8px] text-amber-400/60">via {providerLabel}</span>
              )}
            </span>
            <span className="w-16 text-right">Amount({base})</span>
            <span className="w-16 text-right">Total({quote})</span>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* ── BRIDGE ASKS ─────────────────────────────────────────────── */}
            {isBridgeMode && showAsks && bridgeLevels.asks.length > 0 && (
              <div className={cn("overflow-hidden flex flex-col justify-end", showBids ? "flex-1" : "flex-1")}>
                {[...bridgeLevels.asks].reverse().map((ask, i) => {
                  const key = `bridge-ask-${i}`;
                  const pct = (ask.total / bridgeMaxTotal) * 100;
                  return (
                    <button
                      key={key}
                      onClick={onLeSwap}
                      className={cn(
                        "relative w-full flex items-center px-2 cursor-pointer group transition-colors duration-100",
                        compactOrderBook ? "py-px" : "py-1",
                        "hover:bg-amber-500/15"
                      )}
                    >
                      <div className="absolute right-0 top-0 h-full bg-amber-500/8 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className="flex-1 text-[10px] relative z-10 text-amber-400">{formatPrice(ask.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{ask.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-amber-400/60 text-[10px] relative z-10">{formatVolume(ask.total)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── STANDARD ASKS ───────────────────────────────────────────── */}
            {!isBridgeMode && showAsks && (
              <div className={cn("overflow-hidden flex flex-col justify-end", showBids ? "flex-1" : "flex-1")}>
                {data.asks.slice(-20).reverse().map((ask, i) => {
                  const key = `ask-${i}`;
                  const pct = (ask.total / maxTotal) * 100;
                  const isFlash = flashKey === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative flex items-center px-2 cursor-pointer group transition-colors duration-100",
                        compactOrderBook ? "py-px" : "py-1",
                        isFlash ? "bg-sell/30" : "hover:bg-sell/10"
                      )}
                      onClick={() => handleFill({ price: ask.price.toFixed(2), amount: ask.quantity.toFixed(4), side: "buy", ts: Date.now() }, key)}
                    >
                      <div className="absolute right-0 top-0 h-full bg-sell/12 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className={cn("flex-1 text-[10px] relative z-10", highContrastPrices ? "text-red-400" : "text-sell")}>{formatPrice(ask.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{ask.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-muted-foreground text-[10px] relative z-10">{formatVolume(ask.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Spread / current price row */}
            {showAsks && showBids && (
              <div className="shrink-0">
                <div className={cn(
                  "py-1.5 px-2 border-y border-border flex items-center justify-between transition-all duration-300",
                  spreadFlash === "buy"  && "bg-buy/20 border-buy/40 ring-1 ring-buy/30",
                  spreadFlash === "sell" && "bg-sell/20 border-sell/40 ring-1 ring-sell/30",
                  !spreadFlash && (isBridgeMode ? "bg-amber-500/5" : "bg-white/[0.02]")
                )}>
                  <span className={cn(
                    "text-sm font-bold leading-none transition-colors duration-200",
                    spreadFlash === "buy"  ? "text-buy" :
                    spreadFlash === "sell" ? "text-sell" :
                    isBridgeMode ? "text-amber-400" :
                    isPositive ? "text-buy" : "text-sell"
                  )}>
                    {lastPrice ? formatPrice(lastPrice) : '—'}
                  </span>
                  {spreadFlash ? (
                    <span className={cn(
                      "text-[9px] font-bold animate-in fade-in duration-150 flex items-center gap-1",
                      spreadFlash === "buy" ? "text-buy" : "text-sell"
                    )}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      {spreadLabel}
                    </span>
                  ) : isBridgeMode ? (
                    <button
                      onClick={onLeSwap}
                      className="flex items-center gap-1 text-[9px] text-amber-400/80 hover:text-amber-400 transition-colors"
                    >
                      <span className="text-[8px] px-1 py-px rounded bg-amber-500/20 font-bold">⚡{providerLabel}</span>
                      <ArrowLeftRight className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    <span className="text-[9px] text-muted-foreground/50 italic">Mark Price</span>
                  )}
                </div>
                {/* LE rate card — shown for non-bridge pairs that still have a live quote */}
                {!isBridgeMode && showLEOrders && leAskPrice && (
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

            {/* ── BRIDGE BIDS ─────────────────────────────────────────────── */}
            {isBridgeMode && showBids && bridgeLevels.bids.length > 0 && (
              <div className={cn("overflow-hidden", showAsks ? "flex-1" : "flex-1")}>
                {bridgeLevels.bids.map((bid, i) => {
                  const key = `bridge-bid-${i}`;
                  const pct = (bid.total / bridgeMaxTotal) * 100;
                  return (
                    <button
                      key={key}
                      onClick={onLeSwap}
                      className={cn(
                        "relative w-full flex items-center px-2 cursor-pointer group transition-colors duration-100",
                        compactOrderBook ? "py-px" : "py-1",
                        "hover:bg-amber-500/15"
                      )}
                    >
                      <div className="absolute right-0 top-0 h-full bg-amber-500/8 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className="flex-1 text-[10px] relative z-10 text-amber-300">{formatPrice(bid.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{bid.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-amber-400/60 text-[10px] relative z-10">{formatVolume(bid.total)}</span>
                    </button>
                  );
                })}

                {/* Min/max swap limits info row */}
                {leRate && (
                  <div className="mt-1 px-2 py-1 flex items-center justify-between text-[8px] text-amber-400/50 border-t border-amber-500/10">
                    <span>Min: {parseFloat(leRate.minAmount).toFixed(4)} {base}</span>
                    {parseFloat(leRate.maxAmount) > 0 && parseFloat(leRate.maxAmount) < 999999 && (
                      <span>Max: {parseFloat(leRate.maxAmount).toFixed(2)} {base}</span>
                    )}
                  </div>
                )}

                <button
                  onClick={onLeSwap}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 border-t border-amber-500/15 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  Swap via {providerFull}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* ── STANDARD BIDS ───────────────────────────────────────────── */}
            {!isBridgeMode && showBids && (
              <div className={cn("overflow-hidden", showAsks ? "flex-1" : "flex-1")}>
                {data.bids.slice(0, 20).map((bid, i) => {
                  const key = `bid-${i}`;
                  const pct = (bid.total / maxTotal) * 100;
                  const isFlash = flashKey === key;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative flex items-center px-2 cursor-pointer group transition-colors duration-100",
                        compactOrderBook ? "py-px" : "py-1",
                        isFlash ? "bg-buy/30" : "hover:bg-buy/10"
                      )}
                      onClick={() => handleFill({ price: bid.price.toFixed(2), amount: bid.quantity.toFixed(4), side: "sell", ts: Date.now() }, key)}
                    >
                      <div className="absolute right-0 top-0 h-full bg-buy/12 transition-all duration-300" style={{ width: `${pct}%` }} />
                      <span className={cn("flex-1 text-[10px] relative z-10", highContrastPrices ? "text-green-400" : "text-buy")}>{formatPrice(bid.price, 2)}</span>
                      <span className="w-16 text-right text-foreground text-[10px] relative z-10">{bid.quantity.toFixed(3)}</span>
                      <span className="w-16 text-right text-muted-foreground text-[10px] relative z-10">{formatVolume(bid.total)}</span>
                    </div>
                  );
                })}

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
