/**
 * On-chain liquidity provision for OrahDEX.
 *
 * Three modes, automatically selected by chain + pair:
 *
 *  "on_chain"  – Uniswap V3 real deposit (ETH/USDC on Base or Ethereum mainnet).
 *                Actual tokens deducted from wallet.
 *
 *  "live"      – Wallet is connected to a supported EVM chain but this specific
 *                pair doesn't have a V3 pool yet.  Position is recorded against
 *                the real wallet address; no token transfer.
 *
 *  "simulated" – Non-EVM wallet (BSV/SOL/BTC) or unknown chain.
 *                Legacy fallback.
 */

import { encodeFunctionData } from "viem";
import {
  approveToken, checkAllowance, pollTxReceipt,
} from "./reown";

// ─── EVM chains we recognise ──────────────────────────────────────────────────
/** ChainIds we treat as "live EVM" even if we can't do a full Uniswap V3 tx. */
const EVM_CHAIN_IDS = new Set([
  1, 56, 137, 42161, 10, 8453,
  59144, 324, 534352, 5000, 43114, 250, 25,
]);

// ─── Token addresses per chain ────────────────────────────────────────────────
/** Known ERC-20 addresses. Quote tokens on chains without native USDT are
 *  mapped to USDC (functionally equivalent stablecoin). */
export const CHAIN_TOKEN_ADDRESSES: Record<number, Partial<Record<string, string>>> = {
  8453: {  // Base mainnet
    WETH:  "0x4200000000000000000000000000000000000006",
    USDC:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // routed → native USDC
    WBTC:  "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  },
  1: {     // Ethereum mainnet
    WETH:  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WBTC:  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
};

/** Uniswap V3 NonfungiblePositionManager per chain. */
const UNI_V3_POSITION_MANAGER: Record<number, string> = {
  8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  1:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};

/** Pairs that map to real V3 pools we can interact with. */
const SUPPORTED_V3_PAIRS: Record<number, Set<string>> = {
  8453: new Set(["ETH/USDT", "ETH/USDC", "BTC/USDT", "BTC/USDC"]),
  1:    new Set(["ETH/USDT", "ETH/USDC", "BTC/USDT", "BTC/USDC"]),
};

/** ERC-20 decimals per symbol. */
export const TOKEN_DECIMALS: Record<string, number> = {
  ETH:  18, WETH: 18, BTC: 8, WBTC: 8,
  SOL:  9,  BSV:  8,  BNB: 18, XRP: 6,
  ADA:  6,  DOGE: 8,  DOT: 10, LINK: 18,
  USDC: 6,  USDT: 6,
};

/** Block explorer tx-link base URL per chain. */
export const EXPLORER_TX: Record<number, string> = {
  8453:   "https://basescan.org/tx/",
  1:      "https://etherscan.io/tx/",
  56:     "https://bscscan.com/tx/",
  137:    "https://polygonscan.com/tx/",
  42161:  "https://arbiscan.io/tx/",
  10:     "https://optimistic.etherscan.io/tx/",
  59144:  "https://lineascan.build/tx/",
  324:    "https://explorer.zksync.io/tx/",
  43114:  "https://snowtrace.io/tx/",
  250:    "https://ftmscan.com/tx/",
  25:     "https://cronoscan.com/tx/",
};

// ─── Mode helpers ─────────────────────────────────────────────────────────────

export type LiquidityMode = "on_chain" | "live" | "simulated";

/**
 * Determine which deposit mode to use.
 *
 * "on_chain"  → Uniswap V3 real tx (ETH/BTC pairs on Base or Ethereum)
 * "live"      → EVM wallet connected but pair has no V3 pool yet
 * "simulated" → non-EVM wallet or unsupported chain
 */
export function getLiquidityMode(
  chainId: number | null,
  base: string,
  quote: string,
): LiquidityMode {
  if (!chainId || !EVM_CHAIN_IDS.has(chainId)) return "simulated";
  const pairKey = `${base.toUpperCase()}/${quote.toUpperCase()}`;
  const supported = SUPPORTED_V3_PAIRS[chainId];
  if (supported?.has(pairKey)) return "on_chain";
  return "live";
}

/** Legacy helper for callers that just want a boolean. */
export function canUseOnChain(chainId: number | null, base: string): boolean {
  return getLiquidityMode(chainId, base, "USDT") === "on_chain";
}

// ─── Status type ─────────────────────────────────────────────────────────────

export type OnChainStep =
  | "idle" | "checking" | "approving" | "approval_pending"
  | "depositing" | "deposit_pending" | "success" | "error";

export interface LiquidityTxStatus {
  step: OnChainStep;
  txHash?: string;
  lpTokens?: number;
  valueUsd?: number;
  error?: string;
}

// ─── Uniswap V3 ABI fragments ─────────────────────────────────────────────────

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

// Full-range ticks for fee tier 3000 (tickSpacing = 60)
const TICK_LOWER = -887220;
const TICK_UPPER =  887220;
const FEE_TIER   = 3000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toWei(amount: number, decimals: number): bigint {
  const factor = 10 ** decimals;
  return BigInt(Math.floor(amount * factor));
}

function numToHex(n: bigint): string {
  return "0x" + n.toString(16);
}

async function sendTx(
  from: string, to: string, data: string, valueWei = 0n,
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  const txHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data, value: valueWei > 0n ? numToHex(valueWei) : undefined }],
  });
  return txHash ?? null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface AddLiquidityParams {
  base:     string;
  quote:    string;
  amountA:  number;
  amountB:  number;
  address:  string;
  chainId:  number;
  onStatus: (s: LiquidityTxStatus) => void;
}

