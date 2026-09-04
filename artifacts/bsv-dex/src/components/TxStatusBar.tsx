import { useWalletStore, type PendingTx } from "@/store/useWalletStore";
import { ExternalLink, CheckCircle2, XCircle, Loader2, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function TxRow({ tx, onDismiss }: { tx: PendingTx; onDismiss: () => void }) {
  const isPending   = tx.status === "pending";
  const isConfirmed = tx.status === "confirmed";
  const isFailed    = tx.status === "failed" || tx.status === "dropped";

  return (
    <div className={cn(
      "flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-xl transition-all animate-in slide-in-from-bottom-2",
      isPending   && "bg-card/90 border-border",
      isConfirmed && "bg-green-950/80 border-green-700/40",
      isFailed    && "bg-red-950/70 border-red-700/40",
    )}>
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {isPending   && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
        {isConfirmed && <CheckCircle2 className="w-4 h-4 text-green-400" />}
        {isFailed    && <XCircle className="w-4 h-4 text-red-400" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-xs font-semibold truncate",
            isPending   && "text-foreground",
            isConfirmed && "text-green-300",
            isFailed    && "text-red-300",
          )}>
            {tx.label}
          </span>
          {isConfirmed && tx.confirmations > 0 && (
            <span className="text-[10px] text-green-500 shrink-0">
              ✓ {tx.confirmations} conf
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground font-mono">
            {tx.hash.slice(0, 6)}…{tx.hash.slice(-4)}
          </span>
          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            View <ExternalLink className="w-2.5 h-2.5" />
          </a>
          {isPending && (
            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> pending
            </span>
          )}
          {isFailed && tx.status === "dropped" && (
            <span className="text-[10px] text-red-400/70">timed out</span>
          )}
        </div>
      </div>

      {/* Dismiss — only for non-pending */}
      {!isPending && (
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Fixed bottom-right overlay showing all in-flight / recently confirmed transactions.
 * Mount this once in Layout or App root.
 */
export function TxStatusBar() {
  const txs    = useWalletStore((s) => s.pendingTxs);
  const remove = useWalletStore((s) => s.removeTx);

  // Only show txs that are pending, confirmed, or failed (not old dropped ones after dismiss)
  const visible = txs.filter(
    (tx) => tx.status === "pending" || tx.status === "confirmed" || tx.status === "failed" || tx.status === "dropped"
  );

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)] pointer-events-none">
      {visible.map((tx) => (
        <div key={tx.hash} className="pointer-events-auto">
          <TxRow tx={tx} onDismiss={() => remove(tx.hash)} />
        </div>
      ))}
    </div>
  );
}
