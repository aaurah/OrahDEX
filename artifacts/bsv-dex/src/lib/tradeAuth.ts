import { getViemAccountForAddress } from "@/lib/walletSigner";

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
    const { wagmiAdapter } = await import("@/lib/reown-appkit");
    const connector = wagmiAdapter.wagmiConfig.connectors.find(
      (item: any) => item.id === "walletConnect" || item.type === "walletConnect",
    );
    const eip1193 = await (connector as any)?.getProvider?.();
    if (!eip1193) throw new Error("WalletConnect provider unavailable. Reconnect your wallet and try again.");
    return await eip1193.request({ method: "personal_sign", params: [hexMessage, address] });
  }

  if (wagmiSign) {
    try {
      return await wagmiSign({ message });
    } catch (error: any) {
      const text = String(error?.message ?? "").toLowerCase();
      if (error?.code === 4001 || error?.code === "ACTION_REJECTED" ||
          text.includes("rejected") || text.includes("denied") || text.includes("cancel")) {
        throw error;
      }
      // The native provider is a fallback for wallets connected outside wagmi.
    }
  }

  const ethereum = (window as any).ethereum;
  if (!ethereum?.request) throw new Error("No EVM wallet signing provider is available.");
  return await ethereum.request({ method: "personal_sign", params: [hexMessage, address] });
}
