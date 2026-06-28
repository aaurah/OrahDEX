import { useQuery } from "@tanstack/react-query";
import { fetchZoraCoins, type ZoraCoinRow } from "@/lib/zora-coins-api";

export function useZoraCoins(enabled = true): { data: ZoraCoinRow[]; isLoading: boolean } {
  const { data = [], isLoading } = useQuery<ZoraCoinRow[]>({
    queryKey:   ["zora-coins"],
    queryFn:    () => fetchZoraCoins(50),
    enabled,
    staleTime:  60_000,
    gcTime:     5 * 60_000,
    retry:      1,
    retryDelay: 3_000,
  });
  return { data, isLoading };
}
