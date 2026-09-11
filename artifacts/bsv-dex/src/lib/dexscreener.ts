const DS_BASE = "https://api.dexscreener.com/tokens/v1/base";
const BATCH   = 30;
const MAX_TOKENS = 600; // 20 parallel batches × 30

export type DexPrice = { price: number; chg: number; vol: number };

export async function fetchDexScreenerPrices(
  addresses: string[],
): Promise<Map<string, DexPrice>> {
  const limited = addresses.slice(0, MAX_TOKENS);
  const batches: string[][] = [];
  for (let i = 0; i < limited.length; i += BATCH) batches.push(limited.slice(i, i + BATCH));

  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const r = await fetch(`${DS_BASE}/${batch.join(",")}`);
        if (!r.ok) return [] as any[];
        return (await r.json()) as any[];
      } catch { return [] as any[]; }
    }),
  );

  // Per token address: keep the pair with the highest USD liquidity
  const best = new Map<string, any>();
  for (const pairs of results) {
    for (const pair of pairs) {
      const addr = (pair.baseToken?.address ?? "").toLowerCase();
      if (!addr || !pair.priceUsd) continue;
      const liq = parseFloat(pair.liquidity?.usd ?? "0");
      const prev = best.get(addr);
      if (!prev || liq > parseFloat(prev.liquidity?.usd ?? "0")) best.set(addr, pair);
    }
  }

  // Build symbol → price map (symbol is what our rows use as key)
  const out = new Map<string, DexPrice>();
  for (const [, pair] of best) {
    const sym = (pair.baseToken?.symbol ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9.]/g, "")
      .slice(0, 16);
    if (!sym) continue;
    const price = parseFloat(pair.priceUsd ?? "0");
    if (price <= 0) continue;
    out.set(sym, {
      price,
      chg: parseFloat(pair.priceChange?.h24 ?? "0"),
      vol: parseFloat(pair.volume?.h24 ?? "0"),
    });
  }
  return out;
}
