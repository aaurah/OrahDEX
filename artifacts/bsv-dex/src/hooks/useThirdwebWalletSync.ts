/**
 * Syncs the Reown/Wagmi wallet connection into ThirdWeb's active wallet state
 * so that SwapWidget (and any other ThirdWeb component) automatically sees the
 * wallet that was connected via OrahDEX's own Connect Wallet button.
 *
 * Direction: Reown/Wagmi → ThirdWeb (one-way, best-effort)
 * Uses viemAdapter.wallet.fromViem which wraps the wagmi connector's EIP-1193
 * request method into a ThirdWeb Wallet object.
 */
import { useEffect } from "react";
import { useSetActiveWallet } from "thirdweb/react";
import { useWalletStore } from "@/store/useWalletStore";
import { getWagmiConfig } from "@/lib/reown";

export function useThirdwebWalletSync() {
  const setActiveWallet = useSetActiveWallet();
  const address  = useWalletStore(s => s.address);
  const provider = useWalletStore(s => s.provider);

  useEffect(() => {
    if (!address || provider === "orah-wallet") return;

    let cancelled = false;

    async function sync() {
      try {
        const wagmiConfig = getWagmiConfig();
        if (!wagmiConfig) return;

        const [{ getConnectorClient }, { viemAdapter }] = await Promise.all([
          import("@wagmi/core"),
          import("thirdweb/adapters/viem"),
        ]);

        const walletClient = await getConnectorClient(wagmiConfig);
        if (cancelled || !walletClient?.account) return;

        const wallet = viemAdapter.wallet.fromViem({ walletClient });
        await setActiveWallet(wallet);
      } catch {
        /* Best-effort — never throw to the user */
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [address, provider, setActiveWallet]);
}
