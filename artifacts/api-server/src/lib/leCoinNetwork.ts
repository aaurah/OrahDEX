/**
 * leCoinNetwork.ts
 *
 * Single source-of-truth for the coin → LetsExchange (coin, network) mapping.
 * Imported by both stripeCheckout.ts and webhookHandlers.ts so the two files
 * can never drift out of sync.
 *
 * Networks are the LetsExchange network codes from /v2/coins.
 * When uncertain, ERC20 is the safest default for EVM tokens.
 */

export const LE_COIN_NETWORK: Record<string, { coin: string; network: string }> = {
  // ── Layer-1 blockchains ─────────────────────────────────────────────────────
  BTC:    { coin: "BTC",    network: "BTC"      },
  ETH:    { coin: "ETH",    network: "ETH"      },
  BSV:    { coin: "BSV",    network: "BSV"      },
  BCH:    { coin: "BCH",    network: "BCH"      },
  LTC:    { coin: "LTC",    network: "LTC"      },
  XRP:    { coin: "XRP",    network: "XRP"      },
  XLM:    { coin: "XLM",    network: "XLM"      },
  ADA:    { coin: "ADA",    network: "ADA"      },
  DOT:    { coin: "DOT",    network: "DOT"      },
  SOL:    { coin: "SOL",    network: "SOL"      },
  DOGE:   { coin: "DOGE",   network: "DOGE"     },
  TRX:    { coin: "TRX",    network: "TRC20"    },
  AVAX:   { coin: "AVAX",   network: "AVAX"     },
  ATOM:   { coin: "ATOM",   network: "COSMOS"   },
  NEAR:   { coin: "NEAR",   network: "NEAR"     },
  ALGO:   { coin: "ALGO",   network: "ALGO"     },
  EGLD:   { coin: "EGLD",   network: "EGLD"     },
  HBAR:   { coin: "HBAR",   network: "HBAR"     },
  ICP:    { coin: "ICP",    network: "ICP"      },
  FIL:    { coin: "FIL",    network: "FIL"      },
  ETC:    { coin: "ETC",    network: "ETC"      },
  DASH:   { coin: "DASH",   network: "DASH"     },
  ZEC:    { coin: "ZEC",    network: "ZEC"      },
  XMR:    { coin: "XMR",    network: "XMR"      },
  XTZ:    { coin: "XTZ",    network: "XTZ"      },
  EOS:    { coin: "EOS",    network: "EOS"      },
  VET:    { coin: "VET",    network: "VET"      },
  KAVA:   { coin: "KAVA",   network: "KAVA"     },
  ONE:    { coin: "ONE",    network: "ONE"      },
  FLOW:   { coin: "FLOW",   network: "FLOW"     },
  ZIL:    { coin: "ZIL",    network: "ZIL"      },
  IOTA:   { coin: "IOTA",   network: "IOTA"     },
  KSM:    { coin: "KSM",    network: "KSM"      },
  WAVES:  { coin: "WAVES",  network: "WAVES"    },
  NEO:    { coin: "NEO",    network: "NEO"      },
  QNT:    { coin: "QNT",    network: "ERC20"    },
  MINA:   { coin: "MINA",   network: "MINA"     },
  CELO:   { coin: "CELO",   network: "CELO"     },
  TON:    { coin: "TON",    network: "TON"      },
  APT:    { coin: "APT",    network: "APTOS"    },
  SUI:    { coin: "SUI",    network: "SUI"      },
  SEI:    { coin: "SEI",    network: "SEI"      },
  INJ:    { coin: "INJ",    network: "INJ"      },
  TIA:    { coin: "TIA",    network: "CELESTIA" },
  OSMO:   { coin: "OSMO",   network: "OSMOSIS"  },

  // ── BNB / BEP20 ─────────────────────────────────────────────────────────────
  BNB:    { coin: "BNB",    network: "BEP20"    },
  CAKE:   { coin: "CAKE",   network: "BEP20"    },

  // ── Polygon ─────────────────────────────────────────────────────────────────
  MATIC:  { coin: "MATIC",  network: "POL"      },
  POL:    { coin: "POL",    network: "POL"      },

  // ── Layer-2 / rollups ───────────────────────────────────────────────────────
  ARB:    { coin: "ARB",    network: "ARBITRUM" },
  OP:     { coin: "OP",     network: "OPTIMISM" },
  IMX:    { coin: "IMX",    network: "ERC20"    },
  STX:    { coin: "STX",    network: "STX"      },
  STRK:   { coin: "STRK",   network: "STARKNET" },
  ZK:     { coin: "ZK",     network: "ZKSYNC"   },

  // ── Stablecoins ─────────────────────────────────────────────────────────────
  USDT:   { coin: "USDT",   network: "ERC20"    },
  USDC:   { coin: "USDC",   network: "ERC20"    },
  DAI:    { coin: "DAI",    network: "ERC20"    },
  BUSD:   { coin: "BUSD",   network: "BEP20"    },
  TUSD:   { coin: "TUSD",   network: "ERC20"    },
  FRAX:   { coin: "FRAX",   network: "ERC20"    },
  PYUSD:  { coin: "PYUSD",  network: "ERC20"    },
  USDD:   { coin: "USDD",   network: "TRC20"    },
  CRVUSD: { coin: "CRVUSD", network: "ERC20"    },
  LUSD:   { coin: "LUSD",   network: "ERC20"    },

  // ── Wrapped tokens ──────────────────────────────────────────────────────────
  WBTC:   { coin: "WBTC",   network: "ERC20"    },
  WETH:   { coin: "WETH",   network: "ERC20"    },
  STETH:  { coin: "STETH",  network: "ERC20"    },
  WSTETH: { coin: "WSTETH", network: "ERC20"    },

  // ── DeFi blue-chips (ERC20) ─────────────────────────────────────────────────
  LINK:   { coin: "LINK",   network: "ERC20"    },
  UNI:    { coin: "UNI",    network: "ERC20"    },
  AAVE:   { coin: "AAVE",   network: "ERC20"    },
  MKR:    { coin: "MKR",    network: "ERC20"    },
  COMP:   { coin: "COMP",   network: "ERC20"    },
  YFI:    { coin: "YFI",    network: "ERC20"    },
  CRV:    { coin: "CRV",    network: "ERC20"    },
  SNX:    { coin: "SNX",    network: "ERC20"    },
  BAL:    { coin: "BAL",    network: "ERC20"    },
  GRT:    { coin: "GRT",    network: "ERC20"    },
  LDO:    { coin: "LDO",    network: "ERC20"    },
  ENS:    { coin: "ENS",    network: "ERC20"    },
  "1INCH":{ coin: "1INCH",  network: "ERC20"    },
  SUSHI:  { coin: "SUSHI",  network: "ERC20"    },
  CVX:    { coin: "CVX",    network: "ERC20"    },
  GMX:    { coin: "GMX",    network: "ARBITRUM" },
  DYDX:   { coin: "DYDX",   network: "ERC20"    },
  PENDLE: { coin: "PENDLE", network: "ERC20"    },
  ENA:    { coin: "ENA",    network: "ERC20"    },
  ETHFI:  { coin: "ETHFI",  network: "ERC20"    },

  // ── Solana ecosystem ────────────────────────────────────────────────────────
  JUP:    { coin: "JUP",    network: "SOL"      },
  PYTH:   { coin: "PYTH",   network: "SOL"      },
  JTO:    { coin: "JTO",    network: "SOL"      },
  RAY:    { coin: "RAY",    network: "SOL"      },
  BONK:   { coin: "BONK",   network: "SOL"      },
  WIF:    { coin: "WIF",    network: "SOL"      },

  // ── AI / Data ───────────────────────────────────────────────────────────────
  FET:    { coin: "FET",    network: "ERC20"    },
  AGIX:   { coin: "AGIX",   network: "ERC20"    },
  OCEAN:  { coin: "OCEAN",  network: "ERC20"    },
  RNDR:   { coin: "RNDR",   network: "ERC20"    },
  TAO:    { coin: "TAO",    network: "TAO"      },
  WLD:    { coin: "WLD",    network: "ERC20"    },

  // ── Gaming / NFT ────────────────────────────────────────────────────────────
  AXS:    { coin: "AXS",    network: "ERC20"    },
  SAND:   { coin: "SAND",   network: "ERC20"    },
  MANA:   { coin: "MANA",   network: "ERC20"    },
  GALA:   { coin: "GALA",   network: "ERC20"    },
  ENJ:    { coin: "ENJ",    network: "ERC20"    },
  CHZ:    { coin: "CHZ",    network: "ERC20"    },
  MAGIC:  { coin: "MAGIC",  network: "ARBITRUM" },
  APE:    { coin: "APE",    network: "ERC20"    },

  // ── Meme coins ──────────────────────────────────────────────────────────────
  SHIB:   { coin: "SHIB",   network: "ERC20"    },
  PEPE:   { coin: "PEPE",   network: "ERC20"    },
  FLOKI:  { coin: "FLOKI",  network: "ERC20"    },

  // ── Exchange / infra tokens ─────────────────────────────────────────────────
  CRO:    { coin: "CRO",    network: "ERC20"    },
  FTM:    { coin: "FTM",    network: "FTM"      },
  RUNE:   { coin: "RUNE",   network: "RUNE"     },
  ROSE:   { coin: "ROSE",   network: "ROSE"     },
  CFX:    { coin: "CFX",    network: "CFX"      },
  KAS:    { coin: "KAS",    network: "KAS"      },
  THETA:  { coin: "THETA",  network: "THETA"    },
  ANKR:   { coin: "ANKR",   network: "ERC20"    },
  BAT:    { coin: "BAT",    network: "ERC20"    },
  ZRX:    { coin: "ZRX",    network: "ERC20"    },
  STORJ:  { coin: "STORJ",  network: "ERC20"    },
  SKL:    { coin: "SKL",    network: "ERC20"    },
  CTSI:   { coin: "CTSI",   network: "ERC20"    },
  NMR:    { coin: "NMR",    network: "ERC20"    },
  BAND:   { coin: "BAND",   network: "ERC20"    },
  RSR:    { coin: "RSR",    network: "ERC20"    },
  OGN:    { coin: "OGN",    network: "ERC20"    },
};
