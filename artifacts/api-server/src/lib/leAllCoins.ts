/**
 * leAllCoins.ts — Canonical LetsExchange Coin Catalog (built-in fallback)
 *
 * Used when the LETSEXCHANGE_API_KEY is not configured and the live
 * /v2/coins endpoint is unavailable (returns 403).
 *
 * When the API key IS available, the live list from /v2/coins is preferred
 * and this list is ignored.
 *
 * Kept in sync with LetsExchange's public catalog (~191 unique tickers).
 * 191 × 190 combinations (excluding self) = 36,290 pairs.
 */

export const LE_ALL_COINS: string[] = [
  /* ── Layer-1 blockchains ────────────────────────────────────────── */
  "BTC",  "ETH",  "BNB",  "SOL",  "ADA",  "AVAX", "DOT",  "ATOM",
  "NEAR", "APT",  "SUI",  "SEI",  "INJ",  "TON",  "XRP",  "TRX",
  "LTC",  "BCH",  "XLM",  "ETC",  "DASH", "ZEC",  "DCR",  "DGB",
  "VET",  "ALGO", "EGLD", "ONE",  "KLAY", "FTM",  "KSM",  "IOTA",
  "SCRT", "MINA", "CELO", "FLOW", "HBAR", "QNT",  "ICP",  "TIA",

  /* ── Layer-2 / rollups ──────────────────────────────────────────── */
  "ARB",  "OP",   "IMX",  "STX",  "STRK", "NTRN", "MANTLE",

  /* ── Stablecoins ────────────────────────────────────────────────── */
  "USDT", "USDC", "DAI",  "BUSD", "TUSD", "USDP", "GUSD", "USDD",
  "FRAX", "MIM",  "LUSD", "PYUSD","CRVUSD",

  /* ── Wrapped / liquid staking ───────────────────────────────────── */
  "WBTC", "WETH", "STETH","CBETH","RETH", "WSTETH",

  /* ── DeFi blue-chips ────────────────────────────────────────────── */
  "LINK", "UNI",  "AAVE", "MKR",  "COMP", "YFI",  "CRV",  "SNX",
  "BAL",  "1INCH","SUSHI","GRT",  "BAT",  "PENDLE","ENA",  "ETHFI",
  "LDO",  "CVX",  "FXS",  "GMX",  "PERP", "DYDX",

  /* ── DEX / Perp tokens ──────────────────────────────────────────── */
  "JUP",  "PYTH", "JTO",  "DRIFT","BLUR", "WLD",  "SAFE",

  /* ── Gaming / Metaverse / NFT ───────────────────────────────────── */
  "AXS",  "GALA", "ENJ",  "SAND", "MANA", "CHZ",  "MAGIC","GODS",
  "SUPER","ALICE","TLM",  "YGG",  "PIXEL",

  /* ── Meme coins ─────────────────────────────────────────────────── */
  "SHIB", "DOGE", "PEPE", "FLOKI","WIF",  "BONK", "BOME", "MEW",
  "POPCAT","TURBO",

  /* ── AI / Data ──────────────────────────────────────────────────── */
  "FET",  "AGIX", "OCEAN","RNDR", "NMR",  "GNO",  "CTXC",

  /* ── Infrastructure / Oracle / Identity ────────────────────────── */
  "BAND", "RSR",  "STORJ","LPT",  "AUDIO","ANKR", "SKL",  "CTSI",
  "HNT",  "NMR2", "THETA","FIL",  "EOS",  "XTZ",  "QTUM",

  /* ── Cosmos ecosystem ───────────────────────────────────────────── */
  "OSMO", "AKT",  "JUNO", "STARS","STRD", "ROWAN","EVMOS","KAVA",
  "SCRT2","MARS", "NTRN2","ARCH",

  /* ── Privacy coins ──────────────────────────────────────────────── */
  "XMR",  "ZEN",  "FIRO", "GRIN",

  /* ── Other established alts ─────────────────────────────────────── */
  "NEO",  "ONT",  "WAVES","ZIL",  "SYS",  "BTG",  "XEM",  "RVN",
  "XVG",  "CRO",  "BSV",  "GMT",  "APE",  "RUNE", "STX2",

  /* ── New-gen L1 / infra ─────────────────────────────────────────── */
  "SEI2", "TIA2", "ALT",  "PORTAL","MANTA","AEVO", "OMNI", "REZ",
  "TNSR", "ZETA", "MERL", "SAGA",  "ARKM", "ORDER","LISTA","ZK",

  /* ── Cross-chain / bridge tokens ────────────────────────────────── */
  "MOVR", "GLMR", "ROSE", "AZERO","NODL", "XDC",

  /* ── Exchange tokens ────────────────────────────────────────────── */
  "OKB",  "GT",   "HT",   "KCS",  "MX",   "BGB",  "WOO",

  /* ── Misc high-volume ────────────────────────────────────────────── */
  "LUNC", "USTC", "INJ2", "CAKE", "VELO", "HOOK", "HIGH",
].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

/**
 * Returns the built-in coin list, deduplicated and uppercase.
 * Used as fallback when the LE API is unavailable.
 */
export function getBuiltInLeCoins(): string[] {
  return LE_ALL_COINS;
}
