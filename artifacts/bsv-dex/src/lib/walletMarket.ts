/**
 * Maps a connected wallet's chain/network to the correct Markets tab.
 * Used by both desktop Markets and mobile MobileMarkets pages.
 */

export type MarketTab =
  | "usd" | "bsv" | "btc" | "eth" | "bnb" | "matic" | "avax"
  | "arb" | "op" | "ftm" | "cro" | "base" | "linea" | "zk"
  | "scr" | "mnt" | "sol" | "bch" | "zora" | "favorites"
  | "new" | "ai" | "meme" | "defi" | "futures";

/** EVM chainId → market tab */
const CHAIN_TAB: Record<number, MarketTab> = {
  1:       "eth",    // Ethereum mainnet
  8453:    "base",   // Base
  42161:   "arb",    // Arbitrum One
  10:      "op",     // Optimism
  137:     "matic",  // Polygon
  56:      "bnb",    // BNB Chain / BSC
  43114:   "avax",   // Avalanche C-Chain
  250:     "ftm",    // Fantom
  25:      "cro",    // Cronos
  59144:   "linea",  // Linea
  324:     "zk",     // zkSync Era
  534352:  "scr",    // Scroll
  5000:    "mnt",    // Mantle
  7777777: "zora",   // Zora Network
  100:     "eth",    // Gnosis → show ETH markets (bridged)
  1101:    "matic",  // Polygon zkEVM
};

/** Human-readable chain name for the banner */
const CHAIN_NAME: Record<number, string> = {
  1:       "Ethereum",
  8453:    "Base",
  42161:   "Arbitrum",
  10:      "Optimism",
  137:     "Polygon",
  56:      "BNB Chain",
  43114:   "Avalanche",
  250:     "Fantom",
  25:      "Cronos",
  59144:   "Linea",
  324:     "zkSync Era",
  534352:  "Scroll",
  5000:    "Mantle",
  7777777: "Zora",
  100:     "Gnosis",
  1101:    "Polygon zkEVM",
};

export interface WalletMarketResult {
  tab: MarketTab;
  label: string;      // e.g. "Ethereum" or "BSV" — used in the banner
  isAutoSelected: boolean;
}

export function getWalletMarketTab(
  address: string | null,
  network: string | null,
  chainId: number | null,
): WalletMarketResult {
  if (!address) return { tab: "usd", label: "", isAutoSelected: false };

  // BSV UTXO wallet
  if (network === "bsv") return { tab: "bsv", label: "BSV", isAutoSelected: true };
  // Solana wallet
  if (network === "sol") return { tab: "sol", label: "Solana", isAutoSelected: true };
  // Bitcoin wallet
  if (network === "btc") return { tab: "btc", label: "Bitcoin", isAutoSelected: true };

  // EVM wallet — look up chainId
  if (chainId && CHAIN_TAB[chainId]) {
    return {
      tab: CHAIN_TAB[chainId],
      label: CHAIN_NAME[chainId] ?? `Chain ${chainId}`,
      isAutoSelected: true,
    };
  }

  // EVM but unknown chain — fall back to ETH markets
  if (network === "evm" || (address && address.startsWith("0x"))) {
    return { tab: "eth", label: "EVM", isAutoSelected: true };
  }

  return { tab: "usd", label: "", isAutoSelected: false };
}
