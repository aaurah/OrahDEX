import { useState, useEffect, useMemo } from "react";
import {
  X, Search, ChevronRight, ExternalLink, CheckCircle,
  Wallet, CreditCard, Building2, AlertCircle, Zap, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCoin?: string;
}

// ── Provider registry ──────────────────────────────────────────────────────────
interface ProviderDef {
  id: string;
  name: string;
  badge: string;
  color: string;
  fee: string;
  minUSD: number;
  maxUSD: number;
  methods: string[];
  coins: string[];
  rating: number;
  baseUrl: string;
  params: (coin: string, fiat: string, amount: string, method: string) => Record<string,string>;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "moonpay", name: "MoonPay", badge: "🌙", color: "text-violet-400",
    fee: "1–4.5%", minUSD: 30, maxUSD: 50000, rating: 4.8,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","LTC","BCH","UNI","NEAR","ARB","OP","SUI","BSV"],
    baseUrl: "https://buy.moonpay.com",
    params: (coin,fiat,amt,m) => ({
      currencyCode: coin.toLowerCase(),
      baseCurrencyCode: fiat.toLowerCase(),
      baseCurrencyAmount: amt,
      paymentMethod: m === "card" ? "credit_debit_card" : m === "bank" ? "sepa_bank_transfer" : m,
    }),
  },
  {
    id: "transak", name: "Transak", badge: "⚡", color: "text-cyan-400",
    fee: "0.99–2.5%", minUSD: 15, maxUSD: 25000, rating: 4.6,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","ATOM","LTC","UNI","NEAR","ARB","APT","INJ"],
    baseUrl: "https://global.transak.com",
    params: (coin,fiat,amt) => ({
      cryptoCurrencyCode: coin,
      defaultFiatCurrency: fiat,
      fiatAmount: amt,
      network: "mainnet",
    }),
  },
  {
    id: "banxa", name: "Banxa", badge: "🏦", color: "text-emerald-400",
    fee: "1–3%", minUSD: 50, maxUSD: 100000, rating: 4.4,
    methods: ["card","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","LTC","BCH","DOT","LINK"],
    baseUrl: "https://checkout.banxa.com",
    params: (coin,fiat,amt) => ({
      coinType: coin,
      fiatType: fiat,
      fiatAmount: amt,
    }),
  },
  {
    id: "simplex", name: "Simplex", badge: "💎", color: "text-blue-400",
    fee: "3.5–5%", minUSD: 50, maxUSD: 20000, rating: 4.2,
    methods: ["card","apple","google"],
    coins: ["BTC","ETH","XRP","BNB","ADA","DOGE","LTC","BCH","MATIC","LINK","DOT"],
    baseUrl: "https://checkout.simplexcc.com",
    params: (coin,fiat,amt) => ({
      crypto_currency: coin,
      fiat_currency: fiat,
      requested_amount: amt,
      requested_currency: fiat,
    }),
  },
  {
    id: "ramp", name: "Ramp Network", badge: "🔵", color: "text-blue-300",
    fee: "0.49–2.9%", minUSD: 5, maxUSD: 10000, rating: 4.7,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","MATIC","AVAX","DOT","UNI","LINK","ARB","OP","APT","NEAR","DOGE"],
    baseUrl: "https://app.ramp.network",
    params: (coin,fiat,amt) => ({
      swapAsset: coin,
      fiatCurrency: fiat,
      fiatValue: amt,
    }),
  },
];

// ── Coin catalogue ─────────────────────────────────────────────────────────────
interface CoinDef { symbol: string; name: string; color: string }
const COIN_CATALOGUE: CoinDef[] = [
  { symbol:"BTC",   name:"Bitcoin",        color:"#F97316" },
  { symbol:"ETH",   name:"Ethereum",       color:"#8B5CF6" },
  { symbol:"BSV",   name:"Bitcoin SV",     color:"#EAB308" },
  { symbol:"SOL",   name:"Solana",         color:"#06B6D4" },
  { symbol:"XRP",   name:"Ripple",         color:"#3B82F6" },
  { symbol:"BNB",   name:"BNB",            color:"#F59E0B" },
  { symbol:"ADA",   name:"Cardano",        color:"#2563EB" },
  { symbol:"DOGE",  name:"Dogecoin",       color:"#EAB308" },
  { symbol:"AVAX",  name:"Avalanche",      color:"#EF4444" },
  { symbol:"MATIC", name:"Polygon",        color:"#7C3AED" },
  { symbol:"LINK",  name:"Chainlink",      color:"#2563EB" },
  { symbol:"DOT",   name:"Polkadot",       color:"#E11D48" },
  { symbol:"UNI",   name:"Uniswap",        color:"#EC4899" },
  { symbol:"ATOM",  name:"Cosmos",         color:"#6366F1" },
  { symbol:"LTC",   name:"Litecoin",       color:"#6B7280" },
  { symbol:"BCH",   name:"Bitcoin Cash",   color:"#22C55E" },
  { symbol:"NEAR",  name:"NEAR Protocol",  color:"#10B981" },
  { symbol:"APT",   name:"Aptos",          color:"#06B6D4" },
  { symbol:"ARB",   name:"Arbitrum",       color:"#60A5FA" },
  { symbol:"OP",    name:"Optimism",       color:"#EF4444" },
  { symbol:"SUI",   name:"Sui",            color:"#3B82F6" },
  { symbol:"INJ",   name:"Injective",      color:"#2563EB" },
];

