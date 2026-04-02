/**
 * Real on-chain liquidity provision via Uniswap V3 on supported EVM chains.
 *
 * Supported right now: Base mainnet (chainId 8453) — ETH/USDC pool.
 * All other chains/pairs fall back to simulation mode.
 *
 * Flow:
 *   1. If quote token (USDC) allowance < needed → prompt approve tx
 *   2. Wait for approval confirmation
 *   3. Call NonfungiblePositionManager.multicall([mint(...), refundETH()])
 *      with ETH value for the ETH portion
 *   4. Wait for deposit confirmation
 *   5. Return tx hash + LP token estimate
 */

import { encodeFunctionData } from "viem";
import {
  approveToken, checkAllowance, pollTxReceipt, CHAIN_RPC_URLS,
} from "./reown";

// ─── Supported chain / token config ──────────────────────────────────────────

/** Token addresses per chain. USDT is mapped to USDC on chains that don't have USDT. */
export const CHAIN_TOKEN_ADDRESSES: Record<number, Partial<Record<string, string>>> = {
  8453: {  // Base mainnet
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // routed → native USDC
    WBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  },
  1: {     // Ethereum mainnet
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
};

/** ERC-20 decimals for each token symbol. */
export const TOKEN_DECIMALS: Record<string, number> = {
  ETH:  18, WETH: 18, BTC: 8, WBTC: 8,
  SOL:  9,  BSV:  8,  BNB: 18, XRP: 6,
  ADA:  6,  DOGE: 8,  DOT: 10, LINK: 18,
  USDC: 6,  USDT: 6,
};

// ─── Uniswap V3 contracts per chain ──────────────────────────────────────────

const UNI_V3_POSITION_MANAGER: Record<number, string> = {
  8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  1:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};

/** Block explorer tx URL per chain. */
export const EXPLORER_TX: Record<number, string> = {
  8453: "https://basescan.org/tx/",
  1:    "https://etherscan.io/tx/",
  56:   "https://bscscan.com/tx/",
  137:  "https://polygonscan.com/tx/",
  42161:"https://arbiscan.io/tx/",
  10:   "https://optimistic.etherscan.io/tx/",
};

// ─── Uniswap V3 ABIs (minimal) ────────────────────────────────────────────────

const MINT_ABI = [{
  name: "mint",
  type: "function",
  stateMutability: "payable",
  inputs: [{
    name: "params", type: "tuple",
    components: [
      { name: "token0",          type: "address"  },
      { name: "token1",          type: "address"  },
      { name: "fee",             type: "uint24"   },
      { name: "tickLower",       type: "int24"    },
      { name: "tickUpper",       type: "int24"    },
      { name: "amount0Desired",  type: "uint256"  },
      { name: "amount1Desired",  type: "uint256"  },
      { name: "amount0Min",      type: "uint256"  },
      { name: "amount1Min",      type: "uint256"  },
      { name: "recipient",       type: "address"  },
      { name: "deadline",        type: "uint256"  },
    ],
  }],
  outputs: [
    { name: "tokenId",    type: "uint256" },
    { name: "liquidity",  type: "uint128" },
    { name: "amount0",    type: "uint256" },
    { name: "amount1",    type: "uint256" },
  ],
}] as const;

const REFUND_ETH_ABI = [{
  name: "refundETH",
  type: "function",
  stateMutability: "payable",
  inputs: [],
  outputs: [],
}] as const;

const MULTICALL_ABI = [{
  name: "multicall",
  type: "function",
  stateMutability: "payable",
  inputs: [{ name: "data", type: "bytes[]" }],
  outputs: [{ name: "results", type: "bytes[]" }],
}] as const;

// ─── Tick config (full-range position, fee = 3000, tickSpacing = 60) ─────────
const TICK_LOWER = -887220;   // nearest multiple of 60 below ±MAX_TICK
const TICK_UPPER =  887220;
const FEE_TIER   = 3000;      // 0.3% — matches OrahDEX default pool fee

// ─── Status type ─────────────────────────────────────────────────────────────

export type OnChainStep =
  | "idle"
  | "checking"
  | "approving"
  | "approval_pending"
  | "depositing"
  | "deposit_pending"
  | "success"
  | "error";

export interface LiquidityTxStatus {
  step: OnChainStep;
  txHash?: string;
  lpTokens?: number;
  valueUsd?: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toWei(amount: number, decimals: number): bigint {
  const factor = 10 ** decimals;
  return BigInt(Math.floor(amount * factor));
}

function numToHex(n: bigint): string {
  return "0x" + n.toString(16);
}

async function sendTx(
  from: string,
  to: string,
  data: string,
  valueWei: bigint = 0n,
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const txHash: string = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from,
        to,
        data,
        value: valueWei > 0n ? numToHex(valueWei) : undefined,
      }],
    });
    return txHash ?? null;
  } catch (err: any) {
    // 4001 = user rejected
    throw err;
  }
}

