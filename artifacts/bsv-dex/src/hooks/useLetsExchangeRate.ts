/**
 * useLetsExchangeRate — fetches a live cross-chain rate from LetsExchange for any pair.
 *
 * Polls every REFRESH_MS. Returns null rate when the pair isn't available on LE.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api";

// Amount used purely for rate calculation (normalized to per-unit via rate field)
const REF_AMOUNTS: Record<string, number> = {
  BTC: 0.01, ETH: 0.1, BSV: 1, BNB: 0.5, SOL: 1,
  XRP: 50, ADA: 100, DOGE: 500, DOT: 5, LINK: 5,
  DEFAULT: 0.1,
};

const REFRESH_MS = 45_000;

export interface LERate {
  rate: string;           // how many quote units per 1 base
  minAmount: string;
  maxAmount: string;
  rateId: string | null;
  rateExpiry: number | null; // ms timestamp
  fromNetwork: string;
  toNetwork: string;
}

interface Coin { symbol: string; network: string | null }

export function useLetsExchangeRate(
  fromCoin: Coin | null,
  toCoin: Coin | null,
) {
  const [rate, setRate]       = useState<LERate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!fromCoin || !toCoin) { setRate(null); return; }
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
      const d = await r.json();
      if (!r.ok || !d.rate) { setRate(null); setError(true); }
      else {
        setError(false);
        setRate({
          rate:        d.rate,
          minAmount:   d.min_amount ?? d.deposit_min_amount ?? "0",
          maxAmount:   d.max_amount ?? d.deposit_max_amount ?? "999999",
          rateId:      d.rate_id    ?? null,
          rateExpiry:  d.rate_id_expired_at ? parseInt(d.rate_id_expired_at) : null,
          fromNetwork: fromCoin.network ?? fromCoin.symbol,
          toNetwork:   toCoin.network   ?? toCoin.symbol,
        });
      }
    } catch { setRate(null); setError(true); }
    setLoading(false);
  }, [fromCoin?.symbol, fromCoin?.network, toCoin?.symbol, toCoin?.network]);

  useEffect(() => {
    setRate(null); setError(false);
    fetch();
    timerRef.current = setInterval(fetch, REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch]);

  return { rate, loading, error };
}