const FIATS = ["USD","EUR","GBP","AUD","CAD","SGD","JPY","AED","INR","BRL"];
const QUICK_AMOUNTS = ["50","100","250","500","1000","2500"];

// ── Approximate USD prices for quote estimation ──────────────────────────────
const APPROX_PRICES: Record<string, number> = {
  BTC:68000, ETH:3400, BSV:55, SOL:145, XRP:0.52,
  BNB:390, ADA:0.44, DOGE:0.12, AVAX:36, MATIC:0.72,
  LINK:14.5, DOT:6.8, UNI:9.8, ATOM:8.4, LTC:78,
  BCH:384, NEAR:6.5, APT:10.5, ARB:1.1, OP:2.4, SUI:1.2, INJ:28,
};

// ── Method label helpers ───────────────────────────────────────────────────────
const METHOD_LABELS: Record<string,string> = {
  card:"Credit / Debit Card", bank:"Bank Transfer", apple:"Apple Pay", google:"Google Pay",
};
const METHOD_ICONS: Record<string,React.ReactNode> = {
  card: <CreditCard className="w-3.5 h-3.5" />,
  bank: <Building2 className="w-3.5 h-3.5" />,
  apple: <span className="text-sm">🍎</span>,
  google: <span className="text-sm">G</span>,
};

// ── Step type ─────────────────────────────────────────────────────────────────
type Step = "coin" | "quote" | "checkout";

