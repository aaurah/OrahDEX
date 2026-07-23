import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Send, Loader2, Copy } from "lucide-react";
import { useState } from "react";
import type { ExternalSwapData, ExternalSwapStatus } from "@/hooks/useExternalSwap";

interface Props {
  status:  ExternalSwapStatus;
  swap:    ExternalSwapData | null;
  error:   string | null;
  onReset: () => void;
}

export function ExternalSwapStatus({ status, swap, error, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  if (status === "idle") return null;

  const copyAddr = () => {
    if (!swap?.depositAddress) return;
    navigator.clipboard.writeText(swap.depositAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const venueName = swap?.venue === "letsexchange" ? "OrahRouter" : "OrahSwap";

  // ── Creating ──────────────────────────────────────────────────────────────
  if (status === "creating") {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
          <span>Routing via external swap provider…</span>
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  if (status === "failed") {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <span className="text-xs font-medium text-destructive">Swap failed</span>
        </div>
        {error && <p className="text-[10px] text-muted-foreground pl-5">{error}</p>}
        <button
          onClick={onReset}
          className="ml-5 text-[10px] underline text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  if (status === "completed") {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
          <span className="text-xs font-medium text-green-500">Swap completed</span>
        </div>
        {swap && (
          <p className="text-[10px] text-muted-foreground pl-5">
            {swap.expectedOutput > 0
              ? `≈${swap.expectedOutput.toFixed(6)} ${swap.toCoin} sent to your address`
              : `${swap.toCoin} sent to your address`}
          </p>
        )}
        <button
          onClick={onReset}
          className="ml-5 text-[10px] underline text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ── Confirming / Completing ───────────────────────────────────────────────
  if (status === "confirming" || status === "completing") {
    const label = status === "completing" ? "Sending coins…" : "Exchange in progress…";
    return (
      <div className="mx-3 mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
          <span className="text-xs font-medium text-primary">{label}</span>
        </div>
        {swap && (
          <p className="text-[10px] text-muted-foreground pl-5">
            Funds received · {venueName} is processing your swap
          </p>
        )}
      </div>
    );
  }

  // ── Waiting for deposit ───────────────────────────────────────────────────
  if (status === "waiting_deposit" && swap) {
    return (
      <div className="mx-3 mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span className="text-xs font-medium text-yellow-500">Send funds to complete swap</span>
          <span className="ml-auto text-[9px] text-muted-foreground">via {venueName}</span>
        </div>

        <div className="bg-background/60 rounded p-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Send exactly</span>
            <span className="text-xs font-mono font-semibold tabular-nums">
              {swap.fromAmount.toFixed(8).replace(/\.?0+$/, "")} {swap.fromCoin}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">You receive ≈</span>
            <span className="text-xs font-mono font-semibold tabular-nums text-green-500">
              {swap.expectedOutput > 0
                ? `${swap.expectedOutput.toFixed(6).replace(/\.?0+$/, "")} ${swap.toCoin}`
                : `? ${swap.toCoin}`}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Deposit address</span>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 text-[9px] bg-background/60 rounded px-2 py-1.5 font-mono break-all text-foreground">
              {swap.depositAddress}
            </code>
            <button
              onClick={copyAddr}
              className={cn(
                "shrink-0 p-1.5 rounded transition-colors",
                copied
                  ? "bg-green-500/20 text-green-500"
                  : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
              )}
              title="Copy deposit address"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          {swap.depositExtraId && (
            <p className="text-[9px] text-muted-foreground">
              Memo / Extra ID: <code className="font-mono">{swap.depositExtraId}</code>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          <span>Waiting for your deposit · status updates automatically</span>
        </div>

        <button
          onClick={onReset}
          className="text-[10px] underline text-muted-foreground hover:text-foreground"
        >
          Cancel / start over
        </button>
      </div>
    );
  }

  return null;
}
