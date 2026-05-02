import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Search, CreditCard, CheckCircle2, XCircle, Clock,
  RotateCcw, Trash2, Ban, Copy, Check, Loader2, AlertTriangle,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { cn } from "@/lib/utils";

interface StripeOrder {
  id: string;
  stripe_payment_intent_id: string | null;
  wallet_address: string;
  user_wallet: string | null;
  coin_symbol: string;
  fiat_amount_cents: number;
  fiat_currency: string;
  crypto_amount: string;
  exchange_rate: string;
  fee_usd: string;
  status: string;
  payment_method: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface StripeStats {
  pending?: string;
  paid?: string;
  failed?: string;
  refunded?: string;
  canceled?: string;
  total?: string;
  paid_cents?: string;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  pending:  { label: "Pending",  cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",   icon: Clock },
  paid:     { label: "Paid",     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
  failed:   { label: "Failed",   cls: "bg-red-500/15 text-red-400 border-red-500/25",         icon: XCircle },
  refunded: { label: "Refunded", cls: "bg-violet-500/15 text-violet-400 border-violet-500/25", icon: RotateCcw },
  canceled: { label: "Canceled", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",     icon: Ban },
};

function fmtMoney(cents: number, ccy: string) {
  const v = (cents ?? 0) / 100;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: (ccy || "usd").toUpperCase() }).format(v); }
  catch { return `${v.toFixed(2)} ${ccy?.toUpperCase() ?? "USD"}`; }
}
function fmtDate(s: string) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}
function shorten(s?: string | null, head = 6, tail = 4) {
  if (!s) return "—";
  return s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;
}

