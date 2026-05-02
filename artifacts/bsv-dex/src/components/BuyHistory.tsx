import { useState, useEffect, useCallback } from "react";
import {
  History, RefreshCw, CheckCircle2, Clock, XCircle,
  TrendingUp, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

interface Order {
  id: string;
  coin_symbol: string;
  fiat_amount_cents: number;
  crypto_amount: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  succeeded: {
    label: "Completed",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  pending: {
    label: "Pending",
    icon: <Clock className="w-3.5 h-3.5" />,
    className: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  processing: {
    label: "Processing",
    icon: <Clock className="w-3.5 h-3.5 animate-pulse" />,
    className: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  failed: {
    label: "Failed",
    icon: <XCircle className="w-3.5 h-3.5" />,
    className: "text-red-400 bg-red-500/10 border-red-500/20",
  },
  canceled: {
    label: "Cancelled",
    icon: <XCircle className="w-3.5 h-3.5" />,
    className: "text-muted-foreground bg-muted/30 border-border",
  },
};

const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A", ETH: "#627EEA", BSV: "#EAB308", BNB: "#F3BA2F",
  SOL: "#9945FF", USDT: "#26A17B", USDC: "#2775CA", XRP: "#00AAE4",
  ADA: "#0033AD", MATIC: "#8247E5", DOT: "#E6007A", AVAX: "#E84142",
};

function CoinIcon({ symbol }: { symbol: string }) {
  const color = COIN_COLORS[symbol] ?? "#6366f1";
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-inner shrink-0"
      style={{ background: `linear-gradient(135deg, ${color}cc, ${color}66)`, border: `1px solid ${color}44` }}
    >
      {symbol.slice(0, 3)}
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHrs / 24);
  if (diffMin < 1)  return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDay < 7)  return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDay > 365 ? "numeric" : undefined });
}

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const statusConf = STATUS_CONFIG[order.status] ?? STATUS_CONFIG["pending"];
  const usd = (order.fiat_amount_cents / 100).toFixed(2);
  const crypto = parseFloat(order.crypto_amount);
  const cryptoDisplay = crypto < 0.0001 ? crypto.toExponential(4) : crypto.toFixed(6).replace(/\.?0+$/, "");

  return (
    <div className={cn(
      "rounded-xl border border-border bg-secondary/20 overflow-hidden transition-all",
      expanded && "border-primary/20 bg-primary/5"
    )}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/5 transition"
      >
        <CoinIcon symbol={order.coin_symbol} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">Buy {order.coin_symbol}</span>
            <span className="text-sm font-bold text-foreground">${usd}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">{formatDate(order.created_at)}</span>
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold",
              statusConf.className
            )}>
              {statusConf.icon}
              {statusConf.label}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-border/50 space-y-2 mt-1">
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">You paid</p>
              <p className="text-sm font-bold">${usd} USD</p>
            </div>
            <div className="rounded-lg bg-card/60 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">You received</p>
              <p className="text-sm font-bold">{cryptoDisplay} {order.coin_symbol}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span className="font-mono truncate max-w-[200px]">Order {order.id.slice(0, 8)}…{order.id.slice(-6)}</span>
            <button
              onClick={() => navigator.clipboard.writeText(order.id)}
              className="text-primary hover:underline text-[10px]"
            >
              Copy ID
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  walletAddress: string | null;
}

export function BuyHistory({ walletAddress }: Props) {
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [visible,  setVisible]  = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!walletAddress) { setOrders([]); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/stripe/orders?walletAddress=${encodeURIComponent(walletAddress)}`
      );
      if (!r.ok) throw new Error("Failed to load");
      const data = await r.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load purchase history.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  if (!walletAddress) return null;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setVisible(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold">Purchase History</span>
          {orders.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">
              {orders.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); fetchOrders(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition"
            title="Refresh"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
          </button>
          {visible
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {visible && (
        <div className="px-3 pb-3 border-t border-border/50">
          {loading && orders.length === 0 && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading purchases…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center py-6 text-sm text-red-400 gap-2">
              <XCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 border border-border flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">No purchases yet</p>
                <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                  Your crypto buy orders will appear here
                </p>
              </div>
            </div>
          )}

          {orders.length > 0 && (
            <div className="space-y-2 mt-3">
              {orders.map(o => <OrderRow key={o.id} order={o} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
