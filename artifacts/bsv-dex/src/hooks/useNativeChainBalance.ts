/**
 * useNativeChainBalance
 *
 * Fetches the native coin balance + live USD value for a single non-EVM chain.
 * Designed for use inside ChainBalanceRow in Wallet.tsx so every chain row
 * can display balance + address just like MetaMask / imToken.
 *
 * Supported families: bsv, btc, bch, solana, tron, xrp, ltc, doge
 */

import { useEffect, useRef, useState } from "react";
import {
  fetchBtcNative,
  fetchSolNative,
  fetchBchNative,
  fetchXrpNative,
  fetchLtcNative,
  fetchDogeNative,
  fetchTrxNative,
  fetchBsvNative,
} from "@/hooks/useHybridBalance";
import { useWalletPrices } from "@/hooks/useWalletPrices";

type ChainFamily = "bsv" | "btc" | "bch" | "solana" | "tron" | "xrp" | "ltc" | "doge";

const PRICE_KEY: Record<ChainFamily, string> = {
  bsv:    "BSV",
  btc:    "BTC",
  bch:    "BCH",
  solana: "SOL",
  tron:   "TRX",
  xrp:    "XRP",
  ltc:    "LTC",
  doge:   "DOGE",
};

async function fetchForFamily(family: ChainFamily, address: string): Promise<number> {
  switch (family) {
    case "bsv":    return fetchBsvNative(address);
    case "btc":    return fetchBtcNative(address);
    case "bch":    return fetchBchNative(address);
    case "solana": return fetchSolNative(address);
    case "tron":   return fetchTrxNative(address);
    case "xrp":    return fetchXrpNative(address);
    case "ltc":    return fetchLtcNative(address);
    case "doge":   return fetchDogeNative(address);
  }
}

export interface NativeChainBalance {
  native: number;
  usd:    number;
  loading: boolean;
}

/**
 * @param family  The chain family (bsv / btc / bch / solana / tron / xrp / ltc / doge)
 * @param address The chain-native address — pass null to skip fetching
 */
export function useNativeChainBalance(
  family: ChainFamily,
  address: string | null,
  refreshMs = 120_000,
): NativeChainBalance {
  const { prices } = useWalletPrices(refreshMs);
  const [native, setNative]   = useState(0);
  const [loading, setLoading] = useState(false);
  const prevAddr = useRef<string | null>(null);

  useEffect(() => {
    if (!address) { setNative(0); return; }
    // Skip re-fetch when address hasn't changed (price update will still recalc USD below)
    const isNewAddr = address !== prevAddr.current;
    if (!isNewAddr && native > 0) return;

    let alive = true;
    prevAddr.current = address;
    setLoading(true);

    fetchForFamily(family, address).then(bal => {
      if (!alive) return;
      setNative(bal);
      setLoading(false);
    });

    const id = setInterval(() => {
      fetchForFamily(family, address).then(bal => {
        if (!alive) return;
        setNative(bal);
      });
    }, refreshMs);

    return () => { alive = false; clearInterval(id); };
  }, [family, address]);

  const priceKey = PRICE_KEY[family];
  const usd = native * ((prices as any)[priceKey]?.usd ?? 0);

  return { native, usd, loading };
}
