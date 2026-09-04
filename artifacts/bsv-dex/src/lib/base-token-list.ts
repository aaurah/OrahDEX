export type BaseToken = {
  symbol:   string;
  name:     string;
  address:  string;
  decimals: number;
};

export async function fetchBaseTokenList(): Promise<BaseToken[]> {
  const r = await fetch("https://tokens.coingecko.com/base/all.json", {
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Base token list: HTTP ${r.status}`);
  const d = await r.json();
  return (d.tokens ?? [])
    .filter((t: any) => t.chainId === 8453 && t.symbol && t.address)
    .map((t: any) => ({
      symbol:   String(t.symbol).toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 16),
      name:     String(t.name ?? t.symbol).slice(0, 60),
      address:  String(t.address),
      decimals: Number(t.decimals ?? 18),
    }))
    .filter((t: BaseToken) => t.symbol.length >= 1);
}
