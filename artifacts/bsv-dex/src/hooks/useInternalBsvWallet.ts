/**
 * useInternalBsvWallet
 *
 * When an EVM wallet is connected, automatically provisions a custodial BSV
 * sub-account on OrahDEX. The private key never leaves the server; only the
 * BSV address is returned and stored in the wallet store so UI components
 * can display it and route cross-chain orders to it.
 */

import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

export function useInternalBsvWallet() {
  const address            = useWalletStore(s => s.address);
  const network            = useWalletStore(s => s.network);
  const isDemo             = useWalletStore(s => s.isDemo);
  const setInternalBsv     = useWalletStore(s => s.setInternalBsvAddress);
  const internalBsvAddress = useWalletStore(s => s.internalBsvAddress);

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only provision for real EVM wallets
    if (!address || network !== "evm" || isDemo) {
      if (!address) setInternalBsv(null);
      return;
    }

    // Already provisioned for this address — skip duplicate request
    if (provisionedFor.current === address && internalBsvAddress) return;

    provisionedFor.current = address;

    fetch(`${API_BASE}/user/bsv-wallet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evmAddress: address }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { bsvAddress: string; isNew: boolean }) => {
        setInternalBsv(data.bsvAddress);
      })
      .catch(err => {
        console.warn("[OrahDEX] Could not provision internal BSV wallet:", err);
      });
  }, [address, network, isDemo]);
}
