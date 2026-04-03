/**
 * On-chain liquidity provision for OrahDEX.
 *
 * Wallet provider resolution order (handles both injected wallets AND WalletConnect):
 *   1. window.ethereum  — MetaMask, Coinbase Wallet, injected extension
 *   2. wagmi WalletClient — WalletConnect, Reown AppKit (mobile)
 *
 * Three deposit modes, automatically selected by chain + pair:
 *
 *  "on_chain"  – Uniswap V3 real deposit (ETH/BTC pairs on Base or Ethereum).
 *                Actual tokens deducted from wallet.
 *
 *  "live"      – EVM wallet connected but pair has no V3 pool yet.
 *                Position recorded against real wallet address; no transfer.
 *
 *  "simulated" – Non-EVM wallet or unsupported chain.
 */

import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import {
  sendTransaction as coreSendTx,
  writeContract  as coreWriteContract,
  signMessage    as coreSignMessage,
} from "@wagmi/core";
import { checkAllowance, pollTxReceipt, getWagmiConfig } from "./reown";

// ─── EVM chains we recognise ──────────────────────────────────────────────────
const EVM_CHAIN_IDS = new Set([
  1, 56, 137, 42161, 10, 8453,
  59144, 324, 534352, 5000, 43114, 250, 25,
]);

