/**
 * useLetsExchangePairs — fetches all LetsExchange pairs from the OrahDEX API server.
 *
 * The server endpoint GET /api/letsexchange/pairs returns every LE coin expressed
 * as an OrahDEX-compatible market object against multiple quote currencies.
 * Results are cached in-module for 10 minutes so any number of hook instances
 * share a single fetch.
 *
 * Pass `quote` to filter to a specific quote asset (e.g. "BSV"), or set
 * `all: true` to get every quote combination in one call.
 */

import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";

export interface LEPair {
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
  type:                  "letsexchange" | "spot";
  leSource:              boolean;
  orahSource?:           boolean;
}

// Module-level cache — keyed by the query string used
const cache = new Map<string, { data: LEPair[]; ts: number }>();
const pendingFetch = new Map<string, Promise<LEPair[]>>();
const CACHE_TTL = 10 * 60 * 1000;

function getCached(key: string): LEPair[] | null {
  const e = cache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}

async function fetchPairs(query: string): Promise<LEPair[]> {
  const r = await fetch(`${API_BASE}/letsexchange/pairs${query}`);
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? (d as LEPair[]) : [];
}

export function useLetsExchangePairs(opts: { quote?: string; all?: boolean } = {}) {
  const query = opts.all
    ? "?all=true"
    : opts.quote
      ? `?quote=${encodeURIComponent(opts.quote)}`
      : "";                                    // defaults to BSV on the server

  const hit = getCached(query);
  const [pairs, setPairs]     = useState<LEPair[]>(hit ?? []);
  const [loading, setLoading] = useState(!hit);

  useEffect(() => {
    const cached = getCached(query);
    if (cached) { setPairs(cached); setLoading(false); return; }

    let cancelled = false;

    if (!pendingFetch.has(query)) {
      const p = fetchPairs(query).then(data => {
        cache.set(query, { data, ts: Date.now() });
        pendingFetch.delete(query);
        return data;
      });
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