export function AdminStripeOrders() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "stripe-orders", statusFilter, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const r = await adminFetch(`/api/admin/stripe-orders?${params.toString()}`);
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json() as Promise<{ orders: StripeOrder[]; stats: StripeStats }>;
    },
    refetchInterval: 30_000,
  });

  const orders = data?.orders ?? [];
  const stats = data?.stats ?? {};

  const statCards = useMemo(() => ([
    { key: "total",    label: "Total Orders", value: Number(stats.total ?? 0).toLocaleString() },
    { key: "paid",     label: "Paid",         value: Number(stats.paid ?? 0).toLocaleString(), accent: "text-emerald-400" },
    { key: "pending",  label: "Pending",      value: Number(stats.pending ?? 0).toLocaleString(), accent: "text-amber-400" },
    { key: "refunded", label: "Refunded",     value: Number(stats.refunded ?? 0).toLocaleString(), accent: "text-violet-400" },
    { key: "revenue",  label: "Revenue (paid)", value: fmtMoney(Number(stats.paid_cents ?? 0), "usd"), accent: "text-emerald-400" },
  ]), [stats]);

  const refundM = useMutation({
    mutationFn: async (id: string) => {
      const r = await adminFetch(`/api/admin/stripe-orders/${encodeURIComponent(id)}/refund`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Refund failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "stripe-orders"] }),
  });
  const cancelM = useMutation({
    mutationFn: async (id: string) => {
      const r = await adminFetch(`/api/admin/stripe-orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Cancel failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "stripe-orders"] }),
  });
  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const r = await adminFetch(`/api/admin/stripe-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Delete failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "stripe-orders"] }),
  });
  const bulkM = useMutation({
    mutationFn: async (body: { status?: string; olderThanDays?: number }) => {
      const r = await adminFetch(`/api/admin/stripe-orders/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Bulk delete failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "stripe-orders"] }),
  });

  async function withBusy(id: string, fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(id);
    try { await fn(); }
    catch (e: any) { window.alert(e?.message ?? "Action failed"); }
    finally { setBusyId(null); }
  }

  function copy(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CreditCard className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Stripe Orders</h1>
            <p className="text-sm text-muted-foreground">Manage card-purchase orders. Refund / cancel via Stripe, or clear local rows.</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm flex items-center gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map(s => (
          <div key={s.key} className="rounded-xl border border-border/60 bg-card/40 p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("text-xl font-bold mt-1", s.accent ?? "text-foreground")}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by order ID, payment intent, wallet, coin…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 text-sm focus:outline-none focus:border-primary/60"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
          <option value="canceled">Canceled</option>
        </select>
        <button
          onClick={() => withBusy("bulk-failed", () => bulkM.mutateAsync({ status: "failed" }), "Delete ALL failed orders from the local database? This does not touch Stripe.")}
          className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/20 flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Wipe failed
        </button>
        <button
          onClick={() => withBusy("bulk-old", () => bulkM.mutateAsync({ olderThanDays: 30 }), "Delete all orders older than 30 days from the local database?")}
          className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs hover:bg-amber-500/20 flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Wipe &gt;30d
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Order</th>
                <th className="text-left px-3 py-2">Coin</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Wallet</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> Loading orders…
                </td></tr>
              )}
              {!isLoading && orders.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No Stripe orders match the current filter.
                </td></tr>
              )}
              {orders.map((o) => {
                const meta = STATUS_META[o.status?.toLowerCase()] ?? { label: o.status, cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25", icon: AlertTriangle };
                const StatusIcon = meta.icon;
                const isBusy = busyId === o.id;
                const canRefund = o.status === "paid" && !!o.stripe_payment_intent_id;
                const canCancel = o.status === "pending";
                return (
                  <tr key={o.id} className="border-t border-border/40 hover:bg-secondary/20">
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-foreground/90">{shorten(o.id, 8, 4)}</span>
                        <button onClick={() => copy(o.id)} className="text-muted-foreground hover:text-foreground" title="Copy order ID">
                          {copiedId === o.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      {o.stripe_payment_intent_id && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">PI: {shorten(o.stripe_payment_intent_id, 8, 6)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top font-semibold">{o.coin_symbol}</td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="font-medium">{fmtMoney(o.fiat_amount_cents, o.fiat_currency)}</div>
                      <div className="text-[11px] text-muted-foreground">≈ {Number(o.crypto_amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {o.coin_symbol}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-xs">{shorten(o.wallet_address)}</div>
                      {o.user_wallet && o.user_wallet !== o.wallet_address && (
                        <div className="text-[10px] text-muted-foreground font-mono">user: {shorten(o.user_wallet)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px]", meta.cls)}>
                        <StatusIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {o.error_message && (
                        <div className="mt-1 text-[10px] text-red-400 max-w-[180px] truncate" title={o.error_message}>{o.error_message}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground whitespace-nowrap">{fmtDate(o.created_at)}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-end gap-1">
                        {canRefund && (
                          <button
                            disabled={isBusy}
                            onClick={() => withBusy(o.id, () => refundM.mutateAsync(o.id), `Refund ${fmtMoney(o.fiat_amount_cents, o.fiat_currency)} to the customer via Stripe?`)}
                            className="px-2 py-1 rounded bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[11px] hover:bg-violet-500/20 disabled:opacity-50 flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Refund
                          </button>
                        )}
                        {canCancel && (
                          <button
                            disabled={isBusy}
                            onClick={() => withBusy(o.id, () => cancelM.mutateAsync(o.id), "Cancel this pending order?")}
                            className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" /> Cancel
                          </button>
                        )}
                        <button
                          disabled={isBusy}
                          onClick={() => withBusy(o.id, () => deleteM.mutateAsync(o.id), "Delete this order from the local database? Stripe is not affected.")}
                          className="px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] hover:bg-red-500/20 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Clear
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>Refund</strong> issues a refund through Stripe. <strong>Cancel</strong> aborts a pending payment intent.
        <strong> Clear</strong> removes the local row only; Stripe records remain in your Stripe dashboard.
      </p>
    </div>
  );
}

export default AdminStripeOrders;
