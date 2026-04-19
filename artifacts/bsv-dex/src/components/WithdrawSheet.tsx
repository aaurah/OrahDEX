/**
 * WithdrawSheet.tsx
 *
 * Three-tab dialog: Deposit · Withdraw · History
 *
 * Deposit tab  — unique per-user deposit address + QR, network selector,
 *                TX-hash verifier, and gas top-up card.
 * Withdraw tab — amount + recipient form, instant on-chain settlement.
 * History tab  — past withdrawals with status badges, gas-shortage banner.
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
  Zap,
  History,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Download,
  RefreshCw,
  Fuel,
  ChevronDown,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNotificationStore } from "@/store/useNotificationStore";
import { QRCodeCanvas } from "qrcode.react";

// ── constants ────────────────────────────────────────────────────────────────
const GAS_HOT_WALLET = "0x7Dc8d1A90A058f697c5A163e7e933cb8325E7e4b";

const SUPPORTED_CHAINS: { id: number; label: string; short: string; color: string }[] = [
  { id: 1,    label: "Ethereum Mainnet", short: "Ethereum", color: "#627EEA" },
  { id: 8453, label: "Base",             short: "Base",     color: "#0052FF" },
  { id: 56,   label: "BNB Smart Chain",  short: "BSC",      color: "#F3BA2F" },
];

// ── types ────────────────────────────────────────────────────────────────────
interface WithdrawHistoryItem {
  id:           string;
  asset:        string;
  amount:       number;
  recipient:    string;
  network:      string;
  networkLabel: string;
  status:       "pending" | "processing" | "completed" | "failed" | "cancelled";
  txid?:        string | null;
  note?:        string | null;
  createdAt:    string;
}

interface DepositAddressResponse {
  depositAddress: string;
  chainId:        number;
  chainName:      string;
  nativeSymbol:   string;
  blockExplorer:  string;
  ledgerBalances: Record<string, string>;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function summariseNote(raw: string): string {
  if (!raw) return raw;
  if (raw.includes("total cost") && raw.includes("gas fee"))
    return "Insufficient gas — the exchange hot wallet needs ETH to cover the network fee. Your request is queued and will auto-process once funded.";
  if (/insufficient funds/i.test(raw)) return "Insufficient funds to complete the transaction.";
  if (/nonce/i.test(raw)) return "Transaction nonce conflict — please retry.";
  if (/execution reverted/i.test(raw)) return "Transaction reverted by the contract.";
  const firstSentence = raw.split(/\.\s/)[0];
  return firstSentence.length <= 120 ? firstSentence : firstSentence.slice(0, 117) + "…";
}

function isGasError(note: string | null | undefined): boolean {
  if (!note) return false;
  return (note.includes("total cost") && note.includes("gas fee")) ||
    /insufficient funds for transfer/i.test(note);
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 8)}…${a.slice(-6)}` : "";
}

// ── props ────────────────────────────────────────────────────────────────────
export interface WithdrawSheetProps {
  open:                boolean;
  onClose:             () => void;
  walletAddress:       string;
  defaultRecipient?:   string;
  asset:               string;
  available:           number;
  network:             string;
  networkLabel:        string;
  addressPlaceholder?: string;
  color?:              string;
  /** Open directly on a specific tab */
  initialTab?:         "deposit" | "withdraw" | "history";
}

