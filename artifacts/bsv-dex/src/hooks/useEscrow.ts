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
import { useActiveAccount } from "thirdweb/react";
import { sendTransaction, prepareTransaction, waitForReceipt } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { thirdwebClient } from "@/lib/thirdweb-client";
import { useWalletStore } from "@/store/useWalletStore";
import {
  hasEscrow,
  resolveEscrowAsset,
  escrowAddress,
  lockEthViaOrah,
  lockErc20ViaOrah,
  cancelEscrowViaOrah,
  lockEthViaReown,
  lockErc20ViaReown,
  cancelEscrowViaReown,
  lockEthUniversal,
  lockErc20Universal,
  cancelEscrowUniversal,
  buildLockEthCalldata,
  buildLockErc20Calldata,
  buildApproveCalldata,
  buildCancelCalldata,
  EscrowTxResult,
} from "@/lib/escrow";

type ThirdwebAccount = NonNullable<ReturnType<typeof useActiveAccount>>;

const TW_EXPLORER: Record<number, string> = {
  1:        "https://etherscan.io",
  137:      "https://polygonscan.com",
  56:       "https://bscscan.com",
  8453:     "https://basescan.org",
  42161:    "https://arbiscan.io",
  10:       "https://optimistic.etherscan.io",
  43114:    "https://snowtrace.io",
  11155111: "https://sepolia.etherscan.io",
  84532:    "https://sepolia.basescan.org",
};

async function lockEthViaThirdweb(
  orderId: string,
  rawAmount: bigint,
  account: ThirdwebAccount,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrowAddr = escrowAddress(chainId);
  if (!escrowAddr) throw new Error(`No escrow on chain ${chainId}`);
  const chain = defineChain(chainId);
  const tx = prepareTransaction({
    to: escrowAddr,
    value: rawAmount,
    data: buildLockEthCalldata(orderId),
    chain,
    client: thirdwebClient,
  });
  const { transactionHash } = await sendTransaction({ transaction: tx, account });
  const base = TW_EXPLORER[chainId] ?? "https://etherscan.io";
  return { txHash: transactionHash, explorerUrl: `${base}/tx/${transactionHash}` };
}

async function lockErc20ViaThirdweb(
  orderId: string,
  tokenAddress: string,
  rawAmount: bigint,
  account: ThirdwebAccount,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrowAddr = escrowAddress(chainId);
  if (!escrowAddr) throw new Error(`No escrow on chain ${chainId}`);
  const chain = defineChain(chainId);

  const approveTx = prepareTransaction({
    to: tokenAddress as `0x${string}`,
    data: buildApproveCalldata(escrowAddr, rawAmount),
    chain,
    client: thirdwebClient,
  });
  const approveResult = await sendTransaction({ transaction: approveTx, account });
  await waitForReceipt({ client: thirdwebClient, chain, transactionHash: approveResult.transactionHash });

  const lockTx = prepareTransaction({
    to: escrowAddr,
    data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount),
    chain,
    client: thirdwebClient,
  });
  const { transactionHash } = await sendTransaction({ transaction: lockTx, account });
  const base = TW_EXPLORER[chainId] ?? "https://etherscan.io";
  return { txHash: transactionHash, explorerUrl: `${base}/tx/${transactionHash}` };
}

