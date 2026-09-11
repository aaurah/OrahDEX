/**
 * useEvmHtlcSession — React hook for polling EVM HTLC settlement status.
 *
 * Polls the /api/settlement/evm/session/:id endpoint every 10 seconds
 * while the session is active (not terminal).  Provides helpers for
 * building MetaMask transaction objects from lock instructions.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LockInstruction {
  contractAddress: string | null;
  lockId:          string;
  secretHash:      string;
  asset:           string;
  amount:          string;
  tokenAddress:    string | null;
  timelockUnix:    number;
  calldata:        string;
  instructions:    string[];
}

export interface EvmHtlcSession {
  id:               string;
  tradeId:          string;
  pair:             string;
  chainId:          number;
  contractAddress:  string | null;
  secretHash:       string;
  status:           EvmHtlcStatus;
  sellerAddress:    string;
  buyerAddress:     string;
  sellerLock:       LockInstruction;
  buyerLock:        LockInstruction;
  expiresAt:        number;
  sellerLocked:     boolean;
  buyerLocked:      boolean;
  sellerLockTxid:   string | null;
  buyerLockTxid:    string | null;
  revealSellerTxid: string | null;
  revealBuyerTxid:  string | null;
  createdAt:        string;
}

export type EvmHtlcStatus =
  | "PENDING_LOCKS"
  | "SELLER_LOCKED"
  | "BUYER_LOCKED"
  | "BOTH_LOCKED"
  | "REVEALING"
  | "COMPLETED"
  | "SELLER_REFUNDED"
  | "BUYER_REFUNDED"
  | "EXPIRED";

const TERMINAL_STATUSES: EvmHtlcStatus[] = [
  "COMPLETED", "SELLER_REFUNDED", "BUYER_REFUNDED", "EXPIRED",
];

const POLL_INTERVAL_MS = 10_000;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEvmHtlcSession(sessionId: string | null | undefined) {
  const [session,  setSession]  = useState<EvmHtlcSession | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/settlement/evm/session/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch session" }));
        setError((err as any).error ?? "Failed to fetch session");
        return;
      }
      const data = await res.json() as { session: EvmHtlcSession };
      setSession(data.session);
      setError(null);

      if (TERMINAL_STATUSES.includes(data.session.status)) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setError(null);
      return;
    }

    setLoading(true);
    fetchSession(sessionId).finally(() => setLoading(false));

    intervalRef.current = setInterval(() => fetchSession(sessionId), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionId, fetchSession]);

  const confirmLock = useCallback(async (
    side:   "seller" | "buyer",
    txHash: string
  ): Promise<boolean> => {
    if (!sessionId) return false;
    try {
      const res = await fetch(`${API_BASE}/settlement/evm/confirm-lock`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId, side, txHash }),
      });
      if (!res.ok) return false;
      await fetchSession(sessionId);
      return true;
    } catch {
      return false;
    }
  }, [sessionId, fetchSession]);

  const refresh = useCallback(() => {
    if (sessionId) fetchSession(sessionId);
  }, [sessionId, fetchSession]);

  return {
    session,
    loading,
    error,
    confirmLock,
    refresh,
    isTerminal: session ? TERMINAL_STATUSES.includes(session.status) : false,
  };
}

// ── MetaMask transaction builder ──────────────────────────────────────────────

/**
 * Build a MetaMask `eth_sendTransaction` params object for locking ETH.
 *
 * @param lock       Lock instruction from session
 * @param fromAddress The user's connected wallet address
 */
export function buildEthLockTxParams(lock: LockInstruction, fromAddress: string) {
  if (!lock.contractAddress) return null;
  return {
    from:  fromAddress,
    to:    lock.contractAddress,
    value: "0x" + BigInt(lock.amount).toString(16),
    data:  lock.calldata,
  };
}

/**
 * Build MetaMask `eth_sendTransaction` params for locking an ERC-20 token.
 *
 * IMPORTANT: User must first approve the HTLC contract.
 * Use buildErc20ApproveTxParams() before this.
 *
 * @param lock       Lock instruction from session
 * @param fromAddress The user's connected wallet address
 */
export function buildTokenLockTxParams(lock: LockInstruction, fromAddress: string) {
  if (!lock.contractAddress) return null;
  return {
    from:  fromAddress,
    to:    lock.contractAddress,
    value: "0x0",
    data:  lock.calldata,
  };
}

/**
 * Build an ERC-20 approve() transaction params so the user can authorise
 * the HTLC contract to spend their tokens before calling lockToken().
 *
 * Encodes: approve(spender, amount)
 * Selector: 0x095ea7b3
 */
export function buildErc20ApproveTxParams(
  tokenAddress:    string,
  contractAddress: string,
  amount:          string,
  fromAddress:     string
) {
  const spender = contractAddress.replace("0x", "").padStart(64, "0");
  const amtHex  = BigInt(amount).toString(16).padStart(64, "0");
  const data    = "0x095ea7b3" + spender + amtHex;
  return { from: fromAddress, to: tokenAddress, value: "0x0", data };
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function htlcStatusLabel(status: EvmHtlcStatus): string {
  switch (status) {
    case "PENDING_LOCKS":   return "Awaiting both locks";
    case "SELLER_LOCKED":   return "Seller locked — awaiting buyer";
    case "BUYER_LOCKED":    return "Buyer locked — awaiting seller";
    case "BOTH_LOCKED":     return "Both locked — settlement in progress";
    case "REVEALING":       return "Revealing secret — finalising";
    case "COMPLETED":       return "Settled";
    case "SELLER_REFUNDED": return "Seller refunded (settlement failed)";
    case "BUYER_REFUNDED":  return "Buyer refunded (settlement failed)";
    case "EXPIRED":         return "Expired";
    default:                return status;
  }
}

export function htlcStatusColor(status: EvmHtlcStatus): string {
  switch (status) {
    case "COMPLETED":       return "text-green-400";
    case "REVEALING":
    case "BOTH_LOCKED":     return "text-blue-400";
    case "SELLER_LOCKED":
    case "BUYER_LOCKED":    return "text-yellow-400";
    case "PENDING_LOCKS":   return "text-zinc-400";
    case "SELLER_REFUNDED":
    case "BUYER_REFUNDED":
    case "EXPIRED":         return "text-red-400";
    default:                return "text-zinc-400";
  }
}
