import { useQuery } from "@tanstack/react-query";
import {
  fetchGeckoPools,
  fetchGeckoCategory,
  mergeGeckoRows,
  CAT_GECKO_NETWORK,
  CAT_GECKO_CATEGORY,
  type GeckoRow,
} from "@/lib/gecko-terminal";

export function useGeckoTerminalPools(cat: string): { data: GeckoRow[]; isLoading: boolean } {
  const networkSlug  = CAT_GECKO_NETWORK[cat];
  const categorySlug = CAT_GECKO_CATEGORY[cat];
  const hasBoth = !!(networkSlug && categorySlug);
  const enabled = !!(networkSlug || categorySlug);

  const { data = [], isLoading } = useQuery<GeckoRow[]>({
    queryKey:  ["gecko-pools", cat],
    queryFn:   () => {
      // Fetch more pages for Base — it has thousands of active pools
      const pages = networkSlug === "base" ? 15 : 5;
      if (hasBoth) {
        return Promise.all([
          fetchGeckoPools(networkSlug!, pages),
          fetchGeckoCategory(categorySlug!),
        ]).then(([net, cat]) => mergeGeckoRows(net, cat));
      }
      return categorySlug
        ? fetchGeckoCategory(categorySlug)
        : fetchGeckoPools(networkSlug!, pages);
    },
    enabled,
    staleTime: 90_000,
    gcTime:    5 * 60_000,
    retry:     1,
    retryDelay: 3_000,
  });

  return { data, isLoading };
}
