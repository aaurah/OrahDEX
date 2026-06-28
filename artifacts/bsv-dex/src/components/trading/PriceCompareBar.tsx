/**
 * PriceCompareBar — shows orderbook price, LetsExchange price, and SimpleSwap
 * price side by side for the active trading pair. Best external rate is
 * highlighted in green.
 */

import { cn, formatPrice } from "@/lib/utils";
import type { VenuePrice } from "@/hooks/usePairPrices";
import { Loader2 } from "lucide-react";

interface Props {
  base:         string;
  quote:        string;
  orderbookPrice: number;
  lePrice:      VenuePrice | null;
  ssPrice:      VenuePrice | null;
  bestVenue:    string | null;
  loading:      boolean;
}

function fmt(rate: number, orderbookRef: number): string {
  if (rate <= 0) return "—";
  if (orderbookRef > 0) {
    const decimals = orderbookRef < 0.0001 ? 8
      : orderbookRef < 0.01 ? 6
      : orderbookRef < 1 ? 4
      : 2;
    return rate.toFixed(decimals);
  }
  return formatPrice(rate);
}

function pct(external: number, ob: number): string | null {
  if (!ob || !external) return null;
  const diff = ((external - ob) / ob) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)}%`;
}

export function PriceCompareBar({
  base, quote, orderbookPrice, lePrice, ssPrice, bestVenue, loading,
}: Props) {
  const hasExternal = lePrice != null || ssPrice != null;

  const leRate = lePrice?.rate ?? 0;
  const ssRate = ssPrice?.rate ?? 0;

  const bestExternalRate = leRate > 0 && ssRate > 0
    ? Math.max(leRate, ssRate)
    : leRate > 0 ? leRate
    : ssRate;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-background/60 overflow-x-auto shrink-0 scrollbar-hide">
      <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap shrink-0 mr-1">
        Price compare:
      </span>

      {/* Orderbook price — always shown */}
      <PriceChip
        label="Orderbook"
        value={orderbookPrice > 0 ? fmt(orderbookPrice, orderbookPrice) : "—"}
        quote={quote}
        highlight={false}
        dot="bg-blue-400"
        badge={null}
      />

      {/* Separator */}
      {hasExternal && <span className="text-border text-xs shrink-0">·</span>}

      {/* LetsExchange */}
      {(loading && !lePrice && !ssPrice) ? (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          <span>Fetching rates…</span>
        </span>
      ) : (
        <>
          <PriceChip
            label="LE"
            labelFull="LetsExchange"
            value={leRate > 0 ? fmt(leRate, orderbookPrice) : "—"}
            quote={quote}
            highlight={leRate > 0 && leRate === bestExternalRate && leRate !== ssRate}
            dot="bg-yellow-400"
            badge={leRate > 0 && orderbookPrice > 0 ? pct(leRate, orderbookPrice) : null}
            unavailable={leRate === 0}
          />

          <span className="text-border text-xs shrink-0">·</span>

          <PriceChip
            label="SS"
            labelFull="SimpleSwap"
            value={ssRate > 0 ? fmt(ssRate, orderbookPrice) : "—"}
            quote={quote}
            highlight={ssRate > 0 && ssRate === bestExternalRate && leRate !== ssRate}
            dot="bg-purple-400"
            badge={ssRate > 0 && orderbookPrice > 0 ? pct(ssRate, orderbookPrice) : null}
            unavailable={ssRate === 0}
          />
        </>
      )}

      {/* Best label */}
      {bestVenue && hasExternal && (
        <span className="ml-auto shrink-0 text-[9px] font-semibold text-green-400/70 whitespace-nowrap">
          best: {bestVenue === "letsexchange" ? "LE" : bestVenue === "simpleswap" ? "SS" : bestVenue}
        </span>
      )}
    </div>
  );
}

function PriceChip({
  label, labelFull, value, quote, highlight, dot, badge, unavailable,
}: {
  label: string;
  labelFull?: string;
  value: string;
  quote: string;
  highlight: boolean;
  dot: string;
  badge: string | null;
  unavailable?: boolean;
}) {
  return (
    <div
      title={labelFull ?? label}
      className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap shrink-0 transition-colors",
        highlight
          ? "bg-green-500/15 border border-green-500/30"
          : "bg-secondary/50 border border-transparent",
        unavailable && "opacity-40",
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span className={cn(
        "font-mono font-semibold",
        highlight ? "text-green-400" : "text-foreground",
        unavailable && "text-muted-foreground",
      )}>
        {value}
      </span>
      {value !== "—" && (
        <span className="text-muted-foreground/70">{quote}</span>
      )}
      {badge && (
        <span className={cn(
          "text-[9px] font-mono ml-0.5",
          badge.startsWith("+") ? "text-green-400/80" : "text-red-400/80",
        )}>
          {badge}
        </span>
      )}
    </div>
  );
}
