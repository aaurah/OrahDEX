/**
 * useLetsExchangeCoins — singleton hook that loads the LetsExchange coin list once.
 *
 * Returns the full list of supported coins and a helper to look up a coin by symbol,
 * finding the best/primary network for it (used for rate lookups).
 */

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api";

export interface LeCoin {
  symbol: string;
  name: string;
  network: string | null;
  networkName: string | null;
  image: string | null;
  hasExtraId: boolean;
  minAmount: string | null;
  maxAmount: string | null;
}

// Module-level cache so multiple hook instances share one fetch
let coinsCache: LeCoin[] | null = null;
let fetchPromise: Promise<LeCoin[]> | null = null;

// Preferred network priority — used to pick the "primary" network for a symbol
const NETWORK_PRIORITY: Record<string, number> = {
  BTC: 100, ETH: 100, BSV: 100, BNB: 95, SOL: 95, TRX: 90,
  TRC20: 88, ERC20: 85, BEP20: 83, ARBITRUM: 80, BASE: 78, OP: 75,
  POLYGON: 72, AVAX: 70,
};

function bestNetwork(symbol: string, candidates: LeCoin[]): LeCoin | null {
  if (!candidates.length) return null;
  // Prefer native network matching the symbol itself
  const native = candidates.find(c => c.network === symbol);
  if (native) return native;
  // Otherwise sort by NETWORK_PRIORITY
  return [...candidates].sort((a, b) => {
    const pa = NETWORK_PRIORITY[a.network ?? ""] ?? 0;
    const pb = NETWORK_PRIORITY[b.network ?? ""] ?? 0;
    return pb - pa;
  })[0];
}

async function fetchCoins(): Promise<LeCoin[]> {
  const r = await fetch(`${API_BASE}/letsexchange/currencies`);
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

export function useLetsExchangeCoins() {
  // Only use the module-level cache when it has real data — never treat [] as valid
  const validCache = coinsCache && coinsCache.length > 0 ? coinsCache : null;
  const [coins, setCoins] = useState<LeCoin[]>(validCache ?? []);
  const [loading, setLoading] = useState(!validCache);

  useEffect(() => {
    // Re-check on every mount: if cache is empty, always retry
    if (coinsCache && coinsCache.length > 0) { setCoins(coinsCache); setLoading(false); return; }
    if (!fetchPromise) {
      fetchPromise = fetchCoins().then(c => {
        if (c.length > 0) coinsCache = c; // only persist a non-empty result
        fetchPromise = null;              // clear so next empty-cache mount retries
        return c;
      }).catch(() => { fetchPromise = null; return [] as LeCoin[]; });
    }
    let cancelled = false;
    fetchPromise.then(c => { if (!cancelled) { setCoins(c); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  /** Return the primary LeCoin entry for a given symbol (best network), or null. */
  const getCoin = useCallback((symbol: string): LeCoin | null => {
    const candidates = coins.filter(c => c.symbol === symbol.toUpperCase());
    return bestNetwork(symbol.toUpperCase(), candidates);
  }, [coins]);

  /** Check if a symbol is supported by LetsExchange. */
  const isLECoin = useCallback((symbol: string): boolean => {
    return coins.some(c => c.symbol === symbol.toUpperCase());
  }, [coins]);

  /** Unique symbols supported by LE (one entry per base asset). */
  const uniqueSymbols: string[] = [...new Set(coins.map(c => c.symbol))];

  return { coins, loading, getCoin, isLECoin, uniqueSymbols };
}
