import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetch";
import {
  Link2, RefreshCw, ChevronDown, ChevronRight, Search, X,
  AlertTriangle, CheckCircle, Clock, Copy, Check, ExternalLink,
  ShieldCheck, Zap, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Intent {
  id: string;
  intentHash: string;
  nonce: string;
  userAddress: string;
  solverAddress: string | null;
  tokenIn: string;
  tokenOut: string;
  amountInSat: number;
  minAmountOut: string;
  destinationChain: string;
  destinationAddress: string;
  deadlineTs: number;
  deadlineBlocks: number;
  secretHash: string;
  redeemScript: string;
  htlcAddress: string;
  fundingTxid: string | null;
  fundingVout: number | null;
  fundingConfirmed: boolean;
  confirmations: number;
  solverPaymentTxid: string | null;
  fillNote: string | null;
  claimTxid: string | null;
  refundTxid: string | null;
  auditTxid: string | null;
  status: string;
  terminalAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

interface IntentsResponse {
  intents: Intent[];
  total: number;
  byStatus: Record<string, number>;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const ALL_STATUSES = [
  "PENDING_FUNDING", "FUNDED", "CONFIRMED", "FILLED",
  "CLAIMING", "CLAIMED", "EXPIRED", "REFUNDING", "REFUNDED", "CANCELLED",
];

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  PENDING_FUNDING: { color: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",   dot: "bg-zinc-400",    label: "Awaiting Fund" },
  FUNDED:          { color: "bg-blue-500/15  text-blue-300  border-blue-500/30",  dot: "bg-blue-400",    label: "Funded" },
  CONFIRMED:       { color: "bg-cyan-500/15  text-cyan-300  border-cyan-500/30",  dot: "bg-cyan-400",    label: "Confirmed" },
  FILLED:          { color: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400", label: "Filled" },
  CLAIMING:        { color: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400 animate-pulse", label: "Claiming" },
  CLAIMED:         { color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400", label: "Claimed" },
  EXPIRED:         { color: "bg-orange-500/15 text-orange-300 border-orange-500/30", dot: "bg-orange-400", label: "Expired" },
  REFUNDING:       { color: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400 animate-pulse", label: "Refunding" },
  REFUNDED:        { color: "bg-zinc-500/15  text-zinc-300  border-zinc-500/30",  dot: "bg-zinc-400",    label: "Refunded" },
  CANCELLED:       { color: "bg-red-500/15   text-red-300   border-red-500/30",   dot: "bg-red-400",     label: "Cancelled" },
};

const TERMINAL = new Set(["CLAIMED", "REFUNDED", "CANCELLED"]);

/* ── Helpers ────────────────────────────────────────────────────────────── */

function short(s: string, n = 8) {
  if (!s) return "—";
  return s.length <= n * 2 + 3 ? s : `${s.slice(0, n)}…${s.slice(-4)}`;
}

function fmtTs(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtAgo(ts: string | null) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function satToBsv(sat: number) {
  return (sat / 1e8).toFixed(8);
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { color: "bg-zinc-700 text-zinc-300 border-zinc-600", dot: "bg-zinc-400", label: status };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-semibold", cfg.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); }}
      className="text-zinc-500 hover:text-zinc-300 transition-colors"
      title="Copy"
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

/* ── Summary stat card ──────────────────────────────────────────────────── */

function SumCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-center">
      <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

/* ── Detail row ─────────────────────────────────────────────────────────── */

function DetailRow({ label, value, mono = true, truncate = false }: { label: string; value: string | number | null; mono?: boolean; truncate?: boolean }) {
  const str = value === null || value === undefined ? "—" : String(value);
  return (
    <div className="flex items-start gap-2 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-[11px] text-zinc-500 w-40 shrink-0 pt-0.5">{label}</span>
      <span className={cn("text-[11px] flex-1 break-all", mono && "font-mono text-zinc-200", truncate && "truncate")}>
        {str || "—"}
      </span>
      {str && str !== "—" && mono && <CopyBtn text={str} />}
    </div>
  );
}

/* ── Expanded detail panel ──────────────────────────────────────────────── */

function ExpandedRow({ intent, onForceExpire, expiring }: { intent: Intent; onForceExpire: () => void; expiring: boolean }) {
  const now = Math.floor(Date.now() / 1000);
  const isPastDeadline = now > intent.deadlineTs;
  const isTerminal = TERMINAL.has(intent.status);
  const wocBase = "https://whatsonchain.com/tx/";

  return (
    <div className="px-4 py-4 bg-zinc-950/80 border-t border-zinc-800 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Intent identity */}
        <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Intent Identity</p>
          <DetailRow label="Intent ID"    value={intent.id} />
          <DetailRow label="Intent Hash"  value={intent.intentHash} />
          <DetailRow label="Nonce"        value={intent.nonce} />
          <DetailRow label="Secret Hash"  value={intent.secretHash} />
        </div>

        {/* Trade terms */}
        <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Trade Terms</p>
          <DetailRow label="Token In"     value={intent.tokenIn} mono={false} />
          <DetailRow label="Token Out"    value={intent.tokenOut} mono={false} />
          <DetailRow label="Amount In"    value={`${intent.amountInSat.toLocaleString()} sat (${satToBsv(intent.amountInSat)} BSV)`} mono={false} />
          <DetailRow label="Min Out"      value={`${intent.minAmountOut} ${intent.tokenOut}`} mono={false} />
          <DetailRow label="Dest Chain"   value={intent.destinationChain} mono={false} />
          <DetailRow label="Dest Address" value={intent.destinationAddress} />
        </div>

        {/* Settlement contract */}
        <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Settlement Contract</p>
          <DetailRow label="HTLC Address"   value={intent.htlcAddress} />
          <DetailRow label="Redeem Script"  value={intent.redeemScript} />
          <DetailRow label="Deadline TS"    value={fmtTs(intent.deadlineTs)} mono={false} />
          <DetailRow label="Deadline Block" value={intent.deadlineBlocks} mono={false} />
          <DetailRow label="Expires At"     value={fmtTs(intent.expiresAt)} mono={false} />
        </div>

        {/* Funding & settlement txns */}
        <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Transactions</p>
          <DetailRow label="Funding TXID"   value={intent.fundingTxid} />
          <DetailRow label="Funding Vout"   value={intent.fundingVout} mono={false} />
          <DetailRow label="Confirmations"  value={`${intent.confirmations} (${intent.fundingConfirmed ? "confirmed" : "unconfirmed"})`} mono={false} />
          <DetailRow label="Solver TXID"    value={intent.solverPaymentTxid} />
          <DetailRow label="Claim TXID"     value={intent.claimTxid} />
          <DetailRow label="Refund TXID"    value={intent.refundTxid} />
          <DetailRow label="Audit TXID"     value={intent.auditTxid} />
          <DetailRow label="Fill Note"      value={intent.fillNote} mono={false} />
        </div>
      </div>

      {/* Links to WoC */}
      {(intent.fundingTxid || intent.claimTxid || intent.refundTxid) && (
        <div className="flex flex-wrap gap-2">
          {intent.fundingTxid && (
            <a href={`${wocBase}${intent.fundingTxid}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 border border-zinc-700 transition-colors">
              <ExternalLink className="w-3 h-3" /> Funding TX on WoC
            </a>
          )}
          {intent.claimTxid && (
            <a href={`${wocBase}${intent.claimTxid}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-900/30 hover:bg-emerald-900/50 text-xs text-emerald-300 border border-emerald-700/40 transition-colors">
              <ExternalLink className="w-3 h-3" /> Claim TX on WoC
            </a>
          )}
          {intent.refundTxid && (
            <a href={`${wocBase}${intent.refundTxid}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-900/30 hover:bg-orange-900/50 text-xs text-orange-300 border border-orange-700/40 transition-colors">
              <ExternalLink className="w-3 h-3" /> Refund TX on WoC
            </a>
          )}
        </div>
      )}

      {/* Admin actions */}
      {!isTerminal && (
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">Admin Actions:</span>
          <button
            onClick={onForceExpire}
            disabled={expiring || !isPastDeadline}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              isPastDeadline
                ? "bg-orange-600/20 text-orange-300 border-orange-500/30 hover:bg-orange-600/40"
                : "opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700"
            )}
            title={isPastDeadline ? "Force-expire this intent and let the watcher issue a refund" : "Can only expire intents past their deadline"}
          >
            {expiring ? <RefreshCw className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
            {expiring ? "Expiring…" : "Force Expire"}
          </button>
          {!isPastDeadline && (
            <span className="text-[10px] text-zinc-600">Deadline not yet reached — cannot expire early</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */

export function AdminBsvIntents() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expiringId, setExpiringId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery<IntentsResponse>({
    queryKey:        ["admin-bsv-intents"],
    queryFn:         () => adminFetch("/api/admin/bsv-intents?limit=200").then(r => r.json()),
    refetchInterval: autoRefresh ? 15_000 : false,
    staleTime:       10_000,
  });

  const forceExpireMut = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/api/admin/bsv-intents/${id}/force-expire`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-bsv-intents"] });
      setExpiringId(null);
    },
    onError: () => setExpiringId(null),
  });

  function handleForceExpire(id: string) {
    setExpiringId(id);
    forceExpireMut.mutate(id);
  }

  const byStatus = data?.byStatus ?? {};
  const totalActive = (byStatus.PENDING_FUNDING ?? 0) + (byStatus.FUNDED ?? 0) +
    (byStatus.CONFIRMED ?? 0) + (byStatus.FILLED ?? 0) + (byStatus.CLAIMING ?? 0);
  const totalClaimed = byStatus.CLAIMED ?? 0;
  const totalRefunded = (byStatus.REFUNDED ?? 0) + (byStatus.REFUNDING ?? 0);
  const totalStuck = byStatus.EXPIRED ?? 0;
  const totalCancelled = byStatus.CANCELLED ?? 0;

  const intents = (data?.intents ?? []).filter(i => {
    if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.id.includes(q) ||
        i.userAddress.toLowerCase().includes(q) ||
        i.htlcAddress.toLowerCase().includes(q) ||
        i.intentHash.includes(q) ||
        (i.solverAddress?.toLowerCase().includes(q) ?? false) ||
        (i.fundingTxid?.includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Link2 className="w-5 h-5 text-emerald-400" />
            BSV Intent Sessions
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Cross-chain BSV→EVM intent settlement · dual-hash HTLC enforcement · {data?.total ?? 0} total sessions
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-emerald-500" />
            Live
          </label>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-lg border border-zinc-700 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-2">
        <SumCard label="Active"    value={totalActive}    color="text-blue-300" />
        <SumCard label="Claimed"   value={totalClaimed}   color="text-emerald-400" />
        <SumCard label="Refunded"  value={totalRefunded}  color="text-orange-300" />
        <SumCard label="Expired"   value={totalStuck}     color="text-amber-400" />
        <SumCard label="Cancelled" value={totalCancelled} color="text-red-400" />
      </div>

      {/* Lifecycle flow */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-bold">Lifecycle</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {["PENDING_FUNDING","FUNDED","CONFIRMED","FILLED","CLAIMING","CLAIMED"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusBadge status={s} />
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
            </span>
          ))}
          <span className="text-zinc-600 mx-2">|</span>
          {["EXPIRED","REFUNDING","REFUNDED"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusBadge status={s} />
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
              statusFilter === "ALL"
                ? "bg-zinc-600 text-white border-zinc-500"
                : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
            )}
          >
            All ({data?.total ?? 0})
          </button>
          {ALL_STATUSES.map(s => {
            const count = byStatus[s] ?? 0;
            if (count === 0 && statusFilter !== s) return null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                  statusFilter === s
                    ? "bg-zinc-600 text-white border-zinc-500"
                    : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
                )}
              >
                {STATUS_CONFIG[s]?.label ?? s} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search address, txid, hash…"
              className="pl-8 pr-8 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 w-64 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading && !data ? (
        <div className="text-zinc-500 text-sm py-12 text-center">Loading intent sessions…</div>
      ) : intents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-16 text-center">
          <ShieldCheck className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            {data?.total === 0 ? "No intent sessions yet" : "No intents match the current filter"}
          </p>
          {data?.total === 0 && (
            <p className="text-zinc-600 text-xs mt-1.5">
              Intents are created when users initiate BSV→EVM cross-chain swaps
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
            <span>User / Solver</span>
            <span>Swap</span>
            <span>HTLC Address</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Created</span>
          </div>

          {intents.map(intent => {
            const isExp = expanded === intent.id;
            const isTerminal = TERMINAL.has(intent.status);
            return (
              <div key={intent.id} className={cn(
                "border-b border-zinc-800 last:border-0 transition-colors",
                isExp ? "bg-zinc-900/50" : "hover:bg-zinc-900/30"
              )}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isExp ? null : intent.id)}
                  className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 px-4 py-3 cursor-pointer items-center"
                >
                  {/* User / Solver */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono text-zinc-200 truncate">{short(intent.userAddress, 6)}</span>
                      <CopyBtn text={intent.userAddress} />
                    </div>
                    {intent.solverAddress ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-emerald-500">solver:</span>
                        <span className="text-[10px] font-mono text-zinc-400 truncate">{short(intent.solverAddress, 5)}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-zinc-600">no solver</span>
                    )}
                  </div>

                  {/* Swap */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono text-emerald-400">{intent.tokenIn}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                    <span className="text-xs font-mono text-blue-400">{intent.tokenOut}</span>
                    <span className="text-[10px] text-zinc-500 ml-1 hidden xl:block">via {intent.destinationChain}</span>
                  </div>

                  {/* HTLC */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-400">{short(intent.htlcAddress, 7)}</span>
                    <CopyBtn text={intent.htlcAddress} />
                  </div>

                  {/* Amount */}
                  <div className="text-right whitespace-nowrap">
                    <p className="text-xs font-mono text-zinc-200">{satToBsv(intent.amountInSat)} BSV</p>
                    <p className="text-[10px] text-zinc-500">≥{intent.minAmountOut} {intent.tokenOut}</p>
                  </div>

                  {/* Status */}
                  <StatusBadge status={intent.status} />

                  {/* Created */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500">{fmtAgo(intent.createdAt)}</span>
                    {isTerminal && <CheckCircle className="w-3 h-3 text-zinc-600" />}
                    {isExp
                      ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <ExpandedRow
                    intent={intent}
                    onForceExpire={() => handleForceExpire(intent.id)}
                    expiring={expiringId === intent.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {dataUpdatedAt > 0 && (
        <p className="text-[11px] text-zinc-600 text-right">
          Last fetched: {new Date(dataUpdatedAt).toLocaleTimeString()}
          {intents.length !== (data?.total ?? 0) && ` · showing ${intents.length} of ${data?.total}`}
        </p>
      )}

      {/* Contract spec */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-bold flex items-center gap-2">
          <Zap className="w-3 h-3" /> BSV Locking Script (P2SH)
        </p>
        <pre className="text-[10px] font-mono text-emerald-300/80 leading-relaxed overflow-x-auto">
{`OP_IF
  OP_SHA256 <secretHash>  OP_EQUALVERIFY   ← HTLC preimage
  OP_SHA256 <intentHash>  OP_EQUALVERIFY   ← full trade terms commitment
  OP_1
OP_ELSE
  <deadlineBlocks>  OP_CHECKLOCKTIMEVERIFY ← CLTV refund path
  OP_2DROP  OP_1
OP_ENDIF`}
        </pre>
        <p className="text-[10px] text-zinc-600 mt-2">
          The intentHash commits to all trade terms: nonce, minAmountOut, deadline, addresses, tokenIn/Out, amountInSat.
          A solver who underpays cannot produce a valid claim — the script enforces the full trade intent on-chain.
        </p>
      </div>
    </div>
  );
}