// ─── canUseOnChain ────────────────────────────────────────────────────────────

/**
 * Returns true if the given chain + pair supports real on-chain liquidity.
 * Currently: Base mainnet with ETH as the base token.
 */
export function canUseOnChain(chainId: number | null, base: string): boolean {
  if (!chainId) return false;
  const tokens = CHAIN_TOKEN_ADDRESSES[chainId];
  if (!tokens) return false;
  // We support native ETH pools (ETH/USDC, ETH/USDT → USDC) on chains where WETH is defined
  return base.toUpperCase() === "ETH" && !!tokens["WETH"];
}

// ─── Main: addLiquidityOnChain ────────────────────────────────────────────────

export interface AddLiquidityParams {
  base:      string;    // e.g. "ETH"
  quote:     string;    // e.g. "USDT"
  amountA:   number;    // ETH amount (human-readable)
  amountB:   number;    // USDC/USDT amount (human-readable)
  address:   string;    // user wallet address
  chainId:   number;
  onStatus:  (s: LiquidityTxStatus) => void;
}

export async function addLiquidityOnChain(params: AddLiquidityParams): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, onStatus } = params;

  const update = (s: LiquidityTxStatus) => onStatus(s);
  const tokens  = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};
  const posMan  = UNI_V3_POSITION_MANAGER[chainId];

  if (!posMan) {
    update({ step: "error", error: "This chain is not yet supported for on-chain liquidity." });
    return;
  }

  // Resolve token addresses
  const wethAddr = tokens["WETH"];
  const quoteKey = quote.toUpperCase() === "USDT" ? "USDC" : quote.toUpperCase();
  const quoteAddr = tokens[quoteKey];

  if (!wethAddr || !quoteAddr) {
    update({ step: "error", error: `Token ${quote} is not yet supported on this chain.` });
    return;
  }

  // Uniswap V3: token0 is the lower address
  const wethLower = wethAddr.toLowerCase() < quoteAddr.toLowerCase();
  const token0    = wethLower ? wethAddr  : quoteAddr;
  const token1    = wethLower ? quoteAddr : wethAddr;

  const ethDecimals   = 18;
  const quoteDecimals = TOKEN_DECIMALS[quoteKey] ?? 6;

  const ethWei    = toWei(amountA, ethDecimals);
  const quoteRaw  = toWei(amountB, quoteDecimals);

  const amount0Desired = wethLower ? ethWei   : quoteRaw;
  const amount1Desired = wethLower ? quoteRaw : ethWei;

  update({ step: "checking" });

  // ── Step 1: Check and request USDC approval ──────────────────────────────
  let currentAllowance: bigint;
  try {
    currentAllowance = await checkAllowance(quoteAddr, address, posMan, chainId);
  } catch {
    currentAllowance = 0n;
  }

  if (currentAllowance < quoteRaw) {
    update({ step: "approving" });
    let approvalHash: string | null;
    try {
      // Approve max uint256 so future deposits skip this step
      const maxApproval = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      approvalHash = await approveToken(quoteAddr, posMan, maxApproval, address);
    } catch (err: any) {
      if (err?.code === 4001) {
        update({ step: "error", error: "Approval rejected by wallet." });
      } else {
        update({ step: "error", error: "Approval failed. Please try again." });
      }
      return;
    }

    if (!approvalHash) {
      update({ step: "error", error: "Approval transaction was not sent." });
      return;
    }

    update({ step: "approval_pending", txHash: approvalHash });

    // Wait for approval tx to mine
    await new Promise<void>((resolve, reject) => {
      const cancel = pollTxReceipt(approvalHash!, chainId, {
        intervalMs: 3000,
        maxAttempts: 60,
        onReceipt: (receipt) => {
          cancel();
          if (receipt.status === "0x1") {
            resolve();
          } else {
            reject(new Error("Approval transaction reverted."));
          }
        },
        onTimeout: () => {
          cancel();
          reject(new Error("Approval confirmation timed out."));
        },
      });
    }).catch(err => {
      update({ step: "error", error: err.message });
      throw err;
    });
  }

  // ── Step 2: Build and send the mint multicall ─────────────────────────────
  update({ step: "depositing" });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min

  const mintCalldata = encodeFunctionData({
    abi: MINT_ABI,
    functionName: "mint",
    args: [{
      token0,
      token1,
      fee:             FEE_TIER,
      tickLower:       TICK_LOWER,
      tickUpper:       TICK_UPPER,
      amount0Desired,
      amount1Desired,
      amount0Min:      0n,
      amount1Min:      0n,
      recipient:       address as `0x${string}`,
      deadline,
    }],
  });

  const refundCalldata = encodeFunctionData({
    abi: REFUND_ETH_ABI,
    functionName: "refundETH",
    args: [],
  });

  const multicallData = encodeFunctionData({
    abi: MULTICALL_ABI,
    functionName: "multicall",
    args: [[mintCalldata, refundCalldata]],
  });

  let depositHash: string | null;
  try {
    depositHash = await sendTx(address, posMan, multicallData, ethWei);
  } catch (err: any) {
    if (err?.code === 4001) {
      update({ step: "error", error: "Transaction rejected by wallet." });
    } else {
      update({ step: "error", error: err?.message ?? "Transaction failed. Please try again." });
    }
    return;
  }

  if (!depositHash) {
    update({ step: "error", error: "Transaction was not sent." });
    return;
  }

  update({ step: "deposit_pending", txHash: depositHash });

  // ── Step 3: Wait for deposit confirmation ─────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    const cancel = pollTxReceipt(depositHash!, chainId, {
      intervalMs: 3000,
      maxAttempts: 100,
      onReceipt: (receipt) => {
        cancel();
        if (receipt.status === "0x1") resolve();
        else reject(new Error("Liquidity transaction reverted on-chain."));
      },
      onTimeout: () => {
        cancel();
        // Tx submitted but not confirmed yet — still treat as success
        resolve();
      },
    });
  }).catch(err => {
    update({ step: "error", error: err.message });
    throw err;
  });

  // ── Done ──────────────────────────────────────────────────────────────────
  const valueUsd = amountA * (SPOT_PRICES[base]  ?? 1)
                 + amountB * (SPOT_PRICES[quote] ?? 1);
  const lpTokens = valueUsd / 12.5;

  update({ step: "success", txHash: depositHash!, lpTokens, valueUsd });
}

// ─── Approximate spot prices (same as in Liquidity.tsx) ──────────────────────
// Used only to calculate LP token estimate after a real deposit.
const SPOT_PRICES: Record<string, number> = {
  BTC: 71_000, ETH: 2_160, SOL: 92, BSV: 14, BNB: 640,
  XRP: 1.42, ADA: 0.264, DOGE: 0.094, DOT: 1.39, LINK: 14.2, USDT: 1, USDC: 1,
};
