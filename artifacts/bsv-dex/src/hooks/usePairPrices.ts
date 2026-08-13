/**
 * usePairPrices — fetches LetsExchange + SimpleSwap rates for the current pair
 * in a single call, returning per-venue prices alongside the best external quote.
 * Polls every 45 s. Returns null values when a venue doesn't support the pair.
 *
 * When all live APIs are down, the backend serves a cached DB rate with stale:true.
 * This hook surfaces that as bestRate so the UI can still show a rate.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api";

const REF_AMOUNTS: Record<string, number> = {
  BTC: 0.01, ETH: 0.1, BSV: 1, BNB: 0.5, SOL: 1,
  XRP: 50, ADA: 100, DOGE: 500, DOT: 5, LINK: 5,
  DEFAULT: 0.1,
};

const REFRESH_MS = 45_000;

export interface VenuePrice {
  rate: number;       // quote units per 1 base unit
  minAmount: number | null;
  maxAmount: number | null;
  canExecute: boolean;
}

export interface PairPrices {
  letsexchange: VenuePrice | null;
  simpleswap:   VenuePrice | null;
  bestVenue:    string | null;
  bestRate:     VenuePrice | null; // best rate regardless of venue (includes cached fallback)
  stale:        boolean;           // true when rate came from DB cache (all live APIs failed)
  loading:      boolean;
}

interface Coin { symbol: string; network: string | null }

export function usePairPrices(fromCoin: Coin | null, toCoin: Coin | null): PairPrices {
  const [prices, setPrices] = useState<Omit<PairPrices, "loading">>({
    letsexchange: null,
    simpleswap:   null,
    bestVenue:    null,
    bestRate:     null,
    stale:        false,
  });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrices = useCallback(async () => {
    if (!fromCoin || !toCoin) {
      setPrices({ letsexchange: null, simpleswap: null, bestVenue: null, bestRate: null, stale: false });
      return;
    }
    const refAmt = REF_AMOUNTS[fromCoin.symbol] ?? REF_AMOUNTS.DEFAULT;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/letsexchange/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from:         fromCoin.symbol,
          to:           toCoin.symbol,
          network_from: fromCoin.network ?? fromCoin.symbol,
          network_to:   toCoin.network   ?? toCoin.symbol,
          amount:       refAmt,
          float:        true,
        }),
      });
      if (!r.ok) {
        setPrices({ letsexchange: null, simpleswap: null, bestVenue: null, bestRate: null, stale: false });
        return;
      }
      const d = await r.json();
      const isStale = d.stale === true;

      const venueMap: Record<string, VenuePrice> = {};
      if (Array.isArray(d.venue_quotes)) {
        for (const q of d.venue_quotes) {
          if (q.rate != null && parseFloat(q.rate) > 0) {
            venueMap[q.venue] = {
              rate:       parseFloat(q.rate),
              minAmount:  q.minAmount != null ? parseFloat(q.minAmount) : null,
              maxAmount:  q.maxAmount != null ? parseFloat(q.maxAmount) : null,
              canExecute: q.canExecute ?? true,
            };
          }
        }
      }

      // Top-level rate as best-venue entry (covers stale/cached responses too)
      if (Object.keys(venueMap).length === 0 && d.rate && parseFloat(d.rate) > 0) {
        const venue = d.best_venue ?? "letsexchange";
        venueMap[venue] = {
          rate:       parseFloat(d.rate),
          minAmount:  d.min_amount ? parseFloat(d.min_amount) : null,
          maxAmount:  d.max_amount ? parseFloat(d.max_amount) : null,
          canExecute: true,
        };
      }

      // bestRate: use the top-level rate directly so it works for both live and cached
      let bestRate: VenuePrice | null = null;
      if (d.rate && parseFloat(d.rate) > 0) {
        bestRate = {
          rate:       parseFloat(d.rate),
          minAmount:  d.min_amount ? parseFloat(d.min_amount) : null,
          maxAmount:  d.max_amount ? parseFloat(d.max_amount) : null,
          canExecute: !isStale, // stale rates are indicative only; canExecute when live
        };
      }

      setPrices({
        letsexchange: venueMap["letsexchange"] ?? null,
        simpleswap:   venueMap["simpleswap"]   ?? null,
        bestVenue:    d.best_venue ?? null,
        bestRate,
        stale:        isStale,
      });
    } catch {
      setPrices({ letsexchange: null, simpleswap: null, bestVenue: null, bestRate: null, stale: false });
    }
    setLoading(false);
  }, [fromCoin?.symbol, fromCoin?.network, toCoin?.symbol, toCoin?.network]);

  useEffect(() => {
    setPrices({ letsexchange: null, simpleswap: null, bestVenue: null, bestRate: null, stale: false });
    fetchPrices();
    timerRef.current = setInterval(fetchPrices, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchPrices]);

  return { ...prices, loading };
}
