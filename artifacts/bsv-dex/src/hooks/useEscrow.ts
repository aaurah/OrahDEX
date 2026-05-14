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
  lockEthViaOrah,
  lockErc20ViaOrah,
  cancelEscrowViaOrah,
  lockEthViaReown,
  lockErc20ViaReown,
  cancelEscrowViaReown,
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
  const isEvm        = !!address?.startsWith("0x");
  const isOrahWallet = provider === "orah-wallet";
  const isReown      = provider === "reown";
  // Injected wallets (MetaMask / Rabby browser ext): only when window.ethereum
  // is present AND we aren't using Reown / Orah. Reown wallets often live on
  // mobile via WalletConnect with no window.ethereum.
  const hasInjected  = typeof window !== "undefined" && !!(window as any).ethereum;
  const chainId = walletChainId ?? 0;
  // Escrow is available for any EVM wallet (Orah self-custody OR external) on a
  // chain where the OrahDEX escrow contract is deployed.
  const escrowAvailable = isEvm && hasEscrow(chainId);

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
        if (isOrahWallet) {
          result = await lockEthViaOrah(params.orderId, asset.rawAmount, address, chainId);
        } else if (isReown || !hasInjected) {
          // Reown/WalletConnect (mobile wallets like imToken) — no window.ethereum
          result = await lockEthViaReown(params.orderId, asset.rawAmount, chainId);
        } else {
          result = await lockEthViaInjected(params.orderId, asset.rawAmount, address, chainId);
        }
      } else {
        // ERC-20: approve then lock
        setStatus("approving");
        if (isOrahWallet) {
          result = await lockErc20ViaOrah(params.orderId, asset.address, asset.rawAmount, address, chainId);
        } else if (isReown || !hasInjected) {
          result = await lockErc20ViaReown(params.orderId, asset.address, asset.rawAmount, chainId);
        } else {
          result = await lockErc20ViaInjected(params.orderId, asset.address, asset.rawAmount, address, chainId);
        }
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
  // provider is included so the wallet-path booleans (isOrahWallet / isReown /
  // hasInjected) are never stale when the user changes their wallet connection.
  }, [escrowAvailable, address, chainId, provider]);

  const cancelOrder = useCallback(async (orderId: string): Promise<EscrowTxResult | null> => {
    if (!escrowAvailable || !address) return null;

    try {
      setErrorMsg(null);
      setStatus("cancelling");
      let result: EscrowTxResult;
      if (isOrahWallet) {
        result = await cancelEscrowViaOrah(orderId, address, chainId);
      } else if (isReown || !hasInjected) {
        result = await cancelEscrowViaReown(orderId, chainId);
      } else {
        result = await cancelEscrowViaInjected(orderId, address, chainId);
      }
      setStatus("success");
      setTxResult(result);
      return result;
    } catch (err: any) {
      const msg: string = err?.message ?? "Escrow cancel failed";
      setErrorMsg(msg);
      setStatus("error");
      return null;
    }
  // provider is included so the wallet-path booleans (isOrahWallet / isReown /
  // hasInjected) are never stale when the user changes their wallet connection.
  }, [escrowAvailable, address, chainId, provider]);

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
