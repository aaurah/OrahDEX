/**
 * LetsExchangePanel — Native 3-step cross-chain exchange
 *
 * Step 1: Choose amount + coins  (live rate, countdown auto-refresh)
 * Step 2: Enter withdrawal address
 * Step 3: Deposit address + QR + transaction tracking
 *
 * Requires LetsExchange Enterprise API key for live rates & order creation.
 * When the standard affiliate key is active, the panel shows an upgrade notice
 * on the rate/CTA while the coin picker and UI remain fully functional.
 */

import {
  useState, useEffect, useRef, useMemo, useCallback,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Search, Loader2, AlertTriangle, X, ChevronDown, ArrowUpDown,
  Zap, CheckCircle2, ChevronLeft, Copy, Check, RefreshCw,
  Clock, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { API_BASE } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeCoin {
  symbol: string; name: string; network: string|null; networkName: string|null;
  image: string|null; hasExtraId: boolean; minAmount: string|null; maxAmount: string|null;
}

interface Estimate {
  withdrawal_amount: string;
  deposit_amount: string;
  rate?: string;
  min_amount?: string;
  max_amount?: string;
}

interface OrderResult {
  id: string;
  deposit_address: string;
  deposit_amount: string;
  withdrawal_amount: string;
  withdrawal_address: string;
  coin_from: string;
  coin_to: string;
  status: string;
  rate?: string;
}

interface StatusResult {
  id: string;
  status: string;
  deposit_amount?: string;
  withdrawal_amount?: string;
  hash_in?: string;
  hash_out?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = API_BASE;
const RATE_REFRESH = 10; // seconds between rate refreshes

function fmtNum(n: string|number|null|undefined, sig = 6): string {
  if (n == null || n === "") return "–";
  const v = parseFloat(String(n));
  return isNaN(v) ? "–" : v.toPrecision(sig).replace(/\.?0+$/, "");
}

function shortAddr(a: string) {
  if (a.length <= 16) return a;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

const STATUS_LABEL: Record<string, string> = {
  waiting:    "Waiting for deposit",
  confirming: "Confirming deposit",
  exchanging: "Processing exchange",
  sending:    "Sending funds",
  finished:   "Complete",
  failed:     "Failed",
  refunded:   "Refunded",
};

const STATUS_COLOR: Record<string, string> = {
  waiting:    "text-yellow-400",
  confirming: "text-blue-400",
  exchanging: "text-blue-400",
  sending:    "text-blue-400",
  finished:   "text-emerald-400",
  failed:     "text-red-400",
  refunded:   "text-orange-400",
};

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
        className="flex items-center gap-2 w-full px-3 py-3 rounded-xl bg-[#2a2a2a] border border-white/10 hover:border-white/20 transition-colors text-left">
        {selected ? (
          <>
            <CoinLogo symbol={selected.symbol} size={28} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">{selected.symbol}</p>
              <p className="text-[11px] text-white/40 leading-tight truncate">{selected.networkName ?? selected.network ?? selected.name}</p>
            </div>
          </>
        ) : (
          <span className="text-white/40 text-sm flex-1">Select coin</span>
        )}
        <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-[#1a1a1a] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 340 }}>
          <div className="p-2.5 border-b border-white/10 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <input ref={inputRef} placeholder={`Search ${coins.length.toLocaleString()} coins…`} value={q}
              onChange={e => setQ(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-white/30 text-white" />
            {q && <button type="button" onClick={() => setQ("")}><X className="w-3.5 h-3.5 text-white/30 hover:text-white" /></button>}
            <button type="button" onClick={() => setOpen(false)}><X className="w-3.5 h-3.5 text-white/30 hover:text-white" /></button>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? <p className="text-xs text-white/30 text-center py-6">No coins found</p> : (
              filtered.map(c => (
                <button type="button" key={`${c.symbol}::${c.network ?? ""}`}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left",
                    selected?.symbol === c.symbol && selected?.network === c.network && "bg-white/5")}>
                  <CoinLogo symbol={c.symbol} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight text-white">{c.symbol}</p>
                    <p className="text-[10px] text-white/40 leading-tight truncate">{c.name}{c.networkName ? ` · ${c.networkName}` : ""}</p>
                  </div>
                  {selected?.symbol === c.symbol && selected?.network === c.network && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/30 text-center">
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
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" onClick={copy}
      className={cn("p-1.5 rounded-lg transition-colors", copied ? "text-emerald-400" : "text-white/40 hover:text-white/70", className)}>
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
    <span className="inline-flex items-center gap-1 text-xs text-white/50">
      <RefreshCw className="w-3 h-3" /> {t}s
    </span>
  );
}

// ─── Step 1: Amount ───────────────────────────────────────────────────────────

function StepAmount({ coins, onContinue }: {
  coins: LeCoin[];
  onContinue: (from: LeCoin, to: LeCoin, amount: string, estimate: Estimate|null) => void;
}) {
  const [fromCoin, setFromCoin] = useState<LeCoin|null>(null);
  const [toCoin,   setToCoin]   = useState<LeCoin|null>(null);
  const [amount,   setAmount]   = useState("");
  const [estimate, setEstimate] = useState<Estimate|null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError,   setEstError]   = useState<string|null>(null);
  const [enterpriseRequired, setEnterpriseRequired] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Pre-select BTC → BSV (or ETH)
  useEffect(() => {
    if (!coins.length) return;
    const btc = coins.find(c => c.symbol === "BTC" && (!c.network || c.network === "BTC"));
    const bsv = coins.find(c => c.symbol === "BSV" && (!c.network || c.network === "BSV"));
    const eth = coins.find(c => c.symbol === "ETH" && (!c.network || c.network === "ETH"));
    if (btc) setFromCoin(btc);
    if (bsv || eth) setToCoin(bsv ?? eth ?? null);
  }, [coins]);

  // Fetch estimate
  const fetchEstimate = useCallback(async () => {
    if (!fromCoin || !toCoin || !amount || parseFloat(amount) <= 0) return;
    setEstLoading(true); setEstError(null);
    try {
      const r = await fetch(`${API}/letsexchange/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coin_from: fromCoin.symbol, coin_to: toCoin.symbol,
          deposit_amount: parseFloat(amount),
          network_from: fromCoin.network ?? undefined,
          network_to:   toCoin.network   ?? undefined,
        }),
      });
      const d = await r.json();
      if (d.enterpriseRequired) { setEnterpriseRequired(true); setEstimate(null); }
      else if (!r.ok)           { setEstError(d.error ?? "Rate unavailable"); setEstimate(null); }
      else                      { setEstimate(d); setEnterpriseRequired(false); }
    } catch { setEstError("Network error"); }
    setEstLoading(false);
  }, [fromCoin, toCoin, amount]);

  useEffect(() => { fetchEstimate(); }, [fetchEstimate, refreshKey]);

  const minAmt = fromCoin?.minAmount ? parseFloat(fromCoin.minAmount) : null;
  const maxAmt = fromCoin?.maxAmount ? parseFloat(fromCoin.maxAmount) : null;
  const numAmt = amount !== "" ? parseFloat(amount) : null;
  const belowMin = minAmt !== null && numAmt !== null && numAmt < minAmt;
  const aboveMax = maxAmt !== null && numAmt !== null && numAmt > maxAmt;

  const canContinue = fromCoin && toCoin && numAmt && numAmt > 0 && !belowMin && !aboveMax;

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-white/40">Step 1/3</p>
          <h2 className="text-lg font-bold text-white">Choose deposit amount</h2>
        </div>
        {fromCoin && toCoin && numAmt && numAmt > 0 && (
          <Countdown key={refreshKey} seconds={RATE_REFRESH} onEnd={() => setRefreshKey(k => k + 1)} />
        )}
      </div>

      {/* You send */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 mb-1">
        <p className="text-xs text-white/40 mb-2">You Send</p>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <input type="number" min="0" placeholder="0.0" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-xl font-bold text-white outline-none placeholder:text-white/20 focus:border-white/30 transition-colors" />
          </div>
        </div>
        <div className="mb-2">
          <CoinPicker coins={coins} selected={fromCoin} onChange={c => { setFromCoin(c); setEstimate(null); }} exclude={toCoin?.symbol} />
        </div>
        {fromCoin?.minAmount && (
          <p className={cn("text-xs mt-1", belowMin || aboveMax ? "text-red-400" : "text-emerald-400/80")}>
            Min: <span className="font-mono">{fmtNum(fromCoin.minAmount)} {fromCoin.symbol}</span>
            {fromCoin.maxAmount && <>&nbsp; Max: <span className="font-mono">{fmtNum(fromCoin.maxAmount, 7)} {fromCoin.symbol}</span></>}
          </p>
        )}
      </div>

      {/* Swap direction */}
      <div className="flex justify-center my-2">
        <button type="button" onClick={() => { const t = fromCoin; setFromCoin(toCoin); setToCoin(t); setEstimate(null); }}
          className="p-2.5 rounded-full bg-[#2a2a2a] border border-white/10 hover:bg-[#333] hover:border-white/20 transition-colors">
          <ArrowUpDown className="w-4 h-4 text-white/50" />
        </button>
      </div>

      {/* You get */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 mb-3">
        <p className="text-xs text-white/40 mb-2">You Get</p>
        <div className="mb-2">
          {/* Estimated output */}
          <div className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 mb-2 min-h-[52px] flex items-center">
            {estLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white/30" />
            ) : estimate ? (
              <span className="text-xl font-bold text-white font-mono">{fmtNum(estimate.withdrawal_amount, 8)}</span>
            ) : enterpriseRequired ? (
              <span className="text-sm text-white/30 italic">Rate available after API upgrade</span>
            ) : estError ? (
              <span className="text-sm text-red-400/80">{estError}</span>
            ) : (
              <span className="text-xl font-bold text-white/20">≈</span>
            )}
          </div>
          <CoinPicker coins={coins} selected={toCoin} onChange={c => { setToCoin(c); setEstimate(null); }} exclude={fromCoin?.symbol} />
        </div>

        {/* Rate line */}
        {estimate?.rate && fromCoin && toCoin && (
          <p className="text-xs text-white/40 mt-1">
            1 {fromCoin.symbol} ≈ <span className="text-emerald-400 font-mono">{fmtNum(estimate.rate, 8)} {toCoin.symbol}</span>
          </p>
        )}
        {enterpriseRequired && (
          <p className="text-[11px] text-yellow-400/70 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Enterprise API key needed for live rates
          </p>
        )}
      </div>

      {/* Continue */}
      <button type="button" disabled={!canContinue}
        onClick={() => canContinue && fromCoin && toCoin && onContinue(fromCoin, toCoin, amount, estimate)}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          canContinue
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-[#2a2a2a] text-white/30 cursor-not-allowed")}>
        {!fromCoin || !toCoin ? "Select coins" :
         belowMin ? `Below minimum (${fmtNum(fromCoin.minAmount)} ${fromCoin.symbol})` :
         aboveMax ? `Above maximum (${fmtNum(fromCoin.maxAmount, 7)} ${fromCoin.symbol})` :
         !numAmt  ? "Enter amount" :
                    "Continue"}
      </button>
    </div>
  );
}

// ─── Step 2: Address ──────────────────────────────────────────────────────────

function StepAddress({ fromCoin, toCoin, amount, estimate, onBack, onContinue }: {
  fromCoin: LeCoin; toCoin: LeCoin; amount: string; estimate: Estimate|null;
  onBack: () => void;
  onContinue: (address: string, extraId: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [extraId, setExtraId] = useState("");
  const [refund,  setRefund]  = useState("");
  const [showRefund, setShowRefund] = useState(false);

  const addrOk = address.trim().length >= 10;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-2">
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs text-white/40">Step 2/3</p>
          <h2 className="text-lg font-bold text-white">Withdrawal Setup</h2>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 space-y-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={fromCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{fromCoin.symbol} <span className="text-white/40 font-normal text-xs">{fromCoin.networkName ?? fromCoin.network ?? ""}</span></p>
            <p className="text-xs text-white/40">You send</p>
          </div>
          <div className="ml-auto text-right">
            <p className="font-bold text-base font-mono">{amount}</p>
          </div>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex items-center gap-3">
          <CoinLogo symbol={toCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{toCoin.symbol} <span className="text-white/40 font-normal text-xs">{toCoin.networkName ?? toCoin.network ?? ""}</span></p>
            <p className="text-xs text-white/40">You receive</p>
          </div>
          <div className="ml-auto text-right">
            {estimate ? (
              <p className="font-bold text-base text-emerald-400 font-mono">≈{fmtNum(estimate.withdrawal_amount, 8)}</p>
            ) : (
              <p className="text-sm text-white/30">Live rate</p>
            )}
          </div>
        </div>
      </div>

      {/* Recipient address */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-white">Recipient</label>
        <p className="text-xs text-white/40">Your {toCoin.symbol} wallet address on the {toCoin.networkName ?? toCoin.network ?? toCoin.symbol} network</p>
        <div className="relative">
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder={`${toCoin.symbol} wallet address`}
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors pr-12" />
          {address && <CopyButton text={address} className="absolute right-2 top-1/2 -translate-y-1/2" />}
        </div>
        <p className="text-[11px] text-yellow-400/70">
          ⚠ The currency will be lost if the wallet address and network don't match.
        </p>
      </div>

      {/* Extra ID (memo / tag) */}
      {toCoin.hasExtraId && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white">Memo / Tag <span className="text-white/40 font-normal">(required)</span></label>
          <input value={extraId} onChange={e => setExtraId(e.target.value)}
            placeholder="Destination tag or memo"
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors" />
        </div>
      )}

      {/* Optional refund address */}
      <button type="button" onClick={() => setShowRefund(v => !v)}
        className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1 transition-colors">
        <ChevronDown className={cn("w-3 h-3 transition-transform", showRefund && "rotate-180")} />
        Add refund address (optional)
      </button>
      {showRefund && (
        <input value={refund} onChange={e => setRefund(e.target.value)}
          placeholder={`${fromCoin.symbol} refund address`}
          className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors" />
      )}

      <button type="button" disabled={!addrOk || (toCoin.hasExtraId && !extraId.trim())}
        onClick={() => addrOk && onContinue(address.trim(), extraId.trim())}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          addrOk && !(toCoin.hasExtraId && !extraId.trim())
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-[#2a2a2a] text-white/30 cursor-not-allowed")}>
        Continue
      </button>
    </div>
  );
}

// ─── Step 3: Deposit + Tracking ───────────────────────────────────────────────

function StepDeposit({ order, fromCoin, toCoin, onBack }: {
  order: OrderResult; fromCoin: LeCoin; toCoin: LeCoin; onBack: () => void;
}) {
  const [status,      setStatus]      = useState<StatusResult|null>(null);
  const [statusError, setStatusError] = useState(false);
  const [infoOpen,    setInfoOpen]    = useState(false);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/letsexchange/status/${order.id}`);
      const d = await r.json();
      if (r.ok && d.id) setStatus(d);
      else setStatusError(true);
    } catch { setStatusError(true); }
  }, [order.id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus, refreshKey]);

  const currentStatus = status?.status ?? order.status ?? "waiting";
  const isDone = ["finished", "failed", "refunded"].includes(currentStatus);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-white/40">Step 3/3</p>
            {!isDone && (
              <Countdown key={refreshKey} seconds={15} onEnd={() => setRefreshKey(k => k + 1)} />
            )}
          </div>
          <h2 className="text-lg font-bold text-white">Send by one transaction</h2>
        </div>
      </div>

      {/* Amount to send */}
      <div className="rounded-xl bg-[#1e1e1e] p-4">
        <p className="text-2xl font-bold text-white">
          <span className="text-emerald-400 font-mono">{fmtNum(order.deposit_amount, 8)} {fromCoin.symbol}</span>
          <span className="text-white/40 text-base font-normal ml-2">({fromCoin.networkName ?? fromCoin.network ?? fromCoin.symbol})</span>
        </p>
      </div>

      {/* Status */}
      {status && (
        <div className="rounded-xl bg-[#1e1e1e] p-3 flex items-center gap-3">
          {isDone ? (
            currentStatus === "finished"
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              : <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
          )}
          <div>
            <p className={cn("font-semibold text-sm", STATUS_COLOR[currentStatus] ?? "text-white")}>
              {STATUS_LABEL[currentStatus] ?? currentStatus}
            </p>
            {status.withdrawal_amount && (
              <p className="text-xs text-white/40">You receive: <span className="text-emerald-400 font-mono">{fmtNum(status.withdrawal_amount, 8)} {toCoin.symbol}</span></p>
            )}
          </div>
        </div>
      )}
      {statusError && (
        <p className="text-xs text-yellow-400/70 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Could not fetch status — check back soon
        </p>
      )}

      {/* Deposit address */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">Deposit {fromCoin.symbol} address</p>
        <div className="rounded-xl bg-[#1e1e1e] border border-white/10 px-4 py-3 flex items-center gap-2">
          <CoinLogo symbol={fromCoin.symbol} size={20} />
          <p className="flex-1 min-w-0 text-sm text-white/80 font-mono truncate">{order.deposit_address}</p>
          <CopyButton text={order.deposit_address} />
        </div>
      </div>

      {/* QR code */}
      <div className="rounded-2xl bg-white p-4 flex justify-center items-center">
        <QRCodeSVG value={order.deposit_address} size={200} bgColor="#ffffff" fgColor="#000000" />
      </div>

      {/* Rate + TX ID */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 space-y-1.5">
        {order.rate && (
          <p className="text-xs text-white/40">
            Fixed Rate: 1 {fromCoin.symbol} ≈ <span className="text-emerald-400 font-mono">{fmtNum(order.rate, 8)} {toCoin.symbol}</span>
          </p>
        )}
        <div className="flex items-center gap-2">
          <p className="text-xs text-white/40">Transaction ID:</p>
          <p className="text-xs text-emerald-400 font-mono">{shortAddr(order.id)}</p>
          <CopyButton text={order.id} />
        </div>
      </div>

      {/* Transaction info expandable */}
      <div className="rounded-xl bg-[#1e1e1e] border border-white/10 overflow-hidden">
        <button type="button" onClick={() => setInfoOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
          <span className="font-semibold text-sm">Transaction info</span>
          <span className="text-white/40 text-lg">{infoOpen ? "−" : "+"}</span>
        </button>
        {infoOpen && (
          <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3 text-xs text-white/60">
            <div className="flex justify-between"><span>You send</span><span className="font-mono text-white">{fmtNum(order.deposit_amount, 8)} {fromCoin.symbol}</span></div>
            <div className="flex justify-between"><span>You receive</span><span className="font-mono text-emerald-400">≈{fmtNum(order.withdrawal_amount, 8)} {toCoin.symbol}</span></div>
            <div className="flex justify-between"><span>To address</span><span className="font-mono text-white/80 truncate ml-2 text-right">{shortAddr(order.withdrawal_address)}</span></div>
            <div className="flex justify-between"><span>Order ID</span><span className="font-mono text-emerald-400">{shortAddr(order.id)}</span></div>
            {status?.hash_in && (
              <div className="flex justify-between gap-2">
                <span>Deposit TX</span>
                <span className="font-mono text-emerald-400 truncate">{shortAddr(status.hash_in)}</span>
              </div>
            )}
            {status?.hash_out && (
              <div className="flex justify-between gap-2">
                <span>Withdrawal TX</span>
                <span className="font-mono text-emerald-400 truncate">{shortAddr(status.hash_out)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Enterprise notice (shown when key upgrade is required for full flow) ────

function EnterpriseNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Zap className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm text-yellow-300">Enterprise API Key Required</p>
          <p className="text-xs text-yellow-400/80 mt-1">
            Live rates, order creation, and transaction tracking require a LetsExchange Enterprise API key.
            Your current key is a standard affiliate key that provides coin data only.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-white/60 font-semibold">How to get Enterprise access:</p>
        <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
          <li>Email <span className="text-white/80 font-mono">partners@letsexchange.io</span></li>
          <li>Mention partner ID <span className="text-white/80 font-mono">1692</span> and request full API access</li>
          <li>Once upgraded, the same API key will unlock all endpoints</li>
        </ol>
        <a href="https://letsexchange.io/partners" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300 transition-colors">
          LetsExchange Partner Portal <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <button type="button" onClick={onDismiss} className="text-xs text-white/40 hover:text-white/60 transition-colors">
        Dismiss
      </button>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function LetsExchangePanel() {
  const [coins,     setCoins]     = useState<LeCoin[]>([]);
  const [coinsErr,  setCoinsErr]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  const [step,         setStep]         = useState<1|2|3>(1);
  const [fromCoin,     setFromCoin]     = useState<LeCoin|null>(null);
  const [toCoin,       setToCoin]       = useState<LeCoin|null>(null);
  const [sendAmount,   setSendAmount]   = useState("");
  const [lastEstimate, setLastEstimate] = useState<Estimate|null>(null);

  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState<string|null>(null);
  const [order,        setOrder]        = useState<OrderResult|null>(null);
  const [showEnterprise, setShowEnterprise] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/letsexchange/currencies`);
        const d = await r.json();
        if (!cancelled) {
          if (r.ok && Array.isArray(d)) setCoins(d);
          else setCoinsErr(true);
        }
      } catch { if (!cancelled) setCoinsErr(true); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Step 1 → 2
  const handleAmountContinue = (from: LeCoin, to: LeCoin, amt: string, est: Estimate|null) => {
    setFromCoin(from); setToCoin(to); setSendAmount(amt); setLastEstimate(est);
    setStep(2);
  };

  // Step 2 → 3 (create order)
  const handleAddressContinue = async (address: string, extraId: string) => {
    if (!fromCoin || !toCoin) return;
    setCreating(true); setCreateError(null);
    try {
      const body: Record<string,unknown> = {
        coin_from: fromCoin.symbol, coin_to: toCoin.symbol,
        deposit_amount: parseFloat(sendAmount),
        withdrawal_address: address,
        network_from: fromCoin.network ?? undefined,
        network_to:   toCoin.network   ?? undefined,
      };
      if (extraId) body.withdrawal_extra_id = extraId;

      const r = await fetch(`${API}/letsexchange/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (d.enterpriseRequired) {
        setShowEnterprise(true);
        setCreating(false);
        return;
      }
      if (!r.ok) {
        setCreateError(d.error ?? "Failed to create exchange");
        setCreating(false);
        return;
      }
      setOrder(d);
      setStep(3);
    } catch { setCreateError("Network error — please try again"); }
    setCreating(false);
  };

  // ── Loading / error states ──────────────────────────────────────────────────
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

  // ── Panel chrome ────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border bg-[#111] shadow-xl overflow-hidden">
      {/* Top strip */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Zap className="w-4 h-4 text-yellow-400" />
          Cross-Chain Exchange
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 font-semibold">
          {coins.length}+ coins
        </span>
      </div>

      <div className="px-4 pb-4 pt-2">
        {/* Enterprise notice */}
        {showEnterprise && <div className="mb-4"><EnterpriseNotice onDismiss={() => setShowEnterprise(false)} /></div>}

        {/* Create error */}
        {createError && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {createError}
          </div>
        )}

        {/* Creating spinner */}
        {creating && (
          <div className="mb-4 rounded-xl bg-white/5 p-3 flex items-center gap-3 text-sm text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" /> Creating exchange order…
          </div>
        )}

        {step === 1 && (
          <StepAmount coins={coins} onContinue={handleAmountContinue} />
        )}
        {step === 2 && fromCoin && toCoin && (
          <StepAddress
            fromCoin={fromCoin} toCoin={toCoin} amount={sendAmount} estimate={lastEstimate}
            onBack={() => setStep(1)}
            onContinue={handleAddressContinue}
          />
        )}
        {step === 3 && order && fromCoin && toCoin && (
          <StepDeposit order={order} fromCoin={fromCoin} toCoin={toCoin} onBack={() => setStep(2)} />
        )}
      </div>
    </div>
  );
}
