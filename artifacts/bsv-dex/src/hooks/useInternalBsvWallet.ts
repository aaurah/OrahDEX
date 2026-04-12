/**
 * useInternalBsvWallet
 *
 * When an EVM wallet is connected, provisions BTC/BSV/BCH addresses:
 *
 * 1. If the wallet is Phantom, requests the user's real Bitcoin address via
 *    window.phantom.bitcoin — the same address the user sees in Phantom.
 *    All three forks (BTC/BSV/BCH) use this address.
 *
 * 2. For other EVM wallets (MetaMask, etc.) that don't expose a Bitcoin
 *    provider, falls back to a server-generated custodial sub-account.
 *
 * If addresses are already known (e.g. from HD seed or previous session),
 * this hook is a no-op — it never overwrites existing addresses.
 */

import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

const BTC_ADDR_RE = /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90}|tb1[a-zA-HJ-NP-Z0-9]{25,90})$/;

async function getPhantomBtcAddress(): Promise<string | null> {
  try {
    const btcProvider = (window as any).phantom?.bitcoin;
    if (!btcProvider) return null;

    const accounts = await btcProvider.requestAccounts();
    if (!accounts?.length) return null;

    const first = accounts[0];
    const addr =
      typeof first === "string"
        ? first
        : first?.address ?? first?.addresses?.[0]?.address ?? null;
    if (!addr || !BTC_ADDR_RE.test(addr)) return null;
    return addr;
  } catch {
    return null;
  }
}

export function useInternalBsvWallet() {
  const address            = useWalletStore(s => s.address);
  const network            = useWalletStore(s => s.network);
  const isDemo             = useWalletStore(s => s.isDemo);
  const setInternalBsv     = useWalletStore(s => s.setInternalBsvAddress);
  const setInternalBch     = useWalletStore(s => s.setInternalBchAddress);
  const setInternalBtc     = useWalletStore(s => s.setInternalBtcAddress);
  const internalBsvAddress = useWalletStore(s => s.internalBsvAddress);
  const internalBtcAddress = useWalletStore(s => s.internalBtcAddress);
  const internalBchAddress = useWalletStore(s => s.internalBchAddress);

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!address || network !== "evm" || isDemo) {
      if (!address) { setInternalBsv(null); setInternalBch(null); setInternalBtc(null); }
      return;
    }

    const allPresent = !!internalBsvAddress && !!internalBtcAddress && !!internalBchAddress;
    const provider = useWalletStore.getState().provider;

    const needsPhantomUpgrade =
      provider === "phantom" &&
      allPresent &&
      internalBtcAddress === internalBsvAddress &&
      internalBtcAddress === internalBchAddress &&
      !BTC_ADDR_RE.test(internalBtcAddress ?? "");

    if (allPresent && !needsPhantomUpgrade) return;

    if (provisionedFor.current === address) return;
    provisionedFor.current = address;

    let cancelled = false;

    (async () => {
      let phantomBtcAddr: string | null = null;
      if (provider === "phantom") {
        phantomBtcAddr = await getPhantomBtcAddress();
      }
      if (cancelled) return;

      if (phantomBtcAddr) {
        try {
          const r = await fetch(`${API_BASE}/user/bsv-wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ evmAddress: address, phantomBtcAddress: phantomBtcAddr }),
          });
          if (!r.ok) throw r.status;
          if (cancelled) return;
          setInternalBtc(phantomBtcAddr);
          setInternalBsv(phantomBtcAddr);
          setInternalBch(phantomBtcAddr);
        } catch (err) {
          console.warn("[OrahDEX] Failed to persist Phantom BTC address:", err);
          if (cancelled) return;
          setInternalBtc(phantomBtcAddr);
          setInternalBsv(phantomBtcAddr);
          setInternalBch(phantomBtcAddr);
        }
      } else {
        try {
          const r = await fetch(`${API_BASE}/user/bsv-wallet`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ evmAddress: address }),
          });
          if (!r.ok) throw r.status;
          if (cancelled) return;
          const data: { bsvAddress: string; btcAddress: string; bchAddress: string; isNew: boolean } = await r.json();
          setInternalBsv(data.bsvAddress);
          setInternalBtc(data.btcAddress);
          setInternalBch(data.bchAddress);
        } catch (err) {
          console.warn("[OrahDEX] Could not provision internal BSV/BTC/BCH wallet:", err);
          provisionedFor.current = null;
        }
      }
    })();

    return () => { cancelled = true; };
  }, [address, network, isDemo, internalBsvAddress, internalBtcAddress, internalBchAddress]);
}
