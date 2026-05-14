import { useEffect, useCallback, useRef } from "react";
import { useWalletStore } from "@/store/useWalletStore";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface BsvBalanceResult {
  input: string;
  bsvAddress: string | null;
  paymailResolved: boolean;
  balance: number;
  balanceSatoshis: number;
  confirmed: number;
  unconfirmed: number;
  error?: string;
  message?: string;
}

export async function fetchBsvBalance(address: string): Promise<BsvBalanceResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const res = await fetch(`${BASE_URL}/api/bsv/balance/${encoded}`);
    if (!res.ok) return null;
    return await res.json() as BsvBalanceResult;
  } catch {
    return null;
  }
}

export function useBsvBalance() {
  const { address, network, setBalance } = useWalletStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAddressRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const currentAddress = useWalletStore.getState().address;
    const currentNetwork = useWalletStore.getState().network;
    if (!currentAddress || currentNetwork !== "bsv") return;

    const result = await fetchBsvBalance(currentAddress);
    if (result && result.balance !== undefined && result.error !== "paymail_unresolved") {
      setBalance(result.balance.toFixed(8));
    }
  }, [setBalance]);

  useEffect(() => {
    if (network !== "bsv" || !address) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      lastAddressRef.current = null;
      return;
    }

    if (lastAddressRef.current !== address) {
      lastAddressRef.current = address;
      refresh();
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refresh, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [address, network, refresh]);

  return { refresh };
}
