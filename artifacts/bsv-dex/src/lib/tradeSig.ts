const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Fetch + sign a creator-coin trade challenge.
 * Returns { nonce, signature } for external EVM wallets.
 * Returns { } for non-EVM (BSV) or internal Orah wallets — server falls through.
 * Throws if the user rejects or signing fails.
 */
export async function signTradeIfNeeded(params: {
  walletAddress: string;
  network:       string | null;
  isOrahWallet:  boolean;
  creator:       string;
  side:          "buy" | "sell";
  amount:        string;
  asset:         string;
}): Promise<{ nonce?: string; signature?: string }> {
  const { walletAddress, network, isOrahWallet, creator, side, amount, asset } = params;
  const isEvm = network === "evm" && /^0x[0-9a-fA-F]{40}$/.test(walletAddress);
  if (!isEvm || isOrahWallet) return {};

  const challengeRes = await fetch(`${BASE}/api/social/trade/challenge`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ walletAddress, creator, side, amount, asset }),
  });
  if (!challengeRes.ok) {
    const e = await challengeRes.json().catch(() => ({}));
    throw new Error(e.error ?? "Failed to obtain trade challenge");
  }
  const { nonce, message } = await challengeRes.json() as { nonce: string; message: string };

  const { signMessage } = await import("@wagmi/core");
  const { getWagmiConfig } = await import("@/lib/reown");
  const cfg = getWagmiConfig();
  if (!cfg) throw new Error("Wallet not initialised. Please refresh and reconnect.");

  let signature: string;
  try {
    signature = await signMessage(cfg, { account: walletAddress as `0x${string}`, message });
  } catch (err: any) {
    if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
      throw new Error("Signature rejected. Trade cancelled.");
    }
    throw new Error(err?.message ?? "Wallet signature failed");
  }
  return { nonce, signature };
}
