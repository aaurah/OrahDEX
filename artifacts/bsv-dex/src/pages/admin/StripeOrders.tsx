import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Search, CreditCard, CheckCircle2, XCircle, Clock,
  RotateCcw, Trash2, Ban, Copy, Check, Loader2, AlertTriangle, Send,
  MoreHorizontal, DollarSign, PlayCircle, Flag, ShieldCheck, ShieldOff,
  User, X,
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
  le_transaction_id?: string | null;
  le_deposit_address?: string | null;
  le_deposit_extra_id?: string | null;
  le_status?: string | null;
  created_at: string;
  updated_at: string;
  kyc_first_name?: string | null;
  kyc_last_name?: string | null;
  kyc_date_of_birth?: string | null;
  kyc_nationality?: string | null;
  kyc_country?: string | null;
  kyc_id_type?: string | null;
  kyc_id_number?: string | null;
  kyc_status?: string | null;
  kyc_submitted_at?: string | null;
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
  pending:    { label: "Pending",    cls: "bg-amber-500/15 text-amber-400 border-amber-500/25",   icon: Clock },
  paid:       { label: "Paid",       cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
  processing: { label: "Processing", cls: "bg-sky-500/15 text-sky-400 border-sky-500/25",        icon: Loader2 },
  completed:  { label: "Completed",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", icon: CheckCircle2 },
  failed:     { label: "Failed",     cls: "bg-red-500/15 text-red-400 border-red-500/25",         icon: XCircle },
  refunded:   { label: "Refunded",   cls: "bg-violet-500/15 text-violet-400 border-violet-500/25", icon: RotateCcw },
  canceled:   { label: "Canceled",   cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",     icon: Ban },
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
  const [deliveryModal, setDeliveryModal] = useState<StripeOrder | null>(null);
  const [kycModal, setKycModal] = useState<StripeOrder | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
  const fulfillM = useMutation({
    mutationFn: async (id: string) => {
      const r = await adminFetch(`/api/admin/stripe-orders/${encodeURIComponent(id)}/fulfill`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Fulfillment failed");
      return j;
    },
    onSuccess: (j: any) => {
      qc.invalidateQueries({ queryKey: ["admin", "stripe-orders"] });
      const o = j?.order as StripeOrder | undefined;
      if (o?.le_deposit_address) {
        setDeliveryModal(o);
      } else if (o?.error_message) {
        window.alert(`Fulfillment failed:\n\n${o.error_message}\n\nCheck that LETSEXCHANGE_API_KEY is set, the coin is supported, and the customer wallet is valid.`);
      } else {
        window.alert("Fulfillment endpoint returned no deposit address. Check API server logs for the LetsExchange response.");
      }
    },
  });
  const markM = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await adminFetch(`/api/admin/stripe-orders/${encodeURIComponent(id)}/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Update failed");
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
                <th className="text-left px-3 py-2">User / KYC</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> Loading orders…
                </td></tr>
              )}
              {!isLoading && orders.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
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
                      {o.kyc_first_name ? (
                        <button
                          onClick={() => setKycModal(o)}
                          className="text-left group"
                          title="View KYC details"
                        >
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="text-xs font-medium text-foreground group-hover:text-emerald-400 transition-colors">
                              {o.kyc_first_name} {o.kyc_last_name}
                            </span>
                          </div>
                          <div className="text-[10px] text-emerald-500/70 mt-0.5">KYC verified — view details</div>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <ShieldOff className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          <span className="text-[11px] text-muted-foreground/60">No KYC</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px]", meta.cls)}>
                        <StatusIcon className={cn("w-3 h-3", o.status === "processing" && "animate-spin")} />
                        {meta.label}
                      </span>
                      {o.le_deposit_address && (
                        <button
                          onClick={() => setDeliveryModal(o)}
                          className="mt-1 block text-[10px] text-sky-400 hover:text-sky-300 underline truncate max-w-[200px] font-mono text-left"
                          title="Show full LE deposit address"
                        >
                          → USDT: {shorten(o.le_deposit_address, 10, 8)}
                        </button>
                      )}
                      {o.error_message && (
                        <div className="mt-1 text-[10px] text-red-400 max-w-[200px] truncate" title={o.error_message}>{o.error_message}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground whitespace-nowrap">{fmtDate(o.created_at)}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          disabled={isBusy}
                          onClick={() => withBusy(o.id, () => fulfillM.mutateAsync(o.id), `Manually create a LetsExchange swap to deliver ${o.coin_symbol} to the customer's wallet?`)}
                          className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] hover:bg-emerald-500/20 disabled:opacity-50 flex items-center gap-1"
                          title="Manually trigger crypto delivery via LetsExchange"
                        >
                          <Send className="w-3 h-3" /> Send coins
                        </button>
                        {o.le_deposit_address && (
                          <button
                            onClick={() => setDeliveryModal(o)}
                            className="px-2 py-1 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] hover:bg-sky-500/20 flex items-center gap-1"
                            title="Show LE deposit address"
                          >
                            <Copy className="w-3 h-3" /> Address
                          </button>
                        )}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === o.id ? null : o.id)}
                            className="px-2 py-1 rounded bg-secondary border border-border/60 text-[11px] hover:bg-secondary/70 flex items-center gap-1"
                            title="More actions"
                          >
                            <MoreHorizontal className="w-3 h-3" /> More
                          </button>
                          {openMenuId === o.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                              <div className="absolute right-0 mt-1 w-56 z-50 bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
                                <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground border-b border-border/50 bg-secondary/40">
                                  Mark status
                                </div>
                                {[
                                  { v: "pending",    label: "Pending",    icon: Clock,        cls: "text-amber-400" },
                                  { v: "paid",       label: "Paid",       icon: DollarSign,   cls: "text-emerald-400" },
                                  { v: "processing", label: "Processing", icon: PlayCircle,   cls: "text-sky-400" },
                                  { v: "completed",  label: "Completed",  icon: CheckCircle2, cls: "text-emerald-400" },
                                  { v: "failed",     label: "Failed",     icon: XCircle,      cls: "text-red-400" },
                                  { v: "refunded",   label: "Refunded",   icon: RotateCcw,    cls: "text-violet-400" },
                                  { v: "canceled",   label: "Canceled",   icon: Ban,          cls: "text-zinc-400" },
                                ].map(s => {
                                  const Icon = s.icon;
                                  return (
                                    <button
                                      key={s.v}
                                      disabled={o.status === s.v}
                                      onClick={() => { setOpenMenuId(null); withBusy(o.id, () => markM.mutateAsync({ id: o.id, status: s.v })); }}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/60 disabled:opacity-40 flex items-center gap-2"
                                    >
                                      <Flag className={cn("w-3 h-3", s.cls)} />
                                      Mark as <span className={cn("font-semibold", s.cls)}>{s.label}</span>
                                      {o.status === s.v && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
                                    </button>
                                  );
                                })}
                                <div className="border-t border-border/50">
                                  {canRefund && (
                                    <button
                                      onClick={() => { setOpenMenuId(null); withBusy(o.id, () => refundM.mutateAsync(o.id), `Refund ${fmtMoney(o.fiat_amount_cents, o.fiat_currency)} via Stripe?`); }}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-500/10 text-violet-300 flex items-center gap-2"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Refund via Stripe
                                    </button>
                                  )}
                                  {canCancel && (
                                    <button
                                      onClick={() => { setOpenMenuId(null); withBusy(o.id, () => cancelM.mutateAsync(o.id), "Cancel this pending order?"); }}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-500/10 text-amber-300 flex items-center gap-2"
                                    >
                                      <Ban className="w-3 h-3" /> Cancel payment intent
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setOpenMenuId(null); copy(o.id); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/60 flex items-center gap-2"
                                  >
                                    <Copy className="w-3 h-3" /> Copy order ID
                                  </button>
                                  {o.stripe_payment_intent_id && (
                                    <a
                                      href={`https://dashboard.stripe.com/payments/${o.stripe_payment_intent_id}`}
                                      target="_blank" rel="noopener noreferrer"
                                      onClick={() => setOpenMenuId(null)}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/60 flex items-center gap-2"
                                    >
                                      <CreditCard className="w-3 h-3" /> Open in Stripe ↗
                                    </a>
                                  )}
                                  <button
                                    onClick={() => { setOpenMenuId(null); withBusy(o.id, () => deleteM.mutateAsync(o.id), "Delete this order from the local database? Stripe is not affected."); }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/10 text-red-300 flex items-center gap-2 border-t border-border/50"
                                  >
                                    <Trash2 className="w-3 h-3" /> Clear from DB
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        {isBusy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KYC Detail Modal */}
      {kycModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setKycModal(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{kycModal.kyc_first_name} {kycModal.kyc_last_name}</h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px]">
                      <ShieldCheck className="w-3 h-3" /> KYC Verified
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Order {shorten(kycModal.id, 8, 4)} · {kycModal.coin_symbol} · {fmtMoney(kycModal.fiat_amount_cents, kycModal.fiat_currency)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setKycModal(null)}
                className="p-1 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "First Name",            value: kycModal.kyc_first_name },
                { label: "Last Name",             value: kycModal.kyc_last_name },
                { label: "Date of Birth",         value: kycModal.kyc_date_of_birth },
                { label: "Nationality",           value: kycModal.kyc_nationality },
                { label: "Country of Residence",  value: kycModal.kyc_country },
                { label: "ID Type",               value: kycModal.kyc_id_type },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-secondary/40 border border-border/50 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground font-medium">{label}</div>
                  <div className="text-sm font-semibold mt-1 capitalize">{value ?? "—"}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-amber-500/8 border border-amber-500/25 p-3 space-y-2">
              <div className="text-[10px] uppercase text-amber-300 font-semibold">Government ID</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-muted-foreground">Type</div>
                  <div className="text-sm font-semibold capitalize mt-0.5">{kycModal.kyc_id_type ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Number</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-mono font-semibold">{kycModal.kyc_id_number ?? "—"}</span>
                    {kycModal.kyc_id_number && (
                      <button
                        onClick={() => { navigator.clipboard.writeText(kycModal.kyc_id_number!); setCopiedId("kyc-id"); setTimeout(() => setCopiedId(null), 1200); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy ID number"
                      >
                        {copiedId === "kyc-id" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase text-muted-foreground font-medium">Destination Wallet</div>
              <div className="rounded-lg bg-secondary/40 border border-border/50 px-3 py-2 font-mono text-xs break-all flex items-start gap-2">
                <span className="flex-1">{kycModal.wallet_address}</span>
                <button onClick={() => navigator.clipboard.writeText(kycModal.wallet_address)} className="text-muted-foreground hover:text-foreground shrink-0" title="Copy wallet">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              {kycModal.kyc_submitted_at && (
                <div className="text-[11px] text-muted-foreground">
                  KYC submitted: {fmtDate(kycModal.kyc_submitted_at)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deliveryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeliveryModal(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Send Coins to Customer</div>
                <h2 className="text-xl font-bold mt-1">Deliver {deliveryModal.coin_symbol} via LetsExchange</h2>
                <p className="text-xs text-muted-foreground mt-1">Order {shorten(deliveryModal.id, 10, 6)}</p>
              </div>
              <button
                onClick={() => setDeliveryModal(null)}
                className="p-1 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="text-[11px] uppercase font-semibold text-amber-300 mb-2">Step 1 — Send USDT (ERC-20) to this address</div>
              <div className="bg-black/40 rounded-lg p-3 font-mono text-sm break-all text-emerald-300 select-all">
                {deliveryModal.le_deposit_address}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(deliveryModal.le_deposit_address ?? "");
                    setCopiedId("modal-addr");
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm hover:bg-emerald-500/25 flex items-center justify-center gap-2"
                >
                  {copiedId === "modal-addr" ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy address</>}
                </button>
                <a
                  href={`https://etherscan.io/address/${deliveryModal.le_deposit_address}`}
                  target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-secondary/80"
                >
                  Etherscan ↗
                </a>
              </div>
              {deliveryModal.le_deposit_extra_id && (
                <div className="mt-2 text-xs">
                  <span className="text-amber-300 font-semibold">Memo / Extra ID:</span>{" "}
                  <span className="font-mono">{deliveryModal.le_deposit_extra_id}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Amount to send</div>
                <div className="text-lg font-bold text-amber-300 mt-1">
                  ≈ ${((deliveryModal.fiat_amount_cents / 100) * (1 - 0.015)).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">USDT (ERC-20)</div>
              </div>
              <div className="rounded-lg bg-secondary/40 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Customer receives</div>
                <div className="text-lg font-bold text-emerald-300 mt-1">
                  {Number(deliveryModal.crypto_amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {deliveryModal.coin_symbol}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">delivered automatically</div>
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Customer wallet ({deliveryModal.coin_symbol})</div>
                <div className="font-mono text-xs break-all mt-0.5">{deliveryModal.wallet_address}</div>
              </div>
              {deliveryModal.le_transaction_id && (
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">LetsExchange Tx ID</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{deliveryModal.le_transaction_id}</span>
                    <a
                      href={`https://letsexchange.io/transaction/${deliveryModal.le_transaction_id}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                    >
                      Track ↗
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground border-t border-border/50 pt-3">
              <strong className="text-foreground">How it works:</strong> Once your USDT deposit confirms on Ethereum,
              LetsExchange automatically swaps it and sends {deliveryModal.coin_symbol} to the customer's wallet.
              Status will update to <em>completed</em> here when delivery finishes.
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1">
        <div><strong className="text-emerald-400">Send coins</strong> — manually creates a LetsExchange swap and returns a USDT-ERC20 deposit address. Send USDT to that address from your hot wallet to deliver crypto to the customer.</div>
        <div><strong className="text-violet-300">Refund</strong> — issues a real refund through Stripe (paid orders only).</div>
        <div><strong className="text-amber-300">Cancel</strong> — cancels a pending Stripe payment intent.</div>
        <div><strong className="text-red-300">Clear</strong> — deletes the local DB row only; the Stripe payment record remains in your Stripe dashboard.</div>
      </div>
    </div>
  );
}

export default AdminStripeOrders;
