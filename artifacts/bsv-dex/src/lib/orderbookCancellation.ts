import { cancelOrderbookOrder } from "@/lib/escrow";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TERMINAL_STATUSES = new Set(["cancelled", "filled"]);
const PENDING_CANCELLATIONS_KEY = "orahdex:pending-evm-orderbook-cancellations:v1";

type PendingCancellation = {
  orderId: string;
  walletAddress: string;
  txHash: string;
  createdAt: number;
};

function readPendingCancellations(): PendingCancellation[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_CANCELLATIONS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingCancellation =>
      !!item &&
      typeof item.orderId === "string" &&
      /^0x[a-f\d]{40}$/i.test(item.walletAddress) &&
      /^0x[a-f\d]{64}$/i.test(item.txHash) &&
      Number.isFinite(item.createdAt),
    );
  } catch {
    return [];
  }
}

function writePendingCancellations(items: PendingCancellation[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_CANCELLATIONS_KEY, JSON.stringify(items));
  } catch {
    // Continue with the active request when browser storage is unavailable.
  }
}

function savePendingCancellation(item: PendingCancellation) {
  const pending = readPendingCancellations().filter(
    (existing) => existing.orderId !== item.orderId || existing.walletAddress.toLowerCase() !== item.walletAddress.toLowerCase(),
  );
  pending.push(item);
  writePendingCancellations(pending);
}

function clearPendingCancellation(orderId: string, walletAddress: string) {
  writePendingCancellations(readPendingCancellations().filter(
    (item) => item.orderId !== orderId || item.walletAddress.toLowerCase() !== walletAddress.toLowerCase(),
  ));
}

export function getPendingEvmOrderbookCancellationIds(walletAddress?: string | null): string[] {
  return readPendingCancellations()
    .filter((item) => !walletAddress || item.walletAddress.toLowerCase() === walletAddress.toLowerCase())
    .map((item) => item.orderId);
}

export function hasPendingEvmOrderbookCancellation(orderId: string, walletAddress?: string | null): boolean {
  return readPendingCancellations().some((item) =>
    item.orderId === orderId &&
    (!walletAddress || item.walletAddress.toLowerCase() === walletAddress.toLowerCase()),
  );
}

async function submitCancellationProof(params: {
  orderId: string;
  walletAddress: string;
  txHash: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/api/orders/${encodeURIComponent(params.orderId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      orderbookCancelTxHash: params.txHash,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error ?? "Could not sync the completed cancellation.")) as Error & {
      status?: number;
      code?: string;
    };
    error.status = response.status;
    error.code = typeof payload?.code === "string" ? payload.code : undefined;
    throw error;
  }
  clearPendingCancellation(params.orderId, params.walletAddress);
  return payload;
}

function isRetryableCancellationSyncError(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string; message?: string };
  if (candidate?.status === undefined || candidate.status >= 500 || candidate.status === 408 || candidate.status === 429) {
    return true;
  }
  return candidate.code === "ORDERBOOK_CANCEL_INVALID" &&
    /awaiting ethereum confirmations|temporarily unavailable|timed out/i.test(String(candidate.message ?? ""));
}

