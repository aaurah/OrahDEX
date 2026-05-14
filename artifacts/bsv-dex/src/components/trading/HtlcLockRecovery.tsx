/**
 * HtlcLockRecovery — lets a user recover ETH/tokens locked in an HTLC
 * contract when the counter-party never locked and the timelock has expired.
 *
 * Flow:
 *  1. User pastes the tx hash of their lockETH() call
 *  2. Server decodes the calldata, reads lock state from on-chain
 *  3. If timelock expired & not yet refunded: show "Refund" button
 *  4. User signs refund() from their wallet → ETH returns to them
 */

import { useState } from "react";
import { useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface LockInfo {
  lockId:          string;
  contractAddress: string;
  sender:          string;
  amount:          string;
  amountEth:       string;
  timelockUnix:    number;
  isExpired:       boolean;
  revealed:        boolean;
  refunded:        boolean;
  canRefund:       boolean;
  refundCalldata:  string;
  chainId:         number;
}

function chainName(id: number) {
  const names: Record<number, string> = {
    1: "Ethereum", 11155111: "Sepolia (testnet)",
    137: "Polygon", 56: "BNB Chain",
    8453: "Base", 42161: "Arbitrum One",
    10: "Optimism",
  };
  return names[id] ?? `Chain ${id}`;
}

function formatExpiry(unix: number) {
  const d = new Date(unix * 1000);
  const now = Date.now();
  if (unix * 1000 < now) {
    const ago = Math.round((now - unix * 1000) / 60_000);
    return `Expired ${ago < 60 ? `${ago}m` : `${Math.round(ago / 60)}h`} ago`;
  }
  return `Expires ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function HtlcLockRecovery({ chainId }: { chainId?: number }) {
  const [txHash,  setTxHash]  = useState("");
  const [loading, setLoading] = useState(false);
  const [info,    setInfo]    = useState<LockInfo | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);

  const { sendTransaction, data: refundTxHash, isPending: sending } = useSendTransaction();
  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  async function lookup() {
    const hash = txHash.trim();
    if (!hash.startsWith("0x") || hash.length !== 66) {
      setError("Enter a valid 0x transaction hash (66 chars).");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/bridge/evm-lock-info?txHash=${encodeURIComponent(hash)}&chainId=${chainId ?? 1}`
      );
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not look up lock."); return; }
      setInfo(j);
    } catch {
      setError("Network error — could not reach server.");
    } finally {
      setLoading(false);
    }
  }

  function doRefund() {
    if (!info) return;
    sendTransaction({
      to:   info.contractAddress as `0x${string}`,
      data: info.refundCalldata  as `0x${string}`,
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400 text-[11px] font-semibold hover:bg-amber-500/10 transition-colors"
      >
        <AlertCircle size={13} />
        Recover stuck on-chain funds
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-semibold">
          <ShieldCheck size={13} />
          Recover Locked ETH
        </div>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-[10px]">✕</button>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        If you locked ETH into an HTLC contract and the trade never completed, paste the
        transaction hash below to recover your funds once the timelock expires.
      </p>

      <div className="flex gap-2">
        <input
          value={txHash}
          onChange={e => setTxHash(e.target.value)}
          placeholder="0x transaction hash…"
          className="flex-1 h-9 rounded-lg border border-border bg-background px-2.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-amber-500/50"
        />
        <button
          onClick={lookup}
          disabled={loading}
          className="h-9 px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold hover:bg-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Look up
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-red-400 text-[10px]">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {info && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount locked</span>
              <span className="font-semibold text-foreground">{info.amountEth} ETH</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Network</span>
              <span className="text-foreground">{chainName(info.chainId)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Timelock</span>
              <span className={cn("font-medium", info.isExpired ? "text-green-400" : "text-amber-400")}>
                <Clock size={10} className="inline mr-1" />
                {formatExpiry(info.timelockUnix)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={cn("font-semibold",
                info.refunded  ? "text-primary"    :
                info.revealed  ? "text-green-400"  :
                info.canRefund ? "text-amber-400"  :
                                 "text-muted-foreground"
              )}>
                {info.refunded  ? "Already refunded" :
                 info.revealed  ? "Revealed (trade settled)" :
                 info.canRefund ? "Ready to refund" :
                                  "Timelock still active"}
              </span>
            </div>
          </div>

          {info.refunded && (
            <div className="flex items-center gap-1.5 text-primary text-[10px]">
              <CheckCircle2 size={11} />
              Funds have already been returned to your wallet.
            </div>
          )}

          {info.revealed && (
            <div className="flex items-center gap-1.5 text-green-400 text-[10px]">
              <CheckCircle2 size={11} />
              This lock was revealed — the trade completed on-chain.
            </div>
          )}

          {confirmed && (
            <div className="flex items-center gap-1.5 text-primary text-[10px] font-semibold">
              <CheckCircle2 size={12} />
              Refund confirmed! {info.amountEth} ETH returned to your wallet.
            </div>
          )}

          {info.canRefund && !confirmed && (
            <button
              onClick={doRefund}
              disabled={sending || confirming}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-[12px] font-bold hover:bg-amber-400 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {(sending || confirming) && <Loader2 size={13} className="animate-spin" />}
              {confirming ? "Confirming…" : sending ? "Waiting for wallet…" : `Cancel & Recover ${info.amountEth} ETH`}
            </button>
          )}

          {(info as any).note && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {(info as any).note}
            </p>
          )}

          {!info.canRefund && !info.refunded && !info.revealed && !(info as any).note && (
            <p className="text-[10px] text-amber-400/80">
              The timelock hasn't expired yet. Wait until it does, then come back and click "Look up" again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
