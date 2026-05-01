/**
 * LetsExchangePanel — Native 3-step cross-chain exchange
 *
 * Step 1: Choose amount + coins  (live rate, 10s countdown auto-refresh)
 * Step 2: Enter withdrawal address
 * Step 3: Deposit address + QR code + live status tracking
 *
 * API field mapping (per LetsExchange official docs):
 *   POST /v1/info    → from, to, network_from, network_to, amount → { amount, rate, rate_id, min_amount, max_amount }
 *   POST /v1/transaction → coin_from, coin_to, network_from, network_to, deposit_amount, withdrawal, withdrawal_extra_id, rate_id
 *                       → { transaction_id, deposit, deposit_extra_id, withdrawal_amount, status }
 *   GET  /v1/transaction/{id} → { transaction_id, status, deposit, withdrawal, withdrawal_amount, hash_in, hash_out }
 */

import {
  useState, useEffect, useRef, useMemo, useCallback,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Search, Loader2, AlertTriangle, X, ChevronDown, ArrowUpDown,
  Zap, CheckCircle2, ChevronLeft, Copy, Check, RefreshCw,
  Clock, Lock, Wallet, History, Trash2, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { API_BASE } from "@/lib/api";
import { useAccount } from "wagmi";
import { useWalletStore } from "@/store/useWalletStore";
import { useEvmBalances } from "@/hooks/useEvmBalances";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeCoin {
  symbol: string; name: string; network: string|null; networkName: string|null;
  image: string|null; hasExtraId: boolean; minAmount: string|null; maxAmount: string|null;
}

// Response from POST /v1/info
interface Estimate {
  amount: string;           // output amount you'll receive
  rate: string;
  min_amount: string;
  max_amount: string;
  rate_id: string|null;     // use for fixed-rate transaction creation
  rate_id_expired_at: string|null;
  withdrawal_fee: string;
  deposit_min_amount?: string;
  deposit_max_amount?: string;
}

// Response from POST /v1/transaction
interface OrderResult {
  transaction_id: string;
  status: string;
  deposit: string;              // deposit address
  deposit_extra_id: string|null;
  deposit_amount: string;
  withdrawal_amount: string;
  withdrawal: string;           // recipient address
  coin_from: string;
  coin_to: string;
  coin_from_network: string;
  coin_to_network: string;
  rate?: string;
}

// Response from GET /v1/transaction/{id}
interface StatusResult {
  transaction_id: string;
  status: string;
  deposit_amount?: string;
  withdrawal_amount?: string;
  hash_in?: string|null;
  hash_out?: string|null;
  real_deposit_amount?: string;
  real_withdrawal_amount?: string;
}

// History entry — persisted to localStorage
interface HistoryEntry {
  transaction_id: string;
  coin_from:       string;
  coin_to:         string;
  network_from:    string;
  network_to:      string;
  deposit_amount:  string;
  withdrawal_amount: string;
  withdrawal:      string;
  deposit:         string;
  deposit_extra_id: string | null;
  status:          string;
  rate?:           string;
  createdAt:       number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = API_BASE;
const RATE_REFRESH = 10;
const LS_KEY = "le_swap_history";

// ─── Module-level coin cache ──────────────────────────────────────────────────
// All panel instances share one fetch so simultaneous mounts don't fire
// multiple requests. The result is kept for 30 min (matching backend TTL).

const COINS_CLIENT_TTL = 30 * 60 * 1000;
let _coinsCache: LeCoin[] | null = null;
let _coinsCacheTs = 0;
let _coinsInflight: Promise<LeCoin[]> | null = null;

async function fetchCoins(): Promise<LeCoin[]> {
  if (_coinsCache && Date.now() - _coinsCacheTs < COINS_CLIENT_TTL) return _coinsCache;
  if (_coinsInflight) return _coinsInflight;
  _coinsInflight = fetch(`${API}/letsexchange/currencies`)
    .then(r => { if (!r.ok) throw new Error("currencies failed"); return r.json(); })
    .then((d: LeCoin[]) => {
      _coinsCache = d;
      _coinsCacheTs = Date.now();
      _coinsInflight = null;
      return d;
    })
    .catch(err => { _coinsInflight = null; throw err; });
  return _coinsInflight;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(entries.slice(0, 50))); } catch {}
}

function addHistoryEntry(order: OrderResult) {
  const entries = loadHistory();
  const entry: HistoryEntry = {
    transaction_id:   order.transaction_id,
    coin_from:        order.coin_from,
    coin_to:          order.coin_to,
    network_from:     order.coin_from_network,
    network_to:       order.coin_to_network,
    deposit_amount:   order.deposit_amount,
    withdrawal_amount: order.withdrawal_amount,
    withdrawal:       order.withdrawal,
    deposit:          order.deposit,
    deposit_extra_id: order.deposit_extra_id,
    status:           order.status ?? "wait",
    rate:             order.rate,
    createdAt:        Date.now(),
  };
  // deduplicate by transaction_id
  const filtered = entries.filter(e => e.transaction_id !== entry.transaction_id);
  saveHistory([entry, ...filtered]);
}

function fmtNum(n: string|number|null|undefined, maxDec = 8): string {
  if (n == null || n === "") return "–";
  const v = parseFloat(String(n));
  if (!isFinite(v) || isNaN(v)) return "–";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  // Choose decimal places by magnitude — never show more than maxDec
  const dec = abs >= 1000 ? 2
    : abs >= 1    ? Math.min(maxDec, 4)
    : abs >= 0.01 ? Math.min(maxDec, 6)
    : Math.min(maxDec, 8);
  return v.toFixed(dec).replace(/\.?0+$/, "");
}
function shortAddr(a: string) { return a.length <= 16 ? a : `${a.slice(0, 8)}…${a.slice(-6)}`; }

