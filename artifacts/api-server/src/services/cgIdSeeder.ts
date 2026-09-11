/**
 * cgIdSeeder.ts
 *
 * Runs once at startup (after a short delay). Seeds coin_metadata with
 * coingecko_id values so the /coins/:symbol/full endpoint never needs the
 * rate-limited CoinGecko search API for coins we already know about.
 *
 * Strategy:
 *  1. Hardcoded overrides for the top ~80 coins (always correct, no API call).
 *  2. Fetch /coins/list from CoinGecko (~16 K entries).
 *  3. For each entry, filter out bridged/wrapped/peg variants.
 *  4. Among remaining clean IDs per symbol, prefer the shortest one
 *     (canonical IDs like "bitcoin" are shorter than "binance-peg-bitcoin").
 *  5. Bulk-upsert into coin_metadata for every symbol that doesn't already
 *     have a coingecko_id in the DB.
 */

import { pool } from "@workspace/db";

const OVERRIDES: Record<string, string> = {
  BTC:    "bitcoin",
  ETH:    "ethereum",
  BNB:    "binancecoin",
  SOL:    "solana",
  XRP:    "ripple",
  DOGE:   "dogecoin",
  ADA:    "cardano",
  AVAX:   "avalanche-2",
  SHIB:   "shiba-inu",
  DOT:    "polkadot",
  LINK:   "chainlink",
  MATIC:  "matic-network",
  POL:    "matic-network",
  LTC:    "litecoin",
  BCH:    "bitcoin-cash",
  UNI:    "uniswap",
  ATOM:   "cosmos",
  XLM:    "stellar",
  ETC:    "ethereum-classic",
  ALGO:   "algorand",
  VET:    "vechain",
  FIL:    "filecoin",
  ICP:    "internet-computer",
  HBAR:   "hedera-hashgraph",
  NEAR:   "near",
  FTM:    "fantom",
  SAND:   "the-sandbox",
  MANA:   "decentraland",
  AXS:    "axie-infinity",
  AAVE:   "aave",
  MKR:    "maker",
  COMP:   "compound-governance-token",
  GRT:    "the-graph",
  SNX:    "havven",
  SUSHI:  "sushi",
  CAKE:   "pancakeswap-token",
  CRV:    "curve-dao-token",
  "1INCH":"1inch",
  BAL:    "balancer",
  UMA:    "uma",
  ENJ:    "enjincoin",
  ZRX:    "0x",
  BAT:    "basic-attention-token",
  OCEAN:  "ocean-protocol",
  BAND:   "band-protocol",
  STORJ:  "storj",
  TRX:    "tron",
  XMR:    "monero",
  EOS:    "eos",
  ZIL:    "zilliqa",
  ONE:    "harmony",
  ANKR:   "ankr",
  GALA:   "gala",
  FLOW:   "flow",
  CHZ:    "chiliz",
  THETA:  "theta-token",
  HOT:    "holotoken",
  APE:    "apecoin",
  BSV:    "bitcoin-cash-sv",
  WBTC:   "wrapped-bitcoin",
  STETH:  "staked-ether",
  USDT:   "tether",
  USDC:   "usd-coin",
  DAI:    "dai",
  BUSD:   "binance-usd",
  OP:     "optimism",
  ARB:    "arbitrum",
  INJ:    "injective-protocol",
  SUI:    "sui",
  SEI:    "sei-network",
  TIA:    "celestia",
  PYTH:   "pyth-network",
  JTO:    "jito-governance-token",
  BONK:   "bonk",
  WIF:    "dogwifcoin",
  PEPE:   "pepe",
  FLOKI:  "floki",
  BRETT:  "based-brett",
  DOGS:   "dogs-2",
  ORDI:   "ordi",
  SATS:   "1000-satoshi-natoshi",
  LDO:    "lido-dao",
  RPL:    "rocket-pool",
  FXS:    "frax-share",
  CVX:    "convex-finance",
  FRAX:   "frax",
  RUNE:   "thorchain",
  KSM:    "kusama",
  ZEC:    "zcash",
  DASH:   "dash",
  NEO:    "neo",
  IOTA:   "iota",
  XTZ:    "tezos",
  WAVES:  "waves",
  EGLD:   "elrond-erd-2",
  KAVA:   "kava",
  CELO:   "celo",
  ROSE:   "oasis-network",
  QNT:    "quant-network",
  FET:    "fetch-ai",
  AGIX:   "singularitynet",
  RNDR:   "render-token",
  IMX:    "immutable-x",
  GNO:    "gnosis",
  OSMO:   "osmosis",
  SCRT:   "secret",
  JUNO:   "juno-network",
  A8:     "ancient8",
};

