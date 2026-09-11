import { useQuery } from "@tanstack/react-query";
import { fetchBaseTokenList, type BaseToken } from "@/lib/base-token-list";

export function useBaseTokenList(enabled = true): { data: BaseToken[]; isLoading: boolean } {
  const { data = [], isLoading } = useQuery<BaseToken[]>({
    queryKey:  ["base-token-list"],
    queryFn:   fetchBaseTokenList,
    enabled,
    staleTime: 60 * 60_000,     // 1 hour — list is stable
    gcTime:    6 * 60 * 60_000, // 6 hours
    retry:     1,
    retryDelay: 5_000,
  });
  return { data, isLoading };
}
