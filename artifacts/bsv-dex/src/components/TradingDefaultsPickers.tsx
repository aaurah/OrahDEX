import { useState, useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SLIP_PRESETS = [0.1, 0.5, 1, 2, 3];
const LEV_PRESETS  = [1, 2, 5, 10, 20, 50, 100];

interface SlippageProps {
  open: boolean;
  onClose: () => void;
  valueBps: number;
  onSave: (bps: number) => void;
}

export function SlippagePicker({ open, onClose, valueBps, onSave }: SlippageProps) {
  const initialPct = +(valueBps / 100).toFixed(2);
  const [pct, setPct] = useState<number>(initialPct);
  const [custom, setCustom] = useState<string>(
    SLIP_PRESETS.includes(initialPct) ? "" : String(initialPct)
  );

  useEffect(() => {
    if (open) {
      const v = +(valueBps / 100).toFixed(2);
      setPct(v);
      setCustom(SLIP_PRESETS.includes(v) ? "" : String(v));
    }
  }, [open, valueBps]);

  if (!open) return null;
  const warn = pct > 1;
  const tooHigh = pct > 50 || pct <= 0 || isNaN(pct);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold">Default Slippage</h2>
            <p className="text-[11px] text-muted-foreground">Maximum price movement you'll accept on swaps</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary/50 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {SLIP_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setPct(p); setCustom(""); }}
                className={cn(
                  "py-2.5 rounded-xl text-sm font-bold border transition",
                  pct === p && !custom
                    ? "bg-primary/15 border-primary/60 text-foreground"
                    : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/60"
                )}
              >
                {p}%
              </button>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Custom</label>
            <div className="mt-1.5 flex items-center gap-2 bg-secondary/30 border border-border rounded-xl px-3 py-2.5">
              <input
                type="number"
                min="0.01" max="50" step="0.01"
                value={custom}
                onChange={e => {
                  setCustom(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setPct(v);
                }}
                placeholder="0.50"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {warn && !tooHigh && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400">High slippage — your trade may be front-run.</p>
            </div>
          )}
          {tooHigh && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400">Enter a value between 0.01% and 50%.</p>
            </div>
          )}
          <button
            onClick={() => { if (!tooHigh) { onSave(Math.round(pct * 100)); onClose(); } }}
            disabled={tooHigh}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
          >
            Save · {isNaN(pct) ? "—" : pct}%
          </button>
        </div>
      </div>
    </div>
  );
}

interface LeverageProps {
  open: boolean;
  onClose: () => void;
  value: number;
  onSave: (v: number) => void;
}

export function LeveragePicker({ open, onClose, value, onSave }: LeverageProps) {
  const [lev, setLev] = useState<number>(value);
  const [custom, setCustom] = useState<string>(
    LEV_PRESETS.includes(value) ? "" : String(value)
  );

  useEffect(() => {
    if (open) {
      setLev(value);
      setCustom(LEV_PRESETS.includes(value) ? "" : String(value));
    }
  }, [open, value]);

  if (!open) return null;
  const warn = lev >= 20;
  const extreme = lev >= 50;
  const invalid = lev < 1 || lev > 100 || isNaN(lev);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold">Default Leverage</h2>
            <p className="text-[11px] text-muted-foreground">Pre-fills new Futures &amp; Prediction positions</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary/50 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {LEV_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setLev(p); setCustom(""); }}
                className={cn(
                  "py-2.5 rounded-xl text-sm font-bold border transition",
                  lev === p && !custom
                    ? p >= 50 ? "bg-red-500/15 border-red-500/60 text-red-300"
                    : p >= 20 ? "bg-amber-500/15 border-amber-500/60 text-amber-300"
                    : "bg-primary/15 border-primary/60 text-foreground"
                    : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/60"
                )}
              >
                {p}x
              </button>
            ))}
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Custom (1–100)</label>
            <div className="mt-1.5 flex items-center gap-2 bg-secondary/30 border border-border rounded-xl px-3 py-2.5">
              <input
                type="number"
                min="1" max="100" step="1"
                value={custom}
                onChange={e => {
                  setCustom(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) setLev(v);
                }}
                placeholder="10"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <span className="text-sm text-muted-foreground">x</span>
            </div>
          </div>
          {extreme && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400">Extreme leverage — positions can be liquidated instantly on small moves.</p>
            </div>
          )}
          {warn && !extreme && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-400">High leverage — ensure you understand liquidation risk.</p>
            </div>
          )}
          {invalid && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-400">Enter a whole number between 1 and 100.</p>
            </div>
          )}
          <button
            onClick={() => { if (!invalid) { onSave(lev); onClose(); } }}
            disabled={invalid}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
          >
            Save · {isNaN(lev) ? "—" : `${lev}x`}
          </button>
        </div>
      </div>
    </div>
  );
}