// ─────────────────────────────────────────────────────────────────────────────
export function WithdrawSheet({
  open,
  onClose,
  walletAddress,
  defaultRecipient,
  asset,
  available,
  network,
  networkLabel,
  addressPlaceholder = "Destination wallet address",
  color = "#6B7280",
  initialTab = "withdraw",
}: WithdrawSheetProps) {
  const { toast } = useToast();
  const { addNotification } = useNotificationStore();

  const [tab,          setTab]          = useState<"deposit" | "withdraw" | "history">(initialTab);
  const [amount,       setAmount]       = useState("");
  const [recipient,    setRecipient]    = useState(defaultRecipient ?? "");
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [copiedId,     setCopiedId]     = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [depositChain, setDepositChain] = useState(SUPPORTED_CHAINS[1]); // Base default
  const [txHash,       setTxHash]       = useState("");
  const [verifying,    setVerifying]    = useState(false);
  const [showGasCard,  setShowGasCard]  = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setAmount("");
      setRecipient(defaultRecipient ?? "");
      setSubmitted(false);
      setTxHash("");
    }
  }, [open, defaultRecipient, initialTab]);

  // ── deposit address ──────────────────────────────────────────────────────
  const { data: depositData, isLoading: depositLoading, refetch: refetchDeposit } =
    useQuery<DepositAddressResponse>({
      queryKey: ["deposit-address", walletAddress, depositChain.id],
      queryFn: async () => {
        if (!walletAddress) throw new Error("No wallet");
        const r = await fetch(
          `${API_BASE}/deposit/address?walletAddress=${encodeURIComponent(walletAddress)}&chainId=${depositChain.id}`
        );
        if (!r.ok) throw new Error("Failed to load deposit address");
        return r.json();
      },
      enabled: !!walletAddress && open && tab === "deposit",
      staleTime: 60_000,
    });

  // ── withdrawal history ───────────────────────────────────────────────────
  const { data: history = [], refetch: refetchHistory } = useQuery<WithdrawHistoryItem[]>({
    queryKey: ["withdrawal-history", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return [];
      const r = await fetch(`${API_BASE}/withdrawals/${encodeURIComponent(walletAddress)}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!walletAddress && open,
    refetchInterval: submitted ? 4_000 : 30_000,
    staleTime: 2_000,
  });

  const hasGasError = history.some(
    h => isGasError(h.note) && (h.status === "cancelled" || h.status === "pending")
  );

  // ── withdraw logic ───────────────────────────────────────────────────────
  const parsedAmount    = parseFloat(amount) || 0;
  const exceedsBalance  = parsedAmount > available;
  const canSubmit       = parsedAmount > 0 && !exceedsBalance && recipient.trim().length > 4 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/withdrawals`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, asset, amount: parsedAmount, network, networkLabel, recipient: recipient.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to submit withdrawal");
      setSubmitted(true);
      toast({ title: "Withdrawal sent", description: `${parsedAmount} ${asset} is being broadcast on-chain.` });
      addNotification({ type: "withdrawal", title: "Withdrawal Processing", body: `${parsedAmount} ${asset} is being sent on-chain.` });
      refetchHistory();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── verify deposit TX ────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!txHash.trim()) return;
    setVerifying(true);
    try {
      const r = await fetch(`${API_BASE}/deposit/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txHash: txHash.trim(), chainId: depositChain.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Verification failed");
      toast({ title: "Deposit credited!", description: `${data.amount} ${data.asset} added to your OrahDEX balance.` });
      setTxHash("");
      refetchDeposit();
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const statusStyle = (s: string) => {
    if (s === "completed")  return "text-green-400  bg-green-400/10  border-green-400/20";
    if (s === "failed")     return "text-red-400    bg-red-400/10    border-red-400/20";
    if (s === "cancelled")  return "text-orange-400 bg-orange-400/10 border-orange-400/20";
    if (s === "processing") return "text-blue-400   bg-blue-400/10   border-blue-400/20";
    return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shrink-0"
              style={{ backgroundColor: color + "22", borderColor: color + "44", color }}
            >
              {asset[0]}
            </div>
            <span>{asset} — Deposit &amp; Withdraw</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-secondary/30">
          {([
            { key: "deposit",  label: "Deposit",  icon: <Download className="w-3.5 h-3.5" /> },
            { key: "withdraw", label: "Withdraw", icon: <Upload    className="w-3.5 h-3.5" /> },
            { key: "history",  label: "History",  icon: <History   className="w-3.5 h-3.5" />, badge: history.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="flex items-center justify-center gap-1.5">
                {t.icon}
                {t.label}
                {"badge" in t && t.badge > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                    {t.badge}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* ── DEPOSIT TAB ──────────────────────────────────────────────────── */}
        {tab === "deposit" && (
          <div className="space-y-4">

            {/* Chain selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Network</label>
              <div className="flex gap-2">
                {SUPPORTED_CHAINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setDepositChain(c)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                      depositChain.id === c.id
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {c.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Deposit address + QR */}
            {depositLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : depositData ? (
              <>
                <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
                  {/* QR code */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <QRCodeCanvas
                        value={depositData.depositAddress}
                        size={160}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <div className="text-center space-y-0.5">
                      <p className="text-xs font-semibold text-foreground">Your OrahDEX Deposit Address</p>
                      <p className="text-[11px] text-muted-foreground">{depositChain.label}</p>
                    </div>
                  </div>

                  {/* Address row */}
                  <div className="flex items-center gap-2 bg-background/60 rounded-lg px-3 py-2 border border-border/40">
                    <span className="font-mono text-xs text-foreground/80 flex-1 break-all select-all leading-relaxed">
                      {depositData.depositAddress}
                    </span>
                    <button
                      onClick={() => copy(depositData.depositAddress, "dep-addr")}
                      className="shrink-0 p-1 rounded-lg hover:bg-muted transition-colors"
                    >
                      {copiedId === "dep-addr"
                        ? <Check className="w-4 h-4 text-green-400" />
                        : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>

                  {/* Info pills */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Accepted asset</p>
                      <p className="font-bold text-foreground">{depositData.nativeSymbol} (native)</p>
                    </div>
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Min deposit</p>
                      <p className="font-bold text-foreground">0.001 {depositData.nativeSymbol}</p>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="flex gap-2.5 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                  <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
                    <p>Send <strong className="text-foreground">{depositData.nativeSymbol}</strong> on <strong className="text-foreground">{depositChain.label}</strong> to the address above. After your transaction confirms, paste your TX hash below to credit your OrahDEX balance instantly.</p>
                  </div>
                </div>

                {/* Verify TX */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">I've sent funds — verify deposit</label>
                  <div className="flex gap-2">
                    <Input
                      value={txHash}
                      onChange={e => setTxHash(e.target.value.trim())}
                      placeholder="0x… transaction hash"
                      className="font-mono text-xs flex-1"
                    />
                    <Button
                      onClick={handleVerify}
                      disabled={!txHash.trim() || verifying}
                      size="sm"
                      className="shrink-0 gap-1.5"
                    >
                      {verifying
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Verify
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Paste the transaction hash from your wallet after sending to the address above.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
                <AlertCircle className="w-8 h-8 opacity-40" />
                <p className="text-sm">Could not load deposit address</p>
                <Button variant="outline" size="sm" onClick={() => refetchDeposit()} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </Button>
              </div>
            )}

            {/* Gas top-up card — collapsible */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 overflow-hidden">
              <button
                onClick={() => setShowGasCard(v => !v)}
                className="w-full flex items-center gap-2.5 px-3.5 py-3 text-sm font-semibold text-amber-400 hover:bg-amber-500/5 transition-colors"
              >
                <Fuel className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Fund gas for withdrawals</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", showGasCard && "rotate-180")} />
              </button>

              {showGasCard && (
                <div className="px-3.5 pb-3.5 space-y-2.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The OrahDEX hot wallet on <strong className="text-foreground">Base</strong> needs ETH to pay gas when sending your withdrawals. Send ≥ 0.002 ETH to this address — pending withdrawals process automatically once funded.
                  </p>
                  <div className="flex items-center gap-2 bg-background/60 rounded-lg px-2.5 py-2 border border-amber-500/20">
                    <span className="font-mono text-xs text-amber-300 flex-1 break-all select-all">
                      {GAS_HOT_WALLET}
                    </span>
                    <button
                      onClick={() => copy(GAS_HOT_WALLET, "gas-wallet")}
                      className="shrink-0 p-0.5 hover:text-white transition-colors"
                    >
                      {copiedId === "gas-wallet"
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Network</p>
                      <p className="font-bold text-foreground">Base</p>
                    </div>
                    <div className="rounded-lg bg-background/50 px-2.5 py-2 space-y-0.5">
                      <p className="text-muted-foreground">Min amount</p>
                      <p className="font-bold text-foreground">0.002 ETH</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── WITHDRAW TAB ─────────────────────────────────────────────────── */}
        {tab === "withdraw" && !submitted && (
          <div className="space-y-4">

            {/* Gas warning banner (if previous withdrawals failed due to gas) */}
            {hasGasError && (
              <button
                onClick={() => { setTab("deposit"); setShowGasCard(true); }}
                className="w-full flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left hover:bg-amber-500/15 transition-colors"
              >
                <Fuel className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-400">Withdrawal pending — gas needed</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Tap to see how to fund the exchange gas wallet →</p>
                </div>
              </button>
            )}

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

            {/* Amount */}
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
                  <AlertCircle className="w-3 h-3" /> Exceeds available OrahDEX balance
                </p>
              )}
            </div>

            {/* Recipient */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Recipient address</label>
              <Input
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder={addressPlaceholder}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {walletAddress
                  ? `Pre-filled with your connected wallet. You may change this to any valid ${networkLabel} address.`
                  : `Enter a valid ${networkLabel} address.`}
              </p>
            </div>

            {/* Processing notice */}
            <div className="flex gap-2.5 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Withdrawals are processed instantly on-chain. Funds go directly to your wallet — no waiting.
              </p>
            </div>

            <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full gap-2 h-11">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {submitting ? "Submitting…" : `Withdraw${parsedAmount > 0 ? ` ${parsedAmount}` : ""} ${asset}`}
            </Button>
          </div>
        )}

        {/* ── SUCCESS STATE ─────────────────────────────────────────────────── */}
        {tab === "withdraw" && submitted && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold">Sending to Your Wallet</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                <span className="font-semibold text-foreground">{parsedAmount} {asset}</span>{" "}
                is being broadcast on-chain. Check the History tab for your transaction ID once confirmed.
              </p>
            </div>
            <div className="flex gap-2 w-full pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setTab("history")}>View History</Button>
              <Button className="flex-1" onClick={() => { setSubmitted(false); setAmount(""); }}>New Withdrawal</Button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-0.5">

            {/* Gas banner */}
            {hasGasError && (
              <button
                onClick={() => { setTab("deposit"); setShowGasCard(true); }}
                className="w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-left hover:bg-amber-500/15 transition-colors"
              >
                <Fuel className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-400">Exchange wallet needs gas</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Your withdrawal is queued — send ≥ 0.002 ETH to the exchange hot wallet on Base and it will auto-process.
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 bg-background/60 rounded-lg px-2.5 py-1.5 border border-amber-500/20">
                    <span className="font-mono text-xs text-amber-300 flex-1 truncate">{shortAddr(GAS_HOT_WALLET)}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); copy(GAS_HOT_WALLET, "gas-hist"); }}
                      onKeyDown={e => e.key === "Enter" && copy(GAS_HOT_WALLET, "gas-hist")}
                      className="shrink-0 p-0.5 hover:text-white transition-colors"
                    >
                      {copiedId === "gas-hist"
                        ? <Check className="w-3 h-3 text-green-400" />
                        : <Copy className="w-3 h-3 text-amber-400" />}
                    </span>
                  </div>
                  <p className="text-[11px] text-primary mt-1.5 font-semibold">Tap for full gas funding guide →</p>
                </div>
              </button>
            )}

            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <History className="w-10 h-10 opacity-30" />
                <p className="text-sm">No withdrawal history yet</p>
              </div>
            ) : (
              history.map(item => (
                <div key={item.id} className="p-3.5 rounded-xl border border-border bg-secondary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm font-mono">
                      {item.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {item.asset}
                    </span>
                    <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full border", statusStyle(item.status))}>
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.networkLabel}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                    <span className="truncate flex-1">{item.recipient}</span>
                    <button onClick={() => copy(item.recipient, `${item.id}-addr`)} className="shrink-0 p-0.5 hover:text-foreground transition-colors">
                      {copiedId === `${item.id}-addr` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  {item.txid && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground/80 bg-secondary/30 rounded-lg px-2.5 py-1.5">
                      <span className="text-muted-foreground/50 shrink-0">TX</span>
                      <span className="truncate flex-1">{item.txid}</span>
                      <button onClick={() => copy(item.txid!, `${item.id}-tx`)} className="shrink-0 p-0.5 hover:text-foreground transition-colors">
                        {copiedId === `${item.id}-tx` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}

                  {item.note && (
                    item.note.startsWith("http") ? (
                      <a href={item.note} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                        <ExternalLink className="w-3 h-3" /> View on block explorer
                      </a>
                    ) : (() => {
                      const summary = summariseNote(item.note as string);
                      const isLong  = (item.note as string).length > summary.length + 2;
                      const isOpen  = expandedNote === item.id;
                      return (
                        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-lg px-2.5 py-2 space-y-1">
                          <p className="italic leading-relaxed">{isOpen ? item.note : summary}</p>
                          {isLong && (
                            <button onClick={() => setExpandedNote(isOpen ? null : item.id)} className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors">
                              {isOpen ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>
                      );
                    })()
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
