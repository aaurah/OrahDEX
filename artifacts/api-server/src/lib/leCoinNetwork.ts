/**
 * leCoinNetwork.ts
 *
 * Single source-of-truth for the coin → LetsExchange (coin, network) mapping.
 * Imported by both stripeCheckout.ts and webhookHandlers.ts so the two files
 * can never drift out of sync.
 */

export const LE_COIN_NETWORK: Record<string, { coin: string; network: string }> = {
  BTC:   { coin: "BTC",   network: "BTC"   },
  ETH:   { coin: "ETH",   network: "ETH"   },
  BSV:   { coin: "BSV",   network: "BSV"   },
  BNB:   { coin: "BNB",   network: "BEP20" },
  SOL:   { coin: "SOL",   network: "SOL"   },
  XRP:   { coin: "XRP",   network: "XRP"   },
  ADA:   { coin: "ADA",   network: "ADA"   },
  DOGE:  { coin: "DOGE",  network: "DOGE"  },
  DOT:   { coin: "DOT",   network: "DOT"   },
  AVAX:  { coin: "AVAX",  network: "AVAX"  },
  MATIC: { coin: "MATIC", network: "POL"   },
  USDT:  { coin: "USDT",  network: "ERC20" },
  USDC:  { coin: "USDC",  network: "ERC20" },
  LINK:  { coin: "LINK",  network: "ERC20" },
  UNI:   { coin: "UNI",   network: "ERC20" },
};
