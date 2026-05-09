/**
 * Orah AMM contract addresses per chain.
 *
 * After deploying with `pnpm deploy:sepolia` (or any target network), the
 * script writes `artifacts/orah-contracts/deployments/<chainId>.json`.
 * Copy the factory + router addresses here and add the chainId to ORAHDEX_AMM_CHAINS.
 *
 * These are the ONLY values the frontend needs at runtime — no ABIs imported
 * here, those live in useLpBalance.ts and onChainLiquidity.ts.
 */

export interface OrahDEXAmmConfig {
  factory: `0x${string}`;
  router:  `0x${string}`;
  weth:    `0x${string}`;
}

/**
 * Deployed Orah AMM addresses keyed by EVM chain ID.
 *
 * Chain IDs present here are treated as "Orah-native" chains — the
 * liquidity UI will offer OrahDEXRouter-based add/remove instead of Uni V3.
 *
 * TO ADD A NEW DEPLOYMENT:
 *   1. Run: pnpm --filter @workspace/orah-contracts deploy:<network>
 *   2. Copy the printed factory + router addresses into this map.
 *   3. Add the chainId to ORAHDEX_AMM_CHAINS below.
 */
export const ORAHDEX_AMM_ADDRESSES: Record<number, OrahDEXAmmConfig> = {
  // ── Sepolia testnet (chainId 11155111) — deployed 2026-04-16 ────────────
  11155111: {
    factory: "0x8c6bdD68078Eb20b99dd8E644fF347013415220c",
    router:  "0x03EdB4b914A0D05E6Aee0a8389A90eE33c8f664a",
    weth:    "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
  },

  // ── Base Sepolia testnet (chainId 84532) — not yet deployed ─────────────
  // 84532: {
  //   factory: "0x...",
  //   router:  "0x...",
  //   weth:    "0x4200000000000000000000000000000000000006",
  // },
};

/**
 * Set of chain IDs where Orah AMM contracts are deployed.
 * Used as a fast lookup instead of iterating ORAHDEX_AMM_ADDRESSES keys.
 */
export const ORAHDEX_AMM_CHAINS: ReadonlySet<number> =
  new Set(Object.keys(ORAHDEX_AMM_ADDRESSES).map(Number));

/**
 * Returns the Orah AMM config for a chain, or undefined if not deployed.
 */
export function getOrahDEXAmm(chainId: number): OrahDEXAmmConfig | undefined {
  return ORAHDEX_AMM_ADDRESSES[chainId];
}

/**
 * True when Orah AMM contracts are deployed on the given chain.
 */
export function hasOrahDEXAmm(chainId: number): boolean {
  return ORAHDEX_AMM_CHAINS.has(chainId);
}

// ─── Minimal ABI fragments for LP token & pair interactions ──────────────────
// Embedded here so downstream hooks don't need to import full compile artifacts.

export const ORAHDEX_FACTORY_ABI = [
  {
    name: "getPair",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ name: "pair", type: "address" }],
  },
] as const;

export const ORAHDEX_PAIR_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "",        type: "uint256"  }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getReserves",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [
      { name: "reserve0",           type: "uint112" },
      { name: "reserve1",           type: "uint112" },
      { name: "blockTimestampLast", type: "uint32"  },
    ],
  },
  {
    name: "token0",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "token1",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "pure",
    inputs:  [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const ORAHDEX_ROUTER_ABI = [
  {
    name: "addLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA",        type: "address" },
      { name: "tokenB",        type: "address" },
      { name: "amountADesired",type: "uint256" },
      { name: "amountBDesired",type: "uint256" },
      { name: "amountAMin",    type: "uint256" },
      { name: "amountBMin",    type: "uint256" },
      { name: "to",            type: "address" },
      { name: "deadline",      type: "uint256" },
    ],
    outputs: [
      { name: "amountA",    type: "uint256" },
      { name: "amountB",    type: "uint256" },
      { name: "liquidity",  type: "uint256" },
    ],
  },
  {
    name: "addLiquidityETH",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "token",           type: "address" },
      { name: "amountTokenDesired", type: "uint256" },
      { name: "amountTokenMin",  type: "uint256" },
      { name: "amountETHMin",    type: "uint256" },
      { name: "to",              type: "address" },
      { name: "deadline",        type: "uint256" },
    ],
    outputs: [
      { name: "amountToken",  type: "uint256" },
      { name: "amountETH",    type: "uint256" },
      { name: "liquidity",    type: "uint256" },
    ],
  },
  {
    name: "removeLiquidity",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenA",    type: "address" },
      { name: "tokenB",    type: "address" },
      { name: "liquidity", type: "uint256" },
      { name: "amountAMin",type: "uint256" },
      { name: "amountBMin",type: "uint256" },
      { name: "to",        type: "address" },
      { name: "deadline",  type: "uint256" },
    ],
    outputs: [
      { name: "amountA", type: "uint256" },
      { name: "amountB", type: "uint256" },
    ],
  },
  {
    name: "removeLiquidityETH",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token",      type: "address" },
      { name: "liquidity",  type: "uint256" },
      { name: "amountTokenMin", type: "uint256" },
      { name: "amountETHMin",   type: "uint256" },
      { name: "to",         type: "address" },
      { name: "deadline",   type: "uint256" },
    ],
    outputs: [
      { name: "amountToken", type: "uint256" },
      { name: "amountETH",   type: "uint256" },
    ],
  },
  {
    name: "factory",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "WETH",
    type: "function",
    stateMutability: "view",
    inputs:  [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path",     type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactTokensForTokens",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn",     type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactETHForTokens",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    name: "swapExactTokensForETH",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn",     type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path",         type: "address[]" },
      { name: "to",           type: "address" },
      { name: "deadline",     type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;