const SKIP_PATTERNS = [
  "binance-peg-", "bridged-", "-bridged-", "wrapped-", "solana-bridged-",
  "allbridge-", "wormhole-", "multichain-", "peg-", "-on-", "stargate-",
  "ethereum-bridged-", "polygon-bridged-", "avalanche-bridged-",
  "optimism-bridged-", "arbitrum-bridged-", "celer-", "synapse-",
];

function isCleanId(id: string): boolean {
  const lower = id.toLowerCase();
  return !SKIP_PATTERNS.some(p => lower.includes(p));
}

export async function seedCoinGeckoIds(): Promise<void> {
  try {
    // ── 1. Get all symbols in coin_metadata that already have a cgId ─────
    const existingRes = await pool.query<{ symbol: string }>(
      `SELECT symbol FROM coin_metadata WHERE coingecko_id IS NOT NULL`
    );
    const alreadySeeded = new Set(existingRes.rows.map(r => r.symbol.toUpperCase()));

    // ── 2. Determine which symbols need seeding ───────────────────────────
    // Start with OVERRIDES — upsert all of them regardless.
    const toUpsert: Array<{ symbol: string; cgId: string }> = [];

    for (const [sym, cgId] of Object.entries(OVERRIDES)) {
      toUpsert.push({ symbol: sym, cgId });
    }

    // ── 3. Fetch /coins/list for symbols not in OVERRIDES ─────────────────
    const overrideSymbols = new Set(Object.keys(OVERRIDES));
    const cgListRes = await fetch(
      "https://api.coingecko.com/api/v3/coins/list",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) }
    );
    if (!cgListRes.ok) {
      // Still upsert the overrides even if list fetch fails
      await bulkUpsert(toUpsert);
      return;
    }

    const cgList = await cgListRes.json() as Array<{ id: string; symbol: string; name: string }>;

    // Build symbol → best canonical ID map (skip bridged/peg variants)
    const symbolMap = new Map<string, string>();
    for (const coin of cgList) {
      const sym = coin.symbol.toUpperCase();
      if (overrideSymbols.has(sym)) continue; // already handled
      if (!isCleanId(coin.id)) continue;
      const existing = symbolMap.get(sym);
      // Prefer shorter IDs (more canonical), or first seen if same length
      if (!existing || coin.id.length < existing.length) {
        symbolMap.set(sym, coin.id);
      }
    }

    // ── 4. Add list-derived entries for symbols not yet seeded ────────────
    for (const [sym, cgId] of symbolMap) {
      if (!alreadySeeded.has(sym) && !overrideSymbols.has(sym)) {
        toUpsert.push({ symbol: sym, cgId });
      }
    }

    await bulkUpsert(toUpsert);
  } catch (err: any) {
    // Non-fatal: the endpoint still works via search fallback
    console.warn("[cgIdSeeder] Failed (non-fatal):", err?.message);
  }
}

async function bulkUpsert(entries: Array<{ symbol: string; cgId: string }>): Promise<void> {
  if (!entries.length) return;
  // Process in chunks to avoid huge query sizes
  const CHUNK = 500;
  let seeded = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
    const params = chunk.flatMap(e => [e.symbol.toUpperCase(), e.cgId]);
    await pool.query(
      `INSERT INTO coin_metadata (symbol, coingecko_id)
       VALUES ${values}
       ON CONFLICT (symbol) DO UPDATE SET
         coingecko_id = COALESCE(EXCLUDED.coingecko_id, coin_metadata.coingecko_id)
       WHERE coin_metadata.coingecko_id IS NULL`,
      params,
    );
    seeded += chunk.length;
  }
  console.info(`[cgIdSeeder] Upserted ${seeded} coingecko_id entries`);
}
