/**
 * useInternalEvmWallet
 *
 * When a BSV wallet is connected, automatically provisions a custodial EVM
 * sub-account on Orah. The private key never leaves the server; only the
 * EVM address is returned and stored in the wallet store so UI components
 * can use it for display and order routing.
 *
 * IMPORTANT: If an EVM address is already known (e.g. the user was on EVM and
 * switched to BSV, so internalEvmAddress was saved by switchNetworkType), this
 * hook is a no-op — it never overwrites an existing address with a new
 * custodial keypair.
 */

import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

export function useInternalEvmWallet() {
  const address            = useWalletStore(s => s.address);
  const network            = useWalletStore(s => s.network);
  const setInternalEvm     = useWalletStore(s => s.setInternalEvmAddress);
  const internalEvmAddress = useWalletStore(s => s.internalEvmAddress);

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!address || network !== "bsv") {
      if (!address) setInternalEvm(null);
      return;
    }

    if (internalEvmAddress) return;

    if (provisionedFor.current === address) return;
    provisionedFor.current = address;

    fetch(`${API_BASE}/user/evm-wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bsvAddress: address }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { evmAddress: string; isNew: boolean }) => {
        setInternalEvm(data.evmAddress);
      })
      .catch(err => {
        console.warn("[Orah] Could not provision internal EVM wallet:", err);
        provisionedFor.current = null;
      });
  }, [address, network, internalEvmAddress]);
}
