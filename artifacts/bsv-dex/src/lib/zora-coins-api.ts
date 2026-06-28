const ZORA_API = "https://api-sdk.zora.engineering";

export type ZoraCoinRow = {
  symbol:   string;
  base:     string;
  quote:    "USDC";
  price:    number;
  chg:      number;
  vol:      number;
  fdv:      number;
  address:  string;
  coinType: string;
  name:     string;
  swapOnly: true;
  type:     "spot";
};

function makeTicker(sym: string, creatorName: string): string {
  const clean = sym.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  if (clean.length >= 2) return clean;
  const fallback = creatorName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  return fallback.length >= 2 ? fallback : "";
}

function edgeToRow(node: any): ZoraCoinRow | null {
  const sym         = String(node.symbol ?? "");
  const creatorName = String(node.poolCurrencyToken?.name ?? "");
  const base        = makeTicker(sym, creatorName);
  if (!base) return null;
  const price = parseFloat(node.tokenPrice?.priceInUsdc ?? "0");
  if (price <= 0) return null;
  const vol = parseFloat(node.volume24h ?? "0");
  const fdv = parseFloat(node.marketCap ?? "0");
  const chg = parseFloat(node.marketCapDelta24h ?? "0");
  return {
    symbol:   `${base}/USDC`,
    base,
    quote:    "USDC",
    price,
    chg,
    vol,
    fdv,
    address:  String(node.address ?? ""),
    coinType: String(node.coinType ?? "CONTENT"),
    name:     sym.slice(0, 60),
    swapOnly: true,
    type:     "spot",
  };
}

const LIST_TYPES = ["TOP_VOLUME_24H", "MOST_VALUABLE", "TOP_GAINERS", "NEW"] as const;

export async function fetchZoraCoins(count = 50): Promise<ZoraCoinRow[]> {
  const byAddress = new Map<string, ZoraCoinRow>();
  await Promise.all(
    LIST_TYPES.map(async (listType) => {
      try {
        const r = await fetch(
          `${ZORA_API}/explore?listType=${listType}&count=${count}`,
          { headers: { Accept: "application/json" } }
        );
        if (!r.ok) return;
        const data = await r.json();
        for (const edge of data?.exploreList?.edges ?? []) {
          const node = edge?.node;
          if (!node?.address || byAddress.has(node.address)) continue;
          const row = edgeToRow(node);
          if (row) byAddress.set(node.address, row);
        }
      } catch { /* CORS / network fail — silently skip */ }
    })
  );
  return [...byAddress.values()].sort((a, b) => b.vol - a.vol);
}
