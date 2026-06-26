/**
 * CrossChainSwapPanel — BSV → EVM atomic swap via HTLC intent settlement.
 *
 * Flow:
 *   Configure → POST /api/bsv-intent → PENDING_FUNDING (show P2SH funding address)
 *   → FUNDED → CONFIRMED (≥3 confs) → FILLED (solver pays EVM leg) → CLAIMED ✓
 *
 * Refund path: if deadline passes before FILLED, user can call
 *   POST /api/bsv-intent/:id/refund → watcher broadcasts CLTV refund tx.
 *
 * Cancel: DELETE /api/bsv-intent/:id (only valid while PENDING_FUNDING).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletPrices } from "@/hooks/useWalletPrices";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ArrowRight, CheckCircle2, AlertCircle, Loader2, Copy,
  ExternalLink, Zap, Shield, RotateCcw, X, Clock, ArrowLeftRight,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const CHAINS: { id: number; name: string; short: string }[] = [
  { id: 11155111, name: "Sepolia",  short: "Sep"  },
  { id: 1,        name: "Ethereum", short: "ETH"  },
  { id: 8453,     name: "Base",     short: "Base" },
  { id: 42161,    name: "Arbitrum", short: "Arb"  },
  { id: 137,      name: "Polygon",  short: "Pol"  },
  { id: 56,       name: "BSC",      short: "BSC"  },
];

const TOKENS: { symbol: string; decimals: number }[] = [
  { symbol: "ETH",  decimals: 18 },
  { symbol: "USDT", decimals: 6  },
  { symbol: "USDC", decimals: 6  },
  { symbol: "WBTC", decimals: 8  },
  { symbol: "BNB",  decimals: 18 },
];

const MIN_SAT = 2000;
const SLIPPAGE = 0.02;   // 2% default slippage

// ── Types ─────────────────────────────────────────────────────────────────────

type SwapStatus =
  | "PENDING_FUNDING" | "FUNDED" | "CONFIRMED"
  | "FILLED" | "CLAIMING" | "CLAIMED"
  | "EXPIRED" | "REFUNDING" | "REFUNDED" | "CANCELLED";

interface IntentData {
  id:                 string;
  status:             SwapStatus;
  htlcAddress:        string;
  amountInSat:        number;
  tokenOut:           string;
  minAmountOut:       string;
  destinationChain:   string;
  destinationAddress: string;
  deadlineTs:         number;
  deadlineBlocks:     number;
  redeemScript:       string;
  confirmations:      number | null;
  fundingTxid:        string | null;
  claimTxid:          string | null;
  refundTxid:         string | null;
  solverPaymentTxid:  string | null;
}

type PanelStep = "configure" | "funding" | "tracking";

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SwapStatus, string> = {
  PENDING_FUNDING: "Waiting for BSV deposit",
  FUNDED:          "Deposit detected (0 conf)",
  CONFIRMED:       "Deposit confirmed (≥3 conf)",
  FILLED:          "Solver filled EVM side",
  CLAIMING:        "Claiming BSV from HTLC…",
  CLAIMED:         "Swap complete!",
  EXPIRED:         "HTLC expired — refund available",
  REFUNDING:       "Broadcasting refund…",
  REFUNDED:        "BSV refunded",
  CANCELLED:       "Cancelled",
};

const TERMINAL_STATUSES = new Set<SwapStatus>(["CLAIMED", "REFUNDED", "CANCELLED"]);
const ACTIVE_STEPS: SwapStatus[] = [
  "PENDING_FUNDING", "FUNDED", "CONFIRMED", "FILLED", "CLAIMED",
];

function stepIndex(s: SwapStatus): number {
  const idx = ACTIVE_STEPS.indexOf(s);
  if (idx !== -1) return idx;
  if (s === "CLAIMING") return 4;
  return 0;
}

function isExpired(intent: IntentData): boolean {
  return Date.now() / 1000 > intent.deadlineTs &&
    !TERMINAL_STATUSES.has(intent.status) &&
    intent.status !== "REFUNDING" && intent.status !== "EXPIRED";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusStepper({ status }: { status: SwapStatus }) {
  const current = stepIndex(status);
  const labels = ["Deposit BSV", "Detecting", "Confirmed", "Solver fills", "Done"];
  return (
    <div className="flex items-center justify-between gap-1 py-2">
      {labels.map((label, i) => {
        const done    = i < current;
        const active  = i === current;
        const waiting = i > current;
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0 gap-0.5">
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ring-2",
              done    ? "bg-emerald-500 text-white ring-emerald-500/30"
                      : active ? "bg-violet-600 text-white ring-violet-500/30 animate-pulse"
                               : "bg-zinc-800 text-zinc-500 ring-zinc-800/30"
            )}>
              {done ? <CheckCircle2 size={11} /> : i + 1}
            </div>
            {i < labels.length - 1 && (
              <div className={cn("absolute", "hidden")} />
            )}
            <span className={cn(
              "text-[8px] text-center leading-tight truncate w-full px-0.5",
              done ? "text-emerald-400" : active ? "text-violet-300" : "text-zinc-600"
            )}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
    </button>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={cn("text-zinc-200 text-right break-all", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

export function CrossChainSwapPanel({ open, onOpenChange }: Props) {
  const { address, internalBsvAddress, provider } = useWalletStore();
  const { prices }                                 = useWalletPrices();
  const isOrahWallet  = provider === "orah-wallet";
  const bsvUsd        = prices.BSV?.usd ?? 16;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [amtBsv,    setAmtBsv]    = useState("");
  const [tokenOut,  setTokenOut]  = useState("ETH");
  const [chainId,   setChainId]   = useState(11155111);
  const [destAddr,  setDestAddr]  = useState("");
  const [formErr,   setFormErr]   = useState<string | null>(null);

  // ── Intent state ────────────────────────────────────────────────────────────
  const [step,       setStep]       = useState<PanelStep>("configure");
  const [intentId,   setIntentId]   = useState<string | null>(null);
  const [creating,   setCreating]   = useState(false);
  const [sendingBsv, setSendingBsv] = useState(false);
  const [bsvTxid,    setBsvTxid]    = useState<string | null>(null);
  const [sendErr,    setSendErr]    = useState<string | null>(null);
  const [refunding,  setRefunding]  = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionMsg,  setActionMsg]  = useState<string | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const amtSat = Math.round(parseFloat(amtBsv || "0") * 1e8);
  const tokenUsd = (() => {
    if (tokenOut === "USDT" || tokenOut === "USDC") return 1;
    if (tokenOut === "WBTC") return prices.BTC?.usd ?? 85000;
    if (tokenOut === "BNB")  return prices.BNB?.usd ?? 580;
    return prices.ETH?.usd ?? 2400;
  })();
  const tokenDecimals = TOKENS.find(t => t.symbol === tokenOut)?.decimals ?? 18;
  const bsvValueUsd = amtSat > 0 ? (amtSat / 1e8) * bsvUsd : 0;
  const estimatedOut = tokenUsd > 0 && bsvValueUsd > 0
    ? (bsvValueUsd * (1 - SLIPPAGE)) / tokenUsd
    : 0;
  const minAmountOut = estimatedOut > 0
    ? estimatedOut.toFixed(Math.min(tokenDecimals, 8))
    : "0";
  const chainName = CHAINS.find(c => c.id === chainId)?.name ?? "Sepolia";

  // ── Poll intent status ───────────────────────────────────────────────────────
  const { data: intentData, refetch: refetchIntent } = useQuery<IntentData>({
    queryKey: ["cross-chain-swap", intentId],
    queryFn:  async () => {
      const r = await fetch(`${BASE}/api/bsv-intent/${intentId}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Failed to fetch intent");
      return r.json();
    },
    enabled:         !!intentId && step === "tracking",
    refetchInterval: data => {
      if (!data || TERMINAL_STATUSES.has(data.status)) return false;
      return 5000;
    },
    staleTime: 0,
  });

  // ── Reset on open ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep("configure");
      setIntentId(null);
      setBsvTxid(null);
      setSendErr(null);
      setFormErr(null);
      setActionMsg(null);
    }
  }, [open]);

  // ── Auto-advance to tracking once polling starts ────────────────────────────
  useEffect(() => {
    if (intentData && step === "funding") {
      if (intentData.status !== "PENDING_FUNDING" || bsvTxid) {
        setStep("tracking");
      }
    }
  }, [intentData, step, bsvTxid]);

  // ── Step 1: Initiate intent ──────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    setFormErr(null);
    if (amtSat < MIN_SAT) {
      setFormErr(`Minimum swap amount is ${MIN_SAT} satoshis (${(MIN_SAT / 1e8).toFixed(8)} BSV)`);
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(destAddr.trim())) {
      setFormErr("Destination must be a valid EVM address (0x…)");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch(`${BASE}/api/bsv-intent`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress:        address ?? destAddr.trim(),
          tokenOut,
          amountInSat:        amtSat,
          minAmountOut,
          destinationChain:   String(chainId),
          destinationAddress: destAddr.trim(),
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Failed to create swap");
      setIntentId(json.intentId);
      setStep("funding");
    } catch (err: any) {
      setFormErr(err.message ?? "Failed to initiate swap");
    } finally {
      setCreating(false);
    }
  }, [address, amtSat, tokenOut, chainId, destAddr, minAmountOut]);

  // ── Step 2a: Send BSV with Orah passkey ─────────────────────────────────────
  const handleSendWithPasskey = useCallback(async () => {
    if (!intentData?.htlcAddress || !internalBsvAddress || !address) return;
    setSendErr(null);
    setSendingBsv(true);
    try {
      const { sendBsvWithPasskey } = await import("@/lib/passkeyWallet");
      const result = await sendBsvWithPasskey(
        address,
        internalBsvAddress,
        intentData.htlcAddress,
        intentData.amountInSat / 1e8,
      );
      setBsvTxid(result.txid);
      setStep("tracking");
    } catch (err: any) {
      setSendErr(err.message ?? "Failed to send BSV");
    } finally {
      setSendingBsv(false);
    }
  }, [intentData, internalBsvAddress, address]);

  // ── Reclaim: trigger CLTV refund ─────────────────────────────────────────────
  const handleRefund = useCallback(async () => {
    if (!intentId) return;
    setRefunding(true);
    setActionMsg(null);
    try {
      const r = await fetch(`${BASE}/api/bsv-intent/${intentId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok) {
        setActionMsg(json.error ?? "Refund request failed");
      } else {
        setActionMsg("Refund initiated — watcher will broadcast the CLTV transaction shortly.");
        setTimeout(() => refetchIntent(), 3000);
      }
    } catch {
      setActionMsg("Network error. Try again.");
    } finally {
      setRefunding(false);
    }
  }, [intentId, refetchIntent]);

  // ── Cancel PENDING_FUNDING intent ─────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (!intentId || !address) return;
    setCancelling(true);
    setActionMsg(null);
    try {
      const r = await fetch(`${BASE}/api/bsv-intent/${intentId}`, {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address }),
      });
      const json = await r.json();
      if (!r.ok) {
        setActionMsg(json.error ?? "Cancel failed");
      } else {
        setStep("configure");
        setIntentId(null);
      }
    } catch {
      setActionMsg("Network error. Try again.");
    } finally {
      setCancelling(false);
    }
  }, [intentId, address]);

  // ── Intent for funding step (before polling kicks in) ────────────────────────
  const [fundingIntent, setFundingIntent] = useState<IntentData | null>(null);
  useEffect(() => {
    if (!intentId || step !== "funding") return;
    let cancelled = false;
    fetch(`${BASE}/api/bsv-intent/${intentId}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setFundingIntent(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [intentId, step]);

  const displayIntent: IntentData | null = intentData ?? fundingIntent;

  // ── Deadline clock ────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState<string>("");
  useEffect(() => {
    if (!displayIntent?.deadlineTs) return;
    const tick = () => {
      const s = Math.max(0, displayIntent.deadlineTs - Math.floor(Date.now() / 1000));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      setTimeLeft(`${h}h ${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [displayIntent?.deadlineTs]);

  const refundable = !!displayIntent &&
    (displayIntent.status === "EXPIRED" ||
     (Date.now() / 1000 > displayIntent.deadlineTs &&
      !TERMINAL_STATUSES.has(displayIntent.status)));

  const isComplete  = displayIntent?.status === "CLAIMED";
  const isRefunded  = displayIntent?.status === "REFUNDED" || displayIntent?.status === "CANCELLED";
  const isFailed    = isRefunded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-zinc-950 border-violet-500/20 text-zinc-50 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-zinc-800">
          <DialogTitle className="flex items-center gap-2 text-violet-300 text-base">
            <Shield size={16} /> BSV → EVM Atomic Swap
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs leading-relaxed">
            Trustless cross-chain swap via HTLC. Your funds are non-custodial — only you
            can claim or refund.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 pt-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">

          {/* ── Step 0: Configure ─────────────────────────────────────────── */}
          {step === "configure" && (
            <>
              {/* BSV amount */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  BSV Amount to send
                </label>
                <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden focus-within:border-violet-500/50">
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="0.01"
                    value={amtBsv}
                    onChange={e => setAmtBsv(e.target.value)}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                  <span className="px-3 text-xs font-bold text-zinc-400">BSV</span>
                </div>
                {bsvValueUsd > 0 && (
                  <p className="text-[10px] text-zinc-500">
                    ≈ ${bsvValueUsd.toFixed(2)} USD · {amtSat.toLocaleString()} satoshis
                  </p>
                )}
              </div>

              {/* Token + chain */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Receive token
                  </label>
                  <select
                    value={tokenOut}
                    onChange={e => setTokenOut(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500/50"
                  >
                    {TOKENS.map(t => (
                      <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Destination chain
                  </label>
                  <select
                    value={chainId}
                    onChange={e => setChainId(Number(e.target.value))}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500/50"
                  >
                    {CHAINS.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Destination EVM address */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Receive address (EVM)
                </label>
                <input
                  type="text"
                  placeholder={address?.startsWith("0x") ? address : "0x…"}
                  value={destAddr}
                  onChange={e => setDestAddr(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-mono text-zinc-100 outline-none focus:border-violet-500/50 placeholder:text-zinc-600"
                />
                {address?.startsWith("0x") && !destAddr && (
                  <button
                    onClick={() => setDestAddr(address)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 self-start"
                  >
                    Use connected wallet address
                  </button>
                )}
              </div>

              {/* Quote preview */}
              {estimatedOut > 0 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Estimated swap
                  </p>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <span className="text-zinc-200">{parseFloat(amtBsv || "0").toFixed(4)} BSV</span>
                    <ArrowRight size={13} className="text-violet-400" />
                    <span className="text-violet-300">≥ {estimatedOut.toFixed(4)} {tokenOut}</span>
                  </div>
                  <p className="text-[9px] text-zinc-600">
                    {SLIPPAGE * 100}% slippage buffer · HTLC deadline ~48h ·
                    Trustless via on-chain script
                  </p>
                </div>
              )}

              {formErr && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
                  <AlertCircle size={13} className="shrink-0" />
                  {formErr}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || amtSat < MIN_SAT || !destAddr.trim()}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                  "bg-violet-600 text-white hover:bg-violet-500 active:opacity-80",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {creating
                  ? <><Loader2 size={14} className="animate-spin" /> Creating HTLC…</>
                  : <><Zap size={14} /> Initiate Atomic Swap</>
                }
              </button>
            </>
          )}

          {/* ── Step 1: Fund HTLC ─────────────────────────────────────────── */}
          {step === "funding" && displayIntent && (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Send exactly this amount to the HTLC address:
                </p>
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2">
                  <span className="font-mono font-bold text-amber-300 text-base">
                    {(displayIntent.amountInSat / 1e8).toFixed(8)} BSV
                  </span>
                  <span className="text-xs text-amber-400/70 ml-1">
                    ({displayIntent.amountInSat.toLocaleString()} sat)
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  HTLC P2SH Address (BSV mainnet)
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5">
                  <span className="font-mono text-[11px] text-violet-300 flex-1 break-all select-all">
                    {displayIntent.htlcAddress}
                  </span>
                  <CopyButton text={displayIntent.htlcAddress} />
                </div>
                <p className="text-[9px] text-zinc-600 leading-relaxed">
                  This is a time-locked smart contract address. Send the exact amount above.
                  Excess funds go to miner fees on the refund tx.
                </p>
              </div>

              {/* Orah passkey send */}
              {isOrahWallet && internalBsvAddress && (
                <div className="flex flex-col gap-2">
                  {!bsvTxid ? (
                    <button
                      onClick={handleSendWithPasskey}
                      disabled={sendingBsv}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                        "bg-emerald-600 text-white hover:bg-emerald-500",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      )}
                    >
                      {sendingBsv
                        ? <><Loader2 size={14} className="animate-spin" /> Sending BSV…</>
                        : <><Zap size={14} /> Send with Passkey (Orah Wallet)</>
                      }
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                      <p className="text-xs font-semibold text-emerald-400">BSV sent!</p>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-emerald-300 break-all">{bsvTxid}</span>
                        <a
                          href={`https://whatsonchain.com/tx/${bsvTxid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="shrink-0 text-emerald-400 hover:text-emerald-300"
                        >
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  )}
                  {sendErr && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      <AlertCircle size={12} className="shrink-0" /> {sendErr}
                    </div>
                  )}
                </div>
              )}

              {!bsvTxid && (
                <p className="text-[10px] text-zinc-500 text-center">
                  {isOrahWallet && internalBsvAddress
                    ? "Or send manually from any BSV wallet."
                    : "Send the exact amount from your BSV wallet to the address above."}
                </p>
              )}

              {/* Deadline */}
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                <Clock size={11} className="shrink-0" />
                <span>HTLC expires in: <span className="font-mono text-zinc-300">{timeLeft}</span></span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep("tracking")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <RotateCcw size={12} /> Track status
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  Cancel swap
                </button>
              </div>
              {actionMsg && (
                <p className="text-[10px] text-zinc-400 text-center">{actionMsg}</p>
              )}
            </>
          )}

          {/* ── Step 2: Track status ──────────────────────────────────────── */}
          {step === "tracking" && (
            <>
              {/* Stepper */}
              {displayIntent && !TERMINAL_STATUSES.has(displayIntent.status) && (
                <StatusStepper status={displayIntent.status} />
              )}

              {/* Status badge */}
              {displayIntent && (
                <div className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5",
                  isComplete
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : isFailed
                    ? "border-zinc-700 bg-zinc-900"
                    : refundable
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-violet-500/20 bg-violet-500/8"
                )}>
                  {isComplete
                    ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    : isFailed
                    ? <X size={15} className="text-zinc-500 shrink-0" />
                    : refundable
                    ? <AlertCircle size={15} className="text-amber-400 shrink-0" />
                    : <Loader2 size={15} className={cn("shrink-0", !TERMINAL_STATUSES.has(displayIntent.status) && "animate-spin text-violet-400")} />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-semibold",
                      isComplete ? "text-emerald-300" : refundable ? "text-amber-300" : "text-violet-300"
                    )}>
                      {STATUS_LABELS[displayIntent.status]}
                    </p>
                    {displayIntent.status === "FUNDED" && displayIntent.confirmations != null && (
                      <p className="text-[10px] text-zinc-400">
                        {displayIntent.confirmations} of 3 confirmations
                      </p>
                    )}
                    {!TERMINAL_STATUSES.has(displayIntent.status) && !refundable && (
                      <p className="text-[10px] text-zinc-500">
                        HTLC expires in {timeLeft}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Details */}
              {displayIntent && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                  <DetailRow
                    label="HTLC address"
                    value={
                      <span className="flex items-center gap-1">
                        <span>{displayIntent.htlcAddress.slice(0, 10)}…{displayIntent.htlcAddress.slice(-6)}</span>
                        <CopyButton text={displayIntent.htlcAddress} />
                        <a
                          href={`https://whatsonchain.com/address/${displayIntent.htlcAddress}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-violet-400 hover:text-violet-300"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </span>
                    }
                  />
                  <DetailRow
                    label="Swap"
                    value={`${(displayIntent.amountInSat / 1e8).toFixed(8)} BSV → ≥${parseFloat(displayIntent.minAmountOut).toFixed(4)} ${displayIntent.tokenOut}`}
                  />
                  <DetailRow label="Chain" value={`${chainName} (${displayIntent.destinationChain})`} />
                  <DetailRow
                    label="Receive address"
                    value={<span>{displayIntent.destinationAddress.slice(0, 10)}…{displayIntent.destinationAddress.slice(-4)}</span>}
                  />
                  {displayIntent.fundingTxid && (
                    <DetailRow
                      label="BSV deposit tx"
                      value={
                        <a
                          href={`https://whatsonchain.com/tx/${displayIntent.fundingTxid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-violet-300 hover:underline"
                        >
                          {displayIntent.fundingTxid.slice(0, 10)}… <ExternalLink size={9} />
                        </a>
                      }
                    />
                  )}
                  {displayIntent.claimTxid && (
                    <DetailRow
                      label="Claim tx (BSV)"
                      value={
                        <a
                          href={`https://whatsonchain.com/tx/${displayIntent.claimTxid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-emerald-300 hover:underline"
                        >
                          {displayIntent.claimTxid.slice(0, 10)}… <ExternalLink size={9} />
                        </a>
                      }
                    />
                  )}
                  {displayIntent.solverPaymentTxid && (
                    <DetailRow
                      label="EVM payment tx"
                      value={
                        <a
                          href={`https://etherscan.io/tx/${displayIntent.solverPaymentTxid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-emerald-300 hover:underline"
                        >
                          {displayIntent.solverPaymentTxid.slice(0, 10)}… <ExternalLink size={9} />
                        </a>
                      }
                    />
                  )}
                  {displayIntent.refundTxid && (
                    <DetailRow
                      label="Refund tx"
                      value={
                        <a
                          href={`https://whatsonchain.com/tx/${displayIntent.refundTxid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-amber-300 hover:underline"
                        >
                          {displayIntent.refundTxid.slice(0, 10)}… <ExternalLink size={9} />
                        </a>
                      }
                    />
                  )}
                  <DetailRow label="Intent ID" value={<span className="text-zinc-600 text-[10px]">{displayIntent.id.slice(0, 18)}…</span>} mono />
                </div>
              )}

              {/* Refund action */}
              {refundable && !TERMINAL_STATUSES.has(displayIntent?.status ?? "CANCELLED") && (
                <button
                  onClick={handleRefund}
                  disabled={refunding}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all",
                    "bg-amber-600/80 text-white hover:bg-amber-500 active:opacity-80",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {refunding
                    ? <><Loader2 size={14} className="animate-spin" /> Initiating refund…</>
                    : <><RotateCcw size={14} /> Reclaim funds (CLTV refund)</>
                  }
                </button>
              )}

              {actionMsg && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                  {actionMsg}
                </div>
              )}

              {/* New swap button when terminal */}
              {(isComplete || isRefunded) && (
                <button
                  onClick={() => {
                    setStep("configure");
                    setIntentId(null);
                    setBsvTxid(null);
                    setAmtBsv("");
                    setDestAddr("");
                    setActionMsg(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <ArrowLeftRight size={14} /> Start new swap
                </button>
              )}

              {/* Manual refresh */}
              {!isComplete && !isRefunded && (
                <button
                  onClick={() => refetchIntent()}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <RotateCcw size={10} /> Refresh status
                </button>
              )}
            </>
          )}

          {/* Loading state when intent not yet fetched */}
          {step !== "configure" && !displayIntent && (
            <div className="flex items-center justify-center py-6 gap-2 text-zinc-500">
              <Loader2 size={14} className="animate-spin" /> Loading swap data…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
