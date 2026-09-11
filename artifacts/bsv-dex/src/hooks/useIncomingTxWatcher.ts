/**
 * Watches on-chain transaction history for the connected EVM wallet and fires
 * a notification + toast whenever a new INCOMING transaction appears.
 *
 * Works by comparing the most-recent tx hash seen on the previous poll against
 * the freshest list returned by useOnChainTxHistory. Runs every 60 s when the
 * wallet page / mobile wallet is mounted.
 */
import { useEffect, useRef } from "react";
import { useOnChainTxHistory } from "@/hooks/useOnChainTxHistory";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useToast } from "@/hooks/use-toast";

export function useIncomingTxWatcher(address: string | null) {
  const { data: txs, refetch } = useOnChainTxHistory(address);
  const { addNotification } = useNotificationStore();
  const { toast } = useToast();

  // Track the newest tx hash we have already notified about
  const seenRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!txs || txs.length === 0) return;

    const incoming = txs.filter(tx => tx.isIncoming && !tx.isError);

    if (!initialisedRef.current) {
      // First load — seed the seen set without firing any notifications
      incoming.forEach(tx => seenRef.current.add(tx.hash));
      initialisedRef.current = true;
      return;
    }

    // On subsequent loads, fire for any new incoming tx we haven't seen
    for (const tx of incoming) {
      if (seenRef.current.has(tx.hash)) continue;
      seenRef.current.add(tx.hash);

      const amtLabel = tx.isTokenTransfer && tx.tokenValue != null && tx.tokenSymbol
        ? `${tx.tokenValue.toPrecision(4)} ${tx.tokenSymbol}`
        : tx.valueEth > 0
          ? `${tx.valueEth.toPrecision(4)} ${tx.nativeSymbol}`
          : `${tx.nativeSymbol} transfer`;

      const fromShort = tx.from ? `${tx.from.slice(0, 6)}…${tx.from.slice(-4)}` : "unknown";

      toast({
        title:       `Funds received on ${tx.chainName}`,
        description: `${amtLabel} from ${fromShort}`,
      });

      addNotification({
        type:  "deposit",
        title: `Received ${amtLabel} on ${tx.chainName}`,
        body:  `From ${fromShort} · ${new Date(tx.timeStamp * 1000).toLocaleTimeString()}`,
        txid:  tx.hash,
        href:  tx.explorerUrl,
      });
    }
  }, [txs, addNotification, toast]);

  // Poll every 60 s while component is mounted
  useEffect(() => {
    if (!address) return;
    const id = setInterval(() => { void refetch(); }, 60_000);
    return () => clearInterval(id);
  }, [address, refetch]);
}
