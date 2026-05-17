/**
 * FiatBuySellPanel — Custom OrahDEX-themed fiat on/off-ramp panel.
 *
 * Buy mode:  fiat → crypto  (routes to best provider: MoonPay, Transak, Ramp…)
 * Sell mode: crypto → fiat  (routes to sell URL of best provider)
 *
 * Same two-card layout as the Swap tab. No external iframes.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import {
  ChevronDown, RefreshCw, CreditCard, Building2,
  Smartphone, Zap, ExternalLink, Search, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { useWalletStore } from "@/store/useWalletStore";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PayMethod = "card" | "apple" | "google" | "bank";
type Mode = "buy" | "sell";

// ─── Fiat currencies ───────────────────────────────────────────────────────────

const FIATS = [
  { code: "USD", symbol: "$",  name: "US Dollar"      },
  { code: "EUR", symbol: "€",  name: "Euro"           },
  { code: "GBP", symbol: "£",  name: "British Pound"  },
  { code: "CAD", symbol: "CA$",name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar"},
  { code: "JPY", symbol: "¥",  name: "Japanese Yen"   },
  { code: "CHF", symbol: "Fr", name: "Swiss Franc"    },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar"},
  { code: "INR", symbol: "₹",  name: "Indian Rupee"   },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "Mex$",name:"Mexican Peso"   },
  { code: "AED", symbol: "د.إ",name:"UAE Dirham"      },
];

// ─── Crypto coins ──────────────────────────────────────────────────────────────

const COINS = [
  { symbol: "BTC",  name: "Bitcoin",       network: "Bitcoin"   },
  { symbol: "ETH",  name: "Ethereum",      network: "Ethereum"  },
  { symbol: "BSV",  name: "Bitcoin SV",    network: "BSV"       },
  { symbol: "SOL",  name: "Solana",        network: "Solana"    },
  { symbol: "XRP",  name: "XRP",           network: "XRP Ledger"},
  { symbol: "BNB",  name: "BNB",           network: "BNB Chain" },
  { symbol: "ADA",  name: "Cardano",       network: "Cardano"   },
  { symbol: "DOGE", name: "Dogecoin",      network: "Dogecoin"  },
  { symbol: "AVAX", name: "Avalanche",     network: "Avalanche" },
  { symbol: "MATIC",name: "Polygon",       network: "Polygon"   },
  { symbol: "LINK", name: "Chainlink",     network: "Ethereum"  },
  { symbol: "DOT",  name: "Polkadot",      network: "Polkadot"  },
  { symbol: "UNI",  name: "Uniswap",       network: "Ethereum"  },
  { symbol: "ATOM", name: "Cosmos",        network: "Cosmos"    },
  { symbol: "LTC",  name: "Litecoin",      network: "Litecoin"  },
  { symbol: "BCH",  name: "Bitcoin Cash",  network: "BCH"       },
  { symbol: "NEAR", name: "NEAR Protocol", network: "NEAR"      },
  { symbol: "ARB",  name: "Arbitrum",      network: "Arbitrum"  },
  { symbol: "OP",   name: "Optimism",      network: "Optimism"  },
  { symbol: "APT",  name: "Aptos",         network: "Aptos"     },
  { symbol: "SUI",  name: "Sui",           network: "Sui"       },
  { symbol: "USDT", name: "Tether",        network: "Ethereum"  },
  { symbol: "USDC", name: "USD Coin",      network: "Ethereum"  },
];

// ─── Payment methods ───────────────────────────────────────────────────────────

const PAY_METHODS: { id: PayMethod; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: "card",   label: "Card",       shortLabel: "Card",       icon: <CreditCard className="w-3.5 h-3.5" /> },
  { id: "apple",  label: "Apple Pay",  shortLabel: "Apple Pay",  icon: <span className="text-xs leading-none font-bold"></span> },
  { id: "google", label: "Google Pay", shortLabel: "Google Pay", icon: <span className="text-xs leading-none font-bold text-blue-400">G</span> },
  { id: "bank",   label: "Bank",       shortLabel: "Bank",       icon: <Building2 className="w-3.5 h-3.5" /> },
];

// ─── Providers ─────────────────────────────────────────────────────────────────

interface Provider {
  id: string; name: string; fee: string; minUSD: number; maxUSD: number;
  methods: PayMethod[]; coins: string[];
  buyUrl:  (coin: string, fiat: string, amt: string, method: PayMethod, addr: string) => string;
  sellUrl?: (coin: string, fiat: string, addr: string) => string;
}

const PROVIDERS: Provider[] = [
  {
    id: "moonpay", name: "MoonPay", fee: "1–4.5%", minUSD: 30, maxUSD: 50000,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","LTC","BCH","UNI","NEAR","ARB","OP","SUI","BSV","USDT","USDC"],
    buyUrl:  (c,f,a,m,addr) => `https://buy.moonpay.com?${qs({ currencyCode:c.toLowerCase(), baseCurrencyCode:f.toLowerCase(), baseCurrencyAmount:a, paymentMethod:m==="card"?"credit_debit_card":m==="bank"?"sepa_bank_transfer":m, ...(addr?{walletAddress:addr}:{}) })}`,
    sellUrl: (c,f,addr)     => `https://sell.moonpay.com?${qs({ baseCurrencyCode:c.toLowerCase(), quoteCurrencyCode:f.toLowerCase(), ...(addr?{walletAddress:addr}:{}) })}`,
  },
  {
    id: "transak", name: "Transak", fee: "0.99–2.5%", minUSD: 15, maxUSD: 25000,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","ATOM","LTC","UNI","NEAR","ARB","APT","USDT","USDC"],
    buyUrl:  (c,f,a,_m,addr) => `https://global.transak.com?${qs({ cryptoCurrencyCode:c, defaultFiatCurrency:f, fiatAmount:a, network:"mainnet", ...(addr?{walletAddress:addr}:{}) })}`,
    sellUrl: (c,f,addr)      => `https://global.transak.com?${qs({ cryptoCurrencyCode:c, defaultFiatCurrency:f, productsAvailed:"SELL", ...(addr?{walletAddress:addr}:{}) })}`,
  },
  {
    id: "ramp", name: "Ramp Network", fee: "0.49–2.9%", minUSD: 5, maxUSD: 10000,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","MATIC","AVAX","DOT","UNI","LINK","ARB","OP","APT","NEAR","DOGE","USDT","USDC"],
    buyUrl:  (c,f,a,_m,addr) => `https://app.ramp.network?${qs({ swapAsset:c, fiatCurrency:f, fiatValue:a, ...(addr?{userAddress:addr}:{}) })}`,
    sellUrl: (c,f,addr)      => `https://app.ramp.network?${qs({ swapAsset:c, fiatCurrency:f, userActionType:"offramp", ...(addr?{userAddress:addr}:{}) })}`,
  },
  {
    id: "onramper", name: "Onramper", fee: "0.5–2.5%", minUSD: 30, maxUSD: 50000,
    methods: ["card","apple","google","bank"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","UNI","ATOM","LTC","BCH","NEAR","ARB","OP","APT","SUI","USDT","USDC"],
    buyUrl:  (c,f,a,_m,addr) => `https://buy.onramper.com?${qs({ defaultCrypto:c, defaultFiat:f, defaultAmount:a, ...(addr?{wallets:`${c}:${addr}`}:{}) })}`,
  },
  {
    id: "guardarian", name: "Guardarian", fee: "0–3.5%", minUSD: 10, maxUSD: 30000,
    methods: ["card","bank","apple","google"],
    coins: ["BTC","ETH","SOL","XRP","BNB","ADA","DOGE","AVAX","MATIC","LINK","DOT","UNI","ATOM","LTC","BCH","NEAR","ARB","OP","SUI","USDT","USDC"],
    buyUrl:  (c,f,a,_m,addr) => `https://guardarian.com/calculator/v1?${qs({ from_currency:f, to_currency:c, amount:a, ...(addr?{to_wallet_address:addr}:{}) })}`,
  },
];

function qs(obj: Record<string,string>): string {
  return Object.entries(obj).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];

// ─── Approximate rates (coarse, for UI preview only — real rate shown by provider) ──

const APPROX_RATES: Record<string, Record<string, number>> = {
  BTC:   { USD: 95000,  EUR: 87000,  GBP: 74000  },
  ETH:   { USD: 3200,   EUR: 2950,   GBP: 2500   },
  BSV:   { USD: 55,     EUR: 50,     GBP: 43     },
  SOL:   { USD: 165,    EUR: 152,    GBP: 130    },
  XRP:   { USD: 0.55,   EUR: 0.50,   GBP: 0.43   },
  BNB:   { USD: 600,    EUR: 555,    GBP: 472    },
  ADA:   { USD: 0.55,   EUR: 0.50,   GBP: 0.43   },
  DOGE:  { USD: 0.18,   EUR: 0.17,   GBP: 0.14   },
  AVAX:  { USD: 28,     EUR: 26,     GBP: 22     },
  MATIC: { USD: 0.55,   EUR: 0.50,   GBP: 0.43   },
  LINK:  { USD: 14,     EUR: 13,     GBP: 11     },
  USDT:  { USD: 1,      EUR: 0.92,   GBP: 0.78   },
  USDC:  { USD: 1,      EUR: 0.92,   GBP: 0.78   },
};

function estimateReceive(fiatAmt: number, fiat: string, coin: string): string | null {
  const rate = APPROX_RATES[coin]?.[fiat] ?? APPROX_RATES[coin]?.["USD"];
  if (!rate || !fiatAmt) return null;
  const receive = (fiatAmt * 0.98) / rate; // ~2% blended fee
  return receive < 0.0001
    ? receive.toExponential(4)
    : receive.toFixed(receive < 1 ? 6 : receive < 100 ? 4 : 2);
}

// ─── Small dropdown components ─────────────────────────────────────────────────

function FiatPicker({ selected, onChange }: { selected: typeof FIATS[0]; onChange: (f: typeof FIATS[0]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary border border-border/60 hover:border-border transition-colors">
        <span className="font-bold text-sm text-foreground">{selected.symbol}</span>
        <span className="font-bold text-sm text-foreground">{selected.code}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 top-full mt-1 w-52 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden" style={{ maxHeight: 280 }}>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {FIATS.map(f => (
              <button key={f.code} type="button" onClick={() => { onChange(f); setOpen(false); }}
                className={cn("w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors text-left",
                  f.code === selected.code && "bg-muted/30")}>
                <span className="font-semibold text-foreground">{f.code}</span>
                <span className="text-xs text-muted-foreground">{f.symbol} · {f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CoinPicker({ selected, onChange }: { selected: typeof COINS[0]; onChange: (c: typeof COINS[0]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40); else setQ(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const filtered = useMemo(() => {
    if (!q.trim()) return COINS;
    const qq = q.toLowerCase();
    return COINS.filter(c => c.symbol.toLowerCase().includes(qq) || c.name.toLowerCase().includes(qq));
  }, [q]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary border border-border/60 hover:border-border transition-colors">
        <CoinLogo symbol={selected.symbol} size={20} />
        <span className="font-bold text-sm text-foreground">{selected.symbol}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 top-full mt-1 w-64 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 320 }}>
          <div className="p-2.5 border-b border-border/40 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search coin…"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40 text-foreground" />
            {q && <button type="button" onClick={() => setQ("")}><X className="w-3.5 h-3.5 text-muted-foreground/60" /></button>}
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.map(c => (
              <button key={c.symbol} type="button" onClick={() => { onChange(c); setOpen(false); }}
                className={cn("w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left",
                  c.symbol === selected.symbol && "bg-muted/30")}>
                <CoinLogo symbol={c.symbol} size={26} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{c.symbol}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{c.name} · {c.network}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────

export function FiatBuySellPanel() {
  const { address } = useWalletStore();

  const [mode, setMode]             = useState<Mode>("buy");
  const [fiat, setFiat]             = useState(FIATS[0]);         // USD
  const [coin, setCoin]             = useState(COINS[0]);         // BTC
  const [amount, setAmount]         = useState("250");
  const [payMethod, setPayMethod]   = useState<PayMethod>("card");

  const numAmt  = parseFloat(amount) || 0;
  const receive = estimateReceive(numAmt, fiat.code, coin.symbol);

  // Pick best provider for current selection
  const provider = useMemo(() => {
    return PROVIDERS.find(p =>
      p.methods.includes(payMethod) &&
      p.coins.includes(coin.symbol) &&
      (mode === "buy" ? numAmt >= p.minUSD : true)
    ) ?? PROVIDERS[0];
  }, [payMethod, coin.symbol, mode, numAmt]);

  function launch() {
    if (!provider) return;
    const addr = address ?? "";
    let url: string;
    if (mode === "buy") {
      url = provider.buyUrl(coin.symbol, fiat.code, String(numAmt), payMethod, addr);
    } else {
      url = provider.sellUrl
        ? provider.sellUrl(coin.symbol, fiat.code, addr)
        : provider.buyUrl(coin.symbol, fiat.code, String(numAmt), payMethod, addr);
    }
    window.open(url, "_blank", "noopener");
  }

  const canLaunch = numAmt >= (mode === "buy" ? 5 : 0);

  return (
    <div className="flex flex-col gap-2">

      {/* ── Buy / Sell toggle ── */}
      <div className="flex items-center gap-0.5 p-1 bg-muted/20 rounded-2xl border border-border/30">
        {(["buy","sell"] as Mode[]).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150",
              mode === m
                ? "bg-card text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground/80"
            )}>
            {m === "buy" ? "Buy Crypto" : "Sell Crypto"}
          </button>
        ))}
      </div>

      {/* ── Payment method pills ── */}
      <div className="flex items-center gap-1.5">
        {PAY_METHODS.map(pm => (
          <button key={pm.id} type="button" onClick={() => setPayMethod(pm.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-all",
              payMethod === pm.id
                ? "bg-card border-border/60 text-foreground shadow-sm"
                : "border-border/30 text-muted-foreground hover:text-foreground bg-muted/10"
            )}>
            {pm.icon}
            <span className="hidden sm:inline">{pm.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* ── You Pay / You Send card ── */}
      <div className="rounded-2xl bg-secondary/60 border border-border/50 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{mode === "buy" ? "You Pay" : "You Send"}</span>
          {mode === "buy"
            ? <span className="text-xs text-muted-foreground">{fiat.name}</span>
            : <span className="text-xs text-muted-foreground">{coin.network}</span>
          }
        </div>
        <div className="flex items-center gap-2">
          {mode === "buy" ? (
            <>
              <input type="number" min="0" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-[2.2rem] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 min-w-0 leading-none py-1" />
              <FiatPicker selected={fiat} onChange={setFiat} />
            </>
          ) : (
            <>
              <input type="number" min="0" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-[2.2rem] font-semibold text-foreground outline-none placeholder:text-muted-foreground/30 min-w-0 leading-none py-1" />
              <CoinPicker selected={coin} onChange={setCoin} />
            </>
          )}
        </div>
        {/* Quick amounts (buy mode only) */}
        {mode === "buy" && (
          <div className="flex gap-1.5 mt-2.5">
            {QUICK_AMOUNTS.map(qa => (
              <button key={qa} type="button" onClick={() => setAmount(String(qa))}
                className={cn(
                  "flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors",
                  amount === String(qa)
                    ? "bg-primary/15 border-primary/40 text-primary"
                    : "bg-muted/30 border-border/30 text-muted-foreground hover:border-primary/30 hover:text-primary"
                )}>
                {fiat.symbol}{qa}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Swap icon ── */}
      <div className="flex justify-center">
        <button type="button" onClick={() => setMode(m => m === "buy" ? "sell" : "buy")}
          className="w-8 h-8 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-sm hover:border-primary/50 hover:bg-primary/10 transition-all active:scale-95">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* ── You Get / You Receive card ── */}
      <div className="rounded-2xl bg-secondary/60 border border-border/50 px-4 pt-3 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{mode === "buy" ? "You Get" : "You Receive"}</span>
          {mode === "buy"
            ? <span className="text-xs text-muted-foreground">{coin.network}</span>
            : <span className="text-xs text-muted-foreground">{fiat.name}</span>
          }
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-[2.2rem] font-semibold leading-none py-1 tabular-nums">
            {mode === "buy" ? (
              receive && numAmt > 0
                ? <span className="text-emerald-400">≈{receive}</span>
                : <span className="text-muted-foreground/20">0.0</span>
            ) : (
              receive && numAmt > 0
                ? <span className="text-emerald-400">≈{fiat.symbol}{(numAmt * (APPROX_RATES[coin.symbol]?.[fiat.code] ?? APPROX_RATES[coin.symbol]?.["USD"] ?? 1) * 0.97).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
                : <span className="text-muted-foreground/20">0.0</span>
            )}
          </div>
          {mode === "buy"
            ? <CoinPicker selected={coin} onChange={setCoin} />
            : <FiatPicker selected={fiat} onChange={setFiat} />
          }
        </div>
        {/* Rate / provider info */}
        {numAmt > 0 && receive && provider && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">
              {mode === "buy"
                ? `1 ${coin.symbol} ≈ ${fiat.symbol}${(APPROX_RATES[coin.symbol]?.[fiat.code] ?? 0).toLocaleString()}`
                : `1 ${coin.symbol} ≈ ${fiat.symbol}${(APPROX_RATES[coin.symbol]?.[fiat.code] ?? 0).toLocaleString()}`
              }
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-border/40 bg-muted/30 text-[10px] font-semibold text-muted-foreground">
              via {provider.name} · {provider.fee}
            </span>
          </div>
        )}
      </div>

      {/* ── Note on estimated rate ── */}
      <p className="text-[10px] text-muted-foreground/40 text-center px-2">
        Estimate only · Final rate confirmed by provider · {mode === "buy" ? "Non-custodial" : "KYC may be required"}
      </p>

      {/* ── CTA button ── */}
      <button type="button" disabled={!canLaunch} onClick={launch}
        className={cn(
          "w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 mt-0.5",
          canLaunch
            ? "bg-foreground text-background hover:opacity-90 active:scale-[0.99]"
            : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
        )}>
        {!canLaunch
          ? "Enter amount"
          : mode === "buy"
            ? <><ExternalLink className="w-4 h-4" /> Buy {coin.symbol} with {PAY_METHODS.find(p => p.id === payMethod)?.label ?? "Card"}</>
            : <><ExternalLink className="w-4 h-4" /> Sell {coin.symbol} for {fiat.code}</>
        }
      </button>

      {/* ── Provider row ── */}
      {canLaunch && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-muted-foreground/50">Powered by</span>
          <div className="flex items-center gap-2">
            {PROVIDERS.filter(p => p.methods.includes(payMethod) && p.coins.includes(coin.symbol)).slice(0, 4).map(p => (
              <span key={p.id} className="text-[10px] text-muted-foreground/40 font-medium">{p.name}</span>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