/**
 * Execute a real Uniswap V3 deposit for on_chain mode.
 * Callers must first check getLiquidityMode === "on_chain".
 */
export async function addLiquidityOnChain(params: AddLiquidityParams): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, onStatus } = params;
  const update = (s: LiquidityTxStatus) => onStatus(s);

  const tokens  = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};
  const posMan  = UNI_V3_POSITION_MANAGER[chainId];

  if (!posMan) {
    update({ step: "error", error: "No V3 position manager for this chain." });
    return;
  }

  // Resolve addresses
  const baseKey   = base.toUpperCase() === "BTC" ? "WBTC" : `W${base.toUpperCase()}`;
  const quoteKey  = quote.toUpperCase() === "USDT" ? "USDC" : quote.toUpperCase();
  const baseAddr  = base.toUpperCase() === "ETH" ? tokens["WETH"] : tokens[baseKey];
  const quoteAddr = tokens[quoteKey];

  if (!baseAddr || !quoteAddr) {
    update({ step: "error", error: `Token pair ${base}/${quote} is not yet mapped on this chain.` });
    return;
  }

  const baseDecimals  = base.toUpperCase() === "ETH" ? 18 : (TOKEN_DECIMALS[base.toUpperCase()] ?? 18);
  const quoteDecimals = TOKEN_DECIMALS[quoteKey] ?? 6;

  const baseWei  = toWei(amountA, baseDecimals);
  const quoteRaw = toWei(amountB, quoteDecimals);

  // Uniswap V3: token0 is the lexicographically lower address
  const baseFirst = baseAddr.toLowerCase() < quoteAddr.toLowerCase();
  const token0    = baseFirst ? baseAddr  : quoteAddr;
  const token1    = baseFirst ? quoteAddr : baseAddr;
  const amount0Desired = baseFirst ? baseWei  : quoteRaw;
  const amount1Desired = baseFirst ? quoteRaw : baseWei;

  update({ step: "checking" });

  // ── Step 1: Approve quote token (USDC) ───────────────────────────────────
  let allowance = 0n;
  try { allowance = await checkAllowance(quoteAddr, address, posMan, chainId); } catch {}

  if (allowance < quoteRaw) {
    update({ step: "approving" });
    let approvalHash: string | null;
    try {
      const maxApproval = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      approvalHash = await approveToken(quoteAddr, posMan, maxApproval, address);
    } catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : "Approval failed." });
      return;
    }
    if (!approvalHash) { update({ step: "error", error: "Approval not sent." }); return; }

    update({ step: "approval_pending", txHash: approvalHash });

    await new Promise<void>((res, rej) => {
      const cancel = pollTxReceipt(approvalHash!, chainId, {
        intervalMs: 3000, maxAttempts: 60,
        onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Approval reverted.")); },
        onTimeout: () => { cancel(); rej(new Error("Approval timed out.")); },
      });
    }).catch(err => { update({ step: "error", error: err.message }); throw err; });
  }

  // If base is also an ERC-20 (WBTC), approve it too
  if (base.toUpperCase() !== "ETH") {
    let baseAllowance = 0n;
    try { baseAllowance = await checkAllowance(baseAddr, address, posMan, chainId); } catch {}
    if (baseAllowance < baseWei) {
      update({ step: "approving" });
      let baseApprovalHash: string | null;
      try {
        const maxApproval = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        baseApprovalHash = await approveToken(baseAddr, posMan, maxApproval, address);
      } catch (err: any) {
        update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : "Approval failed." });
        return;
      }
      if (!baseApprovalHash) { update({ step: "error", error: "Base token approval not sent." }); return; }
      update({ step: "approval_pending", txHash: baseApprovalHash });
      await new Promise<void>((res, rej) => {
        const cancel = pollTxReceipt(baseApprovalHash!, chainId, {
          intervalMs: 3000, maxAttempts: 60,
          onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Approval reverted.")); },
          onTimeout: () => { cancel(); rej(new Error("Approval timed out.")); },
        });
      }).catch(err => { update({ step: "error", error: err.message }); throw err; });
    }
  }

  // ── Step 2: Send deposit tx ───────────────────────────────────────────────
  update({ step: "depositing" });

  const deadline    = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const mintCalldata = encodeFunctionData({
    abi: MINT_ABI, functionName: "mint",
    args: [{
      token0, token1,
      fee: FEE_TIER, tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
      amount0Desired, amount1Desired, amount0Min: 0n, amount1Min: 0n,
      recipient: address as `0x${string}`, deadline,
    }],
  });

  let depositHash: string | null;

  if (base.toUpperCase() === "ETH") {
    const refundCalldata = encodeFunctionData({ abi: REFUND_ETH_ABI, functionName: "refundETH", args: [] });
    const multicallData  = encodeFunctionData({ abi: MULTICALL_ABI, functionName: "multicall", args: [[mintCalldata, refundCalldata]] });
    try { depositHash = await sendTx(address, posMan, multicallData, baseWei); }
    catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Transaction rejected." : (err?.message ?? "Transaction failed.") });
      return;
    }
  } else {
    // Both ERC-20: call mint directly (no ETH value)
    try { depositHash = await sendTx(address, posMan, mintCalldata, 0n); }
    catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Transaction rejected." : (err?.message ?? "Transaction failed.") });
      return;
    }
  }

  if (!depositHash) { update({ step: "error", error: "Transaction not sent." }); return; }
  update({ step: "deposit_pending", txHash: depositHash });

  await new Promise<void>((res, rej) => {
    const cancel = pollTxReceipt(depositHash!, chainId, {
      intervalMs: 3000, maxAttempts: 100,
      onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Transaction reverted.")); },
      onTimeout: () => { cancel(); res(); }, // still record on timeout
    });
  }).catch(err => { update({ step: "error", error: err.message }); throw err; });

  const valueUsd = amountA * (SPOT_PRICES[base] ?? 1) + amountB * (SPOT_PRICES[quote] ?? 1);
  const lpTokens = valueUsd / 12.5;
  update({ step: "success", txHash: depositHash!, lpTokens, valueUsd });
}

// Approximate spot prices for LP token estimate
const SPOT_PRICES: Record<string, number> = {
  BTC: 71_000, ETH: 2_160, SOL: 92, BSV: 14, BNB: 640,
  XRP: 1.42, ADA: 0.264, DOGE: 0.094, DOT: 1.39, LINK: 14.2, USDT: 1, USDC: 1,
};
