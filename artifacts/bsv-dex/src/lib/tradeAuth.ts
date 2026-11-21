import { getViemAccountForAddress } from "@/lib/walletSigner";

function isWalletRequestRejected(error: any): boolean {
  const text = String(error?.message ?? "").toLowerCase();
  return error?.code === 4001 || error?.code === "ACTION_REJECTED" ||
    text.includes("rejected") || text.includes("denied") || text.includes("cancel");
}

function canRetryWithRawProvider(error: any): boolean {
  const text = String(error?.message ?? "").toLowerCase();
  return [4100, 4900, -32601].includes(Number(error?.code)) ||
    text.includes("connector not connected") ||
    text.includes("provider not found") ||
    text.includes("no provider");
}

export interface OrderIntentMessageParams {
  walletAddress: string;
  symbol: string;
  side: string;
  quantity: string;
  type: string;
  price?: string;
  stopPrice?: string;
  chainId?: string;
  timeInForce?: string;
  nonce: string;
  expiry: string;
}

export function buildOrderIntentMessage(params: OrderIntentMessageParams): string {
  return [
    "Authorize OrahDEX order",
    `Wallet: ${params.walletAddress}`,
    `Symbol: ${params.symbol}`,
    `Side: ${params.side}`,
    `Quantity: ${params.quantity}`,
    `Type: ${params.type}`,
    `Price: ${params.price ?? ""}`,
    `Stop price: ${params.stopPrice ?? ""}`,
    `Chain ID: ${params.chainId ?? ""}`,
    `Time in force: ${params.timeInForce ?? "GTC"}`,
    `Nonce: ${params.nonce}`,
    `Expiry: ${params.expiry}`,
  ].join("\n");
}

export function buildOrderActionMessage(params: {
  walletAddress: string;
  action: string;
  orderId: string;
  nonce: string;
  expiry: string;
}): string {
  return [
    "Authorize OrahDEX order action",
    `Wallet: ${params.walletAddress}`,
    `Action: ${params.action}`,
    `Order ID: ${params.orderId}`,
    `Nonce: ${params.nonce}`,
    `Expiry: ${params.expiry}`,
  ].join("\n");
}

export async function signWalletMessage(
  address: string,
  provider: string | undefined,
  message: string,
  wagmiSign?: (args: { message: string }) => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  if (provider === "orah-wallet") {
    const account = await getViemAccountForAddress(address, {
      title: "Authorize trade action",
      subtitle: "Sign this wallet-specific request.",
    });
    return account.signMessage!({ message });
  }

  const hexMessage = `0x${Array.from(new TextEncoder().encode(message))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;

  if (provider === "reown") {
    // Some mobile WalletConnect handoffs leave Wagmi's signMessage promise
    // pending even after the wallet approved. Prefer the active connector's
    // account-checked EIP-1193 request and use Wagmi only if no raw provider is
    // available; never issue a second prompt after an ambiguous provider request.
    const { wagmiAdapter } = await import("@/lib/reown-appkit");
    const { getConnection, getConnections } = await import("@wagmi/core");
    const activeConnection = getConnection(wagmiAdapter.wagmiConfig);
    const hasRequestedAccount = (connection: { addresses?: readonly string[] } | undefined) =>
      connection?.addresses?.some((account) => account.toLowerCase() === address.toLowerCase()) ?? false;
    const connection = hasRequestedAccount(activeConnection)
      ? activeConnection
      : getConnections(wagmiAdapter.wagmiConfig).find(
      (item) => item.accounts.some((account) => account.toLowerCase() === address.toLowerCase()),
    );
    let eip1193: any;
    if (connection?.connector) {
      try { eip1193 = await connection.connector.getProvider(); }
      catch { /* try the injected provider after account validation */ }
    }
    eip1193 ??= (window as any).ethereum;
    if (!eip1193?.request) {
      if (wagmiSign) return await wagmiSign({ message });
      throw new Error("Connected wallet provider unavailable. Reconnect your wallet and try again.");
    }
    const accounts = await eip1193.request({ method: "eth_accounts" });
    if (!Array.isArray(accounts) || !accounts.some(
      (account: unknown) => typeof account === "string" && account.toLowerCase() === address.toLowerCase(),
    )) {
      throw new Error("The active wallet account changed. Reconnect the wallet before signing.");
    }
    return await eip1193.request({ method: "personal_sign", params: [hexMessage, address] });
  }

  if (wagmiSign) {
    try {
      return await wagmiSign({ message });
    } catch (error: any) {
      if (signal?.aborted || isWalletRequestRejected(error) || !canRetryWithRawProvider(error)) throw error;
      // Retry through the raw provider only for immediate connection/provider
      // lookup errors, never after an ambiguous wallet request or timeout.
    }
  }

  const ethereum = (window as any).ethereum;
  if (!ethereum?.request) throw new Error("No EVM wallet signing provider is available.");
  const accounts = await ethereum.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || !accounts.some(
    (account: unknown) => typeof account === "string" && account.toLowerCase() === address.toLowerCase(),
  )) {
    throw new Error("The active wallet account changed. Reconnect the wallet before signing.");
  }
  return await ethereum.request({ method: "personal_sign", params: [hexMessage, address] });
}
