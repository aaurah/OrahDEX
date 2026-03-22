import { Trade } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatPrice } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function RecentTrades({ trades }: { trades: Trade[] }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-card border-t border-border font-mono text-sm tabular-nums-aligned">
      <div className="px-4 py-2 border-b border-border flex justify-between text-xs text-muted-foreground font-sans bg-secondary/20">
        <span>Price(USDT)</span>
        <span>Amount(BSV)</span>
        <span>Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map((trade, i) => (
          <div key={trade.id} className="flex justify-between px-4 py-1.5 hover:bg-white/5 cursor-pointer">
            <span className={cn(trade.side === 'buy' ? "text-buy" : "text-sell")}>
              {formatPrice(trade.price)}
            </span>
            <span className="text-foreground">{trade.quantity.toFixed(4)}</span>
            <span className="text-muted-foreground">
              {format(new Date(trade.timestamp), "HH:mm:ss")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
