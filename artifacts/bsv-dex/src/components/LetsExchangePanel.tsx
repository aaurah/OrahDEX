/**
 * LetsExchangePanel.tsx
 *
 * A full cross-chain swap panel powered by LetsExchange.io.
 * Supports 6000+ coin pairs across 100+ blockchains.
 *
 * Flow:
 *  1. User picks FROM coin and TO coin (searched from full coin list)
 *  2. Enter amount — live estimate appears
 *  3. Enter destination address
 *  4. Click "Create Exchange" — backend proxies to LetsExchange API
 *  5. User sends funds to the displayed deposit address
 *  6. Status polling shows progress
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ArrowUpDown, Search, Loader2, CheckCircle2,
  AlertTriangle, ExternalLink, Copy, RefreshCw, X, ChevronDown,
  ArrowRight, Clock, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeCoin {
  symbol: string;
  name: string;
  network?: string;
  image?: string;
  hasExternalId?: boolean;
  addressRegex?: string;
}

interface LeEstimate {
  from: string;
  to: string;
  amount: string;
  result: string;
  networkFee?: string;
  rate?: string;
}

interface LeExchange {
  id: string;
  status: string;
  payinAddress: string;
  payinExtraId?: string;
  payinAmount: string;
  payoutAddress: string;
  fromCurrency: string;
  toCurrency: string;
  amountExpectedFrom: string;
  amountExpectedTo: string;
  createdAt?: string;
}

type OrderStatus =
  | "waiting"
  | "confirming"
  | "exchanging"
  | "sending"
  | "finished"
  | "failed"
  | "refunded"
  | "expired";

const STATUS_LABELS: Record<string, string> = {
  waiting:    "Waiting for deposit",
  confirming: "Confirming",
  exchanging: "Exchanging",
  sending:    "Sending funds",
  finished:   "Completed",
  failed:     "Failed",
  refunded:   "Refunded",
  expired:    "Expired",
};

// ─── Coin picker ─────────────────────────────────────────────────────────────

function CoinPicker({
  coins,
  selected,
  onChange,
  label,
  exclude,
}: {
  coins: LeCoin[];
  selected: LeCoin | null;
  onChange: (c: LeCoin) => void;
  label: string;
  exclude?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [q,    setQ]      = useState("");
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    const list = exclude ? coins.filter(c => c.symbol !== exclude) : coins;
    if (!query) return list.slice(0, 120);
    return list
      .filter(c =>
        c.symbol.toLowerCase().includes(query) ||
        c.name?.toLowerCase().includes(query) ||
        c.network?.toLowerCase().includes(query),
      )
      .slice(0, 80);
  }, [coins, q, exclude]);

  return (
    <div className="relative">
      <p className="text-[10px] text-muted-foreground mb-1 font-medium uppercase tracking-wider">{label}</p>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted border border-border/40 hover:border-border/80 transition-colors w-full"
      >
        {selected ? (
          <>
            <CoinLogo symbol={selected.symbol} size={22} />
            <div className="text-left flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">{selected.symbol}</p>
              {selected.network && (
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{selected.network}</p>
              )}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-sm flex-1 text-left">Select coin</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 340 }}>
          <div className="p-2.5 border-b border-border/60 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              placeholder={`Search ${coins.length.toLocaleString()} coins…`}
              value={q}
              onChange={e => setQ(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
            {q && (
              <button onClick={() => setQ("")}>
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
            <button onClick={() => setOpen(false)}>
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No coins found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={`${c.symbol}-${c.network ?? ""}`}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors text-left",
                    selected?.symbol === c.symbol && selected?.network === c.network && "bg-primary/5",
                  )}
                >
                  <CoinLogo symbol={c.symbol} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{c.symbol}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight truncate">
                      {c.name}{c.network ? ` · ${c.network}` : ""}
                    </p>
                  </div>
                  {selected?.symbol === c.symbol && selected?.network === c.network && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
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

// ─── Order status tracker ────────────────────────────────────────────────────

function OrderTracker({ orderId, onReset }: { orderId: string; onReset: () => void }) {
  const { toast } = useToast();
  const [order, setOrder]     = useState<LeExchange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/letsexchange/status/${orderId}`);
      const d = await r.json();
      if (r.ok) setOrder(d);
      else setError(d.error ?? "Failed to fetch status");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const copyText = (t: string) => {
    navigator.clipboard.writeText(t).catch(() => {});
    toast({ title: "Copied!", description: t.slice(0, 40) + (t.length > 40 ? "…" : "") });
  };

  const status: OrderStatus = (order?.status as OrderStatus) ?? "waiting";
  const isDone  = status === "finished" || status === "failed" || status === "refunded" || status === "expired";
  const isOk    = status === "finished";

  const steps: OrderStatus[] = ["waiting", "confirming", "exchanging", "sending", "finished"];
  const stepIdx = steps.indexOf(status);

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
        <AlertTriangle className="w-4 h-4 inline mr-1" />{error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress steps */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 min-w-0">
            <div className={cn(
              "flex-1 h-1 rounded-full transition-colors",
              i <= stepIdx && !["failed","refunded","expired"].includes(status)
                ? "bg-primary" : "bg-muted/60",
            )} />
            {i < steps.length - 1 && <div className="w-1" />}
          </div>
        ))}
      </div>

      {/* Status badge */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold",
        isOk  ? "bg-green-500/10 border-green-500/20 text-green-400" :
        ["failed","expired","refunded"].includes(status) ? "bg-red-500/10 border-red-500/20 text-red-400" :
        "bg-primary/10 border-primary/20 text-primary",
      )}>
        {isDone && isOk  && <CheckCircle2 className="w-4 h-4 shrink-0" />}
        {isDone && !isOk && <AlertTriangle className="w-4 h-4 shrink-0" />}
        {!isDone          && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
        {STATUS_LABELS[status] ?? status}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">ID: {orderId.slice(0, 10)}…</span>
      </div>

      {/* Deposit address — shown while waiting */}
      {order && (status === "waiting" || status === "confirming") && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-2 border border-border/40">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Send exactly
          </p>
          <p className="text-lg font-bold">
            {order.amountExpectedFrom} <span className="text-primary">{order.fromCurrency}</span>
          </p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mt-2">To address</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs break-all font-mono bg-muted/60 px-2 py-1.5 rounded-lg">
              {order.payinAddress}
            </code>
            <button
              onClick={() => copyText(order.payinAddress)}
              className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          {order.payinExtraId && (
            <>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Memo / Extra ID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs break-all font-mono bg-muted/60 px-2 py-1.5 rounded-lg">
                  {order.payinExtraId}
                </code>
                <button
                  onClick={() => copyText(order.payinExtraId!)}
                  className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-amber-400 font-semibold">
                ⚠ This coin requires a memo/tag — include it or your funds may be lost.
              </p>
            </>
          )}
          <p className="text-[11px] text-muted-foreground/60">
            You will receive ≈ {order.amountExpectedTo} {order.toCurrency} at {order.payoutAddress.slice(0, 16)}…
          </p>
        </div>
      )}

      {/* Finished */}
      {isOk && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
          Exchange complete! Funds sent to your address.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={fetchStatus}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border border-border/60 hover:bg-muted/60 transition-colors text-muted-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        {isDone && (
          <button
            onClick={onReset}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors"
          >
            New Exchange
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LetsExchangePanel() {
  const { toast } = useToast();

  const [coins,      setCoins]      = useState<LeCoin[]>([]);
  const [coinsError, setCoinsError] = useState(false);
  const [loadingCoins, setLoadingCoins] = useState(true);

  const [fromCoin, setFromCoin] = useState<LeCoin | null>(null);
  const [toCoin,   setToCoin]   = useState<LeCoin | null>(null);
  const [amount,   setAmount]   = useState("");
  const [destAddr, setDestAddr] = useState("");
  const [extraId,  setExtraId]  = useState("");

  const [estimate,     setEstimate]     = useState<LeEstimate | null>(null);
  const [estimating,   setEstimating]   = useState(false);
  const [estimateErr,  setEstimateErr]  = useState<string | null>(null);
  const [minAmount,    setMinAmount]    = useState<string | null>(null);

  const [creating,   setCreating]   = useState(false);
  const [orderId,    setOrderId]    = useState<string | null>(null);

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load full coin list on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/letsexchange/currencies`);
        const d = await r.json();
        if (cancelled) return;
        if (r.ok && Array.isArray(d)) {
          setCoins(d);
          // Default selections
          const btc  = d.find((c: LeCoin) => c.symbol === "BTC" && (!c.network || c.network === "BTC"));
          const usdt = d.find((c: LeCoin) => c.symbol === "USDT" && c.network === "TRC20");
          if (btc)  setFromCoin(btc);
          if (usdt) setToCoin(usdt);
        } else {
          setCoinsError(true);
        }
      } catch {
        if (!cancelled) setCoinsError(true);
      }
      if (!cancelled) setLoadingCoins(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch min amount when pair changes
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    setMinAmount(null);
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/letsexchange/min/${fromCoin.symbol}/${toCoin.symbol}`);
        const d = await r.json();
        if (!cancelled && r.ok && d?.minAmount) setMinAmount(d.minAmount);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [fromCoin, toCoin]);

  const fetchEstimate = useCallback(async (val: string) => {
    if (!fromCoin || !toCoin || !val || parseFloat(val) <= 0) {
      setEstimate(null); setEstimateErr(null); return;
    }
    setEstimating(true); setEstimateErr(null);
    try {
      const r = await fetch(`${API_BASE}/letsexchange/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromCoin.symbol, to: toCoin.symbol, amount: val }),
      });
      const d = await r.json();
      if (r.ok) setEstimate(d);
      else setEstimateErr(d.error ?? d.detail?.message ?? "No route found for this pair");
    } catch {
      setEstimateErr("Estimate failed");
    }
    setEstimating(false);
  }, [fromCoin, toCoin]);

  const handleAmountChange = (val: string) => {
    setAmount(val);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchEstimate(val), 500);
  };

  const handleFlip = () => {
    setFromCoin(toCoin);
    setToCoin(fromCoin);
    setAmount("");
    setEstimate(null);
    setEstimateErr(null);
  };

  // Re-estimate when coins change (if amount already set)
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) fetchEstimate(amount);
    else { setEstimate(null); setEstimateErr(null); }
  }, [fromCoin, toCoin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!fromCoin || !toCoin || !amount || !destAddr || !estimate || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`${API_BASE}/letsexchange/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromCoin.symbol,
          to:   toCoin.symbol,
          amount,
          address: destAddr,
          ...(extraId ? { extraId } : {}),
        }),
      });
      const d = await r.json();
      if (r.ok && d.id) {
        setOrderId(d.id);
        toast({ title: "Exchange created!", description: `Order #${d.id}` });
      } else {
        const msg = d.error ?? d.detail?.message ?? "Failed to create exchange";
        toast({ title: "Exchange failed", description: msg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach exchange service", variant: "destructive" });
    }
    setCreating(false);
  };

  // ── Render: order tracking ─────────────────────────────────────────────────
  if (orderId) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Zap className="w-4 h-4 text-yellow-400" />
            Cross-Chain Order Tracking
          </div>
        </div>
        <OrderTracker orderId={orderId} onReset={() => { setOrderId(null); setAmount(""); setEstimate(null); }} />
      </div>
    );
  }

  // ── Render: coin loading ───────────────────────────────────────────────────
  if (loadingCoins) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-lg p-6 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm">Loading 6000+ coins…</p>
      </div>
    );
  }

  if (coinsError) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-lg p-4 text-sm text-red-400 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Failed to load coin list. Please try again later.
      </div>
    );
  }

  const amtNum   = parseFloat(amount) || 0;
  const minNum   = parseFloat(minAmount ?? "0") || 0;
  const belowMin = minNum > 0 && amtNum > 0 && amtNum < minNum;
  const canCreate = !!fromCoin && !!toCoin && amtNum > 0 && !belowMin && !!destAddr.trim() && !!estimate && !creating;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg space-y-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Zap className="w-4 h-4 text-yellow-400" />
          Cross-Chain Exchange
          <span className="text-[10px] font-normal text-muted-foreground">6000+ coins · Non-custodial</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 font-semibold">Cross-Chain</span>
      </div>

      {/* From */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">You Send</p>
        <div className="flex items-center gap-2">
          <div className="w-[155px] shrink-0">
            <CoinPicker
              coins={coins}
              selected={fromCoin}
              onChange={c => { setFromCoin(c); setEstimate(null); }}
              label="From"
              exclude={toCoin?.symbol}
            />
          </div>
          <input
            type="number"
            min="0"
            placeholder="0.0"
            value={amount}
            onChange={e => handleAmountChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 text-right"
          />
        </div>
        {minAmount && (
          <p className={cn("text-[11px]", belowMin ? "text-red-400 font-semibold" : "text-muted-foreground/70")}>
            Min: {minAmount} {fromCoin?.symbol}
          </p>
        )}
      </div>

      {/* Flip */}
      <div className="flex justify-center -my-1">
        <button
          onClick={handleFlip}
          className="p-2 rounded-full border border-border bg-card hover:bg-muted/60 transition-colors"
        >
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* To */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">You Receive</p>
        <div className="flex items-center gap-2">
          <div className="w-[155px] shrink-0">
            <CoinPicker
              coins={coins}
              selected={toCoin}
              onChange={c => { setToCoin(c); setEstimate(null); }}
              label="To"
              exclude={fromCoin?.symbol}
            />
          </div>
          <div className="min-w-0 flex-1 text-2xl font-bold text-right">
            {estimating ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground ml-auto" />
            ) : estimate ? (
              <span className="text-foreground">{parseFloat(estimate.result).toFixed(8).replace(/\.?0+$/, "")}</span>
            ) : (
              <span className="text-muted-foreground/40">0.0</span>
            )}
          </div>
        </div>
      </div>

      {/* Rate display */}
      {estimate && !estimateErr && (
        <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs flex items-center justify-between text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            Rate
          </span>
          <span className="font-mono">
            1 {fromCoin?.symbol} ≈ {(parseFloat(estimate.result) / parseFloat(estimate.amount || "1")).toFixed(6)} {toCoin?.symbol}
          </span>
        </div>
      )}
      {estimateErr && (
        <div className="flex items-center gap-2 text-xs text-amber-400 px-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{estimateErr}
        </div>
      )}

      {/* Destination address */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Your {toCoin?.symbol ?? "destination"} address
          {toCoin?.network ? <span className="text-muted-foreground/60"> ({toCoin.network})</span> : ""}
        </label>
        <input
          type="text"
          placeholder={`Enter ${toCoin?.symbol ?? "coin"} wallet address`}
          value={destAddr}
          onChange={e => setDestAddr(e.target.value)}
          className="w-full text-sm bg-muted/40 border border-border/40 focus:border-primary/60 rounded-xl px-3 py-2.5 outline-none transition-colors placeholder:text-muted-foreground/40 font-mono"
        />
      </div>

      {/* Extra ID (memo/tag) — shown for coins that require it */}
      {toCoin?.hasExternalId && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-amber-400">
            ⚠ Memo / Tag / Extra ID (required for {toCoin.symbol})
          </label>
          <input
            type="text"
            placeholder="Enter memo / tag"
            value={extraId}
            onChange={e => setExtraId(e.target.value)}
            className="w-full text-sm bg-amber-500/5 border border-amber-500/30 focus:border-amber-500/60 rounded-xl px-3 py-2.5 outline-none transition-colors placeholder:text-muted-foreground/40 font-mono"
          />
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className={cn(
          "w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
          canCreate
            ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        {creating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Creating Exchange…</>
        ) : !fromCoin || !toCoin ? (
          "Select coins to swap"
        ) : !amount || amtNum <= 0 ? (
          "Enter amount"
        ) : belowMin ? (
          `Minimum is ${minAmount} ${fromCoin.symbol}`
        ) : !destAddr.trim() ? (
          `Enter your ${toCoin.symbol} address`
        ) : !estimate ? (
          estimating ? "Getting rate…" : "No route for this pair"
        ) : (
          <><Zap className="w-4 h-4" /> Create Exchange</>
        )}
      </button>

      <p className="text-[11px] text-muted-foreground/50 text-center flex items-center justify-center gap-1">
        <Clock className="w-3 h-3" />
        Non-custodial · Best rates across 400+ exchanges
        <ExternalLink className="w-2.5 h-2.5" />
      </p>
    </div>
  );
}
