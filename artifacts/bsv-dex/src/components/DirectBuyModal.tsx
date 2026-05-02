import { useState, useEffect, useCallback, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import {
  X, ChevronDown, Loader2, AlertTriangle, ShoppingCart,
  CheckCircle2, Info, Lock, CreditCard, Building2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

/* ── Chain types & address metadata ──────────────────────────────────────── */
type ChainType = "evm" | "bitcoin" | "bsv" | "solana" | "xrp" | "cardano" | "dogecoin" | "polkadot";

interface CoinDef {
  symbol: string;
  name: string;
  chain: ChainType;
  addressLabel: string;      // label above address field
  addressPlaceholder: string;
  addressHint: string;       // shown below field as helper
  addressRegex: RegExp;      // basic format check
}

/* ── Supported coins for direct purchase ──────────────────────────────────── */
const DIRECT_BUY_COINS: CoinDef[] = [
  {
    symbol: "BTC", name: "Bitcoin", chain: "bitcoin",
    addressLabel: "Your Bitcoin (BTC) address",
    addressPlaceholder: "bc1q... or 1... or 3...",
    addressHint: "Native SegWit (bc1q...), Legacy (1...) or P2SH (3...) address",
    addressRegex: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,90}$/,
  },
  {
    symbol: "ETH", name: "Ethereum", chain: "evm",
    addressLabel: "Your Ethereum (ETH) address",
    addressPlaceholder: "0x...",
    addressHint: "EVM-compatible address starting with 0x",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "BSV", name: "Bitcoin SV", chain: "bsv",
    addressLabel: "Your Bitcoin SV (BSV) address",
    addressPlaceholder: "1...",
    addressHint: "Legacy Bitcoin SV address starting with 1",
    addressRegex: /^1[a-zA-HJ-NP-Z0-9]{25,34}$/,
  },
  {
    symbol: "BNB", name: "BNB", chain: "evm",
    addressLabel: "Your BNB Smart Chain address",
    addressPlaceholder: "0x...",
    addressHint: "BNB Smart Chain address (same format as Ethereum — 0x...)",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "SOL", name: "Solana", chain: "solana",
    addressLabel: "Your Solana (SOL) address",
    addressPlaceholder: "e.g. 7dHbW...",
    addressHint: "Base58 Solana address, ~44 characters",
    addressRegex: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  },
  {
    symbol: "XRP", name: "XRP", chain: "xrp",
    addressLabel: "Your XRP Ledger address",
    addressPlaceholder: "r...",
    addressHint: "XRP address starting with r, 25–35 characters",
    addressRegex: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
  },
  {
    symbol: "ADA", name: "Cardano", chain: "cardano",
    addressLabel: "Your Cardano (ADA) address",
    addressPlaceholder: "addr1...",
    addressHint: "Shelley-era address starting with addr1",
    addressRegex: /^addr1[a-z0-9]{50,100}$/,
  },
  {
    symbol: "AVAX", name: "Avalanche", chain: "evm",
    addressLabel: "Your Avalanche (AVAX) C-Chain address",
    addressPlaceholder: "0x...",
    addressHint: "Avalanche C-Chain address (EVM format — 0x...)",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "DOGE", name: "Dogecoin", chain: "dogecoin",
    addressLabel: "Your Dogecoin (DOGE) address",
    addressPlaceholder: "D...",
    addressHint: "Dogecoin address starting with D, 34 characters",
    addressRegex: /^D[a-zA-HJ-NP-Z0-9]{32,34}$/,
  },
  {
    symbol: "MATIC", name: "Polygon", chain: "evm",
    addressLabel: "Your Polygon (MATIC) address",
    addressPlaceholder: "0x...",
    addressHint: "Polygon address (EVM format — 0x...)",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "DOT", name: "Polkadot", chain: "polkadot",
    addressLabel: "Your Polkadot (DOT) address",
    addressPlaceholder: "1...",
    addressHint: "Polkadot SS58 address, ~48 characters",
    addressRegex: /^1[a-zA-Z0-9]{47,48}$/,
  },
  {
    symbol: "USDT", name: "Tether", chain: "evm",
    addressLabel: "Your Ethereum address (for USDT ERC-20)",
    addressPlaceholder: "0x...",
    addressHint: "USDT will be sent as ERC-20 on Ethereum — use your 0x address",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "USDC", name: "USD Coin", chain: "evm",
    addressLabel: "Your Ethereum address (for USDC ERC-20)",
    addressPlaceholder: "0x...",
    addressHint: "USDC will be sent as ERC-20 on Ethereum — use your 0x address",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "LINK", name: "Chainlink", chain: "evm",
    addressLabel: "Your Ethereum (LINK) address",
    addressPlaceholder: "0x...",
    addressHint: "EVM address on Ethereum — 0x...",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
  {
    symbol: "UNI", name: "Uniswap", chain: "evm",
    addressLabel: "Your Ethereum (UNI) address",
    addressPlaceholder: "0x...",
    addressHint: "EVM address on Ethereum — 0x...",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
  },
];

const QUICK_AMOUNTS = ["50", "100", "250", "500", "1000"];
const FEE_RATE = 0.015; // 1.5%

type FiatPayMethod = "apple" | "google" | "card" | "bank";
type Step = "amount" | "payment" | "success";

/* ── Cached Stripe promise — re-created when key changes ─────────────────── */
let _stripeKey = "";
let _stripePromise: ReturnType<typeof loadStripe> | null = null;

function getStripePromise(pubKey: string) {
  if (pubKey !== _stripeKey || !_stripePromise) {
    _stripeKey = pubKey;
    _stripePromise = loadStripe(pubKey);
  }
  return _stripePromise;
}

/* ── Inner payment form (rendered inside <Elements> context) ─────────────── */
function PaymentForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function handlePay() {
    if (!stripe || !elements) return;
    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (error) {
      onError(error.message ?? "Payment failed — please check your details and try again.");
      setPaying(false);
    } else if (paymentIntent?.status === "succeeded") {
      onSuccess();
    } else {
      onError("Payment status unclear — please check your email for a confirmation.");
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing payment…</>
          : <><Lock className="w-4 h-4" /> Confirm &amp; Pay</>}
      </button>
    </div>
  );
}

/* ── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  open: boolean;
  onClose: () => void;
  defaultCoin?: string;
  defaultPayMethod?: FiatPayMethod;
}

const SESSION_ADDR_KEY = "orahdex_session_addr";
function getUserWallet(evmAddress: string | null | undefined): string {
  if (evmAddress) return evmAddress;
  return sessionStorage.getItem(SESSION_ADDR_KEY) ?? "";
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function DirectBuyModal({
  open,
  onClose,
  defaultCoin = "BTC",
  defaultPayMethod = "card",
}: Props) {
  const { address } = useWalletStore();

  const [step,          setStep]          = useState<Step>("amount");
  const [coin,          setCoin]          = useState(defaultCoin);
  const [fiatAmount,    setFiatAmount]    = useState("100");
  const [walletAddr,    setWalletAddr]    = useState("");
  const [showCoinList,  setShowCoinList]  = useState(false);

  const [prices,        setPrices]        = useState<Record<string, number> | null>(null);
  const [pubKey,        setPubKey]        = useState<string | null>(null);
  const [pubKeyErr,     setPubKeyErr]     = useState(false);

  const [clientSecret,  setClientSecret]  = useState<string | null>(null);
  const [orderId,       setOrderId]       = useState<string | null>(null);
  const [orderDetails,  setOrderDetails]  = useState<{
    cryptoAmount: string; exchangeRate: string; feeUsd: string; netUsd: string;
  } | null>(null);

  const [creating,      setCreating]      = useState(false);
  const [createErr,     setCreateErr]     = useState<string | null>(null);
  const [payErr,        setPayErr]        = useState<string | null>(null);

  /* Auto-fill address when coin changes: EVM coins → connected wallet, others → clear */
  useEffect(() => {
    const def = DIRECT_BUY_COINS.find(c => c.symbol === coin);
    if (def?.chain === "evm" && address) {
      setWalletAddr(address);
    } else if (def?.chain !== "evm") {
      setWalletAddr("");
    }
  }, [coin, address]);

  /* Reset whenever modal opens */
  useEffect(() => {
    if (!open) return;
    setStep("amount");
    const startCoin = defaultCoin;
    setCoin(startCoin);
    setFiatAmount("100");
    const startDef = DIRECT_BUY_COINS.find(c => c.symbol === startCoin);
    setWalletAddr(startDef?.chain === "evm" && address ? address : "");
    setShowCoinList(false);
    setClientSecret(null);
    setOrderId(null);
    setOrderDetails(null);
    setCreateErr(null);
    setPayErr(null);
  }, [open, defaultCoin, address]);

  /* Fetch live prices */
  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/prices`)
      .then(r => r.json())
      .then(d => setPrices(d))
      .catch(() => {});
  }, [open]);

  /* Fetch Stripe publishable key */
  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/stripe/config`)
      .then(r => r.json())
      .then(d => {
        if (d.publishableKey) { setPubKey(d.publishableKey); setPubKeyErr(false); }
        else setPubKeyErr(true);
      })
      .catch(() => setPubKeyErr(true));
  }, [open]);

  if (!open) return null;

  /* ── Computed values ─────────────────────────────────────────────────────── */
  const price        = prices?.[coin] ?? 0;
  const fiatNum      = parseFloat(fiatAmount) || 0;
  const fee          = fiatNum * FEE_RATE;
  const netUsd       = fiatNum - fee;
  const cryptoAmt    = price > 0 ? netUsd / price : 0;
  const coinDef      = DIRECT_BUY_COINS.find(c => c.symbol === coin)!;
  const isEvm        = coinDef?.chain === "evm";
  const isReady      = !!pubKey && !pubKeyErr;
  const addrValid    = walletAddr.trim().length >= 15 && (coinDef?.addressRegex?.test(walletAddr.trim()) ?? true);
  const canPreview   = fiatNum >= 10 && addrValid && isReady;

  /* ── Payment method label ────────────────────────────────────────────────── */
  const methodLabel: Record<FiatPayMethod, string> = {
    apple: "Apple Pay",
    google: "Google Pay",
    card: "Credit / Debit Card",
    bank: "Bank Transfer",
  };

  /* ── Create payment intent ───────────────────────────────────────────────── */
  async function createOrder() {
    if (!canPreview) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const r = await fetch(`${API_BASE}/stripe/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coinSymbol: coin,
          fiatAmountUsd: fiatNum,
          walletAddress: walletAddr.trim(),
          userWallet: getUserWallet(address),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setCreateErr(data.error ?? "Failed to create order — please try again.");
        return;
      }
      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
      setOrderDetails({
        cryptoAmount: data.cryptoAmount,
        exchangeRate: data.exchangeRate,
        feeUsd: data.feeUsd,
        netUsd: data.netUsd,
      });
      setStep("payment");
    } catch {
      setCreateErr("Network error — please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  const elementsOptions: StripeElementsOptions = {
    clientSecret: clientSecret ?? undefined,
    appearance: {
      theme: "night",
      variables: {
        colorPrimary: "#3b82f6",
        colorBackground: "#1a1a2e",
        colorText: "#e2e8f0",
        colorDanger: "#f87171",
        borderRadius: "12px",
        fontFamily: "system-ui, sans-serif",
      },
    },
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-[460px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[93vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step === "payment" && (
              <button
                onClick={() => { setStep("amount"); setPayErr(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-muted-foreground transition-colors"
              >←</button>
            )}
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-400" />
                {step === "amount"  && "Buy Crypto — OrahDEX"}
                {step === "payment" && "Complete Payment"}
                {step === "success" && "Order Confirmed!"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {step === "amount"  && "Direct purchase · No third-party redirect"}
                {step === "payment" && "Secured by Stripe · 256-bit SSL"}
                {step === "success" && "Crypto is on its way to your wallet"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex border-b border-border shrink-0 bg-secondary/20">
          {(["amount", "payment", "success"] as Step[]).map((s, i) => {
            const cur = ["amount", "payment", "success"].indexOf(step);
            return (
              <div key={s} className="flex-1 flex items-center justify-center py-2 gap-1">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                  i < cur ? "bg-green-500 text-white" : i === cur ? "bg-blue-500 text-white" : "bg-secondary text-muted-foreground"
                )}>
                  {i < cur ? "✓" : i + 1}
                </div>
                <span className={cn("text-[9px] font-semibold hidden sm:inline", i === cur ? "text-foreground" : "text-muted-foreground")}>
                  {s === "amount" ? "Amount" : s === "payment" ? "Payment" : "Done"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="overflow-y-auto flex-1 p-4">

          {/* ════════ STEP 1: AMOUNT ════════ */}
          {step === "amount" && (
            <div className="space-y-4">

              {/* Stripe not connected banner */}
              {pubKeyErr && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-300 leading-relaxed">
                    <p className="font-bold">Stripe payment not configured yet.</p>
                    <p className="mt-0.5 opacity-80">Connect your Stripe account from the Integrations tab to enable direct purchases.</p>
                  </div>
                </div>
              )}

              {/* Payment method badge */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                {defaultPayMethod === "apple"  && <span className="text-sm">🍎</span>}
                {defaultPayMethod === "google" && <span className="text-sm">🔵</span>}
                {defaultPayMethod === "card"   && <CreditCard className="w-4 h-4 text-blue-400" />}
                {defaultPayMethod === "bank"   && <Building2 className="w-4 h-4 text-blue-400" />}
                <span className="text-xs font-semibold text-blue-300">
                  Paying via {methodLabel[defaultPayMethod]}
                </span>
                <span className="ml-auto text-[10px] text-blue-400/60">auto-selected</span>
              </div>

              {/* Coin selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">I want to buy</label>
                <div className="relative">
                  <button
                    onClick={() => setShowCoinList(v => !v)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-secondary/40 hover:border-primary/40 transition text-left"
                  >
                    <CoinLogo symbol={coin} size={32} />
                    <div className="flex-1">
                      <div className="font-bold text-sm">{coin}</div>
                      <div className="text-[11px] text-muted-foreground">{coinDef?.name ?? coin}</div>
                    </div>
                    {price > 0 && (
                      <span className="text-xs font-mono text-muted-foreground">
                        ${price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>
                    )}
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showCoinList && "rotate-180")} />
                  </button>

                  {showCoinList && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-card border border-border rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                      {DIRECT_BUY_COINS.map(c => (
                        <button
                          key={c.symbol}
                          onClick={() => { setCoin(c.symbol); setShowCoinList(false); }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition text-left",
                            coin === c.symbol && "bg-primary/10"
                          )}
                        >
                          <CoinLogo symbol={c.symbol} size={28} />
                          <div className="flex-1">
                            <div className="text-sm font-semibold">{c.symbol}</div>
                            <div className="text-[10px] text-muted-foreground">{c.name}</div>
                          </div>
                          {prices?.[c.symbol] && (
                            <span className="text-xs font-mono text-muted-foreground">
                              ${prices[c.symbol].toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Fiat amount */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Amount (USD)</label>
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-secondary/40 focus-within:border-primary/40 transition">
                  <span className="text-2xl font-bold text-muted-foreground/60">$</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={fiatAmount}
                    onChange={e => setFiatAmount(e.target.value)}
                    placeholder="100"
                    className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30"
                  />
                  <span className="text-sm font-semibold text-muted-foreground">USD</span>
                </div>
                <div className="flex gap-1.5">
                  {QUICK_AMOUNTS.map(v => (
                    <button
                      key={v}
                      onClick={() => setFiatAmount(v)}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition",
                        fiatAmount === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price preview card */}
              {price > 0 && fiatNum >= 10 && (
                <div className="rounded-xl bg-muted/30 border border-border/40 divide-y divide-border/30 text-sm overflow-hidden">
                  <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                    <span>Current price</span>
                    <span className="font-mono font-semibold text-foreground">
                      ${price.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {coin}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                    <span>OrahDEX fee (1.5%)</span>
                    <span className="font-mono text-amber-400">−${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 font-bold bg-emerald-500/5">
                    <span>You receive</span>
                    <span className="font-mono text-emerald-400">
                      ≈ {cryptoAmt >= 0.0001 ? cryptoAmt.toFixed(6) : cryptoAmt.toExponential(4)} {coin}
                    </span>
                  </div>
                </div>
              )}
              {fiatNum > 0 && fiatNum < 10 && (
                <p className="text-xs text-amber-400 text-center">Minimum purchase is $10</p>
              )}

              {/* Wallet address — chain-aware */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  {coinDef?.addressLabel ?? `Your ${coin} address`}
                </label>

                {/* Chain badge */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold border",
                  isEvm
                    ? "bg-violet-500/10 border-violet-500/20 text-violet-300"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-300"
                )}>
                  <span>{isEvm ? "🔷" : "⛓️"}</span>
                  <span>
                    {isEvm
                      ? `${coin} is an EVM coin — your connected wallet address is auto-filled`
                      : `${coin} runs on its own chain — paste your ${coin}-compatible address below`}
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={walletAddr}
                    onChange={e => setWalletAddr(e.target.value)}
                    placeholder={coinDef?.addressPlaceholder ?? `Your ${coin} address`}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border bg-secondary/40 text-sm font-mono outline-none transition placeholder:text-muted-foreground/40",
                      walletAddr.trim().length >= 15 && !coinDef?.addressRegex?.test(walletAddr.trim())
                        ? "border-red-500/50 focus:border-red-500/70"
                        : walletAddr.trim().length >= 15 && coinDef?.addressRegex?.test(walletAddr.trim())
                          ? "border-emerald-500/40 focus:border-emerald-500/60"
                          : "border-border focus:border-primary/40"
                    )}
                  />
                  {/* Valid tick */}
                  {addrValid && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                  )}
                </div>

                {/* Hint text */}
                <p className="text-[10px] text-muted-foreground/70 px-1">
                  {coinDef?.addressHint}
                </p>

                {/* Format warning */}
                {walletAddr.trim().length >= 15 && !coinDef?.addressRegex?.test(walletAddr.trim()) && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400 px-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    This doesn't look like a valid {coin} address — please double-check.
                  </div>
                )}

                {/* Use connected EVM wallet shortcut */}
                {isEvm && address && walletAddr.toLowerCase() !== address.toLowerCase() && (
                  <button
                    onClick={() => setWalletAddr(address)}
                    className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    ↩ Use connected wallet: {address.slice(0, 8)}…{address.slice(-6)}
                  </button>
                )}

                {/* Non-EVM warning if user pastes an 0x address */}
                {!isEvm && walletAddr.trim().startsWith("0x") && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-400">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    You entered an EVM (0x) address, but {coin} uses its own address format.
                    Please paste your actual {coin} wallet address.
                  </div>
                )}
              </div>

              {createErr && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {createErr}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={createOrder}
                disabled={creating || !canPreview}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating order…</>
                ) : !isReady ? (
                  "Stripe not connected"
                ) : fiatNum < 10 ? (
                  "Minimum purchase is $10"
                ) : walletAddr.trim().length < 15 ? (
                  "Enter your wallet address"
                ) : (
                  <>
                    Preview: Pay ${fiatNum.toFixed(2)} <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[10px] text-muted-foreground/50 text-center pb-1">
                🔒 PCI DSS compliant · Secured by Stripe · Crypto sent within 10–30 min
              </p>
            </div>
          )}

          {/* ════════ STEP 2: PAYMENT ════════ */}
          {step === "payment" && clientSecret && pubKey && orderDetails && (
            <div className="space-y-4">

              {/* Order summary */}
              <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 divide-y divide-blue-500/10 overflow-hidden text-sm">
                <div className="px-4 py-2.5 flex items-center gap-2 font-bold text-blue-400">
                  <ShoppingCart className="w-4 h-4" /> Order Summary
                </div>
                <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                  <span>Paying</span>
                  <span className="font-bold text-foreground">${fiatNum.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                  <span>OrahDEX fee (1.5%)</span>
                  <span className="text-amber-400">−${parseFloat(orderDetails.feeUsd).toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-4 py-3 font-bold bg-emerald-500/5">
                  <span>You receive</span>
                  <span className="text-emerald-400">
                    ≈ {parseFloat(orderDetails.cryptoAmount).toFixed(6)} {coin}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2 text-[11px] text-muted-foreground/60">
                  <span>Destination wallet</span>
                  <span className="font-mono">{walletAddr.slice(0, 10)}…{walletAddr.slice(-8)}</span>
                </div>
              </div>

              {payErr && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {payErr}
                </div>
              )}

              {/* Stripe Payment Element */}
              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                <Elements stripe={getStripePromise(pubKey)} options={elementsOptions}>
                  <PaymentForm
                    onSuccess={() => setStep("success")}
                    onError={setPayErr}
                  />
                </Elements>
              </div>

              <p className="text-[10px] text-muted-foreground/50 text-center flex items-center justify-center gap-1 pb-1">
                <Lock className="w-3 h-3" /> 256-bit SSL · PCI DSS · Powered by Stripe
              </p>
            </div>
          )}

          {/* ════════ STEP 3: SUCCESS ════════ */}
          {step === "success" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center mx-auto animate-in zoom-in duration-500">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>

              <div>
                <h3 className="text-xl font-bold">Payment Successful!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your order has been received and is being processed.
                </p>
              </div>

              {/* Order details */}
              <div className="rounded-xl bg-muted/30 border border-border/40 divide-y divide-border/30 text-sm text-left overflow-hidden">
                <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                  <span>Amount paid</span>
                  <span className="font-bold text-foreground">${fiatNum.toFixed(2)} USD</span>
                </div>
                {orderDetails && (
                  <div className="flex justify-between px-4 py-2.5 font-bold">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="text-emerald-400">
                      ≈ {parseFloat(orderDetails.cryptoAmount).toFixed(6)} {coin}
                    </span>
                  </div>
                )}
                <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                  <span>Sending to</span>
                  <span className="font-mono text-[11px]">{walletAddr.slice(0, 12)}…{walletAddr.slice(-8)}</span>
                </div>
                {orderId && (
                  <div className="flex justify-between px-4 py-2.5 text-muted-foreground">
                    <span>Order ID</span>
                    <span className="font-mono text-[10px]">{orderId.slice(0, 8)}…</span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs text-blue-300 text-left">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Crypto will be sent to your wallet within 10–30 minutes after payment confirmation. Check your wallet balance.
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition"
              >
                Done
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
