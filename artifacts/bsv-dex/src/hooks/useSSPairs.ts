/**
 * useSSPairs — fetches all SimpleSwap pairs from the OrahDEX API server.
 *
 * Mirrors useLetsExchangePairs but calls /api/simpleswap/pairs.
 * Module-level cache + stampede guard: any number of instances share one fetch.
 */

import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";

export interface SSPair {
  symbol:                string;
  baseAsset:             string;
  quoteAsset:            string;
  network?:              string | null;
  networkName?:          string | null;
  image?:                string | null;
  hasExtraId?:           boolean;
  minAmount?:            string | null;
  maxAmount?:            string | null;
  lastPrice:             number;
  priceChangePercent24h: number;
  volume:                number;
  type:                  "simpleswap";
  ssSource:              true;
  leSource:              false;
}

const cache        = new Map<string, { data: SSPair[]; ts: number }>();
const pendingFetch = new Map<string, Promise<SSPair[]>>();
const CACHE_TTL    = 10 * 60 * 1000;

function getValidCached(key: string): SSPair[] | null {
  const e = cache.get(key);
  if (!e || Date.now() - e.ts >= CACHE_TTL) return null;
  return e.data.length > 0 ? e.data : null;
}

async function fetchSsPairs(query: string): Promise<SSPair[]> {
  const r = await fetch(`${API_BASE}/simpleswap/pairs${query}`);
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? (d as SSPair[]) : [];
}

export function useSSPairs(opts: { quote?: string; all?: boolean } = {}) {
  const query = opts.all
    ? "?all=true"
    : opts.quote
      ? `?quote=${encodeURIComponent(opts.quote)}`
      : "";

  const hit = getValidCached(query);
  const [pairs, setPairs]     = useState<SSPair[]>(hit ?? []);
  const [loading, setLoading] = useState(!hit);

  useEffect(() => {
    const c = getValidCached(query);
    if (c) { setPairs(c); setLoading(false); return; }

    let cancelled = false;

    if (!pendingFetch.has(query)) {
      const p = fetchSsPairs(query)
        .then(data => {
          if (data.length > 0) cache.set(query, { data, ts: Date.now() });
          pendingFetch.delete(query);
          return data;
        })
        .catch(() => { pendingFetch.delete(query); return [] as SSPair[]; });
      pendingFetch.set(query, p);
    }

    pendingFetch.get(query)!.then(data => {
      if (!cancelled) { setPairs(data); setLoading(false); }
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { pairs, loading };
}
