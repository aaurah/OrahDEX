/**
 * useEscrow — React hook for locking / cancelling OrahDEX order funds on-chain.
 *
 * Only activates when:
 *   • The user has an external EVM wallet (not Orah Wallet)
 *   • The wallet is connected to a chain that has an escrow contract (Sepolia)
 *
 * Usage:
 *   const { lockOrder, cancelOrder, status, txResult } = useEscrow();
 *   await lockOrder({ orderId, side, base, quote, quantity, price });
 */

import { useState, useCallback } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import {
  hasEscrow,
  resolveEscrowAsset,
  lockEthViaInjected,
  lockErc20ViaInjected,
  cancelEscrowViaInjected,
  EscrowTxResult,
} from "@/lib/escrow";

export type EscrowStatus =
  | "idle"
  | "approving"   // waiting for ERC-20 approve tx (injected wallet prompt)
  | "locking"     // waiting for lockETH / lockERC20 tx (injected wallet prompt)
  | "cancelling"  // waiting for cancel tx
  | "success"
  | "error";

export interface LockOrderParams {
  orderId:  string;
  side:     "buy" | "sell";
  base:     string;
  quote:    string;
  quantity: number;
  price:    number;   // limit price or last price for market orders
}

export function useEscrow() {
  const { address, chainId: walletChainId, provider } = useWalletStore();
  const isExternalEvm = provider !== "orah-wallet" && !!address?.startsWith("0x");
  const chainId = walletChainId ?? 0;
  const escrowAvailable = isExternalEvm && hasEscrow(chainId);

  const [status,    setStatus]    = useState<EscrowStatus>("idle");
  const [txResult,  setTxResult]  = useState<EscrowTxResult | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  const lockOrder = useCallback(async (params: LockOrderParams): Promise<EscrowTxResult | null> => {
    if (!escrowAvailable || !address) return null;

    const asset = resolveEscrowAsset(
      chainId, params.side, params.base, params.quote,
      params.quantity, params.price,
    );
    if (!asset) {
      setErrorMsg(`Cannot lock ${params.side === "buy" ? params.quote : params.base} on chain ${chainId}`);
      setStatus("error");
      return null;
    }

    try {
      setErrorMsg(null);
      let result: EscrowTxResult;

      if (asset.address === null) {
        // Native ETH
        setStatus("locking");
        result = await lockEthViaInjected(params.orderId, asset.rawAmount, address, chainId);
      } else {
        // ERC-20: approve then lock
        setStatus("approving");
        result = await lockErc20ViaInjected(params.orderId, asset.address, asset.rawAmount, address, chainId);
      }

      setStatus("success");
      setTxResult(result);
      return result;
    } catch (err: any) {
      const msg: string = err?.message ?? "Escrow lock failed";
      const userRejected = msg.includes("rejected") || msg.includes("denied") ||
                           msg.includes("cancel") || msg.includes("4001");
      setErrorMsg(userRejected ? "Transaction cancelled" : msg);
      setStatus("error");
      return null;
    }
  }, [escrowAvailable, address, chainId]);

  const cancelOrder = useCallback(async (orderId: string): Promise<EscrowTxResult | null> => {
    if (!escrowAvailable || !address) return null;

    try {
      setErrorMsg(null);
      setStatus("cancelling");
      const result = await cancelEscrowViaInjected(orderId, address, chainId);
      setStatus("success");
      setTxResult(result);
      return result;
    } catch (err: any) {
      const msg: string = err?.message ?? "Escrow cancel failed";
      setErrorMsg(msg);
      setStatus("error");
      return null;
    }
  }, [escrowAvailable, address, chainId]);

  const reset = useCallback(() => {
    setStatus("idle");
    setTxResult(null);
    setErrorMsg(null);
  }, []);

  return {
    escrowAvailable,
    status,
    txResult,
    errorMsg,
    isLoading: status === "approving" || status === "locking" || status === "cancelling",
    lockOrder,
    cancelOrder,
    reset,
  };
}
