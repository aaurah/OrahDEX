/**
 * useInternalBsvWallet
 *
 * When an EVM wallet is connected, automatically provisions a custodial
 * BTC/BSV/BCH sub-account on OrahDEX.
 *
 * One secp256k1 keypair covers three chains:
 *   • BSV  (P2PKH  "1…")  ← same string as BTC legacy
 *   • BTC  (P2PKH  "1…")  ← same string as BSV
 *   • BCH  (CashAddr "bitcoincash:q…")
 *
 * The private key never leaves the server; only the public addresses are
 * returned and stored in the wallet store.
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

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    // Only provision for real EVM wallets
    if (!address || network !== "evm" || isDemo) {
      if (!address) { setInternalBsv(null); setInternalBch(null); }
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
      .then((data: { bsvAddress: string; btcAddress: string; bchAddress: string; isNew: boolean }) => {
        setInternalBsv(data.bsvAddress);   // BSV = BTC (same string)
        setInternalBch(data.bchAddress);   // BCH CashAddr
      })
      .catch(err => {
        console.warn("[OrahDEX] Could not provision internal BSV/BTC/BCH wallet:", err);
      });
  }, [address, network, isDemo]);
}
