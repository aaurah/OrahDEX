/**
 * useInternalBsvWallet
 *
 * When an EVM wallet is connected, provisions BTC/BSV/BCH addresses:
 *
 * 1. If Phantom's Bitcoin provider (window.phantom.bitcoin) is available in the
 *    browser, requests the user's real Bitcoin address — regardless of whether
 *    the EVM connection is via Phantom, MetaMask, or any other wallet.
 *    All three forks (BTC/BSV/BCH) use this Phantom-sourced BTC address.
 *
 * 2. If Phantom's Bitcoin provider is NOT available, falls back to a
 *    server-generated custodial sub-account.
 */

import { useEffect, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";
import { API_BASE } from "@/lib/api";

const BTC_ADDR_RE = /^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90}|tb1[a-zA-HJ-NP-Z0-9]{25,90})$/;

async function getPhantomBtcAddress(): Promise<string | null> {
  try {
    const btcProvider = (window as any).phantom?.bitcoin;
    if (!btcProvider) return null;

    const accounts: Array<{ address: string; addressType: string } | string> =
      await btcProvider.requestAccounts();
    if (!accounts?.length) return null;

    let addr: string | null = null;

    if (typeof accounts[0] === "string") {
      addr = accounts[0];
    } else {
      const typed = accounts as Array<{ address: string; addressType: string }>;
      addr =
        typed.find(a => a.addressType === "p2wpkh")?.address ??
        typed.find(a => a.addressType === "p2tr")?.address ??
        typed.find(a => a.addressType !== "p2sh")?.address ??
        typed[0]?.address ??
        null;
    }

    if (!addr || !BTC_ADDR_RE.test(addr)) return null;
    return addr;
  } catch {
    return null;
  }
}

async function persistToServer(evmAddress: string, phantomBtcAddr?: string) {
  const body: Record<string, string> = { evmAddress };
  if (phantomBtcAddr) body.phantomBtcAddress = phantomBtcAddr;
  const r = await fetch(`${API_BASE}/user/bsv-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw r.status;
  return r.json() as Promise<{ bsvAddress: string; btcAddress: string; bchAddress: string; isNew: boolean }>;
}

export function useInternalBsvWallet() {
  const address            = useWalletStore(s => s.address);
  const network            = useWalletStore(s => s.network);
  const setInternalBsv     = useWalletStore(s => s.setInternalBsvAddress);
  const setInternalBch     = useWalletStore(s => s.setInternalBchAddress);
  const setInternalBtc     = useWalletStore(s => s.setInternalBtcAddress);
  const internalBsvAddress = useWalletStore(s => s.internalBsvAddress);
  const internalBtcAddress = useWalletStore(s => s.internalBtcAddress);
  const internalBchAddress = useWalletStore(s => s.internalBchAddress);

  const provisionedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!address || network !== "evm") {
      if (!address) { setInternalBsv(null); setInternalBch(null); setInternalBtc(null); }
      return;
    }

    const hasPhantomBitcoin = !!(window as any).phantom?.bitcoin;

    const refKey = `${address}:${hasPhantomBitcoin ? "phantom" : "custodial"}`;
    if (provisionedFor.current === refKey) return;
    provisionedFor.current = refKey;

    let cancelled = false;

    (async () => {
      if (hasPhantomBitcoin) {
        const phantomBtcAddr = await getPhantomBtcAddress();
        if (cancelled) return;

        if (phantomBtcAddr) {
          if (phantomBtcAddr === internalBtcAddress &&
              phantomBtcAddr === internalBsvAddress &&
              phantomBtcAddr === internalBchAddress) {
            return;
          }
          try {
            await persistToServer(address, phantomBtcAddr);
          } catch (err) {
            console.warn("[Orah] Failed to persist Phantom BTC address:", err);
          }
          if (cancelled) return;
          setInternalBtc(phantomBtcAddr);
          setInternalBsv(phantomBtcAddr);
          setInternalBch(phantomBtcAddr);
          return;
        }
      }

      const allPresent = !!internalBsvAddress && !!internalBtcAddress && !!internalBchAddress;
      if (allPresent) return;

      try {
        const data = await persistToServer(address);
        if (cancelled) return;
        setInternalBsv(data.bsvAddress);
        setInternalBtc(data.btcAddress);
        setInternalBch(data.bchAddress);
      } catch (err) {
        console.warn("[Orah] Could not provision internal BSV/BTC/BCH wallet:", err);
        provisionedFor.current = null;
      }
    })();

    return () => { cancelled = true; };
  }, [address, network, internalBsvAddress, internalBtcAddress, internalBchAddress]);
}
