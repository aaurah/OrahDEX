import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Check, X, Clock, Loader2, RefreshCw, AlertTriangle, Copy, CheckCheck, SlidersHorizontal, ChevronDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "@/components/AdminLayout";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Withdrawal {
  id: string;
  walletAddress: string;
  asset: string;
  amount: number;
  network: string;
  networkLabel: string | null;
  recipient: string;
  fee: string | null;
  status: "pending" | "processing" | "completed" | "cancelled";
  txid: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
}

const STATUS_META = {
  pending:    { label: "Pending",    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", icon: Clock },
  processing: { label: "Processing", color: "text-blue-400 bg-blue-500/10 border-blue-500/30",       icon: Loader2 },
  completed:  { label: "Completed",  color: "text-green-400 bg-green-500/10 border-green-500/30",    icon: Check },
  cancelled:  { label: "Cancelled",  color: "text-red-400 bg-red-500/10 border-red-500/30",          icon: X },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 text-muted-foreground hover:text-foreground"
    >
      {copied ? <CheckCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function TxidModal({ id, onClose, onSave }: { id: string; onClose: () => void; onSave: (txid: string) => void }) {
  const [txid, setTxid] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold text-lg">Mark as Completed</h3>
        <p className="text-sm text-muted-foreground">Enter the on-chain transaction ID for this withdrawal.</p>
        <input
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono"
          placeholder="0x... or txid..."
          value={txid}
          onChange={e => setTxid(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted">Cancel</button>
          <button
            disabled={!txid.trim()}
            onClick={() => { if (txid.trim()) onSave(txid.trim()); }}
            className="px-4 py-2 rounded-lg text-sm bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
          >
            Confirm Completed
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ id, onClose, onSave }: { id: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" /> Cancel & Refund
        </h3>
        <p className="text-sm text-muted-foreground">
          Cancelling will <strong className="text-foreground">refund the full amount back</strong> to the user's internal balance. Add an optional note.
        </p>
        <textarea
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm resize-none"
          placeholder="Optional cancellation reason..."
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-muted">Back</button>
          <button
            onClick={() => onSave(note)}
            className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white"
          >
            Cancel & Refund
          </button>
        </div>
      </div>
    </div>
  );
}

function SendViaWalletButton({ withdrawal, onComplete }: {
  withdrawal: Withdrawal;
  onComplete: (txid: string) => void;
}) {
  const { sendTransaction, data: txHash, isPending, error: sendError, reset } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [fired, setFired] = useState(false);

  useEffect(() => {
    if (isSuccess && txHash && !fired) {
      setFired(true);
      onComplete(txHash);
    }
  }, [isSuccess, txHash, fired, onComplete]);

  const isEvm = ["evm", "ethereum", "eth", "erc-20", "erc20"].some(n =>
    withdrawal.network.toLowerCase().includes(n) || (withdrawal.networkLabel ?? "").toLowerCase().includes(n)
  );
  if (!isEvm) return null;

  const handleSend = () => {
    reset();
    setFired(false);
    try {
      sendTransaction({
        to: withdrawal.recipient as `0x${string}`,
        value: parseEther(withdrawal.amount.toString()),
      });
    } catch {}
  };

  if (isSuccess && txHash) {
    return (
      <span className="text-xs text-green-400 flex items-center gap-1">
        <Check className="w-3 h-3" /> Sent
      </span>
    );
  }

  return (
    <button
      disabled={isPending || isConfirming}
      onClick={handleSend}
      className="px-2.5 py-1 rounded-lg text-xs bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/40 disabled:opacity-40 flex items-center gap-1"
      title={sendError ? sendError.message : "Send via MetaMask / Rabby"}
    >
      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
      {isPending ? "Confirm…" : isConfirming ? "Sending…" : "Send via Wallet"}
    </button>
  );
}

function BalanceAdjustPanel() {
  const [open, setOpen] = useState(false);
  const [wallet, setWallet] = useState("");
  const [asset, setAsset] = useState("ETH");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"deduct" | "credit">("deduct");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const adjust = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE}/api/admin/balance-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.trim(), asset: asset.trim(), amount, type, reason }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      return data;
    },
    onSuccess: () => {
      setResult({ ok: true, msg: `${type === "deduct" ? "Deducted" : "Credited"} ${amount} ${asset} successfully` });
      setAmount(""); setReason("");
    },
    onError: (e: Error) => setResult({ ok: false, msg: e.message }),
  });

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">Manual Balance Adjustment</span>
          <span className="text-xs text-muted-foreground">Correct ledger discrepancies</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="p-5 space-y-4 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Wallet Address</label>
              <input
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="0x..."
                value={wallet}
                onChange={e => setWallet(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Asset</label>
              <input
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="ETH, BNB, USDT..."
                value={asset}
                onChange={e => setAsset(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Amount</label>
              <input
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="0.00"
                type="number"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType("deduct")}
                  className={cn("flex-1 py-2 rounded-lg text-sm border transition-colors",
                    type === "deduct" ? "bg-red-600/20 border-red-500/40 text-red-400" : "border-border text-muted-foreground hover:bg-muted")}
                >
                  Deduct
                </button>
                <button
                  onClick={() => setType("credit")}
                  className={cn("flex-1 py-2 rounded-lg text-sm border transition-colors",
                    type === "credit" ? "bg-green-600/20 border-green-500/40 text-green-400" : "border-border text-muted-foreground hover:bg-muted")}
                >
                  Credit
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Reason (optional)</label>
            <input
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Ledger correction — spurious refund from pre-fix cancel"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          {result && (
            <div className={cn("text-sm px-3 py-2 rounded-lg border", result.ok
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400")}>
              {result.msg}
            </div>
          )}
          <button
            disabled={!wallet.trim() || !asset.trim() || !amount || adjust.isPending}
            onClick={() => { setResult(null); adjust.mutate(); }}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40",
              type === "deduct"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
          >
            {adjust.isPending ? "Processing…" : `${type === "deduct" ? "Deduct" : "Credit"} Balance`}
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminWithdrawals() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "processing" | "completed" | "cancelled">("pending");
  const [txidModal, setTxidModal] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState<string | null>(null);

  const { data: withdrawals = [], isFetching, refetch } = useQuery<Withdrawal[]>({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/admin/withdrawals`);
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const patch = useMutation({
    mutationFn: async ({ id, status, txid, note }: { id: string; status: string; txid?: string; note?: string }) => {
      const r = await fetch(`${API_BASE}/api/withdrawals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, txid, note }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Request failed"); }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }),
  });

  const displayed = filter === "all" ? withdrawals : withdrawals.filter(w => w.status === filter);

  const counts = {
    all: withdrawals.length,
    pending: withdrawals.filter(w => w.status === "pending").length,
    processing: withdrawals.filter(w => w.status === "processing").length,
    completed: withdrawals.filter(w => w.status === "completed").length,
    cancelled: withdrawals.filter(w => w.status === "cancelled").length,
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Withdrawal Requests</h1>
              <p className="text-sm text-muted-foreground">Review, process, and cancel user withdrawal requests</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className={cn("flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted", isFetching && "opacity-60")}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} /> Refresh
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["pending", "processing", "all", "completed", "cancelled"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize",
                filter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="ml-1.5 text-xs opacity-70">({counts[s]})</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="border border-border rounded-xl overflow-hidden">
          {displayed.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground text-sm">
              No {filter === "all" ? "" : filter} withdrawal requests
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left text-xs uppercase tracking-wider">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Network</th>
                    <th className="px-4 py-3">Wallet / Recipient</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">TX ID</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((w, i) => {
                    const sm = STATUS_META[w.status];
                    const StatusIcon = sm.icon;
                    const isPending = w.status === "pending";
                    const isProcessing = w.status === "processing";
                    const isActionable = isPending || isProcessing;
                    return (
                      <tr key={w.id} className={cn("border-b border-border/50 hover:bg-muted/20", i % 2 === 0 ? "" : "bg-muted/5")}>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {new Date(w.createdAt).toLocaleDateString()}<br />
                          <span className="text-xs opacity-60">{new Date(w.createdAt).toLocaleTimeString()}</span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                          {w.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {w.asset}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-muted border border-border rounded px-2 py-0.5">
                            {w.networkLabel ?? w.network}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-muted-foreground flex items-center gap-1 max-w-[180px] truncate">
                            {w.walletAddress.slice(0, 8)}…{w.walletAddress.slice(-6)}
                            <CopyButton text={w.walletAddress} />
                          </div>
                          {w.recipient !== w.walletAddress && (
                            <div className="font-mono text-xs text-blue-400 flex items-center gap-1 mt-0.5">
                              → {w.recipient.slice(0, 8)}…{w.recipient.slice(-6)}
                              <CopyButton text={w.recipient} />
                            </div>
                          )}
                          {w.note && <div className="text-xs text-muted-foreground mt-0.5 italic">{w.note}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-xs", sm.color)}>
                            <StatusIcon className={cn("w-3 h-3", w.status === "processing" && "animate-spin")} />
                            {sm.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {w.txid ? (
                            <div className="font-mono text-xs text-green-400 flex items-center gap-1">
                              {w.txid.slice(0, 10)}…
                              <CopyButton text={w.txid} />
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            {isPending && (
                              <button
                                disabled={patch.isPending}
                                onClick={() => patch.mutate({ id: w.id, status: "processing" })}
                                className="px-2.5 py-1 rounded-lg text-xs bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/40 disabled:opacity-40"
                              >
                                Mark Processing
                              </button>
                            )}
                            {isActionable && (
                              <SendViaWalletButton
                                withdrawal={w}
                                onComplete={txid => patch.mutate({ id: w.id, status: "completed", txid })}
                              />
                            )}
                            {isActionable && (
                              <button
                                disabled={patch.isPending}
                                onClick={() => setTxidModal(w.id)}
                                className="px-2.5 py-1 rounded-lg text-xs bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/40 disabled:opacity-40"
                              >
                                Complete
                              </button>
                            )}
                            {isActionable && (
                              <button
                                disabled={patch.isPending}
                                onClick={() => setCancelModal(w.id)}
                                className="px-2.5 py-1 rounded-lg text-xs bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/40 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            )}
                            {!isActionable && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Manual balance adjustment */}
        <BalanceAdjustPanel />
      </div>

      {txidModal && (
        <TxidModal
          id={txidModal}
          onClose={() => setTxidModal(null)}
          onSave={txid => { patch.mutate({ id: txidModal, status: "completed", txid }); setTxidModal(null); }}
        />
      )}
      {cancelModal && (
        <NoteModal
          id={cancelModal}
          onClose={() => setCancelModal(null)}
          onSave={note => { patch.mutate({ id: cancelModal, status: "cancelled", note: note || undefined }); setCancelModal(null); }}
        />
      )}
    </AdminLayout>
  );
}
