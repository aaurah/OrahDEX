import { useQuery } from "@tanstack/react-query";
import { fetchDexScreenerPrices, type DexPrice } from "@/lib/dexscreener";
import type { BaseToken } from "@/lib/base-token-list";

const EMPTY = new Map<string, DexPrice>();

export function useBaseTokenPrices(
  tokens: BaseToken[],
  enabled: boolean,
): Map<string, DexPrice> {
  const { data = EMPTY } = useQuery<Map<string, DexPrice>>({
    queryKey:  ["dex-prices-base", tokens.length],
    queryFn:   () => fetchDexScreenerPrices(tokens.map(t => t.address)),
    enabled:   enabled && tokens.length > 0,
    staleTime: 60_000,
    gcTime:    5 * 60_000,
    retry:     1,
    retryDelay: 3_000,
  });
  return data;
}
