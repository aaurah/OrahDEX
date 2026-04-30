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
  Clock, ExternalLink, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { API_BASE } from "@/lib/api";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = API_BASE;
const RATE_REFRESH = 10;

function fmtNum(n: string|number|null|undefined, sig = 6): string {
  if (n == null || n === "") return "–";
  const v = parseFloat(String(n));
  return isNaN(v) ? "–" : v.toPrecision(sig).replace(/\.?0+$/, "");
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
  const copy = () => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); };
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
  const [refreshKey, setRefreshKey] = useState(0);

  // Pre-select BTC → BSV
  useEffect(() => {
    if (!coins.length) return;
    const btc = coins.find(c => c.symbol === "BTC" && c.network === "BTC");
    const bsv = coins.find(c => c.symbol === "BSV" && c.network === "BSV");
    const eth = coins.find(c => c.symbol === "ETH" && c.network === "ETH");
    if (btc) setFromCoin(btc);
    if (bsv ?? eth) setToCoin(bsv ?? eth ?? null);
  }, [coins]);

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
          float:        false,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setEstError(d.error ?? "Rate unavailable"); setEstimate(null); }
      else { setEstimate(d as Estimate); }
    } catch { setEstError("Network error"); }
    setEstLoading(false);
  }, [fromCoin, toCoin, amount]);

  useEffect(() => { fetchEstimate(); }, [fetchEstimate, refreshKey]);

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
          <p className="text-xs text-white/40">Step 1/3</p>
          <h2 className="text-lg font-bold text-white">Choose deposit amount</h2>
        </div>
        {estimate && (
          <Countdown key={`${refreshKey}-${estimate.rate_id ?? ""}`}
            seconds={Math.min(rateSecondsLeft, RATE_REFRESH)}
            onEnd={() => setRefreshKey(k => k + 1)} />
        )}
      </div>

      {/* You send */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 mb-1">
        <p className="text-xs text-white/40 mb-2">You Send</p>
        <input type="number" min="0" placeholder="0.0" value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 mb-2 text-xl font-bold text-white outline-none placeholder:text-white/20 focus:border-white/30 transition-colors" />
        <CoinPicker coins={coins} selected={fromCoin} onChange={c => { setFromCoin(c); setEstimate(null); }} exclude={toCoin?.symbol} />
        {(minAmt !== null || maxAmt !== null) && fromCoin && (
          <p className={cn("text-xs mt-2", belowMin || aboveMax ? "text-red-400" : "text-emerald-400/80")}>
            Min: <span className="font-mono">{fmtNum(minAmt)} {fromCoin.symbol}</span>
            {maxAmt !== null && <>&nbsp;&nbsp;Max: <span className="font-mono">{fmtNum(maxAmt, 7)} {fromCoin.symbol}</span></>}
          </p>
        )}
      </div>

      {/* Swap direction */}
      <div className="flex justify-center my-2">
        <button type="button" onClick={() => { const t = fromCoin; setFromCoin(toCoin); setToCoin(t); setEstimate(null); setAmount(""); }}
          className="p-2.5 rounded-full bg-[#2a2a2a] border border-white/10 hover:bg-[#333] hover:border-white/20 transition-colors">
          <ArrowUpDown className="w-4 h-4 text-white/50" />
        </button>
      </div>

      {/* You get */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 mb-3">
        <p className="text-xs text-white/40 mb-2">You Get</p>
        <div className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 mb-2 min-h-[52px] flex items-center">
          {estLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white/30" />
          ) : estimate ? (
            <span className="text-xl font-bold text-emerald-400 font-mono">{fmtNum(estimate.amount, 8)}</span>
          ) : estError ? (
            <span className="text-sm text-red-400/80">{estError}</span>
          ) : (
            <span className="text-xl font-bold text-white/20">≈</span>
          )}
        </div>
        <CoinPicker coins={coins} selected={toCoin} onChange={c => { setToCoin(c); setEstimate(null); }} exclude={fromCoin?.symbol} />

        {/* Rate + fixed rate badge */}
        {estimate && fromCoin && toCoin && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <p className="text-xs text-white/40">
              1 {fromCoin.symbol} ≈ <span className="text-emerald-400 font-mono">{fmtNum(estimate.rate, 8)} {toCoin.symbol}</span>
            </p>
            {estimate.rate_id && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                <Lock className="w-2.5 h-2.5" /> Fixed Rate
              </span>
            )}
          </div>
        )}
        {estimate?.withdrawal_fee && parseFloat(estimate.withdrawal_fee) > 0 && toCoin && (
          <p className="text-[11px] text-white/30 mt-1">
            Network fee: <span className="font-mono">{fmtNum(estimate.withdrawal_fee, 6)} {toCoin.symbol}</span>
          </p>
        )}
      </div>

      <button type="button" disabled={!canContinue}
        onClick={() => canContinue && fromCoin && toCoin && onContinue(fromCoin, toCoin, amount, estimate)}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          canContinue
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-[#2a2a2a] text-white/30 cursor-not-allowed")}>
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

function StepAddress({ fromCoin, toCoin, amount, estimate, onBack, onContinue }: {
  fromCoin: LeCoin; toCoin: LeCoin; amount: string; estimate: Estimate|null;
  onBack: () => void;
  onContinue: (address: string, extraId: string) => void;
}) {
  const [address,    setAddress]    = useState("");
  const [extraId,    setExtraId]    = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refund,     setRefund]     = useState("");

  const addrOk = address.trim().length >= 10;
  const extraOk = !toCoin.hasExtraId || extraId.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs text-white/40">Step 2/3</p>
          <h2 className="text-lg font-bold text-white">Withdrawal Setup</h2>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 space-y-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={fromCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{fromCoin.symbol} <span className="text-white/40 font-normal text-xs">{fromCoin.networkName ?? fromCoin.network ?? ""}</span></p>
            <p className="text-xs text-white/40">You send</p>
          </div>
          <p className="ml-auto font-bold text-base font-mono">{amount}</p>
        </div>
        <div className="h-px bg-white/10" />
        <div className="flex items-center gap-3">
          <CoinLogo symbol={toCoin.symbol} size={32} />
          <div>
            <p className="text-sm font-bold">{toCoin.symbol} <span className="text-white/40 font-normal text-xs">{toCoin.networkName ?? toCoin.network ?? ""}</span></p>
            <p className="text-xs text-white/40">You receive</p>
          </div>
          {estimate ? (
            <p className="ml-auto font-bold text-base text-emerald-400 font-mono">≈{fmtNum(estimate.amount, 8)}</p>
          ) : (
            <p className="ml-auto text-sm text-white/30">Live rate</p>
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
        <label className="text-sm font-semibold text-white">Your {toCoin.symbol} receiving address</label>
        <p className="text-xs text-white/40">
          On the <span className="text-white/70">{toCoin.networkName ?? toCoin.network ?? toCoin.symbol}</span> network
        </p>
        <div className="relative">
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder={`${toCoin.symbol} wallet address`}
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors pr-12" />
          {address && <CopyButton text={address} className="absolute right-2 top-1/2 -translate-y-1/2" />}
        </div>
        <p className="text-[11px] text-yellow-400/70">
          ⚠ Funds will be lost if the address or network don't match.
        </p>
      </div>

      {/* Extra ID */}
      {toCoin.hasExtraId && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-white">Memo / Tag <span className="text-red-400 text-xs">required</span></label>
          <input value={extraId} onChange={e => setExtraId(e.target.value)}
            placeholder="Destination tag or memo"
            className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors" />
        </div>
      )}

      {/* Optional refund address */}
      <button type="button" onClick={() => setShowRefund(v => !v)}
        className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1 transition-colors w-fit">
        <ChevronDown className={cn("w-3 h-3 transition-transform", showRefund && "rotate-180")} />
        Add refund address (optional)
      </button>
      {showRefund && (
        <input value={refund} onChange={e => setRefund(e.target.value)}
          placeholder={`${fromCoin.symbol} refund address (if exchange fails)`}
          className="w-full bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 transition-colors" />
      )}

      <button type="button" disabled={!addrOk || !extraOk}
        onClick={() => addrOk && extraOk && onContinue(address.trim(), extraId.trim())}
        className={cn("w-full py-4 rounded-xl font-bold text-base transition-all",
          addrOk && extraOk
            ? "bg-emerald-500 hover:bg-emerald-400 text-black active:scale-[0.98]"
            : "bg-[#2a2a2a] text-white/30 cursor-not-allowed")}>
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
        <button type="button" onClick={onBack} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-white/40">Step 3/3</p>
            {!isDone && <Countdown key={refreshKey} seconds={15} onEnd={() => setRefreshKey(k => k + 1)} />}
          </div>
          <h2 className="text-lg font-bold text-white">Send by one transaction</h2>
        </div>
      </div>

      {/* Amount to send */}
      <div className="rounded-xl bg-[#1e1e1e] p-4">
        <p className="text-xs text-white/40 mb-1">Send exactly</p>
        <p className="text-2xl font-bold">
          <span className="text-emerald-400 font-mono">{fmtNum(order.deposit_amount, 8)}</span>
          <span className="text-white ml-2">{fromCoin.symbol}</span>
          <span className="text-white/40 text-base font-normal ml-2">({fromCoin.networkName ?? fromCoin.network ?? fromCoin.symbol})</span>
        </p>
        <p className="text-xs text-yellow-400/70 mt-1">Send only the exact amount — do not split across multiple transactions</p>
      </div>

      {/* Status */}
      <div className="rounded-xl bg-[#1e1e1e] p-3 flex items-center gap-3">
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
            <p className="text-xs text-white/40 mt-0.5">
              You receive: <span className="text-emerald-400 font-mono">{fmtNum(status?.real_withdrawal_amount ?? order.withdrawal_amount, 8)} {toCoin.symbol}</span>
            </p>
          )}
        </div>
        {statusError && <AlertTriangle className="w-4 h-4 text-yellow-400/50 shrink-0" />}
      </div>

      {/* Deposit address */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-white">Deposit address for {fromCoin.symbol}</p>
        <div className="rounded-xl bg-[#1e1e1e] border border-white/10 px-4 py-3 flex items-center gap-2">
          <CoinLogo symbol={fromCoin.symbol} size={20} />
          <p className="flex-1 min-w-0 text-sm text-white/80 font-mono break-all">{order.deposit}</p>
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
      <div className="rounded-xl bg-[#1e1e1e] p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Exchange ID</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-emerald-400 font-mono">{shortAddr(order.transaction_id)}</span>
            <CopyButton text={order.transaction_id} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Rate</span>
          <span className="text-xs text-white/70 font-mono">
            {order.rate ? `1 ${fromCoin.symbol} ≈ ${fmtNum(order.rate, 8)} ${toCoin.symbol}` : "Float"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">You get</span>
          <span className="text-xs text-emerald-400 font-mono">{fmtNum(order.withdrawal_amount, 8)} {toCoin.symbol}</span>
        </div>
      </div>

      {/* Transaction info expandable */}
      <div className="rounded-xl bg-[#1e1e1e] border border-white/10 overflow-hidden">
        <button type="button" onClick={() => setInfoOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
          <span className="font-semibold text-sm flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-white/30" /> Transaction info
          </span>
          <span className="text-white/40 text-lg">{infoOpen ? "−" : "+"}</span>
        </button>
        {infoOpen && (
          <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3 text-xs">
            <div className="flex justify-between gap-2"><span className="text-white/40">You send</span><span className="font-mono text-white">{fmtNum(order.deposit_amount, 8)} {fromCoin.symbol}</span></div>
            <div className="flex justify-between gap-2"><span className="text-white/40">You receive</span><span className="font-mono text-emerald-400">≈{fmtNum(order.withdrawal_amount, 8)} {toCoin.symbol}</span></div>
            <div className="flex justify-between gap-2"><span className="text-white/40">To address</span><span className="font-mono text-white/80 truncate ml-4 text-right">{shortAddr(order.withdrawal)}</span></div>
            <div className="flex justify-between gap-2"><span className="text-white/40">Order ID</span><span className="font-mono text-emerald-400">{order.transaction_id}</span></div>
            {status?.hash_in && (
              <div className="flex justify-between gap-2"><span className="text-white/40">Deposit TX</span><span className="font-mono text-white/70 truncate ml-4">{shortAddr(status.hash_in)}</span></div>
            )}
            {status?.hash_out && (
              <div className="flex justify-between gap-2"><span className="text-white/40">Withdrawal TX</span><span className="font-mono text-white/70 truncate ml-4">{shortAddr(status.hash_out)}</span></div>
            )}
          </div>
        )}
      </div>

      {/* Support link + new exchange */}
      <div className="flex items-center justify-between">
        <a href={`https://letsexchange.io/track/${order.transaction_id}`} target="_blank" rel="noopener noreferrer"
          className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1 transition-colors">
          Track on LetsExchange <ExternalLink className="w-3 h-3" />
        </a>
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

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function LetsExchangePanel() {
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
        float:               false,
      };
      // Include rate_id for fixed-rate exchange if we have one and it hasn't expired
      if (estimate?.rate_id) {
        const expiry = estimate.rate_id_expired_at ? parseInt(estimate.rate_id_expired_at) : 0;
        if (expiry > Date.now()) body.rate_id = estimate.rate_id;
      }

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
      setOrder(d as OrderResult);
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
    <div className="rounded-2xl border border-border bg-[#111] shadow-xl overflow-hidden">
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
        {createError && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{createError}</span>
          </div>
        )}
        {creating && (
          <div className="mb-4 rounded-xl bg-white/5 p-3 flex items-center gap-3 text-sm text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" /> Creating exchange order…
          </div>
        )}

        {step === 1 && <StepAmount coins={coins} onContinue={handleAmountContinue} />}
        {step === 2 && fromCoin && toCoin && (
          <StepAddress fromCoin={fromCoin} toCoin={toCoin} amount={sendAmount} estimate={estimate}
            onBack={() => setStep(1)} onContinue={handleAddressContinue} />
        )}
        {step === 3 && order && fromCoin && toCoin && (
          <StepDeposit order={order} fromCoin={fromCoin} toCoin={toCoin}
            onBack={() => setStep(2)} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}
