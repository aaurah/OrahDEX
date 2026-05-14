/**
 * Settlement Explorer — BSV Core DEX v2
 *
 * Surfaces the on-chain HTLC status for a cross-chain settlement.
 * Polls the /api/settlements/htlc-status endpoint and shows:
 *   LOCKED   — P2SH output funded, waiting for relayer or expiry
 *   CLAIMED  — relayer spent with secret (cross-chain swap complete)
 *   EXPIRED  — locktime passed, awaiting user refund
 *   REFUNDED — user reclaimed via CLTV refund path
 *   UNKNOWN  — address unfunded or API unavailable
 *
 * Lifecycle: LOCKED → CLAIMED  (ideal path, relayer revealed secret)
 *                   → EXPIRED → REFUNDED  (fallback, user reclaimed after ~24h)
 */

import { useEffect, useState, useCallback } from "react";
import { ExternalLink, RefreshCw, Lock, CheckCircle2, Clock, RotateCcw, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type HtlcStatus = "LOCKED" | "CLAIMED" | "REFUNDED" | "EXPIRED" | "UNKNOWN";

interface HtlcStatusResult {
  status:       HtlcStatus;
  spendTxid?:   string;
  blockHeight:  number;
  checkedAt:    string;
}

interface SettlementExplorerProps {
  /** BSV settlement txid (OP_RETURN transaction) */
  settlementTxid:     string;
  /** OP_RETURN payload string (v2 format: ORAHDEX|v2|...) */
  opReturnPayload?:   string;
  /** HTLC P2SH address — cross-chain only */
  htlcAddress?:       string | null;
  /** Absolute BSV block locktime for refund path */
  htlcLocktimeBlocks?: number | null;
  /** Compact mode for embedding inside the order form */
  compact?: boolean;
  className?: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<HtlcStatus, {
  label:   string;
  detail:  string;
  color:   string;
  bg:      string;
  border:  string;
  Icon:    React.ComponentType<{ className?: string }>;
}> = {
  LOCKED: {
    label:  "Locked",
    detail: "Waiting for relayer to reveal the secret and claim the HTLC",
    color:  "text-yellow-400",
    bg:     "bg-yellow-500/10",
    border: "border-yellow-500/25",
    Icon:   Lock,
  },
  CLAIMED: {
    label:  "Claimed",
    detail: "Relayer revealed the preimage — cross-chain swap complete",
    color:  "text-green-400",
    bg:     "bg-green-500/10",
    border: "border-green-500/25",
    Icon:   CheckCircle2,
  },
  EXPIRED: {
    label:  "Expired",
    detail: "Locktime passed — user can now claim a refund via CLTV path",
    color:  "text-orange-400",
    bg:     "bg-orange-500/10",
    border: "border-orange-500/25",
    Icon:   Clock,
  },
  REFUNDED: {
    label:  "Refunded",
    detail: "User reclaimed funds via the CLTV refund path",
    color:  "text-blue-400",
    bg:     "bg-blue-500/10",
    border: "border-blue-500/25",
    Icon:   RotateCcw,
  },
  UNKNOWN: {
    label:  "Unknown",
    detail: "HTLC address not yet funded or chain API unavailable",
    color:  "text-muted-foreground",
    bg:     "bg-muted/20",
    border: "border-border",
    Icon:   HelpCircle,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SettlementExplorer({
  settlementTxid,
  opReturnPayload,
  htlcAddress,
  htlcLocktimeBlocks,
  compact = false,
  className,
}: SettlementExplorerProps) {
  const [htlcStatus,  setHtlcStatus]  = useState<HtlcStatusResult | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHtlcStatus = useCallback(async () => {
    if (!htlcAddress || !htlcLocktimeBlocks) return;
    setLoading(true);
    try {
      const url = `${API_BASE}/settlements/htlc-status?htlcAddress=${encodeURIComponent(htlcAddress)}&locktimeBlocks=${htlcLocktimeBlocks}`;
      const res  = await fetch(url);
      if (res.ok) {
        const data = await res.json() as HtlcStatusResult;
        setHtlcStatus(data);
        setLastRefresh(new Date());
      }
    } catch {
      // silent — network may be unavailable
    } finally {
      setLoading(false);
    }
  }, [htlcAddress, htlcLocktimeBlocks]);

  // Auto-fetch on mount, then poll every 60 s while LOCKED or EXPIRED
  useEffect(() => {
    if (!htlcAddress) return;
    fetchHtlcStatus();
    const interval = setInterval(() => {
      if (htlcStatus?.status === "LOCKED" || htlcStatus?.status === "EXPIRED" || !htlcStatus) {
        fetchHtlcStatus();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [htlcAddress, htlcStatus?.status, fetchHtlcStatus]);

  const cfg = STATUS_CONFIG[htlcStatus?.status ?? "UNKNOWN"];

  if (compact) {
    // Compact inline badge for the SettlementBanner
    return (
      <div className={cn("flex items-center gap-2 text-[10px]", className)}>
        <cfg.Icon className={cn("w-3 h-3", cfg.color)} />
        <span className={cfg.color}>HTLC {cfg.label}</span>
        {htlcStatus?.spendTxid && (
          <a
            href={`https://whatsonchain.com/tx/${htlcStatus.spendTxid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <button
          onClick={() => void fetchHtlcStatus()}
          disabled={loading}
          className="text-muted-foreground/60 hover:text-muted-foreground"
          title="Refresh HTLC status"
        >
          <RefreshCw className={cn("w-2.5 h-2.5", loading && "animate-spin")} />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-3", cfg.bg, cfg.border, className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", cfg.bg)}>
            <cfg.Icon className={cn("w-4 h-4", cfg.color)} />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">Settlement Explorer</div>
            <div className="text-[10px] text-muted-foreground">BSV Core DEX v2 — HTLC Status</div>
          </div>
        </div>
        <button
          onClick={() => void fetchHtlcStatus()}
          disabled={loading || !htlcAddress}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Status pill */}
      {htlcAddress && (
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border",
            cfg.color, cfg.border,
          )}>
            <cfg.Icon className="w-2.5 h-2.5" />
            {cfg.label.toUpperCase()}
          </span>
          <span className="text-[10px] text-muted-foreground">{cfg.detail}</span>
        </div>
      )}

      {/* Data rows */}
      <div className="flex flex-col gap-1.5 text-[10px]">
        {/* Settlement txid */}
        <DataRow
          label="Settlement TX"
          value={settlementTxid.slice(0, 20) + "…" + settlementTxid.slice(-8)}
          href={`https://whatsonchain.com/tx/${settlementTxid}`}
        />

        {/* HTLC address */}
        {htlcAddress && (
          <DataRow
            label="HTLC Address"
            value={htlcAddress.slice(0, 18) + "…" + htlcAddress.slice(-6)}
            href={`https://whatsonchain.com/address/${htlcAddress}`}
          />
        )}

        {/* Spend txid (claim or refund) */}
        {htlcStatus?.spendTxid && (
          <DataRow
            label={htlcStatus.status === "CLAIMED" ? "Claim TX" : "Refund TX"}
            value={htlcStatus.spendTxid.slice(0, 20) + "…" + htlcStatus.spendTxid.slice(-8)}
            href={`https://whatsonchain.com/tx/${htlcStatus.spendTxid}`}
          />
        )}

        {/* Locktime */}
        {htlcLocktimeBlocks && (
          <DataRow
            label="Refund Locktime"
            value={`Block #${htlcLocktimeBlocks.toLocaleString()} (≈24h)`}
          />
        )}

        {/* Current height */}
        {htlcStatus?.blockHeight ? (
          <DataRow
            label="Chain Height"
            value={`#${htlcStatus.blockHeight.toLocaleString()}`}
          />
        ) : null}

        {/* OP_RETURN payload */}
        {opReturnPayload && (
          <div className="mt-1 pt-1.5 border-t border-border/50">
            <div className="text-muted-foreground mb-0.5">OP_RETURN v2 Payload</div>
            <div className="font-mono text-[9px] text-foreground/70 break-all bg-muted/30 rounded px-2 py-1 leading-relaxed">
              {opReturnPayload}
            </div>
          </div>
        )}
      </div>

      {/* Lifecycle legend */}
      <div className="pt-1 border-t border-border/50">
        <div className="text-[9px] text-muted-foreground/70 mb-1">Lifecycle</div>
        <div className="flex items-center gap-1 flex-wrap">
          {(["LOCKED", "CLAIMED", "EXPIRED", "REFUNDED"] as HtlcStatus[]).map((s, i, arr) => {
            const c = STATUS_CONFIG[s];
            const isCurrent = htlcStatus?.status === s;
            return (
              <div key={s} className="flex items-center gap-0.5">
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded border",
                  isCurrent ? cn(c.color, c.border, c.bg, "font-semibold") : "text-muted-foreground/50 border-transparent",
                )}>
                  {s}
                </span>
                {i < arr.length - 1 && <span className="text-muted-foreground/30 text-[9px]">→</span>}
              </div>
            );
          })}
        </div>
      </div>

      {lastRefresh && (
        <div className="text-[9px] text-muted-foreground/50">
          Last checked: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-foreground/80 text-right flex items-center gap-1">
        {value}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 shrink-0"
          >
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </span>
    </div>
  );
}
