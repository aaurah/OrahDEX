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
    <div className="flex flex-col h-full bg-card font-mono text-sm tabular-nums-aligned overflow-hidden">
      <div className="flex justify-between px-4 py-2 text-xs text-muted-foreground border-b border-border">
        <span>Price(USDT)</span>
        <span>Amount(BSV)</span>
        <span>Total</span>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Asks (Sells) - click to fill a BUY limit order at that ask price */}
        <div className="flex-1 overflow-hidden flex flex-col justify-end">
          {data.asks.slice(-15).reverse().map((ask, i) => {
            const depthPercent = (ask.total / maxTotal) * 100;
            return (
              <div
                key={`ask-${i}`}
                className="relative flex justify-between px-4 py-1 hover:bg-sell/10 cursor-pointer group active:bg-sell/20 transition-colors"
                title={`Click to buy at ${formatPrice(ask.price, 2)}`}
                onClick={() => onFill?.({
                  price:  ask.price.toFixed(2),
                  amount: ask.quantity.toFixed(4),
                  side:   "buy",
                  ts:     Date.now(),
                })}
              >
                <div className="absolute right-0 top-0 h-full bg-sell/15 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-sell relative z-10 group-hover:font-bold transition-all">{formatPrice(ask.price, 2)}</span>
                <span className="text-foreground relative z-10">{ask.quantity.toFixed(4)}</span>
                <span className="text-foreground relative z-10">{formatVolume(ask.total)}</span>
              </div>
            );
          })}
        </div>

        {/* Current Price spread */}
        <div className="py-2 px-4 border-y border-border flex items-center justify-between bg-white/[0.02]">
          <span className="text-lg font-bold text-buy">
            {lastPrice ? formatPrice(lastPrice) : '--'}
          </span>
          <span className="text-xs text-muted-foreground">
            {onFill && <span className="text-[10px] text-primary/60 italic">Click any row to fill form</span>}
          </span>
        </div>

        {/* Bids (Buys) - click to fill a SELL limit order at that bid price */}
        <div className="flex-1 overflow-hidden">
          {data.bids.slice(0, 15).map((bid, i) => {
            const depthPercent = (bid.total / maxTotal) * 100;
            return (
              <div
                key={`bid-${i}`}
                className="relative flex justify-between px-4 py-1 hover:bg-buy/10 cursor-pointer group active:bg-buy/20 transition-colors"
                title={`Click to sell at ${formatPrice(bid.price, 2)}`}
                onClick={() => onFill?.({
                  price:  bid.price.toFixed(2),
                  amount: bid.quantity.toFixed(4),
                  side:   "sell",
                  ts:     Date.now(),
                })}
              >
                <div className="absolute right-0 top-0 h-full bg-buy/15 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-buy relative z-10 group-hover:font-bold transition-all">{formatPrice(bid.price, 2)}</span>
                <span className="text-foreground relative z-10">{bid.quantity.toFixed(4)}</span>
                <span className="text-foreground relative z-10">{formatVolume(bid.total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
