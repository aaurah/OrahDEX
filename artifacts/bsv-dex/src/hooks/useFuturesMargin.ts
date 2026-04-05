/**
 * useFuturesMargin — fetch the futures margin account balance
 *
 * The futures margin account (futures_margin_accounts table) is a SEPARATE
 * balance bucket from the spot user_balances.  This hook returns:
 *
 *   available  — margin that can be used to open new positions
 *   locked     — margin currently locked in open positions
 *   total      — available + locked (total futures collateral)
 *
 * These numbers are NEVER mixed with the spot free/locked balance.
 * Use `balanceBucketFor(type)` from orderIntent.ts to decide which
 * balance to show in the trading form.
 */

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface FuturesMarginBalance {
  available:  number;
  locked:     number;
  total:      number;
  asset:      string;
}

const EMPTY: FuturesMarginBalance = { available: 0, locked: 0, total: 0, asset: "USDT" };

export function useFuturesMargin(walletAddress: string | null | undefined) {
  const { data, isLoading, refetch } = useQuery<FuturesMarginBalance>({
    queryKey: ["futures-margin", walletAddress],
    queryFn: async () => {
      if (!walletAddress) return EMPTY;
      const r = await fetch(`${API_BASE}/futures/margin/${encodeURIComponent(walletAddress)}`);
      if (!r.ok) return EMPTY;
      const j = await r.json();
      const available = parseFloat(j.available ?? "0") || 0;
      const locked    = parseFloat(j.locked    ?? "0") || 0;
      return {
        available,
        locked,
        total: available + locked,
        asset: j.asset ?? "USDT",
      };
    },
    enabled:        !!walletAddress,
    refetchInterval: 15_000,
    staleTime:       8_000,
  });

  return {
    margin:    data ?? EMPTY,
    isLoading,
    refetch,
  };
}
