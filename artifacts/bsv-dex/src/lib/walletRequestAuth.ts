import { API_BASE } from "@/lib/api";
import { signWalletMessage } from "@/lib/tradeAuth";
import { signBsvChallengeFromAddress } from "@/lib/walletSigner";

export type WalletRequestResource =
  | "withdrawal-history"
  | "notifications"
  | "social-notifications"
  | "personal-api-keys";

export type WalletRequestMethod = "GET" | "POST" | "DELETE";

async function signMessage(
  address: string,
  network: string,
  provider: string | undefined,
  message: string,
): Promise<string> {
  if (network === "evm") {
    return signWalletMessage(address, provider, message);
  }
  if (network === "bsv" || network === "bsv-test") {
    return signBsvChallengeFromAddress(address, message);
  }
  if (network === "sol") {
    const solana = (window as any).solana ?? (window as any).phantom?.solana;
    if (!solana?.signMessage) throw new Error("The connected Solana wallet cannot sign messages.");
    const pubkey = solana.publicKey?.toString?.();
    if (pubkey && pubkey !== address) throw new Error("Connected Solana account changed. Reconnect and try again.");
    const signed = await solana.signMessage(new TextEncoder().encode(message), "utf8");
    const bytes = signed?.signature ?? signed;
    if (!(bytes instanceof Uint8Array)) throw new Error("The wallet returned an unsupported signature.");
    return btoa(String.fromCharCode(...bytes));
  }
  throw new Error("Signed account access is not supported by this wallet type yet.");
}

export async function walletRequestAuthHeaders(params: {
  address: string;
  network: string;
  provider?: string;
  resource: WalletRequestResource;
  method: WalletRequestMethod;
  resourceId?: string;
  context?: Record<string, unknown>;
}): Promise<Record<string, string>> {
  const challengeResponse = await fetch(`${API_BASE}/wallet-request/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: params.address,
      resource: params.resource,
      method: params.method,
      ...(params.resourceId ? { resourceId: params.resourceId } : {}),
      ...(params.context ? { context: params.context } : {}),
    }),
  });
  const challenge = await challengeResponse.json().catch(() => ({}));
  if (!challengeResponse.ok) {
    throw new Error(challenge.error ?? "Could not authorize this wallet request.");
  }
  const signature = await signMessage(
    params.address,
    params.network,
    params.provider,
    challenge.message,
  );
  return {
    "X-Wallet-Auth-Challenge": challenge.challengeId,
    "X-Wallet-Auth-Signature": signature,
  };
}
