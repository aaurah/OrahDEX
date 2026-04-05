/**
 * useInternalBsvWallet
 *
 * When an EVM wallet is connected, automatically provisions a custodial
 * BTC/BSV/BCH sub-account on OrahDEX.
 *
 * IMPORTANT: If the BSV address is already known (e.g. derived from an HD
 * seed phrase or restored from a previous session), this hook is a no-op —
 * it never overwrites an existing address with a new custodial keypair.
 */

import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

export function useInternalBsvWallet() {
  const address            = useWalletStore(s => s.address);
  const network            = useWalletStore(s => s.network);
  const isDemo             = useWalletStore(s => s.isDemo);
  const setInternalBsv     = useWalletStore(s => s.setInternalBsvAddress);
  const setInternalBch     = useWalletStore(s => s.setInternalBchAddress);
  const internalBsvAddress = useWalletStore(s => s.internalBsvAddress);

  // Track which EVM address we last provisioned for to avoid duplicate requests
  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only provision for real EVM wallets
    if (!address || network !== "evm" || isDemo) {
      if (!address) { setInternalBsv(null); setInternalBch(null); }
      return;
    }

    // Already have a BSV address — never overwrite it regardless of how it was set.
    // This prevents re-provisioning after chain switches or HD wallet derivation.
    if (internalBsvAddress) return;

    // Don't send duplicate requests for the same address
    if (provisionedFor.current === address) return;
    provisionedFor.current = address;

    fetch(`${API_BASE}/user/bsv-wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evmAddress: address }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { bsvAddress: string; btcAddress: string; bchAddress: string; isNew: boolean }) => {
        setInternalBsv(data.bsvAddress);
        setInternalBch(data.bchAddress);
      })
      .catch(err => {
        console.warn("[OrahDEX] Could not provision internal BSV/BTC/BCH wallet:", err);
        provisionedFor.current = null; // allow retry on next render
      });
  }, [address, network, isDemo, internalBsvAddress]);
}
