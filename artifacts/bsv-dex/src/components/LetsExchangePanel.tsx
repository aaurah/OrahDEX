/**
 * LetsExchangePanel.tsx
 *
 * Inline cross-chain exchange panel.
 * Step 1: coin/amount picker (OrahDEX native UI)
 * Step 2: full-screen exchange view — widget iframe, sandboxed with NO top-navigation,
 *         so the user never leaves OrahDEX.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Loader2, AlertTriangle, X, ChevronDown,
  ArrowUpDown, Zap, CheckCircle2, ChevronLeft, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import { API_BASE } from "@/lib/api";

// ─── Partner config ───────────────────────────────────────────────────────────
const PARTNER_REF = "1692";
const WIDGET_BASE = "https://widget.letsexchange.io/";

// ─── Types ───────────────────────────────────────────────────────────────────
interface LeCoin {
  symbol: string;
  name: string;
  network: string | null;
  networkName: string | null;
  image: string | null;
  hasExtraId: boolean;
  minAmount: string | null;
  maxAmount: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function widgetUrl(from: LeCoin | null, to: LeCoin | null, amount: string): string {
  const params = new URLSearchParams({ ref: PARTNER_REF, theme: "dark" });
  if (from) params.set("from", from.symbol);
  if (to)   params.set("to",   to.symbol);
  if (amount && parseFloat(amount) > 0) params.set("amount", amount);
  return `${WIDGET_BASE}?${params.toString()}`;
}

function fmt(n: string | null, digits = 4) {
  if (!n) return null;
  const v = parseFloat(n);
  return isNaN(v) ? null : v.toPrecision(digits);
}

// ─── CoinPicker ───────────────────────────────────────────────────────────────
function CoinPicker({
  coins, selected, onChange, exclude,
}: {
  coins: LeCoin[];
  selected: LeCoin | null;
  onChange: (c: LeCoin) => void;
  exclude?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q,    setQ]    = useState("");
  const inputRef        = useRef<HTMLInputElement>(null);
  const panelRef        = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase().trim();
    const list = exclude ? coins.filter(c => c.symbol !== exclude) : coins;
    if (!qq) return list.slice(0, 120);
    return list
      .filter(c =>
        c.symbol.toLowerCase().includes(qq) ||
        c.name.toLowerCase().includes(qq) ||
        (c.networkName ?? "").toLowerCase().includes(qq),
      )
      .slice(0, 80);
  }, [coins, q, exclude]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted border border-border/40 hover:border-border/80 transition-colors w-full text-left"
      >
        {selected ? (
          <>
            <CoinLogo symbol={selected.symbol} size={22} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{selected.symbol}</p>
              {selected.networkName && (
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{selected.networkName}</p>
              )}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-sm flex-1">Select coin</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: 340 }}
        >
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
              <button type="button" onClick={() => setQ("")}>
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No coins found</p>
            ) : (
              filtered.map(c => (
                <button
                  type="button"
                  key={`${c.symbol}::${c.network ?? ""}`}
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
                      {c.name}{c.networkName ? ` · ${c.networkName}` : ""}
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

// ─── Inline exchange screen (full-page overlay, no navigation away) ────────────
function ExchangeScreen({
  url,
  fromCoin,
  toCoin,
  onBack,
}: {
  url: string;
  fromCoin: LeCoin | null;
  toCoin: LeCoin | null;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setKey(k => k + 1);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0d0d0d]"
         style={{ fontFamily: "inherit" }}>

      {/* Native-looking header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0 bg-[#111]/90 backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-xl hover:bg-white/10 transition-colors text-white"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          {fromCoin && toCoin ? (
            <>
              <CoinLogo symbol={fromCoin.symbol} size={20} />
              <span className="text-white text-sm font-bold">{fromCoin.symbol}</span>
              <span className="text-white/40 text-sm">→</span>
              <CoinLogo symbol={toCoin.symbol} size={20} />
              <span className="text-white text-sm font-bold">{toCoin.symbol}</span>
            </>
          ) : (
            <span className="text-white text-sm font-bold">Cross-Chain Exchange</span>
          )}
        </div>

        <button
          type="button"
          onClick={reload}
          className="p-1.5 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          aria-label="Reload"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 top-[57px] flex flex-col items-center justify-center gap-3 bg-[#0d0d0d] z-10">
          <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
          <p className="text-sm text-white/50">
            Loading exchange{fromCoin && toCoin ? ` ${fromCoin.symbol} → ${toCoin.symbol}` : ""}…
          </p>
        </div>
      )}

      {/* Exchange iframe — sandboxed without top-navigation or popups */}
      <iframe
        key={key}
        ref={iframeRef}
        src={url}
        onLoad={() => setLoading(false)}
        className="flex-1 w-full border-none"
        title="Cross-Chain Exchange"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function LetsExchangePanel() {
  const [coins,      setCoins]      = useState<LeCoin[]>([]);
  const [coinsError, setCoinsError] = useState(false);
  const [loading,    setLoading]    = useState(true);

  const [fromCoin, setFromCoin] = useState<LeCoin | null>(null);
  const [toCoin,   setToCoin]   = useState<LeCoin | null>(null);
  const [amount,   setAmount]   = useState("");

  const [showExchange, setShowExchange] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/letsexchange/currencies`);
        const d = await r.json();
        if (cancelled) return;
        if (r.ok && Array.isArray(d)) {
          setCoins(d);
          const btc = d.find((c: LeCoin) => c.symbol === "BTC" && (!c.network || c.network === "BTC"));
          const eth = d.find((c: LeCoin) => c.symbol === "ETH" && (!c.network || c.network === "ETH"));
          if (btc) setFromCoin(btc);
          if (eth) setToCoin(eth);
        } else {
          setCoinsError(true);
        }
      } catch {
        if (!cancelled) setCoinsError(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleFlip = () => { setFromCoin(toCoin); setToCoin(fromCoin); };

  const url = widgetUrl(fromCoin, toCoin, amount);

  const minAmt   = fromCoin?.minAmount ? parseFloat(fromCoin.minAmount) : null;
  const maxAmt   = fromCoin?.maxAmount ? parseFloat(fromCoin.maxAmount) : null;
  const numAmt   = amount !== "" ? parseFloat(amount) : null;
  const belowMin = minAmt !== null && numAmt !== null && numAmt < minAmt;
  const aboveMax = maxAmt !== null && numAmt !== null && numAmt > maxAmt;
  const amtError = belowMin || aboveMax;

  if (loading) {
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

  return (
    <>
      {/* Full-screen exchange screen — no external redirect */}
      {showExchange && (
        <ExchangeScreen
          url={url}
          fromCoin={fromCoin}
          toCoin={toCoin}
          onBack={() => setShowExchange(false)}
        />
      )}

      <div className="rounded-2xl border border-border bg-card shadow-lg space-y-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Zap className="w-4 h-4 text-yellow-400" />
            Cross-Chain Exchange
            <span className="text-[10px] font-normal text-muted-foreground">1000+ coins · Non-custodial</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 font-semibold">
            Cross-Chain
          </span>
        </div>

        {/* From */}
        <div className="rounded-xl bg-muted/40 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">You Send</p>
          <div className="flex items-center gap-2">
            <div className="w-[155px] shrink-0">
              <CoinPicker
                coins={coins}
                selected={fromCoin}
                onChange={c => setFromCoin(c)}
                exclude={toCoin?.symbol}
              />
            </div>
            <input
              type="number"
              min="0"
              placeholder="0.0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 text-right"
            />
          </div>
          {fromCoin?.minAmount && (
            <p className={cn("text-[11px]", amtError ? "text-red-400 font-semibold" : "text-emerald-400/80")}>
              Min:&nbsp;{fmt(fromCoin.minAmount)} {fromCoin.symbol}
              {fromCoin.maxAmount && (
                <>&nbsp;· Max:&nbsp;{fmt(fromCoin.maxAmount, 6)} {fromCoin.symbol}</>
              )}
            </p>
          )}
        </div>

        {/* Flip */}
        <div className="flex justify-center -my-1">
          <button
            type="button"
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
                onChange={c => setToCoin(c)}
                exclude={fromCoin?.symbol}
              />
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-xs text-muted-foreground/60">Live rate in exchange</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          disabled={!fromCoin || !toCoin || amtError}
          onClick={() => setShowExchange(true)}
          className={cn(
            "w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
            !fromCoin || !toCoin || amtError
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black shadow-lg shadow-yellow-500/20 active:scale-[0.98]",
          )}
        >
          <Zap className="w-4 h-4" />
          {!fromCoin || !toCoin
            ? "Select coins to continue"
            : belowMin
            ? `Below minimum (${fmt(fromCoin.minAmount)} ${fromCoin.symbol})`
            : aboveMax
            ? `Above maximum (${fmt(fromCoin.maxAmount, 6)} ${fromCoin.symbol})`
            : `Exchange ${fromCoin.symbol} → ${toCoin.symbol}`}
        </button>

        <p className="text-[11px] text-muted-foreground/50 text-center">
          Non-custodial · Best rates across 400+ exchanges
        </p>
      </div>
    </>
  );
}
