import { cancelOrderbookOrder } from "@/lib/escrow";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TERMINAL_STATUSES = new Set(["cancelled", "filled"]);

export async function cancelEvmOrderbookOrder(params: {
  orderId: string;
  walletAddress: string;
  fundingRef: string;
  isOrahWallet: boolean;
}): Promise<{ id: string; status: string; txHash?: string; txid?: string }> {
  const [kind, chainIdText, escrowAddress, orderKey] = params.fundingRef.split(":");
  const chainId = Number(chainIdText);
  if (
    kind !== "evm-order" ||
    ![1, 11155111].includes(chainId) ||
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
    chainId,
    isOrahWallet: params.isOrahWallet,
  });

  let lastError = "The cancellation transaction could not be verified by the exchange.";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
    const response = await fetch(`${BASE}/api/orders/${encodeURIComponent(params.orderId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: params.walletAddress,
        orderbookCancelTxHash: cancellation.txHash,
      }),
    });
    if (response.ok) {
      const result = await response.json();
      return { ...result, id: params.orderId, status: "cancelled", txHash: cancellation.txHash, txid: cancellation.txHash };
    }
    if (response.status === 404) {
      const refreshed = await readServerOrder();
      if (TERMINAL_STATUSES.has(String(refreshed.status))) {
        return { id: params.orderId, status: String(refreshed.status), txHash: cancellation.txHash, txid: cancellation.txHash };
      }
      lastError = "The order changed while cancellation was being confirmed.";
      break;
    }
    const payload = await response.json().catch(() => ({}));
    lastError = String(payload?.error ?? lastError);
    if (payload?.code !== "ORDERBOOK_CANCEL_INVALID") break;
  }

  throw new Error(
    `${lastError} Your wallet already submitted the cancellation; do not submit it again. ` +
    `Transaction: ${cancellation.explorerUrl}`,
  );
}
