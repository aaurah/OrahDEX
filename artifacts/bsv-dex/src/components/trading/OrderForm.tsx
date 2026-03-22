import { useState } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatPrice } from "@/lib/utils";
import { Wallet, Shield, Zap, ArrowRightLeft } from "lucide-react";

type Side = "buy" | "sell";
type OrderType = "limit" | "market";

function WalletPrompt() {
  const openModal = useWalletModalStore((s) => s.open);
  return (
    <div className="flex flex-col h-full">
      {/* Dimmed header tabs */}
      <div className="flex opacity-30 pointer-events-none select-none">
        <div className="flex-1 py-4 text-center font-bold text-sm text-buy border-b-2 border-buy bg-buy/5">Buy</div>
        <div className="flex-1 py-4 text-center font-bold text-sm text-muted-foreground border-b-2 border-transparent">Sell</div>
      </div>

      {/* Overlay prompt */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-6">
        {/* Animated icon */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-primary/30 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-ping opacity-30" />
        </div>

        <div className="text-center">
          <h3 className="font-bold text-foreground text-base mb-1.5">Connect to Trade</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connect your wallet to place orders, view balances, and track positions.
          </p>
        </div>

        {/* Main CTA */}
        <button
          onClick={openModal}
          className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>

        {/* Feature pills */}
        <div className="w-full grid grid-cols-3 gap-2 pt-1">
          {[
            { icon: Shield, label: "Non-custodial" },
            { icon: Zap, label: "Instant fill" },
            { icon: ArrowRightLeft, label: "On-chain" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 bg-white/3 rounded-xl py-3 border border-white/5">
              <Icon className="w-4 h-4 text-primary/70" />
              <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>

        {/* Dimmed form preview */}
        <div className="w-full space-y-2 opacity-20 pointer-events-none select-none mt-1">
          <div className="flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-sm w-16">Price</span>
            <span className="flex-1 text-right font-mono text-sm">—</span>
            <span className="text-muted-foreground text-sm ml-2">USDT</span>
          </div>
          <div className="flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-sm w-16">Amount</span>
            <span className="flex-1 text-right font-mono text-sm">—</span>
            <span className="text-muted-foreground text-sm ml-2">BSV</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrderForm({ symbol, currentPrice = 0 }: { symbol: string; currentPrice?: number }) {
  const { address } = useWalletStore();
  const { toast } = useToast();

  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState<string>(currentPrice > 0 ? currentPrice.toString() : "");
  const [amount, setAmount] = useState<string>("");

  const [base] = symbol.split("/");

  const placeOrder = usePlaceOrder({
    mutation: {
      onSuccess: () => {
        toast({ title: "Order Placed", description: `${side.toUpperCase()} ${amount} ${base} @ ${type === "market" ? "market" : "$" + price}` });
        setAmount("");
      },
      onError: () => {
        toast({ title: "Order Failed", description: "Could not place order. Please try again.", variant: "destructive" });
      },
    },
  });

  const total = parseFloat(price || "0") * parseFloat(amount || "0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    placeOrder.mutate({
      data: {
        symbol,
        walletAddress: address,
        side,
        type,
        price: type === "limit" ? parseFloat(price) : undefined,
        quantity: parseFloat(amount),
      },
    });
  };

  // Not connected — show the prompt overlay
  if (!address) return <WalletPrompt />;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Buy / Sell tabs */}
      <div className="flex">
        <button
          className={cn("flex-1 py-4 text-center font-bold text-sm transition-colors border-b-2",
            side === "buy" ? "text-buy border-buy bg-buy/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("buy")}
        >
          Buy {base}
        </button>
        <button
          className={cn("flex-1 py-4 text-center font-bold text-sm transition-colors border-b-2",
            side === "sell" ? "text-sell border-sell bg-sell/5" : "text-muted-foreground border-transparent hover:bg-white/5")}
          onClick={() => setSide("sell")}
        >
          Sell {base}
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        {/* Order type */}
        <div className="flex gap-2 text-xs font-medium bg-secondary p-1 rounded-lg">
          {(["limit", "market"] as OrderType[]).map((t) => (
            <button key={t}
              className={cn("flex-1 py-1.5 rounded-md transition-colors capitalize",
                type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Available */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Available</span>
            <span className="font-mono">{side === "buy" ? "4,520.50 USDT" : `150.00 ${base}`}</span>
          </div>

          {/* Price */}
          {type === "limit" ? (
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

          {/* Amount */}
          <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <span className="text-muted-foreground text-sm w-16">Amount</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-right text-foreground font-mono focus:outline-none"
              placeholder="0.00"
            />
            <span className="text-muted-foreground text-sm ml-2">{base}</span>
          </div>

          {/* % shortcuts */}
          <div className="flex justify-between gap-1">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                className="flex-1 py-1 text-xs bg-secondary hover:bg-secondary/80 border border-border rounded-md transition-colors"
                onClick={() => setAmount(
                  side === "buy"
                    ? ((4520.50 * (pct / 100)) / parseFloat(price || "1")).toFixed(4)
                    : (150 * (pct / 100)).toFixed(4)
                )}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Total */}
          {type === "limit" && (
            <div className="flex items-center bg-secondary/30 border border-transparent rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground text-sm w-16">Total</span>
              <span className="flex-1 text-right text-foreground font-mono">{formatPrice(isNaN(total) ? 0 : total)}</span>
              <span className="text-muted-foreground text-sm ml-2">USDT</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={placeOrder.isPending || !amount || parseFloat(amount) <= 0}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm mt-2 transition-all hover:-translate-y-0.5 active:translate-y-0",
              side === "buy"
                ? "bg-buy text-white shadow-lg shadow-buy/20 hover:shadow-buy/40"
                : "bg-sell text-white shadow-lg shadow-sell/20 hover:shadow-sell/40",
              (placeOrder.isPending || !amount || parseFloat(amount) <= 0) && "opacity-60 cursor-not-allowed transform-none"
            )}
          >
            {placeOrder.isPending ? "Placing..." : `${side === "buy" ? "Buy" : "Sell"} ${base}`}
          </button>
        </form>
      </div>
    </div>
  );
}
