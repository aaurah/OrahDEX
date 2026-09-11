/**
 * eip712Types.ts — EIP-712 typed data definitions for OrahDEX actions
 *
 * Every user-facing DEX action (swap, add/remove liquidity, bridge, stake)
 * is expressed as EIP-712 typed data. This lets hardware wallets and smart
 * wallets display human-readable signing prompts instead of raw hex.
 *
 * Usage:
 *   import { signSwapIntent } from "@/lib/eip712Types";
 *   const sig = await signSwapIntent(swapParams, chainId, walletAddress);
 */

import type { WalletClient } from "viem";

// ── Domain ───────────────────────────────────────────────────────────────────

export const ORAHDEX_DOMAIN_NAME    = "OrahDEX";
export const ORAHDEX_DOMAIN_VERSION = "1";

export function buildDomain(chainId: number, verifyingContract?: `0x${string}`) {
  return {
    name:    ORAHDEX_DOMAIN_NAME,
    version: ORAHDEX_DOMAIN_VERSION,
    chainId,
    ...(verifyingContract ? { verifyingContract } : {}),
  } as const;
}

// ── Swap ─────────────────────────────────────────────────────────────────────

export const SWAP_TYPES = {
  Swap: [
    { name: "tokenIn",      type: "address" },
    { name: "tokenOut",     type: "address" },
    { name: "amountIn",     type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "recipient",    type: "address" },
    { name: "deadline",     type: "uint256" },
    { name: "nonce",        type: "uint256" },
    { name: "route",        type: "string"  },  // human-readable: "ETH → USDC → ORAH"
  ],
} as const;

export interface SwapIntent {
  tokenIn:      `0x${string}`;
  tokenOut:     `0x${string}`;
  amountIn:     bigint;
  minAmountOut: bigint;
  recipient:    `0x${string}`;
  deadline:     bigint;
  nonce:        bigint;
  route:        string;
}

// ── Add Liquidity ─────────────────────────────────────────────────────────────

export const ADD_LIQUIDITY_TYPES = {
  AddLiquidity: [
    { name: "tokenA",      type: "address" },
    { name: "tokenB",      type: "address" },
    { name: "amountA",     type: "uint256" },
    { name: "amountB",     type: "uint256" },
    { name: "minLp",       type: "uint256" },
    { name: "recipient",   type: "address" },
    { name: "deadline",    type: "uint256" },
    { name: "nonce",       type: "uint256" },
    { name: "poolLabel",   type: "string"  },  // human-readable: "ORAH/USDC 0.3%"
  ],
} as const;

export interface AddLiquidityIntent {
  tokenA:    `0x${string}`;
  tokenB:    `0x${string}`;
  amountA:   bigint;
  amountB:   bigint;
  minLp:     bigint;
  recipient: `0x${string}`;
  deadline:  bigint;
  nonce:     bigint;
  poolLabel: string;
}

// ── Remove Liquidity ──────────────────────────────────────────────────────────

export const REMOVE_LIQUIDITY_TYPES = {
  RemoveLiquidity: [
    { name: "lpToken",   type: "address" },
    { name: "lpAmount",  type: "uint256" },
    { name: "minA",      type: "uint256" },
    { name: "minB",      type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline",  type: "uint256" },
    { name: "nonce",     type: "uint256" },
    { name: "poolLabel", type: "string"  },
  ],
} as const;

// ── Bridge ────────────────────────────────────────────────────────────────────

export const BRIDGE_TYPES = {
  Bridge: [
    { name: "token",         type: "address" },
    { name: "amount",        type: "uint256" },
    { name: "fromChainId",   type: "uint256" },
    { name: "toChainId",     type: "uint256" },
    { name: "recipient",     type: "bytes"   },
    { name: "deadline",      type: "uint256" },
    { name: "nonce",         type: "uint256" },
    { name: "bridgeLabel",   type: "string"  },  // "500 ORAH → Base via LayerZero"
  ],
} as const;

export interface BridgeIntent {
  token:       `0x${string}`;
  amount:      bigint;
  fromChainId: bigint;
  toChainId:   bigint;
  recipient:   `0x${string}`;
  deadline:    bigint;
  nonce:       bigint;
  bridgeLabel: string;
}

// ── Stake ─────────────────────────────────────────────────────────────────────

export const STAKE_TYPES = {
  Stake: [
    { name: "token",        type: "address" },
    { name: "amount",       type: "uint256" },
    { name: "lockDuration", type: "uint256" },
    { name: "deadline",     type: "uint256" },
    { name: "nonce",        type: "uint256" },
    { name: "label",        type: "string"  },
  ],
} as const;

// ── Signing helpers ───────────────────────────────────────────────────────────

/**
 * Sign a swap intent via EIP-712 using a viem WalletClient.
 * Returns the hex signature.
 */
export async function signSwapIntent(
  intent:  SwapIntent,
  chainId: number,
  client:  WalletClient,
  account: `0x${string}`,
  verifyingContract?: `0x${string}`,
): Promise<`0x${string}`> {
  return client.signTypedData({
    account,
    domain:      buildDomain(chainId, verifyingContract),
    types:       SWAP_TYPES,
    primaryType: "Swap",
    message:     intent,
  });
}

export async function signAddLiquidityIntent(
  intent:  AddLiquidityIntent,
  chainId: number,
  client:  WalletClient,
  account: `0x${string}`,
  verifyingContract?: `0x${string}`,
): Promise<`0x${string}`> {
  return client.signTypedData({
    account,
    domain:      buildDomain(chainId, verifyingContract),
    types:       ADD_LIQUIDITY_TYPES,
    primaryType: "AddLiquidity",
    message:     intent,
  });
}

export async function signBridgeIntent(
  intent:  BridgeIntent,
  chainId: number,
  client:  WalletClient,
  account: `0x${string}`,
  verifyingContract?: `0x${string}`,
): Promise<`0x${string}`> {
  return client.signTypedData({
    account,
    domain:      buildDomain(chainId, verifyingContract),
    types:       BRIDGE_TYPES,
    primaryType: "Bridge",
    message:     intent,
  });
}

// ── Human-readable label builders ─────────────────────────────────────────────

export function swapLabel(
  tokenInSymbol: string,
  tokenOutSymbol: string,
  amountIn: string,
  amountOut: string,
  route: string[],
): string {
  const routeStr = route.join(" → ");
  return `Swap ${amountIn} ${tokenInSymbol} for ~${amountOut} ${tokenOutSymbol} via ${routeStr}`;
}

export function addLiquidityLabel(
  symbolA: string,
  symbolB: string,
  amountA: string,
  amountB: string,
  feeTier: number,
): string {
  return `Add ${amountA} ${symbolA} + ${amountB} ${symbolB} to ${symbolA}/${symbolB} ${feeTier}% pool`;
}

export function bridgeLabel(
  symbol: string,
  amount: string,
  fromChain: string,
  toChain: string,
  protocol: string,
): string {
  return `Bridge ${amount} ${symbol} from ${fromChain} to ${toChain} via ${protocol}`;
}
