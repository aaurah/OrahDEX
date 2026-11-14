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

export async function fetchBsvBalance(
  address: string,
  network: "bsv" | "bsv-test" = "bsv",
): Promise<BsvBalanceResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const chain = network === "bsv-test" ? "test" : "main";
    const res = await fetch(`${BASE_URL}/api/bsv/balance/${encoded}?network=${chain}`);
    if (!res.ok) return null;
    return await res.json() as BsvBalanceResult;
  } catch {
    return null;
  }
}

export function useBsvBalance() {
  const { address, network, setBalance, setBsvUnconfirmed } = useWalletStore();
  const balanceRefreshKey = useWalletStore(s => s.balanceRefreshKey);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAddressRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const requestedState = useWalletStore.getState();
    const currentAddress = requestedState.address;
    const currentNetwork = requestedState.network;
    if (!currentAddress || (currentNetwork !== "bsv" && currentNetwork !== "bsv-test")) return;

    const result = await fetchBsvBalance(currentAddress, currentNetwork);
    const latestState = useWalletStore.getState();
    if (latestState.address !== currentAddress || latestState.network !== currentNetwork) return;
    if (result && Number.isFinite(result.balance) && result.error !== "paymail_unresolved") {
      setBalance(result.balance.toFixed(8));
      setBsvUnconfirmed(result.unconfirmed ?? 0);
    }
  }, [setBalance, setBsvUnconfirmed]);

  useEffect(() => {
    if ((network !== "bsv" && network !== "bsv-test") || !address) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      lastAddressRef.current = null;
      return;
    }

    const addressKey = `${network}:${address}`;
    if (lastAddressRef.current !== addressKey) {
      lastAddressRef.current = addressKey;
      refresh();
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refresh, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [address, network, refresh]);

  useEffect(() => {
    if (balanceRefreshKey > 0) refresh();
  }, [balanceRefreshKey, refresh]);

  return { refresh };
}
