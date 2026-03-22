import { useState, useEffect } from "react";
import { X, CreditCard, Building2, Smartphone, ChevronRight, ExternalLink, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCoin?: string;
}

type Method = "card" | "bank" | "apple" | "google";
type Provider = "moonpay" | "transak" | "banxa";

const PROVIDERS: Record<Provider, { name: string; logo: string; url: string; fee: string }> = {
  moonpay: { name: "MoonPay", logo: "🌙", url: "https://www.moonpay.com/buy", fee: "1-4.5%" },
  transak: { name: "Transak", logo: "⚡", url: "https://transak.com", fee: "0.99-2.5%" },
  banxa:   { name: "Banxa",   logo: "🏦", url: "https://banxa.com", fee: "1-3%" },
};

const COINS = [
  "BSV","BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC",
  "LINK","DOT","ATOM","LTC","BCH","UNI","NEAR","ARB","OP","SUI",
];

const FIATS = ["USD","EUR","GBP","AUD","CAD","SGD","JPY","AED","INR","BRL"];

function detectApplePay(): boolean {
  return typeof window !== "undefined" && "ApplePaySession" in window;
}

function detectGooglePay(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /android/.test(ua) || /chrome/.test(ua);
}

export function BuyCryptoModal({ open, onClose, defaultCoin = "BSV" }: Props) {
  const [step, setStep] = useState<"method" | "details" | "provider">("method");
  const [method, setMethod] = useState<Method | null>(null);
  const [coin, setCoin] = useState(defaultCoin);
  const [fiat, setFiat] = useState("USD");
  const [amount, setAmount] = useState("100");
  const [provider, setProvider] = useState<Provider>("moonpay");
  const [hasApplePay, setHasApplePay] = useState(false);
  const [hasGooglePay, setHasGooglePay] = useState(false);

  useEffect(() => {
    setHasApplePay(detectApplePay());
    setHasGooglePay(detectGooglePay());
  }, []);

  useEffect(() => {
    if (open) { setStep("method"); setMethod(null); }
  }, [open]);

  if (!open) return null;

  const methods: { id: Method; label: string; sub: string; icon: React.ReactNode; available: boolean; badge?: string }[] = [
    {
      id: "apple", label: "Apple Pay", sub: "Instant · Face ID / Touch ID",
      icon: <svg viewBox="0 0 24 24" className="w-6 h-6 fill-foreground"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>,
      available: hasApplePay, badge: hasApplePay ? "Detected" : "iOS only",
    },
    {
      id: "google", label: "Google Pay", sub: "Instant · Linked Google account",
      icon: <svg viewBox="0 0 24 24" className="w-6 h-6"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
      available: hasGooglePay, badge: hasGooglePay ? "Detected" : "Android/Chrome",
    },
    {
      id: "card", label: "Credit / Debit Card", sub: "Visa, Mastercard, Amex",
      icon: <CreditCard className="w-6 h-6 text-blue-400" />,
      available: true,
    },
    {
      id: "bank", label: "Bank Transfer", sub: "SEPA, ACH, SWIFT — lowest fees",
      icon: <Building2 className="w-6 h-6 text-green-400" />,
      available: true,
    },
  ];

  const buildProviderUrl = (p: Provider) => {
    const base = PROVIDERS[p].url;
    const params = new URLSearchParams({
      currencyCode: coin,
      baseCurrencyCode: fiat,
      baseCurrencyAmount: amount,
      paymentMethod: method === "card" ? "credit_debit_card" : method === "bank" ? "sepa_bank_transfer" : "apple_pay",
    });
    return `${base}?${params}`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:w-[440px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">Buy Crypto</h2>
            <p className="text-[11px] text-muted-foreground">Fast · Secure · Best rates</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── STEP 1: Choose Payment Method ── */}
          {step === "method" && (
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-4">Select payment method</p>

              {methods.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setMethod(m.id); setStep("details"); }}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                    m.available
                      ? "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                      : "border-border/40 opacity-40 cursor-not-allowed"
                  )}
                  disabled={!m.available && m.id !== "apple" && m.id !== "google"}
                >
                  <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{m.label}</span>
                      {m.badge && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
                          m.available ? "bg-green-500/15 text-green-400" : "bg-muted/40 text-muted-foreground"
                        )}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m.sub}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}

              <div className="mt-4 p-3 bg-secondary/40 rounded-xl text-[11px] text-muted-foreground leading-relaxed">
                🔒 Payments processed by licensed providers (MoonPay, Transak, Banxa). OrahDEX does not store card data.
              </div>
            </div>
          )}

          {/* ── STEP 2: Amount & Coin ── */}
          {step === "details" && (
            <div className="p-5 space-y-4">
              <button onClick={() => setStep("method")} className="text-xs text-primary font-semibold flex items-center gap-1 mb-2">
                ← Back
              </button>

              {/* Amount */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</label>
                <div className="flex gap-2 mt-1.5">
                  <select
                    value={fiat}
                    onChange={e => setFiat(e.target.value)}
                    className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary w-24"
                  >
                    {FIATS.map(f => <option key={f}>{f}</option>)}
                  </select>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    min="10"
                    placeholder="100"
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary tabular-nums"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {["50","100","250","500","1000"].map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className={cn(
                        "flex-1 py-1.5 text-xs rounded-lg border font-semibold transition-colors",
                        amount === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Coin */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Receive</label>
                <div className="grid grid-cols-5 gap-2 mt-1.5">
                  {COINS.slice(0, 15).map(c => (
                    <button
                      key={c}
                      onClick={() => setCoin(c)}
                      className={cn(
                        "py-2 text-xs font-bold rounded-lg border transition-colors",
                        coin === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</label>
                <div className="flex gap-2 mt-1.5">
                  {(Object.entries(PROVIDERS) as [Provider, any][]).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setProvider(key)}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl border text-center transition-colors",
                        provider === key ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className="text-xl">{val.logo}</div>
                      <div className="text-[10px] font-semibold mt-0.5">{val.name}</div>
                      <div className="text-[9px] text-muted-foreground">{val.fee}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep("provider")}
                className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity mt-2"
              >
                Continue → Buy {coin}
              </button>
            </div>
          )}

          {/* ── STEP 3: Launch Provider ── */}
          {step === "provider" && (
            <div className="p-5 space-y-4">
              <button onClick={() => setStep("details")} className="text-xs text-primary font-semibold flex items-center gap-1">
                ← Back
              </button>

              <div className="bg-secondary/40 rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You pay</span>
                  <span className="font-bold">{fiat} {parseFloat(amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">You receive</span>
                  <span className="font-bold text-green-400">≈ {coin}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="font-semibold capitalize">{method?.replace("apple","Apple Pay").replace("google","Google Pay").replace("card","Card").replace("bank","Bank")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-semibold">{PROVIDERS[provider].name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <span className="font-semibold text-amber-400">Bitcoin SV</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <a
                  href={buildProviderUrl(provider)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                >
                  <span>{PROVIDERS[provider].logo}</span>
                  Continue with {PROVIDERS[provider].name}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {/* Alternative providers */}
                {(Object.entries(PROVIDERS) as [Provider, any][]).filter(([k]) => k !== provider).map(([key, val]) => (
                  <a
                    key={key}
                    href={buildProviderUrl(key)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full bg-secondary/60 border border-border py-3 px-4 rounded-xl font-medium text-sm hover:border-primary/50 transition-colors"
                  >
                    <span className="text-lg">{val.logo}</span>
                    <span className="flex-1">{val.name}</span>
                    <span className="text-xs text-muted-foreground">{val.fee} fee</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                ))}
              </div>

              <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-green-300/80 leading-relaxed">
                  After purchase, your {coin} will be sent to your connected wallet. Ensure your wallet is connected before proceeding.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
