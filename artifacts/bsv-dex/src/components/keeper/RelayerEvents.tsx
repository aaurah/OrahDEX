/**
 * RelayerEvents — Live HTLC Watcher Dashboard for Relayer Keepers
 *
 * Shows:
 *   • Active HTLC positions being monitored (LOCKED / EXPIRED)
 *   • Historical status-transition events (newest first)
 *
 * Polls the /api/keeper/relayer-events endpoint every 90 seconds
 * (staggered from the server-side watcher) and auto-registers the caller
 * as a Relayer Keeper for push notifications when their address is supplied.
 *
 * Status colour semantics:
 *   LOCKED   — purple:  awaiting relayer action or counterparty confirmation
 *   CLAIMED  — green:   relayer revealed secret, swap complete, fee earned
 *   EXPIRED  — amber:   locktime passed without claim, refund now available
 *   REFUNDED — red:     user swept via CLTV; trade is unwound
 *   UNKNOWN  — grey:    unfunded or chain API unreachable
 */

import { useQuery } from "@tanstack/react-query";
import { Globe, Clock, CheckCircle2, AlertTriangle, XCircle, HelpCircle, ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

type HtlcStatus = "LOCKED" | "CLAIMED" | "REFUNDED" | "EXPIRED" | "UNKNOWN";

interface HtlcEntry {
  tradeId:         string;
  htlcAddress:     string;
  secretHash:      string;
  locktimeBlocks:  number;
  settlementTxid:  string;
  pair:            string;
  userAddress:     string;
  registeredAt:    string;
  status:          HtlcStatus;
  spendTxid?:      string;
}

interface HtlcEvent {
  tradeId:        string;
  htlcAddress:    string;
  settlementTxid: string;
  pair:           string;
  fromStatus:     HtlcStatus;
  toStatus:       HtlcStatus;
  spendTxid?:     string;
  blockHeight:    number;
  timestamp:      string;
}

interface KeeperAction {
  id:            string;
  keeperAddress: string;
  htlcAddress:   string;
  tradeId:       string;
  pair:          string;
  action:        string;
  txid?:         string;
  blockHeight:   number;
  createdAt:     string;
}

interface RelayerEventsResponse {
  activeCount:   number;
  active:        HtlcEntry[];
  events:        HtlcEvent[];
  keeperActions: KeeperAction[];
  fetchedAt:     string;
}

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_META: Record<HtlcStatus, {
  label:   string;
  icon:    React.ElementType;
  color:   string;
  bg:      string;
  border:  string;
  action?: string;
}> = {
  LOCKED: {
    label:  "LOCKED",
    icon:   Clock,
    color:  "text-purple-400",
    bg:     "bg-purple-500/10",
    border: "border-purple-500/30",
    action: "Awaiting relayer claim or counterparty confirmation",
  },
  CLAIMED: {
    label:  "CLAIMED",
    icon:   CheckCircle2,
    color:  "text-green-400",
    bg:     "bg-green-500/10",
    border: "border-green-500/30",
    action: "Secret revealed — swap complete, bridge fee earned",
  },
  EXPIRED: {
    label:  "EXPIRED",
    icon:   AlertTriangle,
    color:  "text-amber-400",
    bg:     "bg-amber-500/10",
    border: "border-amber-500/30",
    action: "Locktime passed — user may sweep via CLTV refund path",
  },
  REFUNDED: {
    label:  "REFUNDED",
    icon:   XCircle,
    color:  "text-red-400",
    bg:     "bg-red-500/10",
    border: "border-red-500/30",
    action: "User swept via CLTV — trade is unwound on-chain",
  },
  UNKNOWN: {
    label:  "UNKNOWN",
    icon:   HelpCircle,
    color:  "text-muted-foreground",
    bg:     "bg-muted/20",
    border: "border-border",
    action: "Not yet funded or chain API unreachable",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortHash(h: string, n = 8): string {
  return h ? `${h.slice(0, n)}…${h.slice(-4)}` : "—";
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function WocLink({ txid, label }: { txid: string; label?: string }) {
  return (
    <a
      href={`https://whatsonchain.com/tx/${txid}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-primary hover:underline"
    >
      {label ?? shortHash(txid)}
    </a>
  );
}

function StatusBadge({ status }: { status: HtlcStatus }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border", m.bg, m.border, m.color)}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RelayerEventsProps {
  /** Keeper wallet address — if supplied, auto-registers for notifications */
  keeperAddress?: string;
}

export function RelayerEvents({ keeperAddress }: RelayerEventsProps) {
  const url = keeperAddress
    ? `${BASE}/api/keeper/relayer-events?address=${encodeURIComponent(keeperAddress)}&limit=50`
    : `${BASE}/api/keeper/relayer-events?limit=50`;
  // ↑ Maps to GET /api/keeper/relayer-events (registered before /:address catch-all)

  const q = useQuery<RelayerEventsResponse>({
    queryKey: ["keeper-relayer-events", keeperAddress],
    queryFn:  () => fetch(url).then(r => r.json()),
    refetchInterval: 90_000,
    staleTime:       60_000,
  });

  const data = q.data;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Relayer HTLC Monitor</h3>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.activeCount} active
            </span>
          )}
        </div>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", q.isFetching && "animate-spin")} />
          {data ? fmtTime(data.fetchedAt) : "—"}
        </button>
      </div>

      {/* Loading */}
      {q.isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      )}

      {/* Active HTLCs */}
      {data && data.active.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Positions</p>
          {data.active.map(entry => {
            const m = STATUS_META[entry.status];
            const Icon = m.icon;
            return (
              <div key={entry.tradeId} className={cn("rounded-xl border p-4 space-y-3 transition-colors", m.bg, m.border)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("rounded-md p-1.5 border", m.bg, m.border)}>
                      <Icon className={cn("w-3.5 h-3.5", m.color)} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{entry.pair}</p>
                      <p className="text-xs text-muted-foreground">
                        Trade {shortHash(entry.tradeId, 6)} · {fmtTime(entry.registeredAt)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-muted-foreground">Settlement tx</div>
                  <WocLink txid={entry.settlementTxid} />
                  <div className="text-muted-foreground">HTLC address</div>
                  <a
                    href={`https://whatsonchain.com/address/${entry.htlcAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline truncate"
                  >
                    {shortHash(entry.htlcAddress)}
                  </a>
                  <div className="text-muted-foreground">Locktime</div>
                  <span className="font-mono">block #{entry.locktimeBlocks.toLocaleString()}</span>
                  {entry.spendTxid && (
                    <>
                      <div className="text-muted-foreground">Spend tx</div>
                      <WocLink txid={entry.spendTxid} />
                    </>
                  )}
                </div>
                {m.action && (
                  <p className={cn("text-xs font-medium", m.color)}>{m.action}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty active state */}
      {data && data.active.length === 0 && (
        <div className="rounded-xl border border-border bg-card/30 p-8 text-center text-muted-foreground text-sm">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No active HTLC positions</p>
          <p className="text-xs mt-1">Cross-chain settlements will appear here when matched</p>
        </div>
      )}

      {/* Event log */}
      {data && data.events.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Transitions</p>
          <div className="rounded-xl border border-border bg-card/30 divide-y divide-border">
            {data.events.map((event, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={event.fromStatus} />
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <StatusBadge status={event.toStatus} />
                </div>
                <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{event.pair}</span>
                  {" · "}
                  {event.spendTxid
                    ? <WocLink txid={event.spendTxid} label={`spend ${shortHash(event.spendTxid, 6)}`} />
                    : `block #${event.blockHeight.toLocaleString()}`}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{fmtTime(event.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keeper action log */}
      {data && data.keeperActions && data.keeperActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Keeper Action Log</p>
          <div className="rounded-xl border border-border bg-card/30 divide-y divide-border">
            {data.keeperActions.map((a) => {
              const actionColor =
                a.action === "CLAIMED"  ? "text-emerald-400" :
                a.action === "REFUNDED" ? "text-red-400"     :
                a.action === "EXPIRED"  ? "text-amber-400"   :
                                          "text-muted-foreground";
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("text-xs font-bold shrink-0 w-20", actionColor)}>
                    {a.action}
                  </span>
                  <div className="flex-1 min-w-0 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.pair}</span>
                    {a.txid
                      ? <>{" · "}<WocLink txid={a.txid} label={`tx ${shortHash(a.txid, 6)}`} /></>
                      : a.blockHeight > 0 ? ` · block #${a.blockHeight.toLocaleString()}` : ""}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtTime(a.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Auto-refresh notice */}
      <p className="text-xs text-muted-foreground text-center">
        Polls every 90 s — staggered from on-chain HTLC monitor
      </p>
    </div>
  );
}
