/**
 * SorRouteDisplay.tsx — Smart Order Router route visualization
 *
 * Shows the multi-hop swap route returned by /api/sor/quote.
 * Renders a horizontal flow: Token → [Pool Badge] → Token → … → Token
 * with price impact, fee, and protocol labels per hop.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoinLogo } from "@/components/CoinLogo";
import type { SorRoute, SorQuoteResponse } from "@/lib/sorClient";
import { formatSorImpact, protocolLabel, feeLabel } from "@/lib/sorClient";

// ── Props ─────────────────────────────────────────────────────────────────────

interface SorRouteDisplayProps {
  quote:     SorQuoteResponse | null;
  loading:   boolean;
  error?:    string | null;
  className?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SorRouteDisplay({ quote, loading, error, className }: SorRouteDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border bg-secondary/20 px-4 py-3", className)}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap size={12} className="animate-pulse text-primary" />
          <span>Finding best route…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3", className)}>
        <div className="flex items-center gap-2 text-xs text-orange-400">
          <AlertTriangle size={12} />
          <span>No route found: {error}</span>
        </div>
      </div>
    );
  }

  if (!quote?.bestRoute) return null;

  const best     = quote.bestRoute;
  const impact   = formatSorImpact(best.priceImpact);
  const altCount = quote.routes.length - 1;

  return (
    <div className={cn("rounded-xl border border-border bg-secondary/20 overflow-hidden", className)}>
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Zap size={12} className="text-primary shrink-0" />
          <span className="text-xs font-semibold">Best Route</span>
          {/* Compact path pill */}
          <div className="flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
            {best.path.map((token, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <span className="text-[10px] font-bold">{token}</span>
                {i < best.path.length - 1 && (
                  <ArrowRight size={8} className="text-muted-foreground" />
                )}
              </span>
            ))}
          </div>
          {altCount > 0 && (
            <span className="text-[10px] text-muted-foreground">+{altCount} alt</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs font-mono", impact.color)}>
            {impact.label} impact
          </span>
          {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded route detail */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Visual flow */}
          <RouteFlow route={best} />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <StatCell label="Effective price">
              {best.effectivePrice > 0
                ? `${best.effectivePrice.toFixed(6)}`
                : "—"}
            </StatCell>
            <StatCell label="Total fees">
              ${best.totalFeeUsd.toFixed(4)}
            </StatCell>
            <StatCell label="Hops">
              {best.hops.length}
            </StatCell>
          </div>

          {/* Output amount */}
          {quote.tradeValueUsd != null && (
            <div className="text-xs text-muted-foreground">
              Trade value: <span className="text-foreground font-mono">${quote.tradeValueUsd.toFixed(2)}</span>
            </div>
          )}

          {/* Alternate routes */}
          {altCount > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Alternate routes
              </p>
              {quote.routes.slice(1).map((r, i) => (
                <AltRouteRow key={i} route={r} rank={i + 2} bestOut={best.amountOut} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Route flow visualization ──────────────────────────────────────────────────

function RouteFlow({ route }: { route: SorRoute }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Starting token */}
      <TokenBadge symbol={route.path[0]!} />

      {route.hops.map((hop, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {/* Pool connector */}
          <PoolConnector
            poolId={hop.poolId}
            protocol={hop.protocol}
            fee={hop.fee}
            priceImpact={hop.priceImpact}
          />
          {/* Output token */}
          <TokenBadge symbol={hop.tokenOut} />
        </span>
      ))}
    </div>
  );
}

function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1">
      <CoinLogo symbol={symbol} size={14} />
      <span className="text-xs font-bold">{symbol}</span>
    </div>
  );
}

function PoolConnector({
  poolId, protocol, fee, priceImpact,
}: { poolId: string; protocol: string; fee: number; priceImpact: number }) {
  const impact = formatSorImpact(priceImpact);
  const label  = protocolLabel(protocol);
  const feeStr = feeLabel(fee);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[9px] font-semibold text-primary whitespace-nowrap">
        {label}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-muted-foreground">{feeStr}</span>
        <span className="text-[9px]">·</span>
        <span className={cn("text-[9px]", impact.color)}>{impact.label}</span>
      </div>
      {/* Arrow line */}
      <ArrowRight size={10} className="text-muted-foreground" />
    </div>
  );
}

// ── Alternate route row ───────────────────────────────────────────────────────

function AltRouteRow({ route, rank, bestOut }: { route: SorRoute; rank: number; bestOut: number }) {
  const diffPct = bestOut > 0 ? ((route.amountOut - bestOut) / bestOut) * 100 : 0;
  const impact  = formatSorImpact(route.priceImpact);

  return (
    <div className="flex items-center justify-between bg-background/40 rounded-lg px-3 py-1.5 border border-border/50">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground font-mono">#{rank}</span>
        <span className="text-[10px]">{route.path.join(" → ")}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-[10px]", impact.color)}>{impact.label}</span>
        <span className={cn("text-[10px] font-mono", diffPct < 0 ? "text-red-400" : "text-green-400")}>
          {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

// ── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background/40 rounded-lg px-2 py-1.5 text-center">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-xs font-mono font-bold mt-0.5">{children}</div>
    </div>
  );
}
