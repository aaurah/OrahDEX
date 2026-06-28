const GT_BASE = "https://api.geckoterminal.com/api/v2";
const GT_HEADERS = { Accept: "application/json;version=20230302" };

export type GeckoRow = {
  symbol:   string;
  base:     string;
  quote:    string;
  price:    number;
  chg:      number;
  vol:      number;
  fdv:      number;
  network:  string;
  swapOnly: true;
  type:     "spot";
};

export const CAT_GECKO_NETWORK: Record<string, string> = {
  eth:   "eth",
  bnb:   "bsc",
  sol:   "solana",
  matic: "polygon_pos",
  avax:  "avax",
  arb:   "arbitrum",
  op:    "optimism",
  base:  "base",
  ftm:   "fantom",
  cro:   "cronos",
  linea: "linea",
  zk:    "zksync",
  scr:   "scroll",
  mnt:   "mantle",
};

export const CAT_GECKO_CATEGORY: Record<string, string> = {
  zora: "zora-content",
};

function cleanTicker(raw: string): string {
  return raw.replace(/\s+\d+\.?\d*%$/, "").trim();
}

function poolToRow(pool: any, networkLabel: string): GeckoRow | null {
  const a = pool.attributes;
  const parts = (a.name ?? "").split(" / ");
  if (parts.length < 2) return null;
  const base  = cleanTicker(parts[0]);
  const quote = cleanTicker(parts[1]);
  if (!base || !quote) return null;
  const price = parseFloat(a.base_token_price_usd ?? "0");
  const chg   = parseFloat(a.price_change_percentage?.h24 ?? "0");
  const vol   = parseFloat(a.volume_usd?.h24 ?? "0");
  const fdv   = parseFloat(a.fdv_usd ?? "0");
  return { symbol: `${base}/${quote}`, base, quote, price, chg, vol, fdv, network: networkLabel, swapOnly: true, type: "spot" };
}

async function fetchPages(url: (page: number) => string, maxPages: number, label: string): Promise<GeckoRow[]> {
  const rows: GeckoRow[] = [];
  const seen = new Set<string>();
  const seenBases = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    try {
      const r = await fetch(url(page), { headers: GT_HEADERS });
      if (!r.ok) break;
      const data = await r.json();
      for (const pool of data.data ?? []) {
        const row = poolToRow(pool, label);
        if (!row || row.price <= 0) continue;
        if (seen.has(row.symbol)) continue;
        if (seenBases.has(row.base)) continue;
        seen.add(row.symbol);
        seenBases.add(row.base);
        rows.push(row);
      }
    } catch {
      break;
    }
  }
  return rows;
}

export function fetchGeckoPools(networkSlug: string, maxPages = 3): Promise<GeckoRow[]> {
  return fetchPages(
    p => `${GT_BASE}/networks/${networkSlug}/pools?sort=h24_volume_usd_desc&page=${p}`,
    maxPages,
    networkSlug,
  );
}

export function fetchGeckoCategory(category: string, maxPages = 3): Promise<GeckoRow[]> {
  return fetchPages(
    p => `${GT_BASE}/categories/${category}/pools?sort=h24_volume_usd_desc&page=${p}`,
    maxPages,
    category,
  );
}
