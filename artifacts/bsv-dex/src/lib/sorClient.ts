/**
 * sorClient.ts — Frontend client for the OrahDEX Smart Order Router API
 *
 * Wraps /api/sor/* endpoints with typed responses, debouncing,
 * and abort-controller cancellation.
 */

import { API_BASE } from "@/lib/api";

// ── Types (mirror server sorEngine.ts) ───────────────────────────────────────

export interface SorHop {
  poolId:      string;
  protocol:    "orahdex_amm" | "virtual" | string;
  tokenIn:     string;
  tokenOut:    string;
  amountIn:    number;
  amountOut:   number;
  fee:         number;
  priceImpact: number;
}

export interface SorRoute {
  hops:           SorHop[];
  amountIn:       number;
  amountOut:      number;
  totalFeeUsd:    number;
  priceImpact:    number;
  effectivePrice: number;
  path:           string[];
}

export interface SorQuoteResponse {
  tokenIn:        string;
  tokenOut:       string;
  amountIn:       number;
  routes:         SorRoute[];
  bestRoute:      SorRoute | null;
  spotPrice:      number | null;
  priceImpact:    number | null;
  executionPrice: number | null;
  fromUsdPrice:   number | null;
  toUsdPrice:     number | null;
  tradeValueUsd:  number | null;
  cached:         boolean;
}

export interface SorToken {
  symbol:    string;
  usdPrice:  number | null;
  peerCount: number;
}

// ── Quote ────────────────────────────────────────────────────────────────────

export async function fetchSorQuote(
  from:     string,
  to:       string,
  amount:   number,
  signal?:  AbortSignal,
): Promise<SorQuoteResponse> {
  const url = `${API_BASE}/sor/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error ?? `SOR quote failed: ${res.status}`);
  }
  return res.json();
}

// ── Tokens ────────────────────────────────────────────────────────────────────

export async function fetchSorTokens(signal?: AbortSignal): Promise<SorToken[]> {
  const res = await fetch(`${API_BASE}/sor/tokens`, { signal });
  if (!res.ok) throw new Error(`SOR tokens failed: ${res.status}`);
  const data = await res.json();
  return data.tokens ?? [];
}

// ── Debounced hook helper ─────────────────────────────────────────────────────

export function makeSorQuoteDebouncer(delayMs = 400) {
  let timer:  ReturnType<typeof setTimeout> | null = null;
  let ctrl:   AbortController | null = null;

  return function debounced(
    from:      string,
    to:        string,
    amount:    number,
    onResult:  (r: SorQuoteResponse | null, err?: string) => void,
  ) {
    if (timer) clearTimeout(timer);
    if (ctrl)  ctrl.abort();

    if (!from || !to || amount <= 0) {
      onResult(null);
      return;
    }

    timer = setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const result = await fetchSorQuote(from, to, amount, ctrl.signal);
        onResult(result);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        onResult(null, err?.message ?? "SOR error");
      }
    }, delayMs);
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatSorImpact(impact: number): { label: string; color: string } {
  if (impact < 0.1)  return { label: `${impact.toFixed(3)}%`, color: "text-green-400" };
  if (impact < 1)    return { label: `${impact.toFixed(2)}%`, color: "text-yellow-400" };
  if (impact < 3)    return { label: `${impact.toFixed(2)}%`, color: "text-orange-400" };
  return               { label: `${impact.toFixed(2)}%`,  color: "text-red-500" };
}

export function protocolLabel(protocol: string): string {
  switch (protocol) {
    case "orahdex_amm": return "OrahDEX AMM";
    case "virtual":     return "Virtual Pool";
    default:            return protocol;
  }
}

export function feeLabel(fee: number): string {
  return `${(fee * 100).toFixed(2)}%`;
}
