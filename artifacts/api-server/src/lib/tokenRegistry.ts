/**
 * tokenRegistry.ts — Shared ERC-20 token registry for OrahDEX
 *
 * Provides a canonical mapping of symbol → { chainId → contractAddress, decimals }
 * used by both trade.ts (Transfer-log verification) and fundingVerifier.ts
 * (on-chain ERC-20 balance checks via readContract).
 *
 * Native chain assets (ETH, BNB, MATIC, AVAX) are identified by the
 * NATIVE_SYMBOLS map; they use `client.getBalance()` rather than `balanceOf`.
 *
 * To add a new token: add its entry in TOKEN_REGISTRY for each supported chain.
 * To add a new chain: add its native symbol to NATIVE_SYMBOLS and entries to TOKEN_REGISTRY.
 */

export interface TokenInfo {
  /** Checksummed or lowercase ERC-20 contract address */
  address:  string;
  /** Token decimals (e.g. 6 for USDT, 18 for WETH, 8 for WBTC) */
  decimals: number;
}

/**
 * TOKEN_REGISTRY[chainId][SYMBOL_UPPERCASE] → TokenInfo
 *
 * Only covers well-known ERC-20 tokens. Native assets (ETH, BNB, MATIC, AVAX)
 * are NOT listed here — use NATIVE_SYMBOLS to identify them.
 */
export const TOKEN_REGISTRY: Record<number, Record<string, TokenInfo>> = {
  1: { // Ethereum
    USDT:  { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6  },
    USDC:  { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6  },
    DAI:   { address: "0x6b175474e89094c44da98b954eedeac495271d0f", decimals: 18 },
    WETH:  { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", decimals: 18 },
    WBTC:  { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", decimals: 8  },
    LINK:  { address: "0x514910771af9ca656af840dff83e8264ecf986ca", decimals: 18 },
    UNI:   { address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", decimals: 18 },
  },
  56: { // BNB Chain
    USDT:  { address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
    USDC:  { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18 },
    WBNB:  { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", decimals: 18 },
  },
  137: { // Polygon
    USDT:  { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6  },
    USDC:  { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6  },
    WMATIC:{ address: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", decimals: 18 },
    WETH:  { address: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", decimals: 18 },
  },
  8453: { // Base
    USDC:  { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6  },
    WETH:  { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  42161: { // Arbitrum One
    USDT:  { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6  },
    USDC:  { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", decimals: 6  },
    WETH:  { address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", decimals: 18 },
    WBTC:  { address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", decimals: 8  },
  },
  10: { // Optimism
    USDC:  { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", decimals: 6  },
    USDT:  { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6  },
    WETH:  { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  43114: { // Avalanche C-Chain
    USDT:  { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6  },
    USDC:  { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", decimals: 6  },
    WETH:  { address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", decimals: 18 },
  },
};

/**
 * Native asset symbol for each supported chain.
 * If `asset.toUpperCase() === NATIVE_SYMBOLS[chainId]`, use `getBalance()`.
 * Otherwise look up the ERC-20 address in TOKEN_REGISTRY.
 */
export const NATIVE_SYMBOLS: Record<number, string> = {
  1:      "ETH",
  56:     "BNB",
  137:    "MATIC",
  8453:   "ETH",
  42161:  "ETH",
  10:     "ETH",
  43114:  "AVAX",
};

/**
 * Look up token info for a given (chainId, symbol) pair.
 * Returns null if the asset is native (use getBalance) or unknown.
 *
 * @param chainId  - Numeric EVM chain ID
 * @param symbol   - Asset symbol (case-insensitive)
 * @returns TokenInfo if the asset is a known ERC-20, null otherwise
 */
export function getTokenInfo(chainId: number, symbol: string): TokenInfo | null {
  const upper = symbol.toUpperCase();
  // Native assets are not in TOKEN_REGISTRY
  if (NATIVE_SYMBOLS[chainId] === upper) return null;
  return TOKEN_REGISTRY[chainId]?.[upper] ?? null;
}

/**
 * Returns true if `symbol` is the native asset for `chainId`
 * (i.e. use `getBalance` rather than `balanceOf`).
 */
export function isNativeAsset(chainId: number, symbol: string): boolean {
  return NATIVE_SYMBOLS[chainId] === symbol.toUpperCase();
}
