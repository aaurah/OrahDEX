import { useQuery } from "@tanstack/react-query";
import {
  fetchGeckoPools,
  fetchGeckoCategory,
  CAT_GECKO_NETWORK,
  CAT_GECKO_CATEGORY,
  type GeckoRow,
} from "@/lib/gecko-terminal";

export function useGeckoTerminalPools(cat: string): { data: GeckoRow[]; isLoading: boolean } {
  const networkSlug  = CAT_GECKO_NETWORK[cat];
  const categorySlug = CAT_GECKO_CATEGORY[cat];
  const enabled = !!(networkSlug || categorySlug);

  const { data = [], isLoading } = useQuery<GeckoRow[]>({
    queryKey:  ["gecko-pools", cat],
    queryFn:   () =>
      categorySlug
        ? fetchGeckoCategory(categorySlug)
        : fetchGeckoPools(networkSlug!),
    enabled,
    staleTime: 90_000,
    gcTime:    5 * 60_000,
    retry:     1,
    retryDelay: 3_000,
  });

  return { data, isLoading };
}
