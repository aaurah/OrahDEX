import { useEffect, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface TokenPrice {
  usd: number;
  change24h: number;
}

export interface WalletPrices {
  BTC:  TokenPrice;
  ETH:  TokenPrice;
  BSV:  TokenPrice;
  USDT: TokenPrice;
  [key: string]: TokenPrice | undefined;
}

const FALLBACK: WalletPrices = {
  BTC:  { usd: 65000, change24h: 0 },
  ETH:  { usd: 3200,  change24h: 0 },
  BSV:  { usd: 14,    change24h: 0 },
  USDT: { usd: 1,     change24h: 0 },
};

function normalizePrices(data: unknown): WalletPrices {
  const merged: WalletPrices = { ...FALLBACK };
  if (!data || typeof data !== "object") return merged;

  for (const [symbol, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value === "number") {
      if (Number.isFinite(value) && value > 0) {
        merged[symbol] = { usd: value, change24h: 0 };
      }
      continue;
    }

    if (value && typeof value === "object") {
      const v = value as { usd?: unknown; change24h?: unknown };
      const usd = typeof v.usd === "number" ? v.usd : NaN;
      if (!Number.isFinite(usd) || usd <= 0) continue;
      const change24h = typeof v.change24h === "number" && Number.isFinite(v.change24h) ? v.change24h : 0;
      merged[symbol] = { usd, change24h };
    }
  }

  merged.USDT = { usd: 1, change24h: 0 };
  return merged;
}

export function useWalletPrices(refreshMs = 60_000) {
  const [prices, setPrices] = useState<WalletPrices>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(`${BASE}/api/dex/prices`);
        if (!res.ok) throw new Error("price fetch failed");
        const data = await res.json();
        if (alive) {
          setPrices(normalizePrices(data));
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(id); };
  }, [refreshMs]);

  return { prices, loading };
}