// LetsExchange real status values (from docs)
const STATUS_LABEL: Record<string, string> = {
  wait:         "Waiting for deposit",
  confirmation: "Confirming deposit",
  confirmed:    "Deposit confirmed",
  exchanging:   "Processing exchange",
  sending:      "Sending funds",
  finished:     "Complete",
  failed:       "Failed",
  overdue:      "Overdue — funds not received",
  refunded:     "Refunded",
};
const STATUS_COLOR: Record<string, string> = {
  wait:         "text-yellow-400",
  confirmation: "text-blue-400",
  confirmed:    "text-blue-400",
  exchanging:   "text-blue-400",
  sending:      "text-blue-400",
  finished:     "text-emerald-400",
  failed:       "text-red-400",
  overdue:      "text-orange-400",
  refunded:     "text-orange-400",
};
const DONE_STATUSES = new Set(["finished", "failed", "overdue", "refunded"]);

// ─── CoinPicker ───────────────────────────────────────────────────────────────

function CoinPicker({ coins, selected, onChange, exclude }: {
  coins: LeCoin[]; selected: LeCoin|null; onChange: (c: LeCoin) => void; exclude?: string|null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); else setQ(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase().trim();
    const list = exclude ? coins.filter(c => c.symbol !== exclude) : coins;
    if (!qq) return list.slice(0, 120);
    return list.filter(c =>
      c.symbol.toLowerCase().includes(qq) || c.name.toLowerCase().includes(qq) ||
      (c.networkName ?? "").toLowerCase().includes(qq)
    ).slice(0, 80);
  }, [coins, q, exclude]);

  return (
    <div className="relative" ref={panelRef}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-3 rounded-xl bg-muted/60 border border-border/40 hover:border-border/60 transition-colors text-left">
        {selected ? (
          <>
            <CoinLogo symbol={selected.symbol} size={28} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">{selected.symbol}</p>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">{selected.networkName ?? selected.network ?? selected.name}</p>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-sm flex-1">Select coin</span>
        )}
        <ChevronDown className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 340 }}>
          <div className="p-2.5 border-b border-border/40 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <input ref={inputRef} placeholder={`Search ${coins.length.toLocaleString()} coins…`} value={q}
              onChange={e => setQ(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40 text-foreground" />
            {q && <button type="button" onClick={() => setQ("")}><X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-foreground" /></button>}
            <button type="button" onClick={() => setOpen(false)}><X className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-foreground" /></button>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? <p className="text-xs text-muted-foreground/60 text-center py-6">No coins found</p> : (
              filtered.map(c => (
                <button type="button" key={`${c.symbol}::${c.network ?? ""}`}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left",
                    selected?.symbol === c.symbol && selected?.network === c.network && "bg-muted/30")}>
                  <CoinLogo symbol={c.symbol} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight text-foreground">{c.symbol}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">{c.name}{c.networkName ? ` · ${c.networkName}` : ""}</p>
                  </div>
                  {selected?.symbol === c.symbol && selected?.network === c.network && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 text-center">
            {filtered.length.toLocaleString()} of {coins.length.toLocaleString()} coins
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button type="button" onClick={copy}
      className={cn("p-1.5 rounded-lg transition-colors", copied ? "text-emerald-400" : "text-muted-foreground hover:text-muted-foreground/80", className)}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function Countdown({ seconds, onEnd }: { seconds: number; onEnd: () => void }) {
  const [t, setT] = useState(seconds);
  useEffect(() => {
    setT(seconds);
    const iv = setInterval(() => setT(p => { if (p <= 1) { clearInterval(iv); onEnd(); return 0; } return p - 1; }), 1000);
    return () => clearInterval(iv);
  }, [seconds, onEnd]);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/70">
      <RefreshCw className="w-3 h-3" /> {t}s
    </span>
  );
}

// ─── Step 1: Amount ───────────────────────────────────────────────────────────

function StepAmount({ coins, onContinue, initialFrom, initialTo, walletAddress }: {
  coins: LeCoin[];
  onContinue: (from: LeCoin, to: LeCoin, amount: string, estimate: Estimate|null) => void;
  initialFrom?: string;
  initialTo?: string;
  walletAddress?: string | null;
}) {
  const [fromCoin, setFromCoin] = useState<LeCoin|null>(null);
  const [toCoin,   setToCoin]   = useState<LeCoin|null>(null);
  const [amount,   setAmount]   = useState("");
  const [estimate, setEstimate] = useState<Estimate|null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError,   setEstError]   = useState<string|null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Smart router state ───────────────────────────────────────────────────
  const [routeSource, setRouteSource] = useState<"internal"|"letsexchange"|null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Real on-chain EVM balance for the "from" coin
  // useAccount (wagmi) is the authoritative source for the connected chain ID,
  // covering WalletConnect, injected, and all external wallet providers.
  const { chainId: wagmiChainId, address: wagmiAddress } = useAccount();
  const { chainId: storeChainId, balance: nativeBal } = useWalletStore();
  const effectiveChainId = wagmiChainId ?? storeChainId ?? null;
  const effectiveAddress  = wagmiAddress ?? walletAddress ?? null;

  const { balances: evmBalances } = useEvmBalances(effectiveAddress, effectiveChainId);

  // Resolve the available balance: native token (e.g. ETH) or ERC-20 token
  const availBal = useMemo(() => {
    if (!fromCoin || !effectiveAddress) return null;
    const sym = fromCoin.symbol.toUpperCase();
    // Native + ERC-20 balances from the on-chain hook
    if (evmBalances.length > 0) {
      const match = evmBalances.find(b => b.symbol.toUpperCase() === sym);
      if (match && match.amount > 0) return match.amount;
    }
    // Fallback: wallet store native balance string (e.g. "0.0121")
    if (nativeBal) {
      const nativeSym = effectiveChainId === 56 ? "BNB"
                      : effectiveChainId === 137 ? "POL"
                      : "ETH";
      if (sym === nativeSym) {
        const v = parseFloat(nativeBal);
        return isNaN(v) ? null : v;
      }
    }
    return null;
  }, [fromCoin, effectiveAddress, evmBalances, nativeBal, effectiveChainId]);

  // Quick-fill helpers
  const applyPct = (pct: number) => {
    if (!availBal || availBal <= 0) return;
    const val = (availBal * pct) / 100;
    setAmount(fmtNum(val, 8));
    setEstimate(null);
  };

  // Pre-select coins — use initialFrom/initialTo when provided, else BTC → BSV
  useEffect(() => {
    if (!coins.length) return;

    function pickCoin(sym: string): LeCoin | null {
      const up = sym.toUpperCase();
      return coins.find(c => c.symbol === up && c.network === up)
          ?? coins.find(c => c.symbol === up)
          ?? null;
    }

    if (initialFrom) {
      const c = pickCoin(initialFrom);
      if (c) setFromCoin(c);
    } else {
      const btc = coins.find(c => c.symbol === "BTC" && c.network === "BTC");
      if (btc) setFromCoin(btc);
    }

    if (initialTo) {
      const c = pickCoin(initialTo);
      if (c) setToCoin(c);
    } else {
      const bsv = coins.find(c => c.symbol === "BSV" && c.network === "BSV");
      const eth = coins.find(c => c.symbol === "ETH" && c.network === "ETH");
      if (bsv ?? eth) setToCoin(bsv ?? eth ?? null);
    }
  }, [coins, initialFrom, initialTo]);

  // Live rate fetch using correct API fields
  const fetchEstimate = useCallback(async () => {
    if (!fromCoin || !toCoin || !amount || parseFloat(amount) <= 0) { setEstimate(null); return; }
    setEstLoading(true); setEstError(null);
    try {
      const r = await fetch(`${API}/letsexchange/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from:         fromCoin.symbol,
          to:           toCoin.symbol,
          network_from: fromCoin.network ?? fromCoin.symbol,
          network_to:   toCoin.network   ?? toCoin.symbol,
          amount:       parseFloat(amount),
          float:        true,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setEstError(d.error ?? "Rate unavailable"); setEstimate(null); }
      else { setEstimate(d as Estimate); }
    } catch { setEstError("Network error"); }
    setEstLoading(false);
  }, [fromCoin, toCoin, amount]);

  useEffect(() => { fetchEstimate(); }, [fetchEstimate, refreshKey]);

  // ── Debounced smart-route check ──────────────────────────────────────────
  useEffect(() => {
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    const amt = parseFloat(amount);
    if (!fromCoin || !toCoin || !amount || !isFinite(amt) || amt <= 0) {
      setRouteSource(null); return;
    }
    setRouteLoading(true);
    routeTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/swap/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetIn: fromCoin.symbol, assetOut: toCoin.symbol, amountIn: amt }),
        });
        const d = await r.json();
        if (r.ok && d.source) setRouteSource(d.source as "internal"|"letsexchange");
      } catch { /* non-fatal */ }
      setRouteLoading(false);
    }, 600);
    return () => { if (routeTimerRef.current) clearTimeout(routeTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCoin?.symbol, toCoin?.symbol, amount]);

  // Use live min/max from estimate if available, otherwise fall back to coin data
  const minAmt = estimate?.min_amount ? parseFloat(estimate.min_amount) :
                 fromCoin?.minAmount  ? parseFloat(fromCoin.minAmount)  : null;
  const maxAmt = estimate?.max_amount ? parseFloat(estimate.max_amount) :
                 fromCoin?.maxAmount  ? parseFloat(fromCoin.maxAmount)  : null;
  const numAmt = amount !== "" ? parseFloat(amount) : null;
  const belowMin = minAmt !== null && numAmt !== null && numAmt < minAmt;
  const aboveMax = maxAmt !== null && numAmt !== null && numAmt > maxAmt;

  const rateIdExpiresMs = estimate?.rate_id_expired_at ? parseInt(estimate.rate_id_expired_at) : null;
  const rateSecondsLeft = rateIdExpiresMs ? Math.max(0, Math.round((rateIdExpiresMs - Date.now()) / 1000)) : RATE_REFRESH;

  const canContinue = fromCoin && toCoin && numAmt && numAmt > 0 && !belowMin && !aboveMax;

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Step 1/3</p>
          <h2 className="text-lg font-bold text-foreground">Choose deposit amount</h2>
        </div>
        {estimate && (
          <Countdown key={`${refreshKey}-${estimate.rate_id ?? ""}`}
            seconds={Math.min(rateSecondsLeft, RATE_REFRESH)}
            onEnd={() => setRefreshKey(k => k + 1)} />
        )}
      </div>

      {/* You send */}
      <div className="rounded-xl bg-muted/40 p-3 mb-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">You Send</p>
          {availBal !== null && fromCoin && (
            <p className="text-xs text-muted-foreground/70">
              Available: <span className="font-mono text-foreground/80">{fmtNum(availBal, 6)} {fromCoin.symbol}</span>
            </p>
          )}
        </div>
        <input type="number" min="0" placeholder="0.0" value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full bg-muted/60 border border-border/40 rounded-xl px-4 py-3 mb-2 text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 transition-colors" />
        {/* Quick-fill percentage buttons */}
        {availBal !== null && availBal > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            {([25, 50, 75] as const).map(pct => (
              <button key={pct} type="button" onClick={() => applyPct(pct)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-muted/60 border border-border/40 hover:border-primary/40 hover:text-primary transition-colors text-muted-foreground">
                {pct}%
              </button>
            ))}
            <button type="button" onClick={() => applyPct(100)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary transition-colors">
              Max
            </button>
          </div>
        )}
        <CoinPicker coins={coins} selected={fromCoin} onChange={c => { setFromCoin(c); setEstimate(null); }} exclude={toCoin?.symbol} />
        {(minAmt !== null || maxAmt !== null) && fromCoin && (
          <div className={cn("flex items-center gap-3 text-xs mt-2", belowMin || aboveMax ? "text-red-400" : "text-emerald-400/80")}>
            {minAmt !== null && (
              <button type="button" onClick={() => setAmount(fmtNum(minAmt, 8))}
                className="flex items-center gap-1 hover:opacity-70 active:opacity-50 transition-opacity cursor-pointer">
                Min: <span className="font-mono underline underline-offset-2 decoration-dotted">{fmtNum(minAmt)} {fromCoin.symbol}</span>
              </button>
            )}
            {maxAmt !== null && (
              <button type="button" onClick={() => setAmount(fmtNum(maxAmt, 8))}
                className="flex items-center gap-1 hover:opacity-70 active:opacity-50 transition-opacity cursor-pointer">
                Max: <span className="font-mono underline underline-offset-2 decoration-dotted">{fmtNum(maxAmt, 7)} {fromCoin.symbol}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Swap direction */}
      <div className="flex justify-center my-2">
        <button type="button" onClick={() => { const t = fromCoin; setFromCoin(toCoin); setToCoin(t); setEstimate(null); setAmount(""); }}
          className="p-2.5 rounded-full bg-muted/60 border border-border/40 hover:bg-muted hover:border-border/60 transition-colors">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground/70" />
        </button>
      </div>

      {/* You get */}
      <div className="rounded-xl bg-muted/40 p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-2">You Get</p>
        <div className="w-full bg-muted/60 border border-border/40 rounded-xl px-4 py-3 mb-2 min-h-[52px] flex items-center">
          {estLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />
          ) : estimate ? (
            <span className="text-xl font-bold text-emerald-400 font-mono">{fmtNum(estimate.amount, 8)}</span>
          ) : estError ? (
            <span className="text-sm text-red-400/80">{estError}</span>
          ) : (
            <span className="text-xl font-bold text-muted-foreground/40">≈</span>
          )}
        </div>
        <CoinPicker coins={coins} selected={toCoin} onChange={c => { setToCoin(c); setEstimate(null); }} exclude={fromCoin?.symbol} />

        {/* Rate + fixed rate badge */}
        {estimate && fromCoin && toCoin && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              1 {fromCoin.symbol} ≈ <span className="text-emerald-400 font-mono">{fmtNum(estimate.rate, 8)} {toCoin.symbol}</span>
            </p>
          </div>
        )}
        {estimate?.withdrawal_fee && parseFloat(estimate.withdrawal_fee) > 0 && toCoin && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Network fee: <span className="font-mono">{fmtNum(estimate.withdrawal_fee, 6)} {toCoin.symbol}</span>
          </p>
        )}
      </div>

      {/* Smart Router badge */}
      {(routeSource || routeLoading) && fromCoin && toCoin && numAmt && numAmt > 0 && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
          routeLoading
            ? "bg-muted/30 border-border/30 text-muted-foreground/50"
            : routeSource === "internal"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-blue-500/10 border-blue-500/30 text-blue-400",
        )}>
          {routeLoading ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> <span>Checking liquidity…</span></>
          ) : routeSource === "internal" ? (
            <><span className="text-sm">⚡</span> <span>OrahDEX Orderbook — internal liquidity available</span></>
          ) : (
            <><span className="text-sm">🔄</span> <span>LetsExchange — cross-chain bridge</span></>
          )}
        </div>
      )}

      <button type="button" disabled={!canContinue}
        onClick={() => canContinue && fromCoin && toCoin && onContinue(fromCoin, toCoin, amount, estimate)}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          canContinue
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-muted/60 text-muted-foreground/60 cursor-not-allowed")}>
        {!fromCoin || !toCoin ? "Select coins" :
         !numAmt             ? "Enter amount" :
         belowMin            ? `Below minimum (${fmtNum(minAmt)} ${fromCoin.symbol})` :
         aboveMax            ? `Above maximum (${fmtNum(maxAmt, 7)} ${fromCoin.symbol})` :
                               "Continue →"}
      </button>
    </div>
  );
}

// ─── Step 2: Address ──────────────────────────────────────────────────────────

function StepAddress({ fromCoin, toCoin, amount, estimate, onBack, onContinue, walletAddress }: {
  fromCoin: LeCoin; toCoin: LeCoin; amount: string; estimate: Estimate|null;
  onBack: () => void;
  onContinue: (address: string, extraId: string) => void;
  walletAddress?: string | null;
}) {
  const [address,    setAddress]    = useState("");
  const [extraId,    setExtraId]    = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refund,     setRefund]     = useState("");

  const addrOk = address.trim().length >= 10;
  const extraOk = !toCoin.hasExtraId || extraId.trim().length > 0;

  // Only offer "Use connected wallet" when the receiving coin is on an EVM-compatible network.
  // EVM addresses (0x…) are invalid for BTC, BSV, XMR, SOL, etc.
  const EVM_NETWORKS = new Set([
    "eth","erc20","bep20","bsc","bnb","matic","polygon","optimism","op","arbitrum","arb",
    "avax","avalanche","ftm","fantom","celo","base","mnt","mantle","cro","cronos",
    "linea","zksync","zk","scroll","blast","mode",
  ]);
  const isEvmReceiver = EVM_NETWORKS.has((toCoin.network ?? toCoin.symbol).toLowerCase());
  const showConnectedWallet = isEvmReceiver && !!walletAddress;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs text-muted-foreground">Step 2/3</p>
          <h2 className="text-lg font-bold text-foreground">Withdrawal Setup</h2>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={fromCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{fromCoin.symbol} <span className="text-muted-foreground font-normal text-xs">{fromCoin.networkName ?? fromCoin.network ?? ""}</span></p>
            <p className="text-xs text-muted-foreground">You send</p>
          </div>
          <p className="ml-auto font-bold text-base font-mono">{amount}</p>
        </div>
        <div className="h-px bg-muted/60" />
        <div className="flex items-center gap-3">
          <CoinLogo symbol={toCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{toCoin.symbol} <span className="text-muted-foreground font-normal text-xs">{toCoin.networkName ?? toCoin.network ?? ""}</span></p>
            <p className="text-xs text-muted-foreground">You receive</p>
          </div>
          {estimate ? (
            <p className="ml-auto font-bold text-base text-emerald-400 font-mono">≈{fmtNum(estimate.amount, 8)}</p>
          ) : (
            <p className="ml-auto text-sm text-muted-foreground/60">Live rate</p>
          )}
        </div>
        {estimate?.rate_id && (
          <div className="flex items-center gap-1.5 pt-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <p className="text-xs text-emerald-400">Fixed rate locked in</p>
          </div>
        )}
      </div>

      {/* Address */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Your {toCoin.symbol} receiving address</label>
        <p className="text-xs text-muted-foreground">
          On the <span className="text-muted-foreground/80">{toCoin.networkName ?? toCoin.network ?? toCoin.symbol}</span> network
        </p>
        {/* Use connected wallet chip — only for EVM-compatible receiving coins */}
        {showConnectedWallet && (
          <button
            type="button"
            onClick={() => setAddress(walletAddress!)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all",
              address === walletAddress
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60 hover:border-border/70 hover:text-foreground/80",
            )}
          >
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            {address === walletAddress ? "✓ Using connected wallet" : `Use connected wallet: ${walletAddress!.slice(0, 6)}…${walletAddress!.slice(-4)}`}
          </button>
        )}
        <div className="relative">
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder={`${toCoin.symbol} wallet address`}
            className="w-full bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 transition-colors pr-12" />
          {address && <CopyButton text={address} className="absolute right-2 top-1/2 -translate-y-1/2" />}
        </div>
        <p className="text-[11px] text-yellow-400/70">
          ⚠ Verify the address matches the selected coin and network to avoid lost funds.
        </p>
      </div>

      {/* Extra ID */}
      {toCoin.hasExtraId && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Memo / Tag <span className="text-red-400 text-xs">required</span></label>
          <input value={extraId} onChange={e => setExtraId(e.target.value)}
            placeholder="Destination tag or memo"
            className="w-full bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 transition-colors" />
        </div>
      )}

      {/* Optional refund address */}
      <button type="button" onClick={() => setShowRefund(v => !v)}
        className="text-xs text-muted-foreground hover:text-muted-foreground flex items-center gap-1 transition-colors w-fit">
        <ChevronDown className={cn("w-3 h-3 transition-transform", showRefund && "rotate-180")} />
        Add refund address (optional)
      </button>
      {showRefund && (
        <input value={refund} onChange={e => setRefund(e.target.value)}
          placeholder={`${fromCoin.symbol} refund address (if exchange fails)`}
          className="w-full bg-muted/40 border border-border/40 rounded-xl px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 transition-colors" />
      )}

      <button type="button" disabled={!addrOk || !extraOk}
        onClick={() => addrOk && extraOk && onContinue(address.trim(), extraId.trim())}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          addrOk && extraOk
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-muted/60 text-muted-foreground/60 cursor-not-allowed")}>
        {!addrOk ? "Enter receiving address" : !extraOk ? "Enter memo / tag" : "Create Exchange →"}
      </button>
    </div>
  );
}

// ─── Step 3: Deposit + Tracking ───────────────────────────────────────────────

function StepDeposit({ order, fromCoin, toCoin, onBack, onReset }: {
  order: OrderResult; fromCoin: LeCoin; toCoin: LeCoin;
  onBack: () => void; onReset: () => void;
}) {
  const [status,      setStatus]      = useState<StatusResult|null>(null);
  const [statusError, setStatusError] = useState(false);
  const [infoOpen,    setInfoOpen]    = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/letsexchange/status/${order.transaction_id}`);
      const d = await r.json();
      if (r.ok && d.transaction_id) { setStatus(d); setStatusError(false); }
      else setStatusError(true);
    } catch { setStatusError(true); }
  }, [order.transaction_id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus, refreshKey]);

  const currentStatus = status?.status ?? order.status ?? "wait";
  const isDone = DONE_STATUSES.has(currentStatus);

  // Construct QR value — use address:amount format for wallets that support it
  const qrValue = order.deposit;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Step 3/3</p>
            {!isDone && <Countdown key={refreshKey} seconds={15} onEnd={() => setRefreshKey(k => k + 1)} />}
          </div>
          <h2 className="text-lg font-bold text-foreground">Send by one transaction</h2>
        </div>
      </div>

      {/* Amount to send */}
      <div className="rounded-xl bg-muted/40 p-4">
        <p className="text-xs text-muted-foreground mb-1">Send exactly</p>
        <p className="text-2xl font-bold">
          <span className="text-emerald-400 font-mono">{fmtNum(order.deposit_amount, 8)}</span>
          <span className="text-foreground ml-2">{fromCoin.symbol}</span>
          <span className="text-muted-foreground text-base font-normal ml-2">({fromCoin.networkName ?? fromCoin.network ?? fromCoin.symbol})</span>
        </p>
        <p className="text-xs text-yellow-400/70 mt-1">Send only the exact amount — do not split across multiple transactions</p>
      </div>

      {/* Status */}
      <div className="rounded-xl bg-muted/40 p-3 flex items-center gap-3">
        {isDone ? (
          currentStatus === "finished"
            ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={cn("font-semibold text-sm", STATUS_COLOR[currentStatus] ?? "text-white")}>
            {STATUS_LABEL[currentStatus] ?? currentStatus}
          </p>
          {(status?.withdrawal_amount ?? order.withdrawal_amount) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              You receive: <span className="text-emerald-400 font-mono">{fmtNum(status?.real_withdrawal_amount ?? order.withdrawal_amount, 8)} {toCoin.symbol}</span>
            </p>
          )}
        </div>
        {statusError && <AlertTriangle className="w-4 h-4 text-yellow-400/50 shrink-0" />}
      </div>

      {/* Deposit address */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Deposit address for {fromCoin.symbol}</p>
        <div className="rounded-xl bg-muted/40 border border-border/40 px-4 py-3 flex items-center gap-2">
          <CoinLogo symbol={fromCoin.symbol} size={20} />
          <p className="flex-1 min-w-0 text-sm text-foreground/80 font-mono break-all">{order.deposit}</p>
          <CopyButton text={order.deposit} />
        </div>
        {order.deposit_extra_id && (
          <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-yellow-300 font-semibold">Memo / Tag required</p>
              <p className="text-sm font-mono text-yellow-200">{order.deposit_extra_id}</p>
            </div>
            <CopyButton text={order.deposit_extra_id} />
          </div>
        )}
      </div>

      {/* QR code */}
      <div className="rounded-2xl bg-white p-4 flex flex-col items-center gap-2">
        <QRCodeSVG value={qrValue} size={188} bgColor="#ffffff" fgColor="#000000" />
        <p className="text-[10px] text-black/40 font-mono truncate max-w-full">{shortAddr(order.deposit)}</p>
      </div>

      {/* Rate + TX info */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Exchange ID</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-emerald-400 font-mono">{shortAddr(order.transaction_id)}</span>
            <CopyButton text={order.transaction_id} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Rate</span>
          <span className="text-xs text-muted-foreground/80 font-mono">
            {order.rate ? `1 ${fromCoin.symbol} ≈ ${fmtNum(order.rate, 8)} ${toCoin.symbol}` : "Float"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">You get</span>
          <span className="text-xs text-emerald-400 font-mono">{fmtNum(order.withdrawal_amount, 8)} {toCoin.symbol}</span>
        </div>
      </div>

      {/* Transaction info expandable */}
      <div className="rounded-xl bg-muted/40 border border-border/40 overflow-hidden">
        <button type="button" onClick={() => setInfoOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/60" /> Transaction info
          </span>
          <span className="text-muted-foreground text-lg">{infoOpen ? "−" : "+"}</span>
        </button>
        {infoOpen && (
          <div className="px-4 pb-4 space-y-2 border-t border-border/40 pt-3 text-xs">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">You send</span><span className="font-mono text-foreground">{fmtNum(order.deposit_amount, 8)} {fromCoin.symbol}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">You receive</span><span className="font-mono text-emerald-400">≈{fmtNum(order.withdrawal_amount, 8)} {toCoin.symbol}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">To address</span><span className="font-mono text-foreground/80 truncate ml-4 text-right">{shortAddr(order.withdrawal)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Order ID</span><span className="font-mono text-emerald-400">{order.transaction_id}</span></div>
            {status?.hash_in && (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Deposit TX</span><span className="font-mono text-muted-foreground/80 truncate ml-4">{shortAddr(status.hash_in)}</span></div>
            )}
            {status?.hash_out && (
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Withdrawal TX</span><span className="font-mono text-muted-foreground/80 truncate ml-4">{shortAddr(status.hash_out)}</span></div>
            )}
          </div>
        )}
      </div>

      {/* New exchange */}
      <div className="flex items-center justify-end">
        {isDone && (
          <button type="button" onClick={onReset}
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            New exchange →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── HistoryView ─────────────────────────────────────────────────────────────

function HistoryView({ onClose }: { onClose: () => void }) {
  const [entries,     setEntries]     = useState<HistoryEntry[]>(() => loadHistory());
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [liveStatus,  setLiveStatus]  = useState<Record<string, StatusResult>>({});
  const [fetching,    setFetching]    = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const fetchStatus = useCallback(async (id: string) => {
    if (fetching.has(id)) return;
    setFetching(prev => new Set(prev).add(id));
    try {
      const r = await fetch(`${API}/letsexchange/status/${id}`);
      const d = await r.json();
      if (r.ok && d.transaction_id) {
        setLiveStatus(prev => ({ ...prev, [id]: d as StatusResult }));
        // Update cached status in localStorage
        setEntries(prev => {
          const updated = prev.map(e => e.transaction_id === id ? { ...e, status: d.status ?? e.status } : e);
          saveHistory(updated);
          return updated;
        });
      }
    } catch {}
    setFetching(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, [fetching]);

  // Auto-fetch status for expanded entry
  useEffect(() => {
    if (expanded) fetchStatus(expanded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const handleClear = () => {
    saveHistory([]);
    setEntries([]);
    setLiveStatus({});
    setConfirmClear(false);
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/60">
        <History className="w-8 h-8" />
        <p className="text-sm">No swap history yet</p>
        <button type="button" onClick={onClose} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-1">
          Start a swap →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-foreground">{entries.length} swap{entries.length !== 1 ? "s" : ""}</p>
        {confirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Clear all?</span>
            <button type="button" onClick={handleClear} className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors">Yes</button>
            <button type="button" onClick={() => setConfirmClear(false)} className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors">No</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground/70 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Entry list */}
      {entries.map(entry => {
        const live    = liveStatus[entry.transaction_id];
        const status  = live?.status ?? entry.status;
        const isOpen  = expanded === entry.transaction_id;
        const isFetching = fetching.has(entry.transaction_id);
        const isDone  = DONE_STATUSES.has(status);

        return (
          <div key={entry.transaction_id}
            className={cn("rounded-xl border transition-colors overflow-hidden",
              isOpen ? "border-border/60 bg-muted/40" : "border-border/40 bg-card hover:border-border/50")}>
            {/* Row header — always visible */}
            <button type="button"
              className="w-full flex items-center gap-3 px-3 py-3 text-left"
              onClick={() => setExpanded(isOpen ? null : entry.transaction_id)}>
              {/* Coin logos */}
              <div className="flex items-center -space-x-2 shrink-0">
                <CoinLogo symbol={entry.coin_from} size={24} />
                <CoinLogo symbol={entry.coin_to}   size={18} className="ring-1 ring-[#1a1a1a] rounded-full" />
              </div>
              {/* Pair + amounts */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span>{entry.coin_from}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                  <span>{entry.coin_to}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  {fmtNum(entry.deposit_amount, 6)} → ≈{fmtNum(live?.real_withdrawal_amount ?? entry.withdrawal_amount, 6)}
                </p>
              </div>
              {/* Status + date */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={cn("text-[10px] font-bold uppercase tracking-wide",
                  STATUS_COLOR[status] ?? "text-muted-foreground/70")}>
                  {STATUS_LABEL[status] ?? status}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground/60 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-3 pb-4 space-y-3 border-t border-border/40 pt-3">
                {/* Live status */}
                <div className="flex items-center gap-2.5">
                  {isDone
                    ? status === "finished"
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    : isFetching
                      ? <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                      : <RefreshCw className="w-4 h-4 text-blue-400 shrink-0" />
                  }
                  <span className={cn("text-sm font-semibold", STATUS_COLOR[status] ?? "text-white")}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                  {!isFetching && (
                    <button type="button" onClick={() => fetchStatus(entry.transaction_id)}
                      className="ml-auto p-1 rounded-lg text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Deposit address */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Deposit address ({entry.coin_from})</p>
                  <div className="rounded-xl bg-background border border-border/40 px-3 py-2.5 flex items-center gap-2">
                    <CoinLogo symbol={entry.coin_from} size={16} />
                    <p className="flex-1 min-w-0 text-xs text-foreground/80 font-mono break-all">{entry.deposit}</p>
                    <CopyButton text={entry.deposit} />
                  </div>
                  {entry.deposit_extra_id && (
                    <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-yellow-300 font-semibold">Memo / Tag</p>
                        <p className="text-xs font-mono text-yellow-200">{entry.deposit_extra_id}</p>
                      </div>
                      <CopyButton text={entry.deposit_extra_id} />
                    </div>
                  )}
                </div>

                {/* TX hashes */}
                {live?.hash_in && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deposit TX</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-muted-foreground">{shortAddr(live.hash_in)}</span>
                      <CopyButton text={live.hash_in} />
                    </div>
                  </div>
                )}
                {live?.hash_out && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Withdrawal TX</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-muted-foreground">{shortAddr(live.hash_out)}</span>
                      <CopyButton text={live.hash_out} />
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-xl bg-background p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order ID</span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-emerald-400">{shortAddr(entry.transaction_id)}</span>
                      <CopyButton text={entry.transaction_id} />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You sent</span>
                    <span className="font-mono text-foreground">{fmtNum(entry.deposit_amount, 6)} {entry.coin_from}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="font-mono text-emerald-400">
                      ≈{fmtNum(live?.real_withdrawal_amount ?? entry.withdrawal_amount, 6)} {entry.coin_to}
                    </span>
                  </div>
                  {entry.rate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-mono text-muted-foreground">1 {entry.coin_from} ≈ {fmtNum(entry.rate, 6)} {entry.coin_to}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To address</span>
                    <span className="font-mono text-muted-foreground truncate ml-4">{shortAddr(entry.withdrawal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function LetsExchangePanel({
  initialFrom,
  initialTo,
  walletAddress,
  onConnectWallet,
}: {
  initialFrom?: string;
  initialTo?: string;
  walletAddress?: string | null;
  onConnectWallet?: () => void;
} = {}) {
  const [coins,    setCoins]    = useState<LeCoin[]>([]);
  const [coinsErr, setCoinsErr] = useState(false);
  const [loading,  setLoading]  = useState(true);

  const [step,       setStep]       = useState<1|2|3>(1);
  const [fromCoin,   setFromCoin]   = useState<LeCoin|null>(null);
  const [toCoin,     setToCoin]     = useState<LeCoin|null>(null);
  const [sendAmount, setSendAmount] = useState("");
  const [estimate,   setEstimate]   = useState<Estimate|null>(null);
  const [creating,   setCreating]   = useState(false);
  const [createError, setCreateError] = useState<string|null>(null);
  const [order,      setOrder]      = useState<OrderResult|null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyCount, setHistoryCount] = useState(() => loadHistory().length);

  useEffect(() => {
    let cancelled = false;
    fetchCoins()
      .then(d => { if (!cancelled) { setCoins(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setCoinsErr(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const handleAmountContinue = (from: LeCoin, to: LeCoin, amt: string, est: Estimate|null) => {
    setFromCoin(from); setToCoin(to); setSendAmount(amt); setEstimate(est);
    setCreateError(null);
    setStep(2);
  };

  const handleAddressContinue = async (address: string, extraId: string) => {
    if (!fromCoin || !toCoin) return;
    setCreating(true); setCreateError(null);
    try {
      const body: Record<string,unknown> = {
        coin_from:           fromCoin.symbol,
        coin_to:             toCoin.symbol,
        network_from:        fromCoin.network ?? fromCoin.symbol,
        network_to:          toCoin.network   ?? toCoin.symbol,
        deposit_amount:      parseFloat(sendAmount),
        withdrawal:          address,
        withdrawal_extra_id: extraId,   // always sent, even if ""
        float:               true,
      };

      const r = await fetch(`${API}/letsexchange/exchange`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();

      if (!r.ok) {
        // Show a clean error — extract validation messages if available
        let msg = d.error ?? "Failed to create exchange";
        if (d.detail?.error?.validation) {
          const v = d.detail.error.validation as Record<string,string>;
          msg = Object.values(v).join(". ");
        }
        setCreateError(msg);
        setCreating(false);
        return;
      }
      const newOrder = d as OrderResult;
      addHistoryEntry(newOrder);
      setHistoryCount(loadHistory().length);
      setOrder(newOrder);
      setStep(3);
    } catch { setCreateError("Network error — please try again"); }
    setCreating(false);
  };

  const handleReset = () => {
    setStep(1); setOrder(null); setEstimate(null);
    setSendAmount(""); setFromCoin(null); setToCoin(null);
    setCreateError(null);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" /> <span className="text-sm">Loading coins…</span>
      </div>
    );
  }
  if (coinsErr) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-red-400 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" /> Failed to load coin list.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Zap className="w-4 h-4 text-yellow-400" />
          Cross-Chain Exchange
        </div>
        <div className="flex items-center gap-2">
          {/* Wallet connection status */}
          {walletAddress ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-[11px] text-emerald-400 font-semibold">
              <Wallet className="w-3 h-3" />
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </div>
          ) : onConnectWallet ? (
            <button
              type="button"
              onClick={onConnectWallet}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/30 border border-border/50 text-[11px] text-muted-foreground font-semibold hover:bg-muted/60 hover:text-foreground/80 transition-colors"
            >
              <Wallet className="w-3 h-3" />
              Connect Wallet
            </button>
          ) : null}
          {/* History toggle */}
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            className={cn(
              "relative flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-colors",
              showHistory
                ? "bg-muted/60 border-border/60 text-foreground"
                : "bg-muted/30 border-border/40 text-muted-foreground/70 hover:bg-muted/60 hover:text-muted-foreground/80",
            )}
          >
            <History className="w-3 h-3" />
            History
            {historyCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-[9px] text-black font-bold flex items-center justify-center">
                {historyCount}
              </span>
            )}
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 font-semibold">
            {coins.length}+ coins
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        {showHistory ? (
          <HistoryView onClose={() => setShowHistory(false)} />
        ) : (
          <>
            {createError && (
              <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}
            {creating && (
              <div className="mb-4 rounded-xl bg-muted/30 p-3 flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Creating exchange order…
              </div>
            )}

            {step === 1 && <StepAmount coins={coins} onContinue={handleAmountContinue} initialFrom={initialFrom} initialTo={initialTo} walletAddress={walletAddress} />}
            {step === 2 && fromCoin && toCoin && (
              <StepAddress fromCoin={fromCoin} toCoin={toCoin} amount={sendAmount} estimate={estimate}
                onBack={() => setStep(1)} onContinue={handleAddressContinue}
                walletAddress={walletAddress} />
            )}
            {step === 3 && order && fromCoin && toCoin && (
              <StepDeposit order={order} fromCoin={fromCoin} toCoin={toCoin}
                onBack={() => setStep(2)} onReset={() => { handleReset(); setHistoryCount(loadHistory().length); }} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
