/**
 * useInternalEvmWallet
 *
 * When a BSV wallet is connected, automatically provisions a custodial EVM
 * sub-account on OrahDEX. The private key never leaves the server; only the
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
  const isDemo             = useWalletStore(s => s.isDemo);
  const setInternalEvm     = useWalletStore(s => s.setInternalEvmAddress);
  const internalEvmAddress = useWalletStore(s => s.internalEvmAddress);

  // Track which BSV address we last provisioned for to avoid duplicate requests
  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only provision for real BSV wallets
    if (!address || network !== "bsv" || isDemo) {
      if (!address) setInternalEvm(null);
      return;
    }

    // Already have an EVM address — never overwrite it regardless of how it was set.
    // This is the critical guard: if the user was on EVM and switched to BSV,
    // switchNetworkType() already saved internalEvmAddress. We must NOT replace it
    // with a new custodial keypair, which would change the address on switch-back.
    if (internalEvmAddress) return;

    // Don't send duplicate requests for the same BSV address
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
        console.warn("[OrahDEX] Could not provision internal EVM wallet:", err);
        provisionedFor.current = null; // allow retry on next render
      });
  }, [address, network, isDemo, internalEvmAddress]);
}
