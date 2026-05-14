import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Trash2, RotateCcw, TrendingUp, TrendingDown, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { usePriceAlertsStore, type AlertCondition } from "@/store/usePriceAlertsStore";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const POPULAR_SYMBOLS = ["BSV", "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX", "MATIC", "LINK", "DOT"];

export function PriceAlertsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const alerts = usePriceAlertsStore((s) => s.alerts);
  const enabled = usePriceAlertsStore((s) => s.enabled);
  const addAlert = usePriceAlertsStore((s) => s.addAlert);
  const removeAlert = usePriceAlertsStore((s) => s.removeAlert);
  const resetAlert = usePriceAlertsStore((s) => s.resetAlert);
  const setEnabled = usePriceAlertsStore((s) => s.setEnabled);

  const [symbol, setSymbol] = useState("BSV");
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [target, setTarget] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Fetch live prices for the picker so the user sees current value next to symbol.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${BASE}/api/prices`, { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as Record<string, number>;
        if (!cancelled) setPrices(data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const currentPrice = prices[symbol];

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      // Active first, then most recent.
      if ((a.triggeredAt === null) !== (b.triggeredAt === null)) {
        return a.triggeredAt === null ? -1 : 1;
      }
      return b.createdAt - a.createdAt;
    });
  }, [alerts]);

  function handleAdd() {
    setError(null);
    const t = parseFloat(target);
    if (!symbol.trim()) { setError("Pick a symbol."); return; }
    if (!Number.isFinite(t) || t <= 0) { setError("Enter a valid price greater than 0."); return; }
    if (currentPrice && condition === "above" && t <= currentPrice) {
      setError(`Price must be above current ($${fmtPrice(currentPrice)}).`);
      return;
    }
    if (currentPrice && condition === "below" && t >= currentPrice) {
      setError(`Price must be below current ($${fmtPrice(currentPrice)}).`);
      return;
    }
    addAlert({ symbol: symbol.toUpperCase().trim(), condition, target: t });
    setTarget("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell size={16} className="text-amber-400" /> Price Alerts
            </DialogTitle>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide",
                enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground",
              )}
            >
              {enabled ? "ON" : "OFF"}
            </button>
          </div>
          <DialogDescription className="text-xs">
            Get an in-app notification when a coin crosses your target price. Checked every 30 seconds.
          </DialogDescription>
        </DialogHeader>

        {/* New alert form */}
        <div className="px-5 py-4 space-y-3 border-b border-border bg-secondary/20">
          <div className="flex gap-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold uppercase"
            />
            <div className="flex bg-background border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setCondition("above")}
                className={cn(
                  "px-3 text-xs font-semibold flex items-center gap-1",
                  condition === "above" ? "bg-emerald-500/15 text-emerald-400" : "text-muted-foreground",
                )}
              ><TrendingUp size={12} /> Above</button>
              <button
                onClick={() => setCondition("below")}
                className={cn(
                  "px-3 text-xs font-semibold flex items-center gap-1 border-l border-border",
                  condition === "below" ? "bg-rose-500/15 text-rose-400" : "text-muted-foreground",
                )}
              ><TrendingDown size={12} /> Below</button>
            </div>
          </div>

          {/* Quick picks */}
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-md border",
                  symbol === s
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-border",
                )}
              >{s}</button>
            ))}
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="Target price"
              className="w-full bg-background border border-border rounded-lg pl-6 pr-3 py-2 text-sm font-mono"
            />
          </div>

          {currentPrice ? (
            <p className="text-[11px] text-muted-foreground">
              Current {symbol}: <span className="font-mono font-semibold text-foreground">${fmtPrice(currentPrice)}</span>
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">No live price for {symbol}. Alert will still arm if the symbol appears later.</p>
          )}

          {error && <p className="text-[11px] text-rose-400">{error}</p>}

          <button
            onClick={handleAdd}
            className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Plus size={14} /> Add alert
          </button>
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto">
          {sortedAlerts.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">
              No alerts yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedAlerts.map((a) => {
                const triggered = a.triggeredAt !== null;
                return (
                  <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                      triggered ? "bg-muted" : a.condition === "above" ? "bg-emerald-500/15" : "bg-rose-500/15",
                    )}>
                      {a.condition === "above"
                        ? <TrendingUp size={13} className={triggered ? "text-muted-foreground" : "text-emerald-400"} />
                        : <TrendingDown size={13} className={triggered ? "text-muted-foreground" : "text-rose-400"} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {a.symbol} {a.condition} <span className="font-mono">${fmtPrice(a.target)}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {triggered
                          ? `Triggered at $${fmtPrice(a.lastSeenPrice ?? 0)}`
                          : prices[a.symbol]
                            ? `Now $${fmtPrice(prices[a.symbol])}`
                            : "Waiting for price feed"}
                      </p>
                    </div>
                    {triggered && (
                      <button
                        onClick={() => resetAlert(a.id)}
                        className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                        title="Re-arm"
                      ><RotateCcw size={13} /></button>
                    )}
                    <button
                      onClick={() => removeAlert(a.id)}
                      className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-400"
                      title="Delete"
                    ><Trash2 size={13} /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}
