import { useState } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatPrice } from "@/lib/utils";

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

export function OrderForm({ symbol, currentPrice = 0 }: { symbol: string, currentPrice?: number }) {
  const { address } = useWalletStore();
  const { toast } = useToast();
  
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  
  const [price, setPrice] = useState<string>(currentPrice.toString());
  const [amount, setAmount] = useState<string>("");

  const placeOrder = usePlaceOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Order Placed", description: `Successfully placed ${side} order for ${amount} BSV` });
        setAmount("");
      },
      onError: (err) => {
        toast({ title: "Order Failed", description: "Could not place order. Ensure wallet is connected.", variant: "destructive" });
      }
    }
  });

  const total = parseFloat(price || "0") * parseFloat(amount || "0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      toast({ title: "Wallet not connected", description: "Please connect your wallet first", variant: "destructive" });
      return;
    }
    
    placeOrder.mutate({
      data: {
        symbol,
        walletAddress: address,
        side,
        type,
        price: type === 'limit' ? parseFloat(price) : undefined,
        quantity: parseFloat(amount),
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Tabs */}
      <div className="flex">
        <button 
          className={cn("flex-1 py-4 text-center font-bold text-sm transition-colors border-b-2", side === "buy" ? "text-buy border-buy bg-buy/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("buy")}
        >
          Buy BSV
        </button>
        <button 
          className={cn("flex-1 py-4 text-center font-bold text-sm transition-colors border-b-2", side === "sell" ? "text-sell border-sell bg-sell/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("sell")}
        >
          Sell BSV
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        <div className="flex gap-2 text-xs font-medium bg-secondary p-1 rounded-lg">
          <button 
            className={cn("flex-1 py-1.5 rounded-md transition-colors", type === 'limit' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setType('limit')}
          >
            Limit
          </button>
          <button 
            className={cn("flex-1 py-1.5 rounded-md transition-colors", type === 'market' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setType('market')}
          >
            Market
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Avail</span>
            <span className="font-mono">{side === 'buy' ? "4,520.50 USDT" : "150.00 BSV"}</span>
          </div>

          {type === 'limit' ? (
            <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <span className="text-muted-foreground text-sm w-16">Price</span>
              <input 
                type="number" 
                value={price} 
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1 bg-transparent text-right text-foreground font-mono focus:outline-none" 
                placeholder="0.00"
              />
              <span className="text-muted-foreground text-sm ml-2">USDT</span>
            </div>
          ) : (
            <div className="flex items-center bg-secondary/50 border border-border rounded-xl px-3 py-2.5 cursor-not-allowed">
              <span className="text-muted-foreground text-sm w-16">Price</span>
              <span className="flex-1 text-right text-muted-foreground font-mono">Market Price</span>
              <span className="text-muted-foreground text-sm ml-2">USDT</span>
            </div>
          )}

          <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <span className="text-muted-foreground text-sm w-16">Amount</span>
            <input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-right text-foreground font-mono focus:outline-none" 
              placeholder="0.00"
            />
            <span className="text-muted-foreground text-sm ml-2">BSV</span>
          </div>

          <div className="flex justify-between gap-1">
            {[25, 50, 75, 100].map(pct => (
              <button 
                key={pct} 
                type="button"
                className="flex-1 py-1 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-md transition-colors"
                onClick={() => setAmount(side === 'buy' ? ((4520.50 * (pct/100)) / parseFloat(price || "1")).toFixed(4) : (150 * (pct/100)).toFixed(4))}
              >
                {pct}%
              </button>
            ))}
          </div>

          {type === 'limit' && (
            <div className="flex items-center bg-secondary/30 border border-transparent rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground text-sm w-16">Total</span>
              <span className="flex-1 text-right text-foreground font-mono">{formatPrice(total)}</span>
              <span className="text-muted-foreground text-sm ml-2">USDT</span>
            </div>
          )}

          <button 
            type="submit"
            disabled={placeOrder.isPending || !amount || parseFloat(amount) <= 0}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm mt-2 transition-all hover:-translate-y-0.5 active:translate-y-0",
              side === 'buy' 
                ? "bg-buy text-white shadow-lg shadow-buy/20 hover:shadow-buy/40" 
                : "bg-sell text-white shadow-lg shadow-sell/20 hover:shadow-sell/40",
              placeOrder.isPending && "opacity-70 cursor-not-allowed transform-none"
            )}
          >
            {placeOrder.isPending ? "Placing..." : address ? `${side === 'buy' ? 'Buy' : 'Sell'} BSV` : "Connect Wallet to Trade"}
          </button>
        </form>
      </div>
    </div>
  );
}
