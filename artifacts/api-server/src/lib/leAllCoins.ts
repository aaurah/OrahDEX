/**
 * leAllCoins.ts — Canonical LetsExchange Coin Catalog (built-in fallback)
 *
 * Used when the LETSEXCHANGE_API_KEY is not configured and the live
 * /v2/coins endpoint is unavailable (returns 403).
 *
 * When the API key IS available, the live list from /v2/coins is preferred
 * and this list is ignored.
 *
 * ~331 unique tickers after dedup.
 * 331 × 330 all-to-all combinations (excluding self) = 109,230 pairs.
 */

export const LE_ALL_COINS: string[] = [
  /* ── Layer-1 blockchains ────────────────────────────────────────── */
  "BTC",  "ETH",  "BNB",  "SOL",  "ADA",  "AVAX", "DOT",  "ATOM",
  "NEAR", "APT",  "SUI",  "SEI",  "INJ",  "TON",  "XRP",  "TRX",
  "LTC",  "BCH",  "XLM",  "ETC",  "DASH", "ZEC",  "DCR",  "DGB",
  "VET",  "ALGO", "EGLD", "ONE",  "KLAY", "FTM",  "KSM",  "IOTA",
  "SCRT", "MINA", "CELO", "FLOW", "HBAR", "QNT",  "ICP",  "TIA",
  "XNO",  "HIVE", "LSK",  "ARK",  "ARDR", "NXT",  "ERG",  "RVN",

  /* ── Layer-2 / rollups ──────────────────────────────────────────── */
  "ARB",  "OP",   "IMX",  "STX",  "STRK", "NTRN", "MNT",  "SCR",
  "ZK",   "MANTA","BLAST","TAIKO","MODE", "LINEA","ZRO",  "AEVO",

  /* ── Stablecoins ────────────────────────────────────────────────── */
  "USDT", "USDC", "DAI",  "BUSD", "TUSD", "USDP", "GUSD", "USDD",
  "FRAX", "MIM",  "LUSD", "PYUSD","CRVUSD","SUSD","DOLA",

  /* ── Wrapped / liquid staking ───────────────────────────────────── */
  "WBTC", "WETH", "STETH","CBETH","RETH", "WSTETH","FRXETH","MSOL",
  "RPL",  "SSV",

  /* ── DeFi blue-chips ────────────────────────────────────────────── */
  "LINK", "UNI",  "AAVE", "MKR",  "COMP", "YFI",  "CRV",  "SNX",
  "BAL",  "1INCH","SUSHI","GRT",  "BAT",  "PENDLE","ENA",  "ETHFI",
  "LDO",  "CVX",  "FXS",  "GMX",  "PERP", "DYDX", "KNC",  "ZRX",
  "GNO",  "COW",  "LQTY", "VSTA", "LYRA", "STG",

  /* ── DEX / Perp / Yield tokens ──────────────────────────────────── */
  "JUP",  "PYTH", "JTO",  "DRIFT","BLUR", "WLD",  "SAFE", "GNS",
  "RDNT", "GRAIL","HMX",  "VELA", "ORCA", "RAY",

  /* ── Oracles / Infrastructure ───────────────────────────────────── */
  "BAND", "RSR",  "STORJ","LPT",  "AUDIO","ANKR", "SKL",  "CTSI",
  "HNT",  "THETA","FIL",  "EOS",  "XTZ",  "QTUM", "TRB",  "OXT",
  "RLC",  "GLM",  "POWR", "IOTX", "CELR", "ATA",  "SYN",  "API3",
  "DENT", "COTI", "DEXE", "OGN",  "AGLD", "DOCK",

  /* ── Solana ecosystem ───────────────────────────────────────────── */
  "FIDA", "MNGO", "COPE", "SABER","HONEY","SAMO", "GENE", "AURY",

  /* ── Cosmos ecosystem ───────────────────────────────────────────── */
  "OSMO", "AKT",  "JUNO", "STARS","STRD", "ROWAN","EVMOS","KAVA",
  "MARS", "ARCH", "SAGA", "NTRN", "TIA",  "KUJIRA","CANTO","DYM",
  "INJ",  "ORAI",

  /* ── Privacy coins ──────────────────────────────────────────────── */
  "XMR",  "ZEN",  "FIRO", "GRIN",

  /* ── Gaming / Metaverse / NFT ───────────────────────────────────── */
  "AXS",  "GALA", "ENJ",  "SAND", "MANA", "CHZ",  "MAGIC","GODS",
  "SUPER","ALICE","TLM",  "YGG",  "PIXEL","ILV",  "SLP",  "RON",
  "WAXP", "REVV", "LOKA", "VEMP", "TOWER","ATLAS","POLIS","SFUND",
  "AURY", "NAKA", "MOBOX","DERC", "PVU",  "SPS",  "DEC",  "RACA",
  "CEEK", "WOM",  "EFI",  "VRA",

  /* ── Meme coins ─────────────────────────────────────────────────── */
  "SHIB", "DOGE", "PEPE", "FLOKI","WIF",  "BONK", "BOME", "MEW",
  "POPCAT","TURBO","MOG", "NEIRO","NOT",  "HMSTR","DOGS", "TRUMP",
  "MEME", "WEN",  "PONKE","GIGA", "BILLY","GOAT", "PEANUT","FWOG",
  "MYRO", "MOTHER","HARAMBE","GRIFFAIN","ZEREBRO","MOODENG","CHILLGUY",
  "PNUT", "AI16Z","ANIME","PENGU","ACE",  "BRETT","AERO",

  /* ── AI / Data / DePIN ──────────────────────────────────────────── */
  "FET",  "AGIX", "OCEAN","RNDR", "NMR",  "CTXC", "TAO",  "ARKM",
  "EIGEN","GRASS","IO",   "NOS",  "VANA", "AIOZ", "CGPT", "PAAL",
  "ORAI", "WLD",  "ALT",  "VIRTUAL","SONIC","DEEP","SEND", "KAITO",

  /* ── Cross-chain / bridge ───────────────────────────────────────── */
  "MOVR", "GLMR", "ROSE", "AZERO","NODL", "XDC",  "MORPHO","HOP",

  /* ── Exchange tokens ────────────────────────────────────────────── */
  "OKB",  "GT",   "HT",   "KCS",  "MX",   "BGB",  "WOO",

  /* ── Other established alts ─────────────────────────────────────── */
  "NEO",  "ONT",  "WAVES","ZIL",  "SYS",  "BTG",  "XEM",  "XVG",
  "CRO",  "BSV",  "GMT",  "APE",  "RUNE", "MATIC","LTO",  "MDT",

  /* ── New-gen L1 / infra ─────────────────────────────────────────── */
  "PORTAL","OMNI","REZ",  "TNSR", "ZETA", "MERL", "ORDER","LISTA",
  "ZK",   "ALT",

  /* ── DeFi misc ──────────────────────────────────────────────────── */
  "LUNC", "USTC", "CAKE", "VELO", "HOOK", "HIGH", "ONDO", "PENDLE",
  "ENA",

].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

/**
 * Returns the built-in coin list, deduplicated and uppercase.
 * Used as fallback when the LE API is unavailable.
 */
export function getBuiltInLeCoins(): string[] {
  return LE_ALL_COINS;
}