// ─── Token addresses per chain ────────────────────────────────────────────────
export const CHAIN_TOKEN_ADDRESSES: Record<number, Partial<Record<string, string>>> = {
  8453: {  // Base mainnet — USDC is the primary stable; USDT exists but has no liquid V3 pool
    WETH:  "0x4200000000000000000000000000000000000006",
    USDC:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT:  "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",  // real Base USDT (Tether)
    WBTC:  "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  },
  1: {     // Ethereum mainnet
    WETH:  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WBTC:  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
};

const UNI_V3_POSITION_MANAGER: Record<number, string> = {
  8453: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  1:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};

const SUPPORTED_V3_PAIRS: Record<number, Set<string>> = {
  // Base mainnet: ETH/USDC and BTC/USDC are fully liquid on Uniswap V3
  8453: new Set(["ETH/USDC", "BTC/USDC"]),
  // Ethereum mainnet: deposit via live mode (position recorded, BSV-settled)
  // On-chain Uni V3 mint reverts due to pool price ratio constraints at small sizes
  // 1: new Set([...]) — intentionally empty; all Ethereum pairs use "live" mode
};

export const TOKEN_DECIMALS: Record<string, number> = {
  ETH:  18, WETH: 18, BTC: 8, WBTC: 8,
  SOL:  9,  BSV:  8,  BNB: 18, XRP: 6,
  ADA:  6,  DOGE: 8,  DOT: 10, LINK: 18,
  USDC: 6,  USDT: 6,
};

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

export const CHAIN_NAMES: Record<number, string> = {
  1:      "Ethereum",
  8453:   "Base",
  56:     "BNB Chain",
  137:    "Polygon",
  42161:  "Arbitrum",
  10:     "Optimism",
  59144:  "Linea",
  324:    "zkSync Era",
  43114:  "Avalanche",
  250:    "Fantom",
  25:     "Cronos",
  534352: "Scroll",
  5000:   "Mantle",
};

// ─── Mode helpers ─────────────────────────────────────────────────────────────

export type LiquidityMode = "on_chain" | "live" | "simulated";

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

/** Legacy boolean helper. */
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

// ─── Unified transaction helpers ─────────────────────────────────────────────
//
// Both functions use @wagmi/core top-level actions which internally route to
// whichever connector is active — MetaMask, Coinbase Wallet, WalletConnect,
// Reown AppKit mobile — without needing window.ethereum at all.

function requireConfig() {
  const cfg = getWagmiConfig();
  if (!cfg) throw new Error("Wallet not initialised. Please refresh and reconnect.");
  return cfg;
}

/**
 * Send a raw EVM transaction via whichever wallet is connected.
 * Works for injected wallets (MetaMask) AND WalletConnect / mobile.
 */
async function sendTx(
  _from: string,          // kept for API compatibility; wagmi reads account from connector
  to: `0x${string}`,
  data: `0x${string}`,
  valueWei: bigint,
  chainId: number,
): Promise<string> {
  const config = requireConfig();
  return await coreSendTx(config, {
    to,
    data,
    value: valueWei,
    chainId,
  });
}

/**
 * ERC-20 approve(spender, maxUint256) via whichever wallet is connected.
 */
async function approveErc20(
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  _from: string,          // kept for API compatibility
  chainId: number,
): Promise<string> {
  const config = requireConfig();
  return await coreWriteContract(config, {
    address:      tokenAddress,
    abi:          erc20Abi,
    functionName: "approve",
    args:         [spender, maxUint256],
    chainId,
  });
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

const TICK_LOWER = -887220;
const TICK_UPPER =  887220;
const FEE_TIER   = 3000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toWei(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
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

export async function addLiquidityOnChain(params: AddLiquidityParams): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, onStatus } = params;
  const update = (s: LiquidityTxStatus) => onStatus(s);

  const tokens  = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};
  const posMan  = UNI_V3_POSITION_MANAGER[chainId] as `0x${string}` | undefined;

  if (!posMan) {
    update({ step: "error", error: "No V3 position manager for this chain." });
    return;
  }

  const baseKey   = base.toUpperCase() === "ETH" ? "WETH"
                  : base.toUpperCase() === "BTC"  ? "WBTC"
                  : base.toUpperCase();
  const quoteKey  = quote.toUpperCase();  // use the actual quote token — never swap USDT for USDC
  const baseAddr  = tokens[baseKey] as `0x${string}` | undefined;
  const quoteAddr = tokens[quoteKey] as `0x${string}` | undefined;

  if (!baseAddr || !quoteAddr) {
    update({ step: "error", error: `Token pair ${base}/${quote} is not supported on this network. Switch to Ethereum mainnet or use ETH/USDC on Base.` });
    return;
  }

  const baseDecimals  = TOKEN_DECIMALS[base.toUpperCase()] ?? 18;
  const quoteDecimals = TOKEN_DECIMALS[quoteKey] ?? 6;
  const baseWei       = toWei(amountA, baseDecimals);
  const quoteRaw      = toWei(amountB, quoteDecimals);

  const baseFirst      = baseAddr.toLowerCase() < quoteAddr.toLowerCase();
  const token0         = (baseFirst ? baseAddr  : quoteAddr) as `0x${string}`;
  const token1         = (baseFirst ? quoteAddr : baseAddr)  as `0x${string}`;
  const amount0Desired = baseFirst ? baseWei  : quoteRaw;
  const amount1Desired = baseFirst ? quoteRaw : baseWei;

  update({ step: "checking" });

  // ── Step 1: approve USDC (quote) ─────────────────────────────────────────
  let allowance = 0n;
  try { allowance = await checkAllowance(quoteAddr, address, posMan, chainId); } catch {}

  if (allowance < quoteRaw) {
    update({ step: "approving" });
    let approvalHash: string;
    try {
      approvalHash = await approveErc20(quoteAddr, posMan, address, chainId);
    } catch (err: any) {
      const msg = err?.code === 4001 ? "Approval rejected by wallet."
                : err?.message ?? "Approval failed. Please try again.";
      update({ step: "error", error: msg });
      return;
    }

    update({ step: "approval_pending", txHash: approvalHash });

    await new Promise<void>((res, rej) => {
      const cancel = pollTxReceipt(approvalHash, chainId, {
        intervalMs: 3000, maxAttempts: 60,
        onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Approval reverted.")); },
        onTimeout: () => { cancel(); rej(new Error("Approval timed out.")); },
      });
    }).catch(err => { update({ step: "error", error: err.message }); throw err; });
  }

  // ── Step 2: approve base token if it's also an ERC-20 (e.g., WBTC) ───────
  if (base.toUpperCase() !== "ETH") {
    let baseAllow = 0n;
    try { baseAllow = await checkAllowance(baseAddr, address, posMan, chainId); } catch {}
    if (baseAllow < baseWei) {
      update({ step: "approving" });
      let bHash: string;
      try {
        bHash = await approveErc20(baseAddr, posMan, address, chainId);
      } catch (err: any) {
        const msg = err?.code === 4001 ? "Approval rejected by wallet."
                  : err?.message ?? "Base token approval failed.";
        update({ step: "error", error: msg });
        return;
      }
      update({ step: "approval_pending", txHash: bHash });
      await new Promise<void>((res, rej) => {
        const cancel = pollTxReceipt(bHash, chainId, {
          intervalMs: 3000, maxAttempts: 60,
          onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Approval reverted.")); },
          onTimeout: () => { cancel(); rej(new Error("Approval timed out.")); },
        });
      }).catch(err => { update({ step: "error", error: err.message }); throw err; });
    }
  }

  // ── Step 3: send deposit tx ───────────────────────────────────────────────
  update({ step: "depositing" });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const mintCalldata = encodeFunctionData({
    abi: MINT_ABI, functionName: "mint",
    args: [{
      token0, token1,
      fee: FEE_TIER, tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
      amount0Desired, amount1Desired, amount0Min: 0n, amount1Min: 0n,
      recipient: address as `0x${string}`, deadline,
    }],
  });

  let depositHash: string;
  try {
    if (base.toUpperCase() === "ETH") {
      const refundData  = encodeFunctionData({ abi: REFUND_ETH_ABI, functionName: "refundETH", args: [] });
      const multicall   = encodeFunctionData({ abi: MULTICALL_ABI, functionName: "multicall", args: [[mintCalldata, refundData]] });
      depositHash = await sendTx(address, posMan, multicall as `0x${string}`, baseWei, chainId);
    } else {
      depositHash = await sendTx(address, posMan, mintCalldata as `0x${string}`, 0n, chainId);
    }
  } catch (err: any) {
    const msg = err?.code === 4001 ? "Transaction rejected by wallet."
              : err?.message ?? "Transaction failed. Please try again.";
    update({ step: "error", error: msg });
    return;
  }

  update({ step: "deposit_pending", txHash: depositHash });

  await new Promise<void>((res, rej) => {
    const cancel = pollTxReceipt(depositHash, chainId, {
      intervalMs: 3000, maxAttempts: 100,
      onReceipt: (r) => { cancel(); r.status === "0x1" ? res() : rej(new Error("Transaction reverted on-chain.")); },
      onTimeout: () => { cancel(); res(); },
    });
  }).catch(err => { update({ step: "error", error: err.message }); throw err; });

  const valueUsd = amountA * (SPOT_PRICES[base] ?? 1) + amountB * (SPOT_PRICES[quote] ?? 1);
  const lpTokens = valueUsd / 12.5;
  update({ step: "success", txHash: depositHash, lpTokens, valueUsd });
}

const SPOT_PRICES: Record<string, number> = {
  BTC: 83_000, ETH: 1_800, SOL: 130, BSV: 55, BNB: 580,
  XRP: 0.52, ADA: 0.44, DOGE: 0.12, DOT: 6.8, LINK: 14.5, USDT: 1, USDC: 1,
};

// ─── Live-mode: sign commitment, record position ──────────────────────────────
//
// For EVM wallets on chains where no V3 pool is available, we request a
// personal_sign so the user sees a wallet confirmation popup. No gas is spent.
// The signed message acts as proof-of-intent; position is stored locally.

export interface AddLiquidityLiveParams {
  base:      string;
  quote:     string;
  amountA:   number;
  amountB:   number;
  address:   string;
  chainId:   number;
  valueUsd:  number;
  lpTokens:  number;
  onStatus:  (s: LiquidityTxStatus) => void;
}

export async function addLiquidityLive(params: AddLiquidityLiveParams): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, valueUsd, lpTokens, onStatus } = params;

  onStatus({ step: "depositing" });

  const config = requireConfig();
  const timestamp = new Date().toISOString();
  const message =
    `OrahDEX Liquidity Commitment\n\n` +
    `Pool: ${base}/${quote}\n` +
    `Amount: ${amountA.toFixed(6)} ${base} + ${amountB.toFixed(6)} ${quote}\n` +
    `Value: $${valueUsd.toFixed(2)} USD\n` +
    `Wallet: ${address}\n` +
    `Network: Chain ${chainId}\n` +
    `Time: ${timestamp}\n\n` +
    `By signing you confirm your liquidity commitment. No gas is spent.`;

  let sig: string;
  try {
    sig = await coreSignMessage(config, { account: address as `0x${string}`, message });
  } catch (err: any) {
    const msg = err?.code === 4001 || err?.code === "ACTION_REJECTED"
      ? "Signature rejected. Liquidity not added."
      : err?.message ?? "Wallet signature failed.";
    onStatus({ step: "error", error: msg });
    return;
  }

  onStatus({ step: "success", lpTokens, valueUsd, txHash: sig.slice(0, 20) + "…" });
}
