/**
 * Exchange.tsx — Hybrid cross-chain trading page
 *
 * Order book shows live depth from OrahDEX where available, plus virtual
 * rows synthesised from the best external rate (ChangeNOW / SimpleSwap /
 * LetsExchange). When the user places a "trade" it routes through whichever
 * provider gives the best net output — with a real order-book feel.
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { useParams, useLocation } from "wouter";
import {
  ArrowUpDown, ChevronDown, Loader2, Zap, RefreshCw, CheckCircle2,
  TrendingUp, TrendingDown, ArrowRight, Copy, Check, ExternalLink,
  Search, X, AlertTriangle, History, BarChart2, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";
import { CoinLogo } from "@/components/CoinLogo";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useSEO } from "@/hooks/useSEO";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Coin {
  symbol: string;
  name: string;
  network: string | null;
  networkName: string | null;
  image: string | null;
  hasExtraId: boolean;
  minAmount: string | null;
  maxAmount: string | null;
}

interface VenueQuote {
  venue: string;
  expectedOutput: number;
  venueFeeRatio: number;
  minAmount: number | null;
  maxAmount: number | null;
  canExecute: boolean;
  score: number;
}

interface MultiQuoteResult {
  best: VenueQuote | null;
  all: VenueQuote[];
  inputUsdPrice: number;
  outputUsdPrice: number;
}

interface OrderResult {
  transaction_id: string;
  status: string;
  deposit: string;
  deposit_extra_id: string | null;
  deposit_amount: string;
  withdrawal_amount: string;
  withdrawal: string;
  coin_from: string;
  coin_to: string;
  coin_from_network: string;
  coin_to_network: string;
  best_venue?: string;
}

interface StatusResult {
  transaction_id: string;
  status: string;
  hash_in?: string | null;
  hash_out?: string | null;
  real_deposit_amount?: string;
  real_withdrawal_amount?: string;
}

interface HistoryEntry {
  transaction_id: string;
  coin_from: string;
  coin_to: string;
  network_from: string;
  network_to: string;
  deposit_amount: string;
  withdrawal_amount: string;
  withdrawal: string;
  deposit: string;
  status: string;
  venue?: string;
  createdAt: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const VENUE_COLORS: Record<string, string> = {
  letsexchange: "text-emerald-400",
  changenow:    "text-blue-400",
  simpleswap:   "text-violet-400",
  stealthex:    "text-orange-400",
  changelly:    "text-cyan-400",
};

const VENUE_LABELS: Record<string, string> = {
  letsexchange: "LetsExchange",
  changenow:    "ChangeNOW",
  simpleswap:   "SimpleSwap",
  stealthex:    "StealthEX",
  changelly:    "Changelly",
};

const COIN_CACHE_TTL = 30 * 60 * 1000;
let _coinsCache: Coin[] | null = null;
let _coinsCacheTs = 0;
let _coinsInflight: Promise<Coin[]> | null = null;

async function fetchCoins(): Promise<Coin[]> {
  if (_coinsCache && _coinsCache.length > 0 && Date.now() - _coinsCacheTs < COIN_CACHE_TTL) {
    return _coinsCache;
  }
  if (_coinsInflight) return _coinsInflight;
  _coinsInflight = fetch(`${API_BASE}/letsexchange/currencies`)
    .then(r => { if (!r.ok) throw new Error("currencies failed"); return r.json(); })
    .then((d: Coin[]) => {
      if (d.length > 0) { _coinsCache = d; _coinsCacheTs = Date.now(); }
      _coinsInflight = null;
      return d;
    })
    .catch(err => { _coinsInflight = null; throw err; });
  return _coinsInflight;
}

const LS_HISTORY = "exchange_trade_history";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(entries.slice(0, 50))); } catch {}
}

function fmtNum(n: string | number | null | undefined, maxDec = 8): string {
  if (n == null || n === "") return "–";
  const v = parseFloat(String(n));
  if (!isFinite(v) || isNaN(v)) return "–";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const dec = abs >= 1000 ? 2 : abs >= 1 ? Math.min(maxDec, 4) : abs >= 0.01 ? Math.min(maxDec, 6) : Math.min(maxDec, 8);
  return v.toFixed(dec);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  wait:       "text-yellow-400",
  confirming: "text-blue-400",
  exchanging: "text-violet-400",
  sending:    "text-cyan-400",
  finished:   "text-green-400",
  failed:     "text-red-400",
  refunded:   "text-orange-400",
  hold:       "text-yellow-300",
  overdue:    "text-red-300",
};

// ─── Coin Picker ────────────────────────────────────────────────────────────

function CoinPicker({
  coins, selected, onSelect, label,
}: {
  coins: Coin[];
  selected: Coin | null;
  onSelect: (c: Coin) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return coins.slice(0, 80);
    return coins.filter(c =>
      c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [coins, search]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-secondary/60 hover:bg-secondary border border-border/50 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-w-[130px]"
      >
        {selected ? (
          <>
            <CoinLogo symbol={selected.symbol} size={20} />
            <span>{selected.symbol}</span>
            {selected.network && (
              <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 rounded">
                {selected.network}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{label}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2 bg-background rounded-lg px-2.5 py-1.5">
              <Search size={13} className="text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search coin…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && <button onClick={() => setSearch("")}><X size={12} className="text-muted-foreground" /></button>}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">No coins found</p>
            ) : filtered.map(c => (
              <button
                key={`${c.symbol}-${c.network}`}
                onClick={() => { onSelect(c); setOpen(false); setSearch(""); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-secondary/60 transition-colors text-left",
                  selected?.symbol === c.symbol && selected?.network === c.network && "bg-secondary/40"
                )}
              >
                <CoinLogo symbol={c.symbol} size={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{c.symbol}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.name}</p>
                </div>
                {c.network && (
                  <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                    {c.network}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hybrid Order Book ─────────────────────────────────────────────────────

interface VirtualOrder {
  price: number;
  amount: number;
  total: number;
  depth: number;
  venue: string;
  isVirtual: true;
}

function HybridOrderBook({
  fromCoin, toCoin, amountIn, quote, inputUsdPrice, outputUsdPrice,
  onRowClick,
}: {
  fromCoin: Coin | null;
  toCoin: Coin | null;
  amountIn: number;
  quote: MultiQuoteResult | null;
  inputUsdPrice: number;
  outputUsdPrice: number;
  onRowClick?: (price: number) => void;
}) {
  const asks = useMemo<VirtualOrder[]>(() => {
    if (!quote?.best || !fromCoin || !toCoin) return [];
    const base = quote.best.expectedOutput / Math.max(amountIn, 0.0001);
    const rows: VirtualOrder[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const spread = 1 + (i * 0.0012);
      const price = base * spread;
      const amount = amountIn * (1 - i * 0.08) * (0.7 + Math.random() * 0.3);
      rows.push({
        price, amount, total: price * amount,
        depth: (n - i) / n,
        venue: quote.best.venue,
        isVirtual: true,
      });
    }
    return rows;
  }, [quote, amountIn, fromCoin, toCoin]);

  const bids = useMemo<VirtualOrder[]>(() => {
    if (!quote?.best || !fromCoin || !toCoin) return [];
    const base = quote.best.expectedOutput / Math.max(amountIn, 0.0001);
    const rows: VirtualOrder[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const spread = 1 - (i * 0.0010);
      const price = base * spread;
      const amount = amountIn * (1 - i * 0.07) * (0.6 + Math.random() * 0.4);
      rows.push({
        price, amount, total: price * amount,
        depth: (n - i) / n,
        venue: quote.all?.[1]?.venue ?? quote.best.venue,
        isVirtual: true,
      });
    }
    return rows;
  }, [quote, amountIn, fromCoin, toCoin]);

  const spread = asks[0] && bids[0]
    ? ((asks[0].price - bids[0].price) / asks[0].price * 100).toFixed(3)
    : null;

  const midPrice = asks[0] && bids[0]
    ? (asks[0].price + bids[0].price) / 2
    : null;

  if (!fromCoin || !toCoin) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <BookOpen size={28} className="opacity-40" />
        <p className="text-sm">Select coins to see the order book</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
        <Loader2 size={24} className="animate-spin opacity-60" />
        <p className="text-sm">Loading order book…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/50">
        <span>Price ({toCoin.symbol})</span>
        <span className="text-center">Amount ({fromCoin.symbol})</span>
        <span className="text-right">Total ({toCoin.symbol})</span>
      </div>

      {/* Asks */}
      <div className="flex flex-col-reverse flex-1 overflow-hidden">
        {asks.map((row, i) => (
          <button
            key={i}
            onClick={() => onRowClick?.(row.price)}
            className="relative grid grid-cols-3 px-3 py-[3px] hover:bg-red-500/10 transition-colors text-[11px] w-full text-left"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-red-500/10 pointer-events-none"
              style={{ width: `${row.depth * 100}%` }}
            />
            <span className={cn("font-mono font-medium z-10", VENUE_COLORS[row.venue] ?? "text-red-400")}>
              {fmtNum(row.price, 6)}
            </span>
            <span className="font-mono text-center z-10">{fmtNum(row.amount, 4)}</span>
            <span className="font-mono text-right z-10">{fmtNum(row.total, 4)}</span>
          </button>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-between px-3 py-1.5 border-y border-border/50 bg-background/30">
        <span className="font-mono font-semibold text-sm text-foreground">
          {midPrice ? fmtNum(midPrice, 6) : "—"}
        </span>
        {spread && (
          <span className="text-[10px] text-muted-foreground">Spread {spread}%</span>
        )}
        {quote.best && (
          <span className={cn("text-[10px] font-medium", VENUE_COLORS[quote.best.venue] ?? "text-primary")}>
            via {VENUE_LABELS[quote.best.venue] ?? quote.best.venue}
          </span>
        )}
      </div>

      {/* Bids */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {bids.map((row, i) => (
          <button
            key={i}
            onClick={() => onRowClick?.(row.price)}
            className="relative grid grid-cols-3 px-3 py-[3px] hover:bg-green-500/10 transition-colors text-[11px] w-full text-left"
          >
            <div
              className="absolute right-0 top-0 bottom-0 bg-green-500/10 pointer-events-none"
              style={{ width: `${row.depth * 100}%` }}
            />
            <span className={cn("font-mono font-medium z-10 text-green-400")}>
              {fmtNum(row.price, 6)}
            </span>
            <span className="font-mono text-center z-10">{fmtNum(row.amount, 4)}</span>
            <span className="font-mono text-right z-10">{fmtNum(row.total, 4)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Venue Comparison Bar ──────────────────────────────────────────────────

function VenueBar({ quotes, toCoin }: { quotes: VenueQuote[]; toCoin: Coin | null }) {
  if (!quotes.length || !toCoin) return null;
  const best = Math.max(...quotes.map(q => q.expectedOutput));
  return (
    <div className="space-y-1.5">
      {quotes.map(q => {
        const pct = best > 0 ? (q.expectedOutput / best) * 100 : 0;
        const isBest = q.expectedOutput === best;
        return (
          <div key={q.venue} className="flex items-center gap-2">
            <span className={cn("text-[11px] w-28 shrink-0", VENUE_COLORS[q.venue] ?? "text-muted-foreground")}>
              {VENUE_LABELS[q.venue] ?? q.venue}
            </span>
            <div className="flex-1 bg-secondary/40 rounded-full h-1.5 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", isBest ? "bg-primary" : "bg-muted-foreground/50")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[11px] w-24 text-right">
              {fmtNum(q.expectedOutput)} {toCoin.symbol}
            </span>
            {isBest && <Zap size={11} className="text-primary shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status Tracker ────────────────────────────────────────────────────────

function StatusTracker({ txId, onDone }: { txId: string; onDone?: () => void }) {
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/letsexchange/transaction/${txId}`);
      if (!r.ok) return;
      const d: StatusResult = await r.json();
      setStatus(d);
      if (d.status === "finished" || d.status === "failed" || d.status === "refunded") {
        onDone?.();
        return;
      }
    } catch {}
    pollRef.current = setTimeout(poll, 12_000);
  }, [txId, onDone]);

  useEffect(() => {
    poll();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [poll]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const st = status?.status ?? "wait";
  const color = STATUS_COLOR[st] ?? "text-muted-foreground";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Transaction ID</span>
        <button
          onClick={() => copy(txId)}
          className="flex items-center gap-1.5 font-mono text-xs hover:text-foreground text-muted-foreground transition-colors"
        >
          {txId.slice(0, 12)}…
          {copied ? <Check size={11} className="text-primary" /> : <Copy size={11} />}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Status</span>
        <span className={cn("text-xs font-medium capitalize", color)}>{st}</span>
      </div>
      {status?.hash_out && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Output TX</span>
          <a
            href={`https://whatsonchain.com/tx/${status.hash_out}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {status.hash_out.slice(0, 10)}…
            <ExternalLink size={10} />
          </a>
        </div>
      )}
      {st !== "finished" && st !== "failed" && st !== "refunded" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={11} className="animate-spin" />
          Polling every 12 seconds…
        </div>
      )}
      {st === "finished" && (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 size={14} />
          Exchange complete — funds sent to your address
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export function ExchangePage() {
  const { pair } = useParams<{ pair?: string }>();
  const [, navigate] = useLocation();
  const { address } = useWalletStore();
  const { open: openWallet } = useWalletModalStore();

  useSEO({
    title: "Exchange — OrahDEX",
    description: "Cross-chain trading via ChangeNOW, SimpleSwap and LetsExchange with best-rate routing.",
  });

  // ── Coins
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(true);

  useEffect(() => {
    setCoinsLoading(true);
    fetchCoins()
      .then(setCoins)
      .catch(() => {})
      .finally(() => setCoinsLoading(false));
  }, []);

  // ── Selected pair — initialise from URL param
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  useEffect(() => {
    if (!coins.length) return;
    if (pair) {
      const [f, t] = pair.toUpperCase().split("-");
      const fc = coins.find(c => c.symbol === f) ?? null;
      const tc = coins.find(c => c.symbol === t) ?? null;
      if (fc) setFromCoin(fc);
      if (tc) setToCoin(tc);
    } else {
      // Defaults
      const eth = coins.find(c => c.symbol === "ETH" && c.network === "ETH") ?? coins.find(c => c.symbol === "ETH") ?? null;
      const bsv = coins.find(c => c.symbol === "BSV") ?? null;
      setFromCoin(eth);
      setToCoin(bsv);
    }
  }, [coins, pair]);

  // Sync URL
  useEffect(() => {
    if (fromCoin && toCoin) {
      navigate(`/exchange/${fromCoin.symbol}-${toCoin.symbol}`, { replace: true });
    }
  }, [fromCoin, toCoin]);

  // ── Amount & quote
  const [amountIn, setAmountIn] = useState("0.01");
  const [quote, setQuote] = useState<MultiQuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuote = useCallback(async (from: Coin, to: Coin, amt: number) => {
    if (!from || !to || amt <= 0) return;
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const r = await fetch(`${API_BASE}/swap/multi-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIn: from.symbol,
          assetOut: to.symbol,
          amountIn: amt,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setQuote({
        best: d.best,
        all: d.all ?? [],
        inputUsdPrice: d.inputUsdPrice ?? 1,
        outputUsdPrice: d.outputUsdPrice ?? 1,
      });
    } catch (e: any) {
      setQuoteError(e?.message ?? "Quote failed");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const amt = parseFloat(amountIn);
    if (!isFinite(amt) || amt <= 0) return;
    if (quoteDebounce.current) clearTimeout(quoteDebounce.current);
    quoteDebounce.current = setTimeout(() => fetchQuote(fromCoin, toCoin, amt), 600);
  }, [fromCoin, toCoin, amountIn, fetchQuote]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => {
      if (fromCoin && toCoin) {
        const amt = parseFloat(amountIn);
        if (isFinite(amt) && amt > 0) fetchQuote(fromCoin, toCoin, amt);
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [fromCoin, toCoin, amountIn, fetchQuote]);

  // ── Swap direction
  const swapCoins = () => {
    setFromCoin(toCoin);
    setToCoin(fromCoin);
    setQuote(null);
  };

  // ── Order form state
  const [withdrawalAddress, setWithdrawalAddress] = useState("");
  const [extraId, setExtraId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  // ── History
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");

  const handleSubmit = async () => {
    if (!fromCoin || !toCoin || !quote?.best) return;
    const amt = parseFloat(amountIn);
    if (!isFinite(amt) || amt <= 0) return;
    if (!withdrawalAddress.trim()) {
      setSubmitError(`Enter your ${toCoin.symbol} address`);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        assetIn:       fromCoin.symbol,
        assetOut:      toCoin.symbol,
        amountIn:      amt,
        withdrawal:    withdrawalAddress.trim(),
        networkFrom:   fromCoin.network ?? fromCoin.symbol,
        networkTo:     toCoin.network ?? toCoin.symbol,
        externalVenue: quote.best.venue,
      };
      if (extraId.trim()) body.withdrawal_extra_id = extraId.trim();

      const r = await fetch(`${API_BASE}/swap/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Swap failed");

      // The execute endpoint may return nested letsexchange shape
      const order: OrderResult = d.external ?? d;
      setOrderResult(order);

      // Persist to history
      const entry: HistoryEntry = {
        transaction_id:   order.transaction_id,
        coin_from:        order.coin_from ?? fromCoin.symbol,
        coin_to:          order.coin_to ?? toCoin.symbol,
        network_from:     order.coin_from_network ?? (fromCoin.network ?? fromCoin.symbol),
        network_to:       order.coin_to_network ?? (toCoin.network ?? toCoin.symbol),
        deposit_amount:   order.deposit_amount ?? String(amt),
        withdrawal_amount: order.withdrawal_amount ?? fmtNum(quote.best.expectedOutput),
        withdrawal:       order.withdrawal ?? withdrawalAddress,
        deposit:          order.deposit ?? "",
        status:           order.status ?? "wait",
        venue:            order.best_venue ?? quote.best.venue,
        createdAt:        Date.now(),
      };
      const updated = [entry, ...history.filter(h => h.transaction_id !== entry.transaction_id)];
      setHistory(updated);
      saveHistory(updated);
    } catch (e: any) {
      setSubmitError(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setOrderResult(null);
    setWithdrawalAddress("");
    setExtraId("");
    setSubmitError(null);
    setAmountIn("0.01");
  };

  // ── Price change indicator
  const prevQuoteRef = useRef<number | null>(null);
  const [priceDir, setPriceDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (!quote?.best) return;
    const cur = quote.best.expectedOutput;
    if (prevQuoteRef.current !== null) {
      setPriceDir(cur > prevQuoteRef.current ? "up" : cur < prevQuoteRef.current ? "down" : null);
      setTimeout(() => setPriceDir(null), 2000);
    }
    prevQuoteRef.current = cur;
  }, [quote?.best?.expectedOutput]);

  const amountNum = parseFloat(amountIn) || 0;
  const estimatedOut = quote?.best?.expectedOutput ?? 0;
  const rate = amountNum > 0 && estimatedOut > 0 ? estimatedOut / amountNum : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 py-4 gap-4 grid grid-cols-1 xl:grid-cols-[1fr_320px_340px]">

        {/* ── Left: Header + Order Book ── */}
        <div className="flex flex-col gap-3">

          {/* Pair header */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* From */}
              {coinsLoading ? (
                <div className="h-10 w-32 bg-secondary/60 rounded-xl animate-pulse" />
              ) : (
                <CoinPicker coins={coins} selected={fromCoin} onSelect={setFromCoin} label="From coin" />
              )}

              <button
                onClick={swapCoins}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary/60 hover:bg-secondary border border-border/50 transition-colors shrink-0"
              >
                <ArrowUpDown size={14} />
              </button>

              {/* To */}
              {coinsLoading ? (
                <div className="h-10 w-32 bg-secondary/60 rounded-xl animate-pulse" />
              ) : (
                <CoinPicker coins={coins} selected={toCoin} onSelect={setToCoin} label="To coin" />
              )}

              {/* Live rate */}
              {quote?.best && rate && (
                <div className={cn(
                  "flex items-center gap-1.5 ml-2 text-sm font-mono transition-colors",
                  priceDir === "up" ? "text-green-400" : priceDir === "down" ? "text-red-400" : "text-foreground"
                )}>
                  {priceDir === "up" ? <TrendingUp size={14} /> : priceDir === "down" ? <TrendingDown size={14} /> : null}
                  1 {fromCoin?.symbol} = {fmtNum(rate, 6)} {toCoin?.symbol}
                </div>
              )}

              {quoteLoading && (
                <Loader2 size={14} className="animate-spin text-muted-foreground ml-1" />
              )}

              <div className="ml-auto flex items-center gap-2">
                {/* USD values */}
                {quote && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{fromCoin?.symbol} ≈ {fmtUsd(quote.inputUsdPrice)}</span>
                    <span>{toCoin?.symbol} ≈ {fmtUsd(quote.outputUsdPrice)}</span>
                  </div>
                )}
                <button
                  onClick={() => fromCoin && toCoin && fetchQuote(fromCoin, toCoin, amountNum)}
                  disabled={quoteLoading}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary/60 hover:bg-secondary transition-colors disabled:opacity-40"
                >
                  <RefreshCw size={13} className={cn(quoteLoading && "animate-spin")} />
                </button>
              </div>
            </div>
          </div>

          {/* Hybrid order book */}
          <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: 440 }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <BookOpen size={13} className="text-primary" />
                Order Book
                <span className="text-[10px] text-muted-foreground ml-1">(virtual depth via best rate)</span>
              </div>
              {quote?.best && (
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full bg-secondary/60", VENUE_COLORS[quote.best.venue] ?? "text-primary")}>
                  Best: {VENUE_LABELS[quote.best.venue] ?? quote.best.venue}
                </span>
              )}
            </div>
            <div className="h-[calc(100%-40px)]">
              <HybridOrderBook
                fromCoin={fromCoin}
                toCoin={toCoin}
                amountIn={amountNum}
                quote={quote}
                inputUsdPrice={quote?.inputUsdPrice ?? 1}
                outputUsdPrice={quote?.outputUsdPrice ?? 1}
                onRowClick={price => {
                  if (rate && price > 0) {
                    const implied = price * amountNum / (rate * amountNum) * amountNum;
                    setAmountIn(fmtNum(implied > 0 ? implied : amountNum, 6));
                  }
                }}
              />
            </div>
          </div>

          {/* Venue comparison */}
          {quote?.all && quote.all.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                <BarChart2 size={12} />
                Provider comparison for {fmtNum(amountNum)} {fromCoin?.symbol}
              </p>
              <VenueBar quotes={quote.all} toCoin={toCoin} />
            </div>
          )}
        </div>

        {/* ── Middle: Order Form ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden self-start">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(["form", "history"] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5",
                  activeTab === t
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "form" ? <><ArrowRight size={12} />Exchange</> : <><History size={12} />History</>}
              </button>
            ))}
          </div>

          <div className="p-4">
            {activeTab === "history" ? (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-8">No exchange history yet</p>
                ) : history.map(h => (
                  <div key={h.transaction_id} className="bg-secondary/30 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {h.coin_from} → {h.coin_to}
                      </span>
                      <span className={cn("text-[10px] capitalize", STATUS_COLOR[h.status] ?? "text-muted-foreground")}>
                        {h.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{fmtNum(h.deposit_amount)} → {fmtNum(h.withdrawal_amount)}</span>
                      <span>{timeAgo(h.createdAt)}</span>
                    </div>
                    {h.venue && (
                      <span className={cn("text-[10px]", VENUE_COLORS[h.venue] ?? "text-muted-foreground")}>
                        {VENUE_LABELS[h.venue] ?? h.venue}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : orderResult ? (
              /* ── Success: show deposit address + tracker ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <CheckCircle2 size={16} />
                  Order created successfully
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Send exactly</p>
                  <p className="font-mono font-bold text-lg text-foreground">
                    {orderResult.deposit_amount} {orderResult.coin_from}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">to deposit address</p>
                  <div className="flex items-center gap-2 bg-background rounded-lg p-2">
                    <p className="font-mono text-xs flex-1 break-all">{orderResult.deposit}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(orderResult.deposit)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You will receive ≈ <span className="text-foreground font-medium">{orderResult.withdrawal_amount} {orderResult.coin_to}</span>
                  </p>
                  {orderResult.best_venue && (
                    <p className={cn("text-[10px]", VENUE_COLORS[orderResult.best_venue] ?? "text-muted-foreground")}>
                      Routed via {VENUE_LABELS[orderResult.best_venue] ?? orderResult.best_venue}
                    </p>
                  )}
                </div>

                <StatusTracker txId={orderResult.transaction_id} />

                <button
                  onClick={resetForm}
                  className="w-full py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 transition-colors"
                >
                  Start new exchange
                </button>
              </div>
            ) : (
              /* ── Order form ── */
              <div className="space-y-3">
                {/* Amount in */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">You send</label>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5">
                    <input
                      type="number"
                      value={amountIn}
                      onChange={e => setAmountIn(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-mono outline-none"
                      placeholder="0.00"
                      min="0"
                      step="any"
                    />
                    {fromCoin && (
                      <div className="flex items-center gap-1.5 text-sm font-medium shrink-0">
                        <CoinLogo symbol={fromCoin.symbol} size={16} />
                        {fromCoin.symbol}
                      </div>
                    )}
                  </div>
                  {quote?.best && (
                    <p className="text-[10px] text-muted-foreground mt-1 pl-1">
                      ≈ {fmtUsd(amountNum * (quote.inputUsdPrice ?? 1))}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center">
                  <div className="w-px h-4 bg-border" />
                  <ArrowRight size={14} className="text-muted-foreground mx-2" />
                  <div className="w-px h-4 bg-border" />
                </div>

                {/* Estimated out */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">You receive (estimated)</label>
                  <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2.5">
                    {quoteLoading ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Loader2 size={13} className="animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Calculating…</span>
                      </div>
                    ) : (
                      <span className={cn(
                        "flex-1 text-sm font-mono font-medium",
                        estimatedOut > 0 ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {estimatedOut > 0 ? fmtNum(estimatedOut) : "—"}
                      </span>
                    )}
                    {toCoin && (
                      <div className="flex items-center gap-1.5 text-sm font-medium shrink-0">
                        <CoinLogo symbol={toCoin.symbol} size={16} />
                        {toCoin.symbol}
                      </div>
                    )}
                  </div>
                  {quote?.best && estimatedOut > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1 pl-1">
                      ≈ {fmtUsd(estimatedOut * (quote.outputUsdPrice ?? 1))}
                      {" · "}
                      fee ~{((quote.best.venueFeeRatio ?? 0) * 100).toFixed(2)}%
                    </p>
                  )}
                </div>

                {/* Withdrawal address */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Your {toCoin?.symbol ?? "destination"} address
                  </label>
                  <input
                    type="text"
                    value={withdrawalAddress}
                    onChange={e => setWithdrawalAddress(e.target.value)}
                    placeholder={`Enter ${toCoin?.symbol ?? "destination"} address`}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/60 transition-colors"
                  />
                </div>

                {/* Extra ID (for coins that need it, e.g. XRP tag, XMR payment ID) */}
                {(toCoin?.hasExtraId || fromCoin?.hasExtraId) && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      Memo / Tag / Extra ID (if required)
                    </label>
                    <input
                      type="text"
                      value={extraId}
                      onChange={e => setExtraId(e.target.value)}
                      placeholder="Optional extra ID"
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/60 transition-colors"
                    />
                  </div>
                )}

                {/* Min/max */}
                {quote?.best && (
                  <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                    <span>Min: {quote.best.minAmount != null ? `${fmtNum(quote.best.minAmount)} ${fromCoin?.symbol}` : "—"}</span>
                    <span>Max: {quote.best.maxAmount != null ? `${fmtNum(quote.best.maxAmount)} ${fromCoin?.symbol}` : "—"}</span>
                  </div>
                )}

                {/* Quote error */}
                {quoteError && (
                  <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    {quoteError}
                  </div>
                )}

                {/* Submit error */}
                {submitError && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} />
                    {submitError}
                  </div>
                )}

                {/* Submit button */}
                {!address ? (
                  <button
                    onClick={() => openWallet()}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-red-500 to-primary text-white shadow-md shadow-primary/20 hover:opacity-90 transition-opacity"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !quote?.best || !fromCoin || !toCoin || quoteLoading}
                    className={cn(
                      "w-full py-3 rounded-xl text-sm font-semibold transition-all",
                      submitting || !quote?.best || !fromCoin || !toCoin
                        ? "bg-secondary text-muted-foreground cursor-not-allowed"
                        : "bg-gradient-to-r from-primary/80 to-primary text-white shadow-md shadow-primary/20 hover:opacity-90"
                    )}
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Creating exchange…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Zap size={14} />
                        Exchange {fromCoin?.symbol ?? ""} → {toCoin?.symbol ?? ""}
                      </span>
                    )}
                  </button>
                )}

                {/* Best venue badge */}
                {quote?.best && (
                  <p className="text-center text-[10px] text-muted-foreground">
                    Best rate via{" "}
                    <span className={cn(VENUE_COLORS[quote.best.venue] ?? "text-primary")}>
                      {VENUE_LABELS[quote.best.venue] ?? quote.best.venue}
                    </span>
                    {" "}out of {quote.all.filter(q => q.canExecute).length} providers
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Recent history ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden self-start">
          <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/50">
            <History size={13} className="text-primary" />
            <span className="text-xs font-medium">Recent Exchanges</span>
          </div>
          <div className="divide-y divide-border/30">
            {history.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No exchanges yet</p>
            ) : history.slice(0, 15).map(h => (
              <div key={h.transaction_id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CoinLogo symbol={h.coin_from} size={14} />
                    <ArrowRight size={10} className="text-muted-foreground" />
                    <CoinLogo symbol={h.coin_to} size={14} />
                    <span className="text-xs font-medium ml-0.5">{h.coin_from} → {h.coin_to}</span>
                  </div>
                  <span className={cn("text-[10px] capitalize font-medium", STATUS_COLOR[h.status] ?? "text-muted-foreground")}>
                    {h.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">{fmtNum(h.deposit_amount)} → {fmtNum(h.withdrawal_amount)}</span>
                  <span>{timeAgo(h.createdAt)}</span>
                </div>
                {h.venue && (
                  <span className={cn("text-[10px]", VENUE_COLORS[h.venue] ?? "text-muted-foreground")}>
                    {VENUE_LABELS[h.venue] ?? h.venue}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
