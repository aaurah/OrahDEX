import { OrderBook as OrderBookType } from '@workspace/api-client-react';
import { formatPrice, formatVolume } from '@/lib/utils';

interface OrderBookProps {
  data: OrderBookType;
  lastPrice?: number;
}

export function OrderBook({ data, lastPrice }: OrderBookProps) {
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
        {/* Asks (Sells) - Order descending to display highest prices at top */}
        <div className="flex-1 overflow-hidden flex flex-col justify-end">
          {data.asks.slice(-15).reverse().map((ask, i) => {
            const depthPercent = (ask.total / maxTotal) * 100;
            return (
              <div key={`ask-${i}`} className="relative flex justify-between px-4 py-1 hover:bg-white/5 cursor-pointer group">
                <div className="absolute right-0 top-0 h-full bg-sell/15 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-sell relative z-10">{formatPrice(ask.price, 2)}</span>
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
          <span className="text-xs text-muted-foreground underline decoration-dashed cursor-help">
            More
          </span>
        </div>

        {/* Bids (Buys) */}
        <div className="flex-1 overflow-hidden">
          {data.bids.slice(0, 15).map((bid, i) => {
            const depthPercent = (bid.total / maxTotal) * 100;
            return (
              <div key={`bid-${i}`} className="relative flex justify-between px-4 py-1 hover:bg-white/5 cursor-pointer group">
                <div className="absolute right-0 top-0 h-full bg-buy/15 transition-all duration-300" style={{ width: `${depthPercent}%` }} />
                <span className="text-buy relative z-10">{formatPrice(bid.price, 2)}</span>
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
