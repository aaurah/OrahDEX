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

/* ── Supported coins for direct purchase ──────────────────────────────────── */
const DIRECT_BUY_COINS = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "BSV",  name: "Bitcoin SV" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "XRP",  name: "XRP" },
  { symbol: "ADA",  name: "Cardano" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "MATIC","name": "Polygon" },
  { symbol: "DOT",  name: "Polkadot" },
  { symbol: "USDT", name: "Tether" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "UNI",  name: "Uniswap" },
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
  const [walletAddr,    setWalletAddr]    = useState(address ?? "");
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

  /* Reset whenever modal opens */
  useEffect(() => {
    if (!open) return;
    setStep("amount");
    setCoin(defaultCoin);
    setFiatAmount("100");
    setWalletAddr(address ?? "");
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
  const coinDef      = DIRECT_BUY_COINS.find(c => c.symbol === coin);
  const isReady      = !!pubKey && !pubKeyErr;
  const canPreview   = fiatNum >= 10 && walletAddr.trim().length >= 15 && isReady;

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

              {/* Wallet address */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Your {coin} wallet address
                </label>
                <input
                  type="text"
                  value={walletAddr}
                  onChange={e => setWalletAddr(e.target.value)}
                  placeholder={`Paste your ${coin} address to receive crypto`}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/40 text-sm font-mono outline-none focus:border-primary/40 transition placeholder:text-muted-foreground/40"
                />
                {address && walletAddr !== address && (
                  <button
                    onClick={() => setWalletAddr(address)}
                    className="text-[11px] text-primary font-semibold hover:underline"
                  >
                    Use connected wallet: {address.slice(0, 8)}…{address.slice(-6)}
                  </button>
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
