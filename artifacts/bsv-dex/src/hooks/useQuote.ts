/**
 * useQuote — real-time price quote from the Orah Sovereign Routing API
 *
 * Calls GET /v1/quote with debouncing so the form stays responsive while typing.
 * Returns expected output, price impact, fee info, and Keeper tier discount.
 */

import { useState, useEffect, useRef } from "react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface QuoteResult {
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountInUsd: number;
  expectedOut: number;
  minOut: number;
  priceOutUsd: number;
  priceImpactPct: number;
  feeBps: number;
  feeUsd: number;
  mevRisk: "low" | "medium" | "high";
  route: Array<{ pool: string; protocol: string; feeBps: number }>;
  keeper: {
    address: string | null;
    tier: 0 | 1 | 2 | 3;
    tierName: "Standard" | "Guardian" | "Elder" | "Archon";
    feeBps: number;
    discountPct: number;
    pools: string[];
  };
  chainId: number;
  routerAddress: string;
  timestamp: string;
}

interface UseQuoteParams {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  chainId?: number;
  keeperAddress?: string | null;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseQuoteResult {
  quote: QuoteResult | null;
  loading: boolean;
  error: string | null;
}

const TIER_COLORS: Record<number, string> = {
  0: "#9CA3AF",  // grey — Standard
  1: "#60A5FA",  // blue — Guardian
  2: "#A78BFA",  // violet — Elder
  3: "#F5A623",  // gold — Archon
};

export const KEEPER_TIER_COLORS = TIER_COLORS;

export function useQuote({
  tokenIn,
  tokenOut,
  amount,
  chainId = 1,
  keeperAddress,
  debounceMs = 400,
  enabled = true,
}: UseQuoteParams): UseQuoteResult {
  const [quote, setQuote]   = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const amtNum = parseFloat(amount);
    if (!enabled || !tokenIn || !tokenOut || !amount || isNaN(amtNum) || amtNum <= 0) {
      setQuote(null);
      setError(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          chainId: String(chainId),
          tokenIn,
          tokenOut,
          amount,
          ...(keeperAddress ? { keeperAddress } : {}),
        });

        const res = await fetch(`${BASE_URL}/v1/quote?${params}`, {
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError((json as any)?.error ?? "Quote unavailable");
          setQuote(null);
        } else {
          const data = await res.json() as QuoteResult;
          setQuote(data);
          setError(null);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError("Quote fetch failed");
        setQuote(null);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tokenIn, tokenOut, amount, chainId, keeperAddress, debounceMs, enabled]);

  return { quote, loading, error };
}
