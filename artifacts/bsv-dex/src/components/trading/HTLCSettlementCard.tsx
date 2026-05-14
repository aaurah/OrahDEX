/**
 * HTLCSettlementCard — EVM HTLC atomic settlement UI.
 *
 * Shown after an EVM/EVM trade fills, guiding both parties through the
 * lock-and-reveal flow that atomically settles the trade on-chain.
 *
 * Non-custodial: no funds flow through OrahDEX servers.
 * The user signs transactions directly in MetaMask/WalletConnect.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEvmHtlcSession,
  buildEthLockTxParams,
  buildTokenLockTxParams,
  buildErc20ApproveTxParams,
  htlcStatusLabel,
  htlcStatusColor,
  type EvmHtlcSession,
  type LockInstruction,
} from "../../hooks/useEvmHtlcSession";
import { getPublicClient } from "../../lib/escrow";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  sessionId:       string;
  userAddress:     string;
  onSettled?:      () => void;
  onDismiss?:      () => void;
  className?:      string;
}

// ── Chain names ───────────────────────────────────────────────────────────────

function chainName(chainId: number): string {
  switch (chainId) {
    case 1:   return "Ethereum";
    case 137: return "Polygon";
    case 56:  return "BNB Chain";
    default:  return `Chain ${chainId}`;
  }
}

function chainColor(chainId: number): string {
  switch (chainId) {
    case 1:   return "text-blue-400";
    case 137: return "text-purple-400";
    case 56:  return "text-yellow-400";
    default:  return "text-zinc-400";
  }
}

function explorerTxUrl(chainId: number, txHash: string): string {
  const base =
    chainId === 1   ? "https://etherscan.io/tx/"    :
    chainId === 137 ? "https://polygonscan.com/tx/" :
    chainId === 56  ? "https://bscscan.com/tx/"     :
    "https://etherscan.io/tx/";
  return base + txHash;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(unixSecs: number): string {
  const diff = unixSecs - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Expired";
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}m ${s}s`;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function shortHash(hash: string): string {
  return hash.slice(0, 10) + "…" + hash.slice(-6);
}

// ── Status stepper ────────────────────────────────────────────────────────────

const STEPS = [
  { key: "PENDING_LOCKS",  label: "Awaiting locks" },
  { key: "LOCKING",        label: "Parties locking" },
  { key: "BOTH_LOCKED",    label: "Both locked" },
  { key: "REVEALING",      label: "Settling" },
  { key: "COMPLETED",      label: "Complete" },
];

function stepIndex(status: string): number {
  if (status === "SELLER_LOCKED" || status === "BUYER_LOCKED") return 1;
  if (status === "BOTH_LOCKED")  return 2;
  if (status === "REVEALING")    return 3;
  if (status === "COMPLETED")    return 4;
  return 0;
}

// ── Lock action panel ─────────────────────────────────────────────────────────

interface LockPanelProps {
  lock:         LockInstruction;
  side:         "seller" | "buyer";
  locked:       boolean;
  lockTxid:     string | null;
  userAddress:  string;
  partyAddress: string;  // wallet address of the seller or buyer for this panel
  sessionId:    string;
  chainId:      number;
  onConfirmed:  (txHash: string) => void;
}

function LockPanel({
  lock, side, locked, lockTxid, userAddress, partyAddress, chainId, onConfirmed,
}: LockPanelProps) {
  const [step,    setStep]    = useState<"idle" | "approving" | "locking" | "done" | "error">("idle");
  const [txHash,  setTxHash]  = useState<string | null>(lockTxid ?? null);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

  const isNative  = lock.tokenAddress === null;
  const needsApprove = !isNative;

  async function sendTx(params: object): Promise<string> {
    const provider = (window as any).ethereum;
    if (!provider) throw new Error("MetaMask not detected. Please install MetaMask.");
    return new Promise((resolve, reject) => {
      provider.request({ method: "eth_sendTransaction", params: [params] })
        .then((hash: string) => resolve(hash))
        .catch((e: any) => reject(new Error(e?.message ?? "Transaction rejected")));
    });
  }

  async function handleLock() {
    setErrMsg(null);
    try {
      if (needsApprove) {
        setStep("approving");
        const approveParams = buildErc20ApproveTxParams(
          lock.tokenAddress!,
          lock.contractAddress!,
          lock.amount,
          userAddress
        );
        const approveTxHash = await sendTx(approveParams);
        // Wait for the approve confirmation so the allowance is on-chain
        // before lockERC20 executes (prevents "allowance too low" reverts).
        await getPublicClient(chainId).waitForTransactionReceipt({
          hash: approveTxHash as `0x${string}`,
        });
      }

      setStep("locking");
      const lockParams = isNative
        ? buildEthLockTxParams(lock, userAddress)
        : buildTokenLockTxParams(lock, userAddress);

      if (!lockParams) throw new Error("Contract not yet deployed on this chain.");

      const hash = await sendTx(lockParams);
      setTxHash(hash);
      setStep("done");
      onConfirmed(hash);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Transaction failed");
      setStep("error");
    }
  }

  // True when the connected wallet address matches this panel's party (seller or buyer).
  // Only the relevant party should see an active Lock button.
  const isUserSide = userAddress.toLowerCase() === partyAddress.toLowerCase();

  const sideLabel = side === "seller" ? "Seller" : "Buyer";
  const verb = isNative ? "Lock ETH" : `Approve & Lock ${lock.asset}`;

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${
      locked
        ? "border-green-500/30 bg-green-900/10"
        : "border-zinc-700 bg-zinc-800/40"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
          {sideLabel} Lock
        </span>
        {locked ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
            Locked
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-400">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
            Pending
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white">
          {lock.asset}
        </span>
        <span className="text-sm text-zinc-400">
          Lock ID: {shortHash(lock.lockId)}
        </span>
      </div>

      <div className="text-xs text-zinc-500 space-y-0.5">
        <div>Timelock: {formatTime(lock.timelockUnix)}</div>
        {lock.tokenAddress && (
          <div>Token: {shortAddr(lock.tokenAddress)}</div>
        )}
      </div>

      {locked && txHash ? (
        <a
          href={explorerTxUrl(chainId, txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-400 hover:text-blue-300 truncate"
        >
          Tx: {shortHash(txHash)} ↗
        </a>
      ) : !locked && lock.contractAddress && isUserSide ? (
        <div className="space-y-2">
          {step === "idle" || step === "error" ? (
            <button
              onClick={handleLock}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2 px-4 transition-colors"
            >
              {verb}
            </button>
          ) : step === "approving" ? (
            <div className="text-xs text-yellow-400 animate-pulse">
              Confirm token approval in MetaMask…
            </div>
          ) : step === "locking" ? (
            <div className="text-xs text-blue-400 animate-pulse">
              Confirm lock transaction in MetaMask…
            </div>
          ) : step === "done" ? (
            <div className="text-xs text-green-400">Lock submitted! Awaiting confirmation…</div>
          ) : null}

          {errMsg && (
            <div className="text-xs text-red-400">{errMsg}</div>
          )}
        </div>
      ) : !locked && lock.contractAddress && !isUserSide ? (
        <div className="text-xs text-zinc-500 italic">
          Waiting for counterparty to lock…
        </div>
      ) : !lock.contractAddress ? (
        <div className="text-xs text-zinc-500 italic">
          Contract not yet deployed — manual settlement required.
        </div>
      ) : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HTLCSettlementCard({
  sessionId, userAddress, onSettled, onDismiss, className = "",
}: Props) {
  const { session, loading, error, confirmLock, refresh } = useEvmHtlcSession(sessionId);
  const [timeStr, setTimeStr] = React.useState("");

  React.useEffect(() => {
    if (!session) return;
    const tick = () => setTimeStr(formatTime(session.expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);

  React.useEffect(() => {
    if (session?.status === "COMPLETED") onSettled?.();
  }, [session?.status, onSettled]);

  if (loading && !session) {
    return (
      <div className={`rounded-2xl border border-zinc-700 bg-zinc-900 p-6 ${className}`}>
        <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse mb-3" />
        <div className="h-3 w-60 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className={`rounded-2xl border border-red-500/30 bg-zinc-900 p-6 ${className}`}>
        <p className="text-sm text-red-400">{error ?? "Settlement session not found."}</p>
      </div>
    );
  }

  const currentStep = stepIndex(session.status);
  const isTerminal  = ["COMPLETED", "SELLER_REFUNDED", "BUYER_REFUNDED", "EXPIRED"].includes(session.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Atomic Settlement</h3>
          <p className={`text-xs mt-0.5 ${chainColor(session.chainId)}`}>
            {chainName(session.chainId)} · {session.pair}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${htlcStatusColor(session.status as any)}`}>
            {htlcStatusLabel(session.status as any)}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Progress stepper */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center">
                <div className={`h-2 w-2 rounded-full transition-colors ${
                  i <= currentStep ? "bg-indigo-400" : "bg-zinc-700"
                }`} />
                <span className={`mt-1 text-[9px] leading-tight ${
                  i <= currentStep ? "text-indigo-300" : "text-zinc-600"
                }`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mb-3 transition-colors ${
                  i < currentStep ? "bg-indigo-500/60" : "bg-zinc-700"
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Session meta */}
      <div className="px-5 py-3 border-t border-zinc-800/60 text-xs text-zinc-500 flex gap-4 flex-wrap">
        <span>Session: <code className="text-zinc-400">{session.id.slice(0, 8)}…</code></span>
        {!isTerminal && (
          <span>Expires: <span className="text-yellow-400">{timeStr}</span></span>
        )}
        <span>
          Secret hash: <code className="text-zinc-400">{shortHash(session.secretHash)}</code>
        </span>
      </div>

      {/* Lock panels */}
      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LockPanel
          lock={session.sellerLock}
          side="seller"
          locked={session.sellerLocked}
          lockTxid={session.sellerLockTxid}
          userAddress={userAddress}
          partyAddress={session.sellerAddress}
          sessionId={sessionId}
          chainId={session.chainId}
          onConfirmed={(hash) => confirmLock("seller", hash)}
        />
        <LockPanel
          lock={session.buyerLock}
          side="buyer"
          locked={session.buyerLocked}
          lockTxid={session.buyerLockTxid}
          userAddress={userAddress}
          partyAddress={session.buyerAddress}
          sessionId={sessionId}
          chainId={session.chainId}
          onConfirmed={(hash) => confirmLock("buyer", hash)}
        />
      </div>

      {/* Completed state */}
      <AnimatePresence>
        {session.status === "COMPLETED" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 pb-5"
          >
            <div className="rounded-xl border border-green-500/30 bg-green-900/10 p-4 text-center">
              <p className="text-sm font-semibold text-green-400 mb-1">Trade settled atomically</p>
              <p className="text-xs text-zinc-400 mb-3">
                Funds have been transferred to both parties on-chain.
              </p>
              {(session.revealSellerTxid || session.revealBuyerTxid) && (
                <div className="flex flex-col gap-1">
                  {session.revealSellerTxid && (
                    <a
                      href={explorerTxUrl(session.chainId, session.revealSellerTxid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Seller reveal tx ↗
                    </a>
                  )}
                  {session.revealBuyerTxid && (
                    <a
                      href={explorerTxUrl(session.chainId, session.revealBuyerTxid)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Buyer reveal tx ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {(session.status === "EXPIRED" || session.status.includes("REFUNDED")) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 pb-5"
          >
            <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4 text-center">
              <p className="text-sm font-semibold text-red-400 mb-1">Settlement failed</p>
              <p className="text-xs text-zinc-400">
                {session.status === "EXPIRED"
                  ? "The settlement window expired before both parties locked."
                  : "Funds were refunded to their respective senders."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      {!isTerminal && (
        <div className="border-t border-zinc-800 px-5 py-3 flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            Non-custodial · OrahDEX never holds your funds
          </p>
          <button
            onClick={refresh}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}
    </motion.div>
  );
}
