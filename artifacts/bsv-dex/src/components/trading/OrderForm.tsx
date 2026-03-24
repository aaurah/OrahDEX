import { useState } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatPrice } from "@/lib/utils";
import {
  Wallet, Shield, Zap, ArrowRightLeft, CheckCircle2,
  ExternalLink, Loader2, PenLine,
} from "lucide-react";

type Side = "buy" | "sell";
type OrderType = "limit" | "market" | "stop";

// ── Wallet prompt shown when no wallet is connected ───────────────────────────
function WalletPrompt() {
  const openModal = useWalletModalStore((s) => s.open);
  return (
    <div className="flex flex-col h-full">
      <div className="flex opacity-30 pointer-events-none select-none">
        <div className="flex-1 py-4 text-center font-bold text-sm text-buy border-b-2 border-buy bg-buy/5">Buy</div>
        <div className="flex-1 py-4 text-center font-bold text-sm text-muted-foreground border-b-2 border-transparent">Sell</div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-5 py-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/30 to-primary/30 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl border border-primary/20 animate-ping opacity-30" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-foreground text-base mb-1.5">Connect to Trade</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connect your EVM or BSV wallet to place orders. Trades settle on-chain via Bitcoin SV.
          </p>
        </div>
        <button
          onClick={openModal}
          className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-violet-600 to-primary text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
        >
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </button>
        <div className="w-full grid grid-cols-3 gap-2 pt-1">
          {[
            { icon: Shield, label: "Non-custodial" },
            { icon: Zap, label: "BSV settled" },
            { icon: ArrowRightLeft, label: "Multi-chain" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 bg-white/3 rounded-xl py-3 border border-white/5">
              <Icon className="w-4 h-4 text-primary/70" />
              <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
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

// ── Settlement result banner ───────────────────────────────────────────────────
function SettlementBanner({
  matched,
  txid,
  explorerUrl,
  onDismiss,
}: {
  matched: boolean;
  txid: string | null;
  explorerUrl: string | null;
  onDismiss: () => void;
}) {
  if (!matched) return null;
  return (
    <div className="mx-4 mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/25 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-xs font-semibold text-green-400">Trade Matched & Settled On-Chain</span>
      </div>
      {txid && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-mono break-all leading-relaxed">
            BSV txid: {txid.slice(0, 16)}…{txid.slice(-8)}
          </span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-primary hover:text-primary/80"
              title="View on WhatsOnChain"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
      <button onClick={onDismiss} className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground text-left">
        Dismiss
      </button>
    </div>
  );
}

// ── Main OrderForm ─────────────────────────────────────────────────────────────
export function OrderForm({ symbol, currentPrice = 0 }: { symbol: string; currentPrice?: number }) {
  const { address, network, balance } = useWalletStore();
  const { toast } = useToast();
  const isEvm = !address || network === "evm" || address.startsWith("0x");

  const nativeSymbol = network === "bsv" ? "BSV" : network === "sol" ? "SOL" : network === "btc" ? "BTC" : "ETH";
  const nativeBal = balance ? parseFloat(balance) : 0;

  const [side, setSide]       = useState<Side>("buy");
  const [type, setType]       = useState<OrderType>("limit");
  const [price, setPrice]     = useState<string>(currentPrice > 0 ? currentPrice.toFixed(2) : "");
  const [stopPrice, setStopPrice] = useState<string>("");
  const [amount, setAmount]   = useState<string>("");

  const [signing, setSigning] = useState(false);
  const [settlement, setSettlement] = useState<{
    matched: boolean; txid: string | null; explorerUrl: string | null;
  } | null>(null);

  const [base] = symbol.split("/");

  const placeOrder = usePlaceOrder({
    mutation: {
      onSuccess: (data: any) => {
        const matched = data?.matched ?? false;
        const txid    = data?.settlementTxid ?? data?.txid ?? null;
        const url     = data?.explorerUrl ?? null;

        if (matched) {
          setSettlement({ matched: true, txid, explorerUrl: url });
          toast({
            title: "Order Filled ✓",
            description: txid
              ? `Settled on BSV chain · ${txid.slice(0, 12)}…`
              : `${side.toUpperCase()} ${amount} ${base} matched`,
          });
        } else {
          toast({
            title: "Order Open",
            description: `${side.toUpperCase()} ${amount} ${base} @ $${price} · waiting for match`,
          });
        }
        setAmount("");
      },
      onError: () => {
        toast({ title: "Order Failed", description: "Could not place order. Please try again.", variant: "destructive" });
      },
    },
  });

  const total = parseFloat(price || "0") * parseFloat(amount || "0");

  /**
   * Sign the order intent with MetaMask (EVM) before submitting.
   * For BSV wallets, no signing step is needed (BSV tx is built server-side).
   */
  const buildOrderMessage = () =>
    `OrahDEX Order\nPair: ${symbol}\nSide: ${side.toUpperCase()}\nType: ${type.toUpperCase()}\nAmount: ${amount} ${base}${type !== "market" ? `\nPrice: $${price}` : ""}${type === "stop" ? `\nTrigger: $${stopPrice}` : ""}\nWallet: ${address}\nTimestamp: ${Date.now()}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !amount || parseFloat(amount) <= 0) return;

    let evmSignature: string | undefined;

    // EVM wallets: sign the order intent with MetaMask
    if (isEvm && (window as any).ethereum) {
      try {
        setSigning(true);
        const message = buildOrderMessage();
        evmSignature = await (window as any).ethereum.request({
          method: "personal_sign",
          params: [message, address],
        });
      } catch (err: any) {
        setSigning(false);
        if (err?.code === 4001) {
          toast({ title: "Signing rejected", description: "You cancelled the signature request.", variant: "destructive" });
          return;
        }
        // Signing failed but continue without signature (BSV wallets, test env)
      } finally {
        setSigning(false);
      }
    }

    placeOrder.mutate({
      data: {
        symbol,
        walletAddress: address,
        side,
        type:           type === "stop" ? "limit" : type,
        price:          type !== "market" ? parseFloat(price) : undefined,
        stopPrice:      type === "stop" ? parseFloat(stopPrice) : undefined,
        quantity:       parseFloat(amount),
        evmSignature,
        networkType:    isEvm ? "evm" : "bsv",
      } as any,
    });
  };

  if (!address) return <WalletPrompt />;

  const isPending = placeOrder.isPending || signing;
  const priceValid = type === "market" || (!!price && parseFloat(price) > 0);
  const stopValid  = type !== "stop" || (!!stopPrice && parseFloat(stopPrice) > 0);
  const canSubmit  = !isPending && !!amount && parseFloat(amount) > 0 && priceValid && stopValid;

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

      {/* Settlement banner */}
      {settlement && (
        <SettlementBanner
          matched={settlement.matched}
          txid={settlement.txid}
          explorerUrl={settlement.explorerUrl}
          onDismiss={() => setSettlement(null)}
        />
      )}

      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        {/* Network badge */}
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
            isEvm
              ? "text-violet-400 border-violet-500/30 bg-violet-500/10"
              : "text-green-400 border-green-500/30 bg-green-500/10"
          )}>
            {isEvm ? "⬡ EVM" : "₿ BSV"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {isEvm ? "Signs with MetaMask · settles on BSV chain" : "Native BSV · on-chain settlement"}
          </span>
        </div>

        {/* Order type */}
        <div className="flex gap-1 text-xs font-medium bg-secondary p-1 rounded-lg">
          {(["limit", "market", "stop"] as OrderType[]).map((t) => (
            <button key={t}
              className={cn("flex-1 py-1.5 rounded-md transition-colors capitalize",
                type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setType(t)}
            >
              {t === "stop" ? "Stop" : t}
            </button>
          ))}
        </div>

        {/* Stop order info */}
        {type === "stop" && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-amber-400 text-[10px] leading-relaxed">
              <strong>Stop-Limit:</strong> When the market hits your <em>Trigger</em> price, a limit order is placed at your <em>Price</em>.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Available */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Available</span>
            <span className="font-mono text-foreground">
              {side === "buy"
                ? `${nativeBal.toFixed(4)} ${nativeSymbol}`
                : `${nativeBal.toFixed(4)} ${nativeSymbol}`}
            </span>
          </div>

          {/* Trigger price for stop orders */}
          {type === "stop" && (
            <div className="group flex items-center bg-secondary border border-amber-500/40 rounded-xl px-3 py-2.5 focus-within:border-amber-400/70 focus-within:ring-1 focus-within:ring-amber-400/20 transition-all">
              <span className="text-amber-400 text-sm w-16 shrink-0">Trigger</span>
              <input
                type="number"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                className="flex-1 bg-transparent text-right text-foreground font-mono focus:outline-none"
                placeholder="0.00"
                min="0"
                step="any"
              />
              <span className="text-muted-foreground text-sm ml-2">USDT</span>
            </div>
          )}

          {/* Price */}
          {type === "limit" || type === "stop" ? (
            <div className="group flex items-center bg-secondary border border-border rounded-xl px-3 py-2.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <span className="text-muted-foreground text-sm w-16">{type === "stop" ? "Limit" : "Price"}</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="flex-1 bg-transparent text-right text-foreground font-mono focus:outline-none"
                placeholder="0.00"
                min="0"
                step="any"
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
              min="0"
              step="any"
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
                onClick={() => {
                  const portion = nativeBal * (pct / 100);
                  if (side === "buy" && price && parseFloat(price) > 0) {
                    setAmount((portion / parseFloat(price)).toFixed(6));
                  } else {
                    setAmount(portion.toFixed(6));
                  }
                }}
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
            disabled={!canSubmit}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm mt-2 transition-all flex items-center justify-center gap-2",
              side === "buy"
                ? "bg-buy text-white shadow-lg shadow-buy/20 hover:shadow-buy/40 hover:-translate-y-0.5 active:translate-y-0"
                : "bg-sell text-white shadow-lg shadow-sell/20 hover:shadow-sell/40 hover:-translate-y-0.5 active:translate-y-0",
              !canSubmit && "opacity-60 cursor-not-allowed !transform-none"
            )}
          >
            {signing ? (
              <>
                <PenLine className="w-4 h-4 animate-pulse" />
                Sign in MetaMask…
              </>
            ) : isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Placing…
              </>
            ) : (
              `${side === "buy" ? "Buy" : "Sell"} ${base}`
            )}
          </button>

          {/* Fee info & VIP discount */}
          <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span>Fee: <span className="text-foreground font-mono">0.10%</span> maker / <span className="text-foreground font-mono">0.10%</span> taker</span>
            <span className="text-primary font-medium cursor-pointer hover:underline" title="Pay fees in ORAH token for up to 25% discount. VIP tiers unlock lower rates.">
              VIP discounts ↗
            </span>
          </div>

          {/* How it works */}
          <div className="p-3 rounded-xl bg-secondary/40 border border-border/50">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {isEvm
                ? "Your EVM wallet signs the order intent (no gas). When matched, the trade settles permanently on the BSV blockchain via OP_RETURN."
                : "Your BSV wallet trades natively on-chain. Settlement is recorded on the Bitcoin SV blockchain via OP_RETURN."}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
