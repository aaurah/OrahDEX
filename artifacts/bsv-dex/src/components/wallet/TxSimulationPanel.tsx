/**
 * TxSimulationPanel.tsx — Pre-execution transaction simulation UI
 *
 * Displays the SimulationResult from txSimulator.ts before the user
 * confirms a swap or send. Shows:
 *   - Balance deltas (before → after)
 *   - Gas estimate in ETH + USD
 *   - Risk flags with severity color coding
 *   - Proceed / Cancel decision buttons
 */

import { useState, useEffect } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, Loader2,
  TrendingDown, TrendingUp, Fuel, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulationResult, RiskLevel } from "@/lib/txSimulator";
import { riskLevelColor, riskLevelBg } from "@/lib/txSimulator";
import { checkCurrentOrigin } from "@/lib/antiPhishing";

// ── Props ─────────────────────────────────────────────────────────────────────

interface TxSimulationPanelProps {
  simulation:   SimulationResult | null;
  loading:      boolean;
  onProceed:    () => void;
  onCancel:     () => void;
  proceedLabel?: string;
  className?:   string;
}

// ── Shield icon by overall status ────────────────────────────────────────────

function StatusShield({ result }: { result: SimulationResult }) {
  const critical = result.riskFlags.some(f => f.level === "critical");
  const high     = result.riskFlags.some(f => f.level === "high");
  const medium   = result.riskFlags.some(f => f.level === "medium");

  if (critical) return <ShieldX    size={20} className="text-red-500 shrink-0" />;
  if (high)     return <ShieldAlert size={20} className="text-orange-400 shrink-0" />;
  if (medium)   return <ShieldAlert size={20} className="text-yellow-400 shrink-0" />;
  return               <ShieldCheck size={20} className="text-green-400 shrink-0" />;
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function TxSimulationPanel({
  simulation, loading, onProceed, onCancel, proceedLabel = "Confirm", className,
}: TxSimulationPanelProps) {
  const [flagsExpanded, setFlagsExpanded] = useState(false);
  const domainCheck = checkCurrentOrigin();

  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-border bg-background p-5 space-y-4", className)}>
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="text-primary animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold">Simulating transaction…</p>
            <p className="text-xs text-muted-foreground">Checking balances, allowances, and risk</p>
          </div>
        </div>
      </div>
    );
  }

  if (!simulation) return null;

  const hasFlags    = simulation.riskFlags.length > 0;
  const canProceed  = simulation.canProceed;
  const critFlags   = simulation.riskFlags.filter(f => f.level === "critical");

  return (
    <div className={cn("rounded-2xl border border-border bg-background overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <StatusShield result={simulation} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Transaction Preview</p>
          <p className={cn(
            "text-xs mt-0.5",
            canProceed ? "text-muted-foreground" : "text-red-400",
          )}>
            {simulation.summary}
          </p>
        </div>
        <button onClick={onCancel} className="p-1 rounded-lg hover:bg-secondary transition-colors shrink-0">
          <X size={14} className="text-muted-foreground" />
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {/* Anti-phishing origin check */}
        {!domainCheck.isOrahDex && domainCheck.risk !== "safe" && (
          <div className={cn(
            "rounded-xl border px-3 py-2.5 text-xs",
            domainCheck.risk === "dangerous"
              ? "bg-red-500/10 border-red-500/30 text-red-400"
              : "bg-yellow-400/10 border-yellow-400/30 text-yellow-400",
          )}>
            <span className="font-bold">Origin check: </span>
            {domainCheck.reason ?? `This site (${domainCheck.origin}) is not a verified OrahDEX domain.`}
          </div>
        )}

        {/* Balance deltas */}
        {simulation.balanceDeltas.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Balance changes
            </p>
            {simulation.balanceDeltas.map((d, i) => (
              <div key={i} className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  {d.isNegative
                    ? <TrendingDown size={13} className="text-red-400 shrink-0" />
                    : <TrendingUp   size={13} className="text-green-400 shrink-0" />}
                  <span className="text-xs font-semibold">{d.symbol}</span>
                  {d.before !== "—" && (
                    <span className="text-[10px] text-muted-foreground">({d.before})</span>
                  )}
                </div>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  d.isNegative ? "text-red-400" : "text-green-400",
                )}>
                  {d.delta}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Gas estimate */}
        {simulation.gasEstimate && (
          <div className="flex items-center justify-between bg-secondary/30 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <Fuel size={13} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Estimated gas</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono">{simulation.gasEstimate} ETH</span>
              {simulation.gasCostUsd != null && (
                <span className="text-[10px] text-muted-foreground ml-1.5">
                  (~${simulation.gasCostUsd.toFixed(2)})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Risk flags */}
        {hasFlags && (
          <div className="space-y-1.5">
            <button
              className="w-full flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
              onClick={() => setFlagsExpanded(e => !e)}
            >
              <span>{simulation.riskFlags.length} risk notice{simulation.riskFlags.length > 1 ? "s" : ""}</span>
              {flagsExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {(flagsExpanded || critFlags.length > 0) && (
              <div className="space-y-1.5">
                {(flagsExpanded ? simulation.riskFlags : critFlags).map((flag, i) => (
                  <div key={i} className={cn("rounded-xl border px-3 py-2 text-xs", riskLevelBg(flag.level))}>
                    <span className={cn("font-bold capitalize mr-1", riskLevelColor(flag.level))}>
                      {flag.level}:
                    </span>
                    {flag.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-secondary/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            disabled={!canProceed}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors",
              canProceed
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-red-500/20 text-red-400 border border-red-500/30 cursor-not-allowed",
            )}
          >
            {canProceed ? proceedLabel : "Blocked"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Compact inline badge (for swap confirm flow) ──────────────────────────────

export function SimulationStatusBadge({ result }: { result: SimulationResult }) {
  const critical = result.riskFlags.some(f => f.level === "critical");
  const high     = result.riskFlags.some(f => f.level === "high");

  if (critical) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1">
        <ShieldX size={12} />
        <span className="font-semibold">Blocked</span>
      </div>
    );
  }
  if (high) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 rounded-lg px-2.5 py-1">
        <ShieldAlert size={12} />
        <span className="font-semibold">Warning</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-2.5 py-1">
      <ShieldCheck size={12} />
      <span className="font-semibold">Looks good</span>
    </div>
  );
}
