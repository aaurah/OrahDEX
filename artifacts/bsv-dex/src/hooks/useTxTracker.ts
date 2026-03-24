import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { pollTxReceipt, getBlockNumber, fetchEvmBalance } from "@/lib/reown";

/**
 * Watches all `pendingTxs` in the wallet store.
 * For each pending tx, polls `eth_getTransactionReceipt` until mined.
 * On confirmation: updates status + confirmations, refreshes native balance.
 *
 * Mount this once at the app root (inside Router).
 */
export function useTxTracker() {
  const pendingTxs   = useWalletStore((s) => s.pendingTxs);
  const updateTx     = useWalletStore((s) => s.updateTx);
  const setBalance   = useWalletStore((s) => s.setBalance);
  const walletAddr   = useWalletStore((s) => s.address);
  const walletChain  = useWalletStore((s) => s.chainId);

  const watching = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending  = pendingTxs.filter((tx) => tx.status === "pending");
    const cancels: Array<() => void> = [];

    for (const tx of pending) {
      if (watching.current.has(tx.hash)) continue;
      watching.current.add(tx.hash);

      const cancel = pollTxReceipt(tx.hash, tx.chainId, {
        intervalMs:  4000,
        maxAttempts: 90,

        onReceipt: async (receipt) => {
          watching.current.delete(tx.hash);
          const confirmed = receipt.status === "0x1";
          const txBlock   = parseInt(receipt.blockNumber, 16);
          const curBlock  = await getBlockNumber(tx.chainId);
          const confs     = curBlock != null ? Math.max(1, curBlock - txBlock + 1) : 1;

          updateTx(tx.hash, {
            status:        confirmed ? "confirmed" : "failed",
            confirmations: confs,
            blockNumber:   txBlock,
          });

          if (confirmed && walletAddr) {
            const chainId = walletChain ?? tx.chainId;
            const bal = await fetchEvmBalance(walletAddr, chainId);
            if (bal !== null) setBalance(bal);
          }
        },

        onTimeout: () => {
          watching.current.delete(tx.hash);
          updateTx(tx.hash, { status: "dropped" });
        },
      });

      cancels.push(cancel);
    }

    return () => { cancels.forEach((c) => c()); };
  }, [pendingTxs]);
}