async function submitCancellationProofWithRetry(params: {
  orderId: string;
  walletAddress: string;
  txHash: string;
}): Promise<Record<string, unknown>> {
  const retryDelays = [0, 1_000, 2_000, 4_000, 7_000];
  let lastError: unknown;
  for (const delay of retryDelays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await submitCancellationProof(params);
    } catch (error) {
      lastError = error;
      if (!isRetryableCancellationSyncError(error)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not sync the completed cancellation.");
}

/**
 * Reconcile an already-completed wallet cancellation without asking the wallet
 * to submit another transaction. The API verifies the event before changing
 * the order row.
 */
export async function reconcileEvmOrderbookCancellation(params: {
  orderId: string;
  walletAddress: string;
  txHash: string;
}): Promise<{ id: string; status: string; txHash: string; txid: string }> {
  if (!/^0x[a-f\d]{40}$/i.test(params.walletAddress) || !/^0x[a-f\d]{64}$/i.test(params.txHash)) {
    throw new Error("Enter the public Ethereum cancellation transaction hash from your wallet.");
  }
  savePendingCancellation({ ...params, createdAt: Date.now() });
  try {
    const result = await submitCancellationProofWithRetry(params);
    return { ...result, id: params.orderId, status: "cancelled", txHash: params.txHash, txid: params.txHash };
  } catch (error) {
    if (!isRetryableCancellationSyncError(error)) {
      clearPendingCancellation(params.orderId, params.walletAddress);
    }
    throw error;
  }
}

/**
 * Resume saved cancellation proofs after a page reload. This only retries the
 * API update; it never invokes a wallet or submits a chain transaction.
 */
export async function retryPendingEvmOrderbookCancellations(
  walletAddress?: string | null,
): Promise<string[]> {
  const completed: string[] = [];
  const pending = readPendingCancellations().filter((item) =>
    !walletAddress || item.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
  );
  for (const item of pending) {
    try {
      await submitCancellationProof({
        orderId: item.orderId,
        walletAddress: item.walletAddress,
        txHash: item.txHash,
      });
      completed.push(item.orderId);
    } catch (error) {
      if (!isRetryableCancellationSyncError(error)) {
        clearPendingCancellation(item.orderId, item.walletAddress);
      }
    }
  }
  return completed;
}

export async function cancelEvmOrderbookOrder(params: {
  orderId: string;
  walletAddress: string;
  fundingRef: string;
  isOrahWallet: boolean;
}): Promise<{ id: string; status: string; txHash?: string; txid?: string }> {
  const savedCancellation = readPendingCancellations().find(
    (item) => item.orderId === params.orderId && item.walletAddress.toLowerCase() === params.walletAddress.toLowerCase(),
  );
  if (savedCancellation) {
    const result = await submitCancellationProofWithRetry(savedCancellation);
    return {
      ...result,
      id: params.orderId,
      status: "cancelled",
      txHash: savedCancellation.txHash,
      txid: savedCancellation.txHash,
    };
  }

  const [kind, version, escrowAddress, orderKey] = params.fundingRef.split(":");
  if (
    kind !== "evm-order" ||
    version !== "1" ||
    !/^0x[a-f\d]{40}$/i.test(escrowAddress ?? "") ||
    !/^0x[a-f\d]{64}$/i.test(orderKey ?? "")
  ) {
    throw new Error("Order escrow details are invalid. Refresh My Orders and try again.");
  }

  const readServerOrder = async () => {
    const response = await fetch(`${BASE}/api/orders/${encodeURIComponent(params.orderId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not verify this order before cancellation.");
    return response.json();
  };

  const currentOrder = await readServerOrder();
  if (String(currentOrder.walletAddress ?? "").toLowerCase() !== params.walletAddress.toLowerCase()) {
    throw new Error("This order does not belong to the connected wallet.");
  }
  if (TERMINAL_STATUSES.has(String(currentOrder.status))) {
    return { id: params.orderId, status: String(currentOrder.status) };
  }
  if (!["open", "processing"].includes(String(currentOrder.status))) {
    throw new Error("Order status changed. Refresh My Orders before retrying.");
  }

  const cancellation = await cancelOrderbookOrder({
    escrowAddress,
    orderKey: orderKey as `0x${string}`,
    from: params.walletAddress,
    chainId: 1,
    isOrahWallet: params.isOrahWallet,
  });

  savePendingCancellation({
    orderId: params.orderId,
    walletAddress: params.walletAddress,
    txHash: cancellation.txHash,
    createdAt: Date.now(),
  });
  try {
    const result = await submitCancellationProofWithRetry({
      orderId: params.orderId,
      walletAddress: params.walletAddress,
      txHash: cancellation.txHash,
    });
    return {
      ...result,
      id: params.orderId,
      status: "cancelled",
      txHash: cancellation.txHash,
      txid: cancellation.txHash,
    };
  } catch (error) {
    if (!isRetryableCancellationSyncError(error)) {
      clearPendingCancellation(params.orderId, params.walletAddress);
      throw error;
    }
    const message = error instanceof Error ? error.message : "The API could not sync the cancellation yet.";
    throw new Error(
      `The wallet cancellation is confirmed, but order sync is pending. Do not submit another wallet transaction. ${message} Transaction: ${cancellation.explorerUrl}`,
    );
  }
}
