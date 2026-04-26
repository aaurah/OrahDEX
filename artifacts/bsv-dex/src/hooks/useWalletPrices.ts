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
          setPrices({
            BTC:  { usd: data.BTC?.usd  ?? FALLBACK.BTC.usd,  change24h: data.BTC?.change24h  ?? 0 },
            ETH:  { usd: data.ETH?.usd  ?? FALLBACK.ETH.usd,  change24h: data.ETH?.change24h  ?? 0 },
            BSV:  { usd: data.BSV?.usd  ?? FALLBACK.BSV.usd,  change24h: data.BSV?.change24h  ?? 0 },
            USDT: { usd: 1, change24h: 0 },
          });
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
