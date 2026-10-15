const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function signFuturesChallengeIfNeeded(params: {
  walletAddress: string;
  network:       string | null;
  action:        "open" | "close" | "deposit";
  fields:        Record<string, unknown>;
}): Promise<{ nonce: string; signature: string }> {
  const { walletAddress, network, action, fields } = params;
  if (network !== "evm" || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error("Futures trading currently requires an EVM wallet.");
  }

  const challengeRes = await fetch(`${BASE}/api/futures/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, action, ...fields }),
  });
  if (!challengeRes.ok) {
    const e = await challengeRes.json().catch(() => ({}));
    throw new Error(e.error ?? "Failed to obtain futures challenge");
  }
  const { nonce, message } = await challengeRes.json() as { nonce: string; message: string };

  const { signMessage } = await import("@wagmi/core");
  const { getWagmiConfig } = await import("@/lib/reown");
  const cfg = getWagmiConfig();
  if (!cfg) throw new Error("Wallet not initialised. Please refresh and reconnect.");

  const signature = await signMessage(cfg, { account: walletAddress as `0x${string}`, message });
  return { nonce, signature };
}
