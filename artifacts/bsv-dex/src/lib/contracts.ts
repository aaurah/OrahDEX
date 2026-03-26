/**
 * Known on-chain contract addresses for common tokens.
 * Keyed by TOKEN_SYMBOL -> { "Chain Name": "0x..." }
 *
 * Addresses are the canonical contract for each token on each chain.
 * "native" = the token is native on that chain (no contract).
 */
export const KNOWN_CONTRACTS: Record<string, Record<string, string>> = {
  BTC: {
    "Ethereum (WBTC)":  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    "BNB Chain (BTCB)": "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    "Polygon (WBTC)":   "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BFD6",
    "Arbitrum (WBTC)":  "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    "Avalanche":        "0x152b9d0FdC40C096757F570Be9Ee9FAF2C4b2b43",
  },
  ETH: {
    "BNB Chain":        "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    "Polygon":          "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    "Arbitrum":         "native",
    "Optimism":         "native",
    "Avalanche":        "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
  },
  USDT: {
    "Ethereum":         "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "BNB Chain":        "0x55d398326f99059fF775485246999027B3197955",
    "Polygon":          "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    "Arbitrum":         "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    "Optimism":         "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    "Avalanche":        "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "Tron":             "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  },
  USDC: {
    "Ethereum":         "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "BNB Chain":        "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    "Polygon":          "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "Arbitrum":         "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "Optimism":         "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "Avalanche":        "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "Base":             "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  BNB: {
    "Ethereum":         "0xB8c77482e45F1F44dE1745F52C74426C631bDD52",
    "BNB Chain":        "native",
  },
  SOL: {
    "Ethereum":         "0xD31a59c85aE9D8edEFeC411D448f90841571b89c",
    "BNB Chain":        "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
    "Solana":           "native",
  },
  XRP: {
    "BNB Chain":        "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe",
    "Ethereum":         "0x628F76eAB0C1298F7a24d337bBbf1ef8A1Ea6A24",
  },
  ADA: {
    "BNB Chain":        "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
    "Ethereum":         "0xAE48c91dF1fE419994FFDa27da09D5aC69c30f55",
  },
  DOGE: {
    "BNB Chain":        "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
    "Ethereum":         "0x4206931337dc273a630d328dA6441786BfaD668f",
  },
  AVAX: {
    "Ethereum":         "0x85f138bfEE4ef8e540890CFb48F620571d67Eda3",
    "BNB Chain":        "0x1CE0c2827e2eF14D5C4f29a091d735A204794041",
    "Avalanche":        "native",
  },
  MATIC: {
    "Ethereum":         "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    "Polygon":          "native",
    "BNB Chain":        "0xCC42724C6683B7E57334c4E856f4c9965ED682bD",
  },
  DOT: {
    "BNB Chain":        "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402",
    "Ethereum":         "0xFfFFfFff1FcaCBd218EDc0EbA20Fc2308C778080",
  },
  LINK: {
    "Ethereum":         "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    "BNB Chain":        "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    "Polygon":          "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    "Arbitrum":         "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
  },
  UNI: {
    "Ethereum":         "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    "BNB Chain":        "0xBf5140A22578168FD562DCcF235E5D43A02ce9B1",
    "Polygon":          "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
  },
  AAVE: {
    "Ethereum":         "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    "Polygon":          "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    "Avalanche":        "0x63a72806098Bd3D9520cC43356dD78afe5D386D9",
  },
  DAI: {
    "Ethereum":         "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    "Polygon":          "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    "BNB Chain":        "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    "Arbitrum":         "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  },
  SHIB: {
    "Ethereum":         "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    "BNB Chain":        "0x2859e4544C4bB03966803b044A93563Bd2D0DD4D",
  },
  PEPE: {
    "Ethereum":         "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
  },
  ARB: {
    "Arbitrum":         "0x912CE59144191C1204E64559FE8253a0e49E6548",
    "Ethereum":         "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
  },
  OP: {
    "Optimism":         "native",
    "Ethereum":         "0x4200000000000000000000000000000000000042",
  },
  LTC: {
    "BNB Chain":        "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94",
    "Ethereum":         "0xAbb39FBfbCa56B6B5b9C3aFEaCeEc7c90AdF11C3",
  },
  BCH: {
    "BNB Chain":        "0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf",
    "Ethereum":         "0x5d6e3d7632D6719e04cA162be652164Bec1cDA7c",
  },
  TRX: {
    "Tron":             "native",
    "BNB Chain":        "0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B",
  },
  ATOM: {
    "BNB Chain":        "0x0Eb3a705fc54725037CC9e008bDede697f62F335",
    "Cosmos":           "native",
  },
  NEAR: {
    "Ethereum":         "0x85F17Cf997934a597031b2E18a9aB6ebD4B9f6a4",
    "BNB Chain":        "0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63",
    "NEAR":             "native",
  },
  SUI: {
    "Sui":              "native",
    "BNB Chain":        "0x55d398326f99059fF775485246999027B3197955",
  },
  INJ: {
    "Ethereum":         "0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30",
    "BNB Chain":        "0xa2B726B1145A4773F1a3587Ab1F80e97D5Cc7D4b",
  },
  APT: {
    "Aptos":            "native",
    "BNB Chain":        "0x4F0B4661a2d3Fa9d39E0c3F5C35C0B6AA64fC3e7",
  },
  MKR: {
    "Ethereum":         "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
  },
  CRV: {
    "Ethereum":         "0xD533a949740bb3306d119CC777fa900bA034cd52",
    "Polygon":          "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
  },
  FET: {
    "Ethereum":         "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
    "BNB Chain":        "0x031b41e504677879370e9DBcF937283A8691Fa7f",
  },
  BSV: {
    "Bitcoin SV":       "native",
    "Ethereum (BSVB)":  "0x6F9D224e3E9f671D5F7F48d21bC1FC9E51B5D0e9",
  },
  WBTC: {
    "Ethereum":         "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    "Polygon":          "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BFD6",
    "Arbitrum":         "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  },
};

/**
 * Get all contract addresses for a token — DB-stored addresses take priority;
 * the lookup table fills in any missing chains as a fallback.
 */
export function getContractAddresses(
  baseAsset: string,
  dbAddresses?: Record<string, string> | null
): Record<string, string> {
  const lookup = KNOWN_CONTRACTS[baseAsset.toUpperCase()] ?? {};
  return { ...lookup, ...(dbAddresses ?? {}) };
}

/**
 * Format an address for display: 0x1234...5678 or full for short addresses.
 */
export function shortAddr(addr: string, chars = 4): string {
  if (!addr || addr === "native") return addr;
  if (addr.startsWith("0x") && addr.length > chars * 2 + 2) {
    return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
  }
  if (addr.length > chars * 2 + 1) {
    return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
  }
  return addr;
}

/**
 * Returns a blockchain explorer URL for the given chain + address.
 */
export function explorerUrl(chain: string, address: string): string | null {
  if (!address || address === "native") return null;
  const c = chain.toLowerCase();
  if (c.includes("ethereum"))  return `https://etherscan.io/token/${address}`;
  if (c.includes("bnb") || c.includes("bsc")) return `https://bscscan.com/token/${address}`;
  if (c.includes("polygon"))   return `https://polygonscan.com/token/${address}`;
  if (c.includes("arbitrum"))  return `https://arbiscan.io/token/${address}`;
  if (c.includes("optimism"))  return `https://optimistic.etherscan.io/token/${address}`;
  if (c.includes("avalanche")) return `https://snowtrace.io/token/${address}`;
  if (c.includes("base"))      return `https://basescan.org/token/${address}`;
  if (c.includes("solana"))    return `https://solscan.io/token/${address}`;
  if (c.includes("tron"))      return `https://tronscan.org/#/token20/${address}`;
  if (c.includes("near"))      return `https://nearblocks.io/token/${address}`;
  return null;
}
