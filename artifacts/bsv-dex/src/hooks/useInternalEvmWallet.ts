/**
 * useInternalEvmWallet
 *
 * When a BSV wallet is connected, automatically provisions a custodial EVM
 * sub-account on OrahDEX. The private key never leaves the server; only the
 * EVM address is returned and stored in the wallet store so UI components
 * can use it for display and order routing.
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

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only provision for real BSV wallets
    if (!address || network !== "bsv" || isDemo) {
      if (!address) setInternalEvm(null);
      return;
    }

    // Already provisioned for this address — no duplicate request
    if (provisionedFor.current === address && internalEvmAddress) return;

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
      });
  }, [address, network, isDemo]);
}
