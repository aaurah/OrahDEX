/**
 * WithdrawSheet.tsx
 *
 * Withdrawal flow — moves funds from the OrahDEX internal balance back
 * to the user's connected wallet (or any address they specify).
 *
 * Flow:
 *   1. User picks amount (with MAX shortcut) and confirms recipient address
 *   2. Submits POST /api/withdrawals — creates a pending withdrawal request
 *   3. Admin processes the request and broadcasts the on-chain transaction
 *   4. History tab shows all past requests + their current status
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  CheckCircle2,
  Loader2,
  Clock,
  History,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNotificationStore } from "@/store/useNotificationStore";

interface WithdrawHistoryItem {
  id:           string;
  asset:        string;
  amount:       number;
  recipient:    string;
  network:      string;
  networkLabel: string;
  status:       "pending" | "processing" | "completed" | "failed";
  txid?:        string | null;
  note?:        string | null;
  createdAt:    string;
}

export interface WithdrawSheetProps {
  open:          boolean;
  onClose:       () => void;
  walletAddress: string;
  asset:         string;
  available:     number;
  network:       string;
  networkLabel:  string;
  color?:        string;
}

export function WithdrawSheet({
  open,
  onClose,
  walletAddress,
  asset,
  available,
  network,
  networkLabel,
  color = "#6B7280",
}: WithdrawSheetProps) {
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();
  const [tab,       setTab]       = useState<"withdraw" | "history">("withdraw");
  const [amount,    setAmount]    = useState("");
  const [recipient, setRecipient] = useState(walletAddress);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [copiedId,   setCopiedId]   = useState<string | null>(null);

  // Reset when the dialog re-opens for a new asset
  useEffect(() => {
    if (open) {
      setTab("withdraw");
      setAmount("");
      setRecipient(walletAddress);
      setSubmitted(false);
    }
  }, [open, walletAddress]);

  // Withdrawal history
  const { data: history = [], refetch: refetchHistory } = useQuery<WithdrawHistoryItem[]>({
    queryKey: ["withdrawal-history", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const r = await fetch(`${API_BASE}/withdrawals/${encodeURIComponent(walletAddress)}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!walletAddress && open,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const parsedAmount = parseFloat(amount) || 0;
  const exceedsBalance = parsedAmount > available;
  const canSubmit =
    parsedAmount > 0 &&
    !exceedsBalance &&
    recipient.trim().length > 4 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/withdrawals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          asset,
          amount:       parsedAmount,
          network,
          networkLabel,
          recipient:    recipient.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to submit withdrawal");
      setSubmitted(true);
      toast({
        title:       "Withdrawal requested",
        description: `${parsedAmount} ${asset} withdrawal is queued for processing.`,
      });
      addNotification({
        type:  "withdrawal",
        title: "Withdrawal Requested",
        body:  `${parsedAmount} ${asset} withdrawal queued — check Portfolio for status updates.`,
      });
      refetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setAmount("");
    setSubmitted(false);
    setTab("withdraw");
    onClose();
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const statusStyle = (s: string) => {
    if (s === "completed")  return "text-green-400  bg-green-400/10  border-green-400/20";
    if (s === "failed")     return "text-red-400    bg-red-400/10    border-red-400/20";
    if (s === "processing") return "text-blue-400   bg-blue-400/10   border-blue-400/20";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0"
              style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
            >
              {asset[0]}
            </div>
            <span>Withdraw {asset}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-secondary/30">
          {(["withdraw", "history"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize",
                tab === t
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "history" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  History
                  {history.length > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      {history.length}
                    </span>
                  )}
                </span>
              ) : "Withdraw"}
            </button>
          ))}
        </div>

        {/* ── WITHDRAW TAB ─────────────────────────────────────────────── */}
        {tab === "withdraw" && !submitted && (
          <div className="space-y-4">

            {/* Balance summary */}
            <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">OrahDEX Balance</span>
                <span className="font-bold font-mono" style={{ color }}>
                  {available.toLocaleString(undefined, { maximumFractionDigits: available < 0.0001 ? 8 : 6 })} {asset}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Destination network</span>
                <span className="font-medium">{networkLabel}</span>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Amount to withdraw</label>
              <div className="relative">
                <Input
                  value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className={cn("pr-16 font-mono text-base", exceedsBalance && "border-red-500/60 focus-visible:ring-red-500/30")}
                />
                <button
                  type="button"
                  onClick={() => setAmount(available.toFixed(available < 0.0001 ? 8 : 6))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-primary hover:text-primary/80 px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  MAX
                </button>
              </div>
              {exceedsBalance && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Exceeds available OrahDEX balance
                </p>
              )}
            </div>

            {/* Recipient address */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Recipient address</label>
              <Input
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="Destination wallet address"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Pre-filled with your connected wallet. You may change this to any valid {networkLabel} address.
              </p>
            </div>

            {/* Processing notice */}
            <div className="flex gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Withdrawals are processed manually within 24 hours. Funds will be sent on-chain to the recipient address once verified.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full gap-2 h-11"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              {submitting
                ? "Submitting…"
                : `Withdraw${parsedAmount > 0 ? ` ${parsedAmount}` : ""} ${asset}`}
            </Button>
          </div>
        )}

        {/* ── SUCCESS STATE ─────────────────────────────────────────────── */}
        {tab === "withdraw" && submitted && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold">Withdrawal Requested</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Your request has been submitted. You'll receive{" "}
                <span className="font-semibold text-foreground">{parsedAmount} {asset}</span>{" "}
                at your address within 24 hours.
              </p>
            </div>
            <div className="flex gap-2 w-full pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTab("history")}>
                View History
              </Button>
              <Button className="flex-1" onClick={() => { setSubmitted(false); setAmount(""); }}>
                New Withdrawal
              </Button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ──────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <History className="w-10 h-10 opacity-30" />
                <p className="text-sm">No withdrawal history yet</p>
              </div>
            ) : (
              history.map(item => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm font-mono">
                      {item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {item.asset}
                    </span>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                      statusStyle(item.status),
                    )}>
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.networkLabel}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>

                  {/* Recipient */}
                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                    <span className="truncate flex-1">{item.recipient}</span>
                    <button
                      onClick={() => copy(item.recipient, `${item.id}-addr`)}
                      className="shrink-0 p-0.5 hover:text-foreground transition-colors"
                    >
                      {copiedId === `${item.id}-addr`
                        ? <Check className="w-3 h-3 text-green-400" />
                        : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* TX hash if available */}
                  {item.txid && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                      <span className="text-muted-foreground/50 shrink-0">TX</span>
                      <span className="truncate flex-1">{item.txid}</span>
                      <button
                        onClick={() => copy(item.txid!, `${item.id}-tx`)}
                        className="shrink-0 p-0.5 hover:text-foreground transition-colors"
                      >
                        {copiedId === `${item.id}-tx`
                          ? <Check className="w-3 h-3 text-green-400" />
                          : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}

                  {/* Note from admin */}
                  {item.note && (
                    <p className="text-xs text-muted-foreground italic">{item.note}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
