import { OrderBook as OrderBookType } from '@workspace/api-client-react';
import { formatPrice, formatVolume } from '@/lib/utils';

export interface OrderBookFill {
  price: string;
  amount: string;
  side: "buy" | "sell";
  ts: number;
}

interface OrderBookProps {
  data: OrderBookType;
  lastPrice?: number;
  onFill?: (fill: OrderBookFill) => void;
}

export function OrderBook({ data, lastPrice, onFill }: OrderBookProps) {
  const maxTotal = Math.max(
    ...data.bids.map(b => b.total),
    ...data.asks.map(a => a.total)
  );

  return (
    <div className="flex flex-col h-full bg-card font-mono tabular-nums-aligned overflow-hidden">
      {/* Column headers — tiny */}
      <div className="flex justify-between px-2 py-1 text-[9px] text-muted-foreground border-b border-border shrink-0">
        <span>Price</span>
        <span>Amount</span>
        <span>Total</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Asks (Sells) — click to place a BUY limit */}
        <div className="flex-1 overflow-hidden flex flex-col justify-end">
          {data.asks.slice(-20).reverse().map((ask, i) => {
            const depthPercent = (ask.total / maxTotal) * 100;
            return (
              <div
                key={`ask-${i}`}
                className="relative flex justify-between px-2 py-px hover:bg-sell/10 cursor-pointer group active:bg-sell/20 transition-colors"
                title={`Buy at ${formatPrice(ask.price, 2)}`}
                onClick={() => onFill?.({
                  price:  ask.price.toFixed(2),
                  amount: ask.quantity.toFixed(4),
                  side:   "buy",
                  ts:     Date.now(),
                })}
              >
                <div className="absolute right-0 top-0 h-full bg-sell/12 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-sell text-[10px] relative z-10 group-hover:brightness-125">{formatPrice(ask.price, 2)}</span>
                <span className="text-foreground text-[10px] relative z-10">{ask.quantity.toFixed(3)}</span>
                <span className="text-muted-foreground text-[10px] relative z-10">{formatVolume(ask.total)}</span>
              </div>
            );
          })}
        </div>

        {/* Spread / current price row */}
        <div className="py-1 px-2 border-y border-border flex items-center justify-between bg-white/[0.02] shrink-0">
          <span className="text-sm font-bold text-buy leading-none">
            {lastPrice ? formatPrice(lastPrice) : '--'}
          </span>
          {onFill && (
            <span className="text-[9px] text-primary/50 italic">tap row → fill form</span>
          )}
        </div>

        {/* Bids (Buys) — click to place a SELL limit */}
        <div className="flex-1 overflow-hidden">
          {data.bids.slice(0, 20).map((bid, i) => {
            const depthPercent = (bid.total / maxTotal) * 100;
            return (
              <div
                key={`bid-${i}`}
                className="relative flex justify-between px-2 py-px hover:bg-buy/10 cursor-pointer group active:bg-buy/20 transition-colors"
                title={`Sell at ${formatPrice(bid.price, 2)}`}
                onClick={() => onFill?.({
                  price:  bid.price.toFixed(2),
                  amount: bid.quantity.toFixed(4),
                  side:   "sell",
                  ts:     Date.now(),
                })}
              >
                <div className="absolute right-0 top-0 h-full bg-buy/12 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-buy text-[10px] relative z-10 group-hover:brightness-125">{formatPrice(bid.price, 2)}</span>
                <span className="text-foreground text-[10px] relative z-10">{bid.quantity.toFixed(3)}</span>
                <span className="text-muted-foreground text-[10px] relative z-10">{formatVolume(bid.total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
