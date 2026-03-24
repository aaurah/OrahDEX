import { useState } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { usePlaceOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn, formatPrice } from "@/lib/utils";
import { getTxExplorerUrl } from "@/store/useWalletStore";
import { checkAllowance, approveToken, fetchEvmBalance } from "@/lib/reown";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { getChainToken, getChainRouter, getNativeSymbol } from "@/lib/chainConfig";
import { evmTrade, getAmountsOut, WRAPPED_NATIVE } from "@/lib/dex-trade";
import {
  Wallet, Shield, Zap, ArrowRightLeft, CheckCircle2,
  ExternalLink, Loader2, PenLine, Settings2, AlertTriangle,
  Lock, ShieldCheck, RefreshCw,
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
  const { address, network, balance, chainId: walletChainId } = useWalletStore();
  const { toast } = useToast();
  const isEvm = !address || network === "evm" || address.startsWith("0x");

  const chainId = walletChainId ?? 1;
  const nativeSymbol = network === "bsv" ? "BSV" : network === "sol" ? "SOL" : network === "btc" ? "BTC" : getNativeSymbol(chainId);
  const nativeBal = balance ? parseFloat(balance) : 0;

  // Fetch real on-chain token balances for the connected EVM wallet
  const { balances: tokenBalances, loading: balancesLoading, refresh: refreshBalances } = useEvmBalances(
    isEvm ? address : null,
    isEvm ? chainId : null
  );

  const [side, setSide]       = useState<Side>("buy");
  const [type, setType]       = useState<OrderType>("limit");
  const [price, setPrice]     = useState<string>(currentPrice > 0 ? currentPrice.toFixed(2) : "");
  const [stopPrice, setStopPrice] = useState<string>("");
  const [amount, setAmount]   = useState<string>("");

  const [signing, setSigning]       = useState(false);
  const [approvalStep, setApprovalStep] = useState<
    "idle" | "checking" | "needed" | "approving" | "approved"
  >("idle");
  const [settlement, setSettlement] = useState<{
    matched: boolean; txid: string | null; explorerUrl: string | null;
  } | null>(null);
  const [slippage, setSlippage] = useState(0.5);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [customSlip, setCustomSlip] = useState("");

  const parts = symbol.split("/");
  const [base, quote = "USDT"] = parts;

  // Derive available balance for each side using real on-chain data:
  // • Sell: how much of the base asset the user has (e.g. BSV, BTC, ETH)
  // • Buy:  how much of the quote asset they can spend (e.g. USDT, USDC)
  const baseBalEntry  = tokenBalances.find(t => t.symbol.toUpperCase() === base.toUpperCase());
  const quoteBalEntry = tokenBalances.find(t => t.symbol.toUpperCase() === quote.toUpperCase());
  // If base is the native token (ETH, BNB, etc.), fall back to native balance from store
  const isNativeBase = base.toUpperCase() === nativeSymbol.toUpperCase();
  const baseAvailable  = isNativeBase ? nativeBal : (baseBalEntry?.amount  ?? 0);
  const quoteAvailable = quoteBalEntry?.amount ?? 0;
  const availableAmt   = side === "sell" ? baseAvailable  : quoteAvailable;
  const availableSym   = side === "sell" ? base : quote;

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

    const currentChainId = useWalletStore.getState().chainId ?? 1;
    const addTx   = useWalletStore.getState().addPendingTx;
    const setbal  = useWalletStore.getState().setBalance;

    // Per-chain router + token registry — correct addresses for every network
    const routerAddr = getChainRouter(currentChainId);

    // ── Step 1: ERC-20 Allowance check for EVM sells ──────────────────────
    // If the user is selling an ERC-20 token, verify the DEX router has
    // enough allowance via allowance(owner, router). If not, request approve().
    if (isEvm && side === "sell" && (window as any).ethereum) {
      // Look up the token contract on the CURRENT chain (not hardcoded mainnet)
      const token = getChainToken(currentChainId, base);
      if (token?.address) {
        try {
          setApprovalStep("checking");
          const amtUnits = BigInt(Math.floor(parseFloat(amount) * 10 ** token.decimals));
          const allowed  = await checkAllowance(token.address, address, routerAddr, currentChainId);

          if (allowed < amtUnits) {
            setApprovalStep("needed");
            toast({
              title: "Token Approval Required",
              description: `Allow OrahDEX to spend your ${base} — you'll see a wallet prompt.`,
            });

            setApprovalStep("approving");
            // Request max approval (0xfff...fff = unlimited)
            const maxHex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
            const approveTxHash = await approveToken(token.address, routerAddr, maxHex, address);

            if (!approveTxHash) {
              setApprovalStep("idle");
              toast({ title: "Approval cancelled", description: "You rejected the approval request.", variant: "destructive" });
              return;
            }

            // Track the approve tx
            addTx({
              hash:                 approveTxHash,
              chainId,
              label:                `Approve ${base} for OrahDEX`,
              status:               "pending",
              confirmations:        0,
              requiredConfirmations: 1,
              timestamp:            Date.now(),
              explorerUrl:          getTxExplorerUrl(approveTxHash, chainId),
            });

            setApprovalStep("approved");
            toast({
              title: "Approval submitted",
              description: `${base} approval tx sent — proceeding to sign order.`,
            });
          } else {
            setApprovalStep("approved");
          }
        } catch {
          setApprovalStep("idle");
        }
      }
    }

    // ── Step 2: EVM market orders — execute on-chain router swap ──────────
    // For market orders on EVM chains, we call swapExactTokensForTokens (or the
    // native-in/out variants) directly on the Uniswap v2-compatible router for
    // this chain. The result tx hash is forwarded to the API as proof-of-trade.
    let onChainTxHash: string | undefined;
    if (isEvm && type === "market" && (window as any).ethereum) {
      try {
        setSigning(true);

        const wNative   = WRAPPED_NATIVE[currentChainId];
        const baseToken  = getChainToken(currentChainId, base);
        const quoteToken = getChainToken(currentChainId, quote);

        // Resolve token addresses; native coin uses its wrapped address in paths
        const isNativeBase  = !baseToken  && !!wNative;
        const isNativeQuote = !quoteToken && !!wNative;
        const baseAddr  = baseToken?.address  ?? wNative ?? "";
        const quoteAddr = quoteToken?.address ?? wNative ?? "";

        if (baseAddr && quoteAddr) {
          const amtFloat = parseFloat(amount);
          let amountInUnits: bigint;
          let isNativeIn  = false;
          let isNativeOut = false;
          let tokenPath: string[];

          if (side === "sell") {
            // Selling base asset → quote asset
            // e.g. ETH → USDT: ETH(native) → USDT
            const decimals   = baseToken?.decimals ?? 18;
            amountInUnits    = BigInt(Math.floor(amtFloat * 10 ** decimals));
            isNativeIn       = isNativeBase;
            isNativeOut      = isNativeQuote;
            tokenPath        = [baseAddr, quoteAddr];
          } else {
            // Buying base asset with quote asset
            // e.g. USDT → ETH: USDT → ETH(native)
            const total      = amtFloat * (parseFloat(price || "0") || currentPrice);
            const decimals   = quoteToken?.decimals ?? 6;
            amountInUnits    = BigInt(Math.floor(total * 10 ** decimals));
            isNativeIn       = isNativeQuote;
            isNativeOut      = isNativeBase;
            tokenPath        = [quoteAddr, baseAddr];
          }

          if (amountInUnits > 0n) {
            // Quote the expected output from the router
            const quoted      = await getAmountsOut(routerAddr, amountInUnits, tokenPath, currentChainId);
            const amountOutMin = quoted ?? 0n;

            toast({
              title: "Confirm Swap",
              description: `Approve the on-chain swap in your wallet — ${amount} ${base}`,
            });

            try {
              onChainTxHash = await evmTrade({
                chainId:        currentChainId,
                routerAddress:  routerAddr,
                amountIn:       amountInUnits,
                amountOutMin,
                path:           tokenPath,
                to:             address,
                slippageBps:    Math.round(slippage * 100),
                isNativeIn,
                isNativeOut,
              }) ?? undefined;

              if (onChainTxHash) {
                addTx({
                  hash:                 onChainTxHash,
                  chainId:              currentChainId,
                  label:                `Swap ${amount} ${base} on ${side === "buy" ? "Buy" : "Sell"}`,
                  status:               "pending",
                  confirmations:        0,
                  requiredConfirmations: 1,
                  timestamp:            Date.now(),
                  explorerUrl:          getTxExplorerUrl(onChainTxHash, currentChainId),
                });
                toast({
                  title: "Swap Submitted ✓",
                  description: `On-chain swap sent · ${onChainTxHash.slice(0, 14)}…`,
                });
              }
            } catch (swapErr: any) {
              setSigning(false);
              setApprovalStep("idle");
              if (swapErr?.code === "USER_REJECTED") {
                toast({ title: "Swap cancelled", description: "You rejected the swap transaction.", variant: "destructive" });
                return;
              }
              // Non-rejection error: fall through to API submission without on-chain hash
              console.warn("[OrahDEX] EVM swap failed, falling back to API:", swapErr);
            }
          }
        }
      } catch (err: any) {
        console.warn("[OrahDEX] EVM market swap error:", err);
      } finally {
        setSigning(false);
      }
    }

    // ── Step 3: Sign the order intent (EVM limit / stop orders only) ───────
    // Market orders already have the on-chain tx hash from Step 2.
    // For limit and stop orders we sign the intent to prove ownership.
    let evmSignature: string | undefined;
    if (isEvm && type !== "market" && (window as any).ethereum) {
      try {
        setSigning(true);
        const message = buildOrderMessage();
        evmSignature = await (window as any).ethereum.request({
          method: "personal_sign",
          params: [message, address],
        });
      } catch (err: any) {
        setSigning(false);
        setApprovalStep("idle");
        if (err?.code === 4001) {
          toast({ title: "Signing rejected", description: "You cancelled the signature request.", variant: "destructive" });
          return;
        }
      } finally {
        setSigning(false);
      }
    }

    setApprovalStep("idle");

    // ── Step 4: Record the order — on success, track settlement tx ─────────
    placeOrder.mutate(
      {
        data: {
          symbol,
          walletAddress: address,
          side,
          type:           type === "stop" ? "limit" : type,
          price:          type !== "market" ? parseFloat(price) : undefined,
          stopPrice:      type === "stop" ? parseFloat(stopPrice) : undefined,
          quantity:       parseFloat(amount),
          evmSignature,
          // Attach the on-chain swap txHash for market orders so the API can
          // record it and generate the corresponding BSV settlement tx.
          signedTx:       onChainTxHash ?? evmSignature,
          networkType:    isEvm ? "evm" : "bsv",
        } as any,
      },
      {
        onSuccess: async (data: any) => {
          const matched = data?.matched ?? false;
          const txid    = data?.settlementTxid ?? data?.txid ?? null;
          const url     = data?.explorerUrl ?? null;

          if (matched && txid) {
            // Track BSV settlement tx in the status bar
            addTx({
              hash:                 txid,
              chainId:              0, // BSV
              label:                `BSV Settlement · ${side.toUpperCase()} ${amount} ${base}`,
              status:               "confirmed",
              confirmations:        1,
              requiredConfirmations: 1,
              timestamp:            Date.now(),
              explorerUrl:          url ?? `https://whatsonchain.com/tx/${txid}`,
            });
          }

          // Refresh native + token balances after any trade
          if (isEvm && address) {
            const bal = await fetchEvmBalance(address, currentChainId);
            if (bal !== null) setbal(bal);
            refreshBalances();
          }
        },
      }
    );
  };

  if (!address) return <WalletPrompt />;

  const isApproving = approvalStep === "checking" || approvalStep === "needed" || approvalStep === "approving";
  const isPending = placeOrder.isPending || signing || isApproving;
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
              <span className="text-muted-foreground text-sm ml-2">{quote}</span>
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
              <span className="text-muted-foreground text-sm ml-2">{quote}</span>
            </div>
          ) : (
            <div className="flex items-center bg-secondary/50 border border-border rounded-xl px-3 py-2.5 cursor-not-allowed">
              <span className="text-muted-foreground text-sm w-16">Price</span>
              <span className="flex-1 text-right text-muted-foreground font-mono">Market Price</span>
              <span className="text-muted-foreground text-sm ml-2">{quote}</span>
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

          {/* Slippage (market orders only) */}
          {type === "market" && (
            <div>
              <button
                type="button"
                onClick={() => setSlippageOpen(o => !o)}
                className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Settings2 className="w-3 h-3" />
                  Slippage tolerance
                </span>
                <span className={cn(
                  "font-semibold",
                  slippage > 1 ? "text-amber-400" : "text-foreground"
                )}>
                  {slippage}%{slippage > 1 ? " ⚠" : ""}
                </span>
              </button>
              {slippageOpen && (
                <div className="mt-2 p-2.5 bg-secondary/60 border border-border rounded-xl space-y-2">
                  <div className="flex gap-1.5">
                    {[0.1, 0.5, 1.0, 2.0].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setSlippage(s); setCustomSlip(""); }}
                        className={cn(
                          "flex-1 py-1 rounded-md text-xs font-bold border transition-all",
                          slippage === s && !customSlip
                            ? "bg-primary/20 border-primary/50 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-card"
                        )}
                      >{s}%</button>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="Custom %"
                      value={customSlip}
                      min="0.01"
                      max="50"
                      step="0.1"
                      onChange={e => {
                        setCustomSlip(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (v > 0 && v <= 50) setSlippage(v);
                      }}
                      className="w-full py-1 px-3 rounded-md text-xs border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 text-center"
                    />
                  </div>
                  {slippage > 1 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      High slippage — your trade may be front-run.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Balance + % shortcuts */}
          <div className="space-y-1.5">
            {/* Balance row — shown right above the % buttons */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Available ({side === "sell" ? base : quote})
              </span>
              <div className="flex items-center gap-1.5">
                {balancesLoading && isEvm ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground/50" />
                ) : (
                  <span className="font-mono font-semibold text-foreground">
                    {availableAmt > 0
                      ? availableAmt.toLocaleString("en-US", { maximumFractionDigits: 8 })
                      : "0"}{" "}
                    <span className="text-muted-foreground font-normal">{availableSym}</span>
                  </span>
                )}
                {!balancesLoading && isEvm && (
                  <button
                    type="button"
                    onClick={refreshBalances}
                    className="text-muted-foreground/40 hover:text-primary transition-colors"
                    title="Refresh balance"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* % shortcut buttons */}
            <div className="flex justify-between gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 text-xs font-semibold border rounded-md transition-all",
                    pct === 100
                      ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      : "bg-secondary hover:bg-secondary/80 border-border text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    const maxAmt = availableAmt;
                    const portion = maxAmt * (pct / 100);
                    if (side === "buy" && price && parseFloat(price) > 0) {
                      setAmount((portion / parseFloat(price)).toFixed(6));
                    } else {
                      setAmount(portion > 0 ? portion.toFixed(6) : "");
                    }
                  }}
                >
                  {pct === 100 ? "MAX" : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Total / Min Received */}
          {type === "limit" && (
            <div className="flex items-center bg-secondary/30 border border-transparent rounded-xl px-3 py-2.5">
              <span className="text-muted-foreground text-sm w-16">Total</span>
              <span className="flex-1 text-right text-foreground font-mono">{formatPrice(isNaN(total) ? 0 : total)}</span>
              <span className="text-muted-foreground text-sm ml-2">{quote}</span>
            </div>
          )}
          {type === "market" && !!amount && parseFloat(amount) > 0 && currentPrice > 0 && (
            <div className="space-y-1 px-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Min received</span>
                <span className="font-mono font-semibold text-foreground">
                  {(parseFloat(amount) * (1 - slippage / 100)).toFixed(6)} {base}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Est. total</span>
                <span className="font-mono text-foreground">
                  ≈ {formatPrice(parseFloat(amount) * currentPrice)} {quote}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Route</span>
                <span className="font-semibold text-green-400 text-[10px] flex items-center gap-1">
                  <Zap className="w-3 h-3" /> AMM → BSV Settlement
                </span>
              </div>
            </div>
          )}

          {/* EVM approval step indicator */}
          {approvalStep !== "idle" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
              {approvalStep === "checking" && <><Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" /><span className="text-amber-300">Checking {base} allowance…</span></>}
              {approvalStep === "needed"   && <><AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" /><span className="text-amber-300">Approval required — confirm in wallet</span></>}
              {approvalStep === "approving" && <><Lock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" /><span className="text-amber-300">Waiting for approval tx…</span></>}
              {approvalStep === "approved"  && <><ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" /><span className="text-green-300">Allowance confirmed — signing order</span></>}
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
            {approvalStep === "checking" || approvalStep === "needed" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Checking allowance…</>
            ) : approvalStep === "approving" ? (
              <><Lock className="w-4 h-4 animate-pulse" /> Approving {base}…</>
            ) : signing ? (
              <><PenLine className="w-4 h-4 animate-pulse" /> Sign in MetaMask…</>
            ) : isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</>
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