export function BuyCryptoModal({ open, onClose, defaultCoin = "BTC" }: Props) {
  const { address } = useWalletStore();
  const openWalletModal = useWalletModalStore(s => s.open);

  const [step, setStep]       = useState<Step>("coin");
  const [coin, setCoin]       = useState(defaultCoin);
  const [fiat, setFiat]       = useState("USD");
  const [amount, setAmount]   = useState("100");
  const [search, setSearch]   = useState("");
  const [method, setMethod]   = useState<string>("card");
  const [providerId, setProviderId] = useState<string>("");

  // Reset on open
  useEffect(() => {
    if (open) { setStep("coin"); setCoin(defaultCoin); setSearch(""); setAmount("100"); }
  }, [open, defaultCoin]);

  if (!open) return null;

  // Filtered coin list
  const filteredCoins = COIN_CATALOGUE.filter(c =>
    !search ||
    c.symbol.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Providers that support the selected coin
  const supportedProviders = PROVIDERS.filter(p => p.coins.includes(coin));

  // Auto-select first supported provider when we switch coins
  function selectCoin(sym: string) {
    setCoin(sym);
    const first = PROVIDERS.find(p => p.coins.includes(sym));
    setProviderId(first?.id ?? "");
    setSearch("");
    setStep("quote");
  }

  // Compute estimated crypto received
  const feeRate = 0.025; // ~2.5% average
  const numAmt = parseFloat(amount) || 0;
  const priceUSD = APPROX_PRICES[coin] ?? 1;
  const fiatToUSD = fiat === "USD" ? 1 : fiat === "EUR" ? 1.08 : fiat === "GBP" ? 1.27 : 1;
  const netUSD = numAmt * fiatToUSD * (1 - feeRate);
  const estCrypto = netUSD / priceUSD;
  const fmtCrypto = estCrypto >= 1
    ? estCrypto.toFixed(4)
    : estCrypto >= 0.0001
    ? estCrypto.toFixed(6)
    : estCrypto.toExponential(4);

  // Build provider URL
  function getProviderUrl(pId: string): string {
    const p = PROVIDERS.find(x => x.id === pId);
    if (!p) return "#";
    const params = new URLSearchParams(p.params(coin, fiat, amount, method));
    return `${p.baseUrl}?${params}`;
  }

  const selectedProvider = PROVIDERS.find(p => p.id === providerId) ?? supportedProviders[0];
  const coinDef = COIN_CATALOGUE.find(c => c.symbol === coin)!;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:w-[460px] bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step !== "coin" && (
              <button
                onClick={() => setStep(step === "checkout" ? "quote" : "coin")}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold"
              >
                ←
              </button>
            )}
            <div>
              <h2 className="text-base font-bold">Buy Crypto</h2>
              <p className="text-[11px] text-muted-foreground">
                {step === "coin" && "Select the coin you want to buy"}
                {step === "quote" && `Quote for ${coin} · ${supportedProviders.length} exchanges available`}
                {step === "checkout" && "Review & pay"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex border-b border-border shrink-0">
          {(["coin","quote","checkout"] as Step[]).map((s, i) => (
            <div key={s} className="flex-1 flex items-center justify-center py-2 gap-1.5">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                step === s ? "bg-primary text-primary-foreground" : i < ["coin","quote","checkout"].indexOf(step) ? "bg-green-500 text-white" : "bg-secondary text-muted-foreground"
              )}>
                {i < ["coin","quote","checkout"].indexOf(step) ? "✓" : i + 1}
              </div>
              <span className={cn("text-[11px] font-semibold capitalize hidden sm:inline", step === s ? "text-foreground" : "text-muted-foreground")}>
                {s === "coin" ? "Select Coin" : s === "quote" ? "Quote" : "Pay"}
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-y-auto flex-1">

          {/* ══════════════════ STEP 1: Select Coin ══════════════════ */}
          {step === "coin" && (
            <div className="p-4 space-y-4">
              {/* Wallet status */}
              <div className={cn(
                "flex items-center gap-3 p-3 rounded-xl border text-sm",
                address
                  ? "bg-green-500/10 border-green-500/25 text-green-300"
                  : "bg-amber-500/10 border-amber-500/25 text-amber-300"
              )}>
                <Wallet className="w-4 h-4 shrink-0" />
                {address ? (
                  <span>Wallet connected · <span className="font-mono text-xs">{address.slice(0,10)}…</span></span>
                ) : (
                  <div className="flex items-center justify-between flex-1 gap-2">
                    <span className="text-xs">Connect wallet to auto-receive your crypto</span>
                    <button
                      onClick={() => { onClose(); openWalletModal(); }}
                      className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-[11px] font-bold text-amber-300 shrink-0"
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search coin…"
                  className="w-full bg-secondary/60 border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>

              {/* Popular label */}
              {!search && (
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Popular
                </p>
              )}

              {/* Coin grid */}
              <div className="grid grid-cols-1 gap-1.5">
                {filteredCoins.map(c => {
                  const providers = PROVIDERS.filter(p => p.coins.includes(c.symbol));
                  return (
                    <button
                      key={c.symbol}
                      onClick={() => selectCoin(c.symbol)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                    >
                      {/* Coin badge */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-black text-white shrink-0 shadow"
                        style={{ background: c.color }}
                      >
                        {c.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{c.symbol}</span>
                          <span className="text-xs text-muted-foreground">{c.name}</span>
                        </div>
                        {/* Exchange badges */}
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {providers.slice(0,4).map(p => (
                            <span key={p.id} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded font-medium text-muted-foreground">
                              {p.badge} {p.name}
                            </span>
                          ))}
                          {providers.length === 0 && (
                            <span className="text-[9px] text-amber-400 font-medium">OrahDEX P2P only</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-semibold text-foreground">
                          ${(APPROX_PRICES[c.symbol] ?? 1).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{providers.length} exchanges</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  );
                })}
                {filteredCoins.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">No coins found for "{search}"</p>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════ STEP 2: Quote ══════════════════ */}
          {step === "quote" && (
            <div className="p-4 space-y-4">
              {/* Selected coin banner */}
              <div className="flex items-center gap-3 p-3 bg-secondary/40 rounded-xl">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black text-white shrink-0 shadow"
                  style={{ background: coinDef?.color ?? "#6B7280" }}
                >
                  {coin.slice(0, 2)}
                </div>
                <div>
                  <div className="font-bold text-sm">{coin} · {coinDef?.name}</div>
                  <div className="text-xs text-muted-foreground">≈ ${(APPROX_PRICES[coin] ?? 0).toLocaleString()} USD</div>
                </div>
                <button
                  onClick={() => setStep("coin")}
                  className="ml-auto text-xs text-primary font-semibold hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">You pay</label>
                <div className="flex gap-2 mt-1.5">
                  <select
                    value={fiat}
                    onChange={e => setFiat(e.target.value)}
                    className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-primary w-24 shrink-0"
                  >
                    {FIATS.map(f => <option key={f}>{f}</option>)}
                  </select>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    min="5"
                    className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-base font-bold focus:outline-none focus:border-primary tabular-nums"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {QUICK_AMOUNTS.map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className={cn(
                        "flex-1 py-1.5 text-[11px] rounded-lg border font-bold transition-colors",
                        amount === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live quote estimate */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">You receive ≈</span>
                  <div className="text-right">
                    <div className="text-xl font-black text-green-400">{fmtCrypto} {coin}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">after ~2.5% avg fee · {fiat} {amount}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-green-400/70">
                  <Zap className="w-3 h-3" />
                  Delivered to your wallet within 5–15 minutes
                </div>
              </div>

              {/* Exchange / Provider list */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Exchanges supporting {coin} ({supportedProviders.length})
                </label>
                <div className="space-y-2 mt-2">
                  {supportedProviders.length === 0 && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-300 text-center">
                      No third-party exchange supports {coin} directly.<br />
                      <span className="text-xs text-muted-foreground">Use OrahDEX P2P to buy {coin} from other users.</span>
                    </div>
                  )}
                  {supportedProviders.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setProviderId(p.id); }}
                      className={cn(
                        "w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all",
                        providerId === p.id
                          ? "border-primary bg-primary/8 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-white/5"
                      )}
                    >
                      {/* Logo */}
                      <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-xl shrink-0">
                        {p.badge}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{p.name}</span>
                          <span className={cn("text-[10px] font-bold", p.color)}>★ {p.rating}</span>
                          <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded font-medium text-muted-foreground">{p.fee} fee</span>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {p.methods.map(m => (
                            <span key={m} className="flex items-center gap-1 text-[10px] bg-secondary/60 px-1.5 py-0.5 rounded text-muted-foreground">
                              {METHOD_ICONS[m]} {m === "card" ? "Card" : m === "bank" ? "Bank" : m === "apple" ? "Apple" : "Google"}
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Min ${p.minUSD} · Max ${p.maxUSD.toLocaleString()}
                        </div>
                      </div>
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 shrink-0 mt-1 transition-all",
                        providerId === p.id ? "border-primary bg-primary" : "border-border"
                      )} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Continue */}
              {supportedProviders.length > 0 && (
                <button
                  onClick={() => {
                    if (!providerId && supportedProviders.length > 0) setProviderId(supportedProviders[0].id);
                    setStep("checkout");
                  }}
                  disabled={numAmt < 5}
                  className="w-full bg-primary text-primary-foreground py-3.5 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue → {selectedProvider ? `Pay with ${selectedProvider.name}` : "Select an exchange"}
                </button>
              )}
            </div>
          )}

          {/* ══════════════════ STEP 3: Checkout ══════════════════ */}
          {step === "checkout" && selectedProvider && (
            <div className="p-4 space-y-4">
              {/* Order summary */}
              <div className="bg-secondary/40 border border-border rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Order Summary</p>
                <div className="space-y-2.5">
                  {[
                    ["You pay",     `${fiat} ${parseFloat(amount).toLocaleString()}`],
                    ["You receive", `≈ ${fmtCrypto} ${coin}`],
                    ["Exchange",    `${selectedProvider.badge} ${selectedProvider.name}`],
                    ["Exchange fee",selectedProvider.fee],
                    ["Network",     "Bitcoin SV · On-chain settlement"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("font-semibold", label === "You receive" && "text-green-400")}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Payment method</label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {selectedProvider.methods.map(m => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border text-sm font-semibold transition-all",
                        method === m ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {METHOD_ICONS[m]}
                      <span className="text-xs">{METHOD_LABELS[m]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet warning */}
              {!address && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300 leading-relaxed">
                    No wallet connected. Connect a wallet first so {selectedProvider.name} knows where to send your {coin}.
                    <button
                      onClick={() => { onClose(); openWalletModal(); }}
                      className="ml-1 underline font-bold"
                    >
                      Connect now
                    </button>
                  </p>
                </div>
              )}

              {/* Primary CTA */}
              <a
                href={getProviderUrl(selectedProvider.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground py-4 rounded-xl font-black text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
              >
                <span className="text-xl">{selectedProvider.badge}</span>
                Buy {coin} with {selectedProvider.name}
                <ExternalLink className="w-4 h-4" />
              </a>

              {/* Alternate providers */}
              {supportedProviders.filter(p => p.id !== selectedProvider.id).length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Other exchanges</p>
                  <div className="space-y-2">
                    {supportedProviders.filter(p => p.id !== selectedProvider.id).map(p => (
                      <a
                        key={p.id}
                        href={getProviderUrl(p.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full bg-secondary/40 border border-border py-2.5 px-3.5 rounded-xl font-medium text-sm hover:border-primary/50 transition-colors"
                      >
                        <span className="text-lg">{p.badge}</span>
                        <span className="flex-1 text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.fee}</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-green-300/80 leading-relaxed">
                  After payment is confirmed, {selectedProvider.name} will send your {coin} directly to your wallet. The process typically takes 5–15 minutes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