async function cancelEscrowViaThirdweb(
  orderId: string,
  account: ThirdwebAccount,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrowAddr = escrowAddress(chainId);
  if (!escrowAddr) throw new Error(`No escrow on chain ${chainId}`);
  const chain = defineChain(chainId);
  const tx = prepareTransaction({
    to: escrowAddr,
    data: buildCancelCalldata(orderId),
    chain,
    client: thirdwebClient,
  });
  const { transactionHash } = await sendTransaction({ transaction: tx, account });
  const base = TW_EXPLORER[chainId] ?? "https://etherscan.io";
  return { txHash: transactionHash, explorerUrl: `${base}/tx/${transactionHash}` };
}

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
  const thirdwebAccount = useActiveAccount();
  const isEvm        = !!address?.startsWith("0x");
  const isOrahWallet = provider === "orah-wallet";
  const isThirdweb   = provider === "thirdweb";
  const chainId = walletChainId ?? 0;
  // Escrow is available for any EVM wallet (Orah self-custody OR external) on a
  // chain where the OrahDEX escrow contract is deployed.
  const escrowAvailable = isEvm && hasEscrow(chainId);

  // Reown/WalletConnect has been removed. This always returns false.
  function isReownConnected(): boolean {
    return false;
  }

  const [status,    setStatus]    = useState<EscrowStatus>("idle");
  const [txResult,  setTxResult]  = useState<EscrowTxResult | null>(null);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);

  const lockOrder = useCallback(async (params: LockOrderParams): Promise<EscrowTxResult | null> => {
    if (!address) {
      setErrorMsg("Wallet not connected. Please connect your wallet and try again.");
      setStatus("error");
      return null;
    }
    if (!escrowAvailable) {
      setErrorMsg(`Escrow contract not available on this network (chain ${chainId}). Please switch to a supported EVM chain.`);
      setStatus("error");
      return null;
    }

    const asset = resolveEscrowAsset(
      chainId, params.side, params.base, params.quote,
      params.quantity, params.price,
    );
    if (!asset) {
      setErrorMsg(`Cannot lock ${params.side === "buy" ? params.quote : params.base} on chain ${chainId}`);
      setStatus("error");
      return null;
    }

    // Routing priority:
    //   1. Orah in-app wallet (local key)
    //   2. Native ThirdWeb connection (ThirdWeb UI → ThirdWeb SDK sendTransaction)
    //   3. Universal fallback (window.ethereum injected wallet)
    const useReown = !isOrahWallet && isReownConnected();
    const useTw    = !isOrahWallet && !useReown && isThirdweb && !!thirdwebAccount;

    try {
      setErrorMsg(null);
      let result: EscrowTxResult;

      if (asset.address === null) {
        // Native ETH
        setStatus("locking");
        if (isOrahWallet) {
          result = await lockEthViaOrah(params.orderId, asset.rawAmount, address, chainId);
        } else if (useReown) {
          result = await lockEthViaReown(params.orderId, asset.rawAmount, chainId);
        } else if (useTw) {
          result = await lockEthViaThirdweb(params.orderId, asset.rawAmount, thirdwebAccount!, chainId);
        } else {
          result = await lockEthUniversal(params.orderId, asset.rawAmount, address, chainId);
        }
      } else {
        // ERC-20: approve then lock
        setStatus("approving");
        if (isOrahWallet) {
          result = await lockErc20ViaOrah(params.orderId, asset.address, asset.rawAmount, address, chainId);
        } else if (useReown) {
          result = await lockErc20ViaReown(params.orderId, asset.address, asset.rawAmount, chainId);
        } else if (useTw) {
          result = await lockErc20ViaThirdweb(params.orderId, asset.address, asset.rawAmount, thirdwebAccount!, chainId);
        } else {
          result = await lockErc20Universal(params.orderId, asset.address, asset.rawAmount, address, chainId);
        }
      }

      setStatus("success");
      setTxResult(result);
      return result;
    } catch (err: any) {
      const msg: string = err?.message ?? "Escrow lock failed";
      const code = (err as any)?.code;
      const userRejected = code === 4001 || code === "ACTION_REJECTED" ||
        msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied") ||
        msg.toLowerCase().includes("cancel");
      setErrorMsg(userRejected ? "Transaction cancelled" : msg);
      setStatus("error");
      return null;
    }
  }, [escrowAvailable, address, chainId, isOrahWallet, isThirdweb, thirdwebAccount]);

  const cancelOrder = useCallback(async (orderId: string): Promise<EscrowTxResult | null> => {
    if (!address) {
      setErrorMsg("Wallet not connected. Please connect your wallet and try again.");
      setStatus("error");
      return null;
    }
    if (!escrowAvailable) {
      setErrorMsg(`Escrow contract not available on this network (chain ${chainId}). Please switch to a supported EVM chain.`);
      setStatus("error");
      return null;
    }

    const useReown = !isOrahWallet && isReownConnected();
    const useTw    = !isOrahWallet && !useReown && isThirdweb && !!thirdwebAccount;

    try {
      setErrorMsg(null);
      setStatus("cancelling");
      let result: EscrowTxResult;
      if (isOrahWallet) {
        result = await cancelEscrowViaOrah(orderId, address, chainId);
      } else if (useReown) {
        result = await cancelEscrowViaReown(orderId, chainId);
      } else if (useTw) {
        result = await cancelEscrowViaThirdweb(orderId, thirdwebAccount!, chainId);
      } else {
        result = await cancelEscrowUniversal(orderId, address, chainId);
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
  }, [escrowAvailable, address, chainId, isOrahWallet, isThirdweb, thirdwebAccount]);

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
