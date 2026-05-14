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

import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import {
  sendTransaction as coreSendTx,
  writeContract  as coreWriteContract,
  signMessage    as coreSignMessage,
} from "@wagmi/core";
import { checkAllowance, pollTxReceipt, getWagmiConfig, CHAIN_RPC_URLS } from "./reown";
import { getOrahAmm, hasOrahAmm, ORAH_ROUTER_ABI, ORAH_FACTORY_ABI } from "./orahAmmAddresses";

// ─── EVM chains we recognise ──────────────────────────────────────────────────
const EVM_CHAIN_IDS = new Set([
  1, 56, 137, 42161, 10, 8453,
  59144, 324, 534352, 5000, 43114, 250, 25,
  11155111, 84532,  // testnets: Sepolia, Base Sepolia
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
  11155111: {  // Sepolia testnet — OrahDEX AMM deployed
    WETH:  "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9",
    USDC:  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",  // Circle test USDC on Sepolia
    USDT:  "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",  // Aave test USDT on Sepolia
    WBTC:  "0x29f2D40B0605204364af54EC677bD022dA425d03",  // Aave test WBTC on Sepolia
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
  8453:     "https://basescan.org/tx/",
  1:        "https://etherscan.io/tx/",
  56:       "https://bscscan.com/tx/",
  137:      "https://polygonscan.com/tx/",
  42161:    "https://arbiscan.io/tx/",
  10:       "https://optimistic.etherscan.io/tx/",
  59144:    "https://lineascan.build/tx/",
  324:      "https://explorer.zksync.io/tx/",
  43114:    "https://snowtrace.io/tx/",
  250:      "https://ftmscan.com/tx/",
  25:       "https://cronoscan.com/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
  84532:    "https://sepolia.basescan.org/tx/",
};

export const CHAIN_NAMES: Record<number, string> = {
  1:        "Ethereum",
  8453:     "Base",
  56:       "BNB Chain",
  137:      "Polygon",
  42161:    "Arbitrum",
  10:       "Optimism",
  59144:    "Linea",
  324:      "zkSync Era",
  43114:    "Avalanche",
  250:      "Fantom",
  25:       "Cronos",
  534352:   "Scroll",
  5000:     "Mantle",
  11155111: "Sepolia",
  84532:    "Base Sepolia",
};

// ─── Mode helpers ─────────────────────────────────────────────────────────────

export type LiquidityMode = "on_chain" | "orah_amm" | "live" | "simulated";

const INTERNAL_PROVIDERS = new Set([
  "orah-wallet", "passkey", "mobile-qr",
]);

export function hasExternalConnector(provider: string | null): boolean {
  if (!provider) return false;
  return !INTERNAL_PROVIDERS.has(provider);
}

export function getLiquidityMode(
  chainId: number | null,
  base: string,
  quote: string,
  provider?: string | null,
): LiquidityMode {
  if (!chainId || !EVM_CHAIN_IDS.has(chainId)) return "simulated";
  if (provider !== undefined && !hasExternalConnector(provider)) return "simulated";
  // OrahDEX-native AMM chains get real on-chain add/remove via OrahRouter02
  if (hasOrahAmm(chainId)) return "orah_amm";
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
  /** OrahDEX LP token (pair) address — set on success for orah_amm mode */
  lpTokenAddress?: string;
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
 * ERC-20 approve(spender, amount) via whichever wallet is connected.
 * Uses exact amount only — never grants unlimited (maxUint256) allowance.
 */
async function approveErc20(
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  _from: string,          // kept for API compatibility
  chainId: number,
  amount: bigint,         // exact approval amount
): Promise<string> {
  const config = requireConfig();
  return await coreWriteContract(config, {
    address:      tokenAddress,
    abi:          erc20Abi,
    functionName: "approve",
    args:         [spender, amount],
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

/**
 * Convert a decimal amount to wei using exact string-based math.
 * Avoids the `amount * 10**decimals` float-precision bug that loses
 * digits for large/odd values (e.g. 1.234567890123456789).
 *
 * Accepts both `number` and pre-formatted decimal strings.
 */
function toWei(amount: number | string, decimals: number): bigint {
  let str: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount) || amount < 0) return 0n;
    // toLocaleString("fullwide") expands scientific notation safely.
    str = amount.toLocaleString("fullwide", {
      useGrouping: false,
      maximumFractionDigits: 30,
    });
  } else {
    str = amount.trim();
    if (!str) return 0n;
    // Normalise scientific notation if it sneaks in.
    if (/e/i.test(str)) {
      str = Number(str).toLocaleString("fullwide", {
        useGrouping: false,
        maximumFractionDigits: 30,
      });
    }
  }
  // Reject anything other than digits + at most one dot
  if (!/^[0-9]+(\.[0-9]+)?$/.test(str)) return 0n;
  return parseUnits(str as `${number}`, decimals);
}

/**
 * Apply slippage tolerance to a desired amount.
 * `bps` is basis points: 50 = 0.5%, 100 = 1%, capped at 5000 (50%).
 * Returns the minimum acceptable amount the user is willing to receive.
 */
function applySlippage(amount: bigint, bps: number): bigint {
  const safe = Math.max(0, Math.min(5000, Math.floor(bps)));
  if (safe === 0) return amount;
  return (amount * BigInt(10_000 - safe)) / 10_000n;
}

/** Default slippage tolerance when caller does not specify one. */
const DEFAULT_SLIPPAGE_BPS = 50;

// ─── Main export ─────────────────────────────────────────────────────────────

export interface AddLiquidityParams {
  base:     string;
  quote:    string;
  amountA:  number;
  amountB:  number;
  address:  string;
  chainId:  number;
  /** Slippage tolerance in basis points (50 = 0.5%). Defaults to 50 bps. */
  slippageBps?: number;
  onStatus: (s: LiquidityTxStatus) => void;
}

export async function addLiquidityOnChain(params: AddLiquidityParams): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, onStatus } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
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
      approvalHash = await approveErc20(quoteAddr, posMan, address, chainId, quoteRaw);
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
        bHash = await approveErc20(baseAddr, posMan, address, chainId, baseWei);
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
      amount0Desired, amount1Desired,
      amount0Min: applySlippage(amount0Desired, slippageBps),
      amount1Min: applySlippage(amount1Desired, slippageBps),
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
      onTimeout: () => { cancel(); rej(new Error("Transaction timed out waiting for confirmation.")); },
    });
  }).catch(err => { update({ step: "error", error: err.message }); throw err; });

  const valueUsd = amountA * (SPOT_PRICES[base] ?? 1) + amountB * (SPOT_PRICES[quote] ?? 1);
  const lpTokens = valueUsd / 12.5;
  update({ step: "success", txHash: depositHash, lpTokens, valueUsd });
}

const SPOT_PRICES: Record<string, number> = {
  BTC: 83_000, ETH: 1_800, SOL: 130, BSV: 14, BNB: 580,
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

// ─── OrahDEX AMM helpers (raw JSON-RPC, no wagmi chain config required) ───────

/**
 * Raw eth_call via JSON-RPC — no dependency on wagmi chain list.
 * Used for reading on-chain data on any chain (including testnets).
 */
async function ethCallRaw(rpc: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    const json = await res.json();
    return json?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll for tx receipt on the given RPC.
 * Resolves when the tx is mined or after a timeout (~4 minutes).
 */
async function waitOrahTx(txHash: string, rpc: string): Promise<void> {
  const MAX_ATTEMPTS = 80;        // 80 × 3s = 4 minutes
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });
      const json = await res.json();
      const receipt = json?.result;
      if (receipt?.blockHash) {
        // status: "0x1" = success, "0x0" = revert. Treat anything other than
        // explicit success as a revert to avoid silently accepting reverts.
        const status = String(receipt.status ?? "").toLowerCase();
        if (status === "0x1" || status === "1") return;
        throw new Error("Transaction reverted on-chain.");
      }
    } catch (err: any) {
      // Re-throw revert errors immediately; ignore transient network errors.
      if (err?.message?.includes("reverted")) throw err;
    }
  }
  throw new Error("Transaction timed out waiting for confirmation. Check the block explorer.");
}

/** Pad an address to 32-byte ABI slot. */
const padAddr = (a: string) => a.replace("0x", "").padStart(64, "0");

/**
 * Fetch the OrahDEX pair address from the factory for a token pair.
 * Returns undefined when the pair doesn't exist yet.
 */
async function getOrahPairAddress(
  rpc: string,
  factoryAddress: string,
  tokenA: string,
  tokenB: string,
): Promise<string | undefined> {
  try {
    const calldata = encodeFunctionData({
      abi: ORAH_FACTORY_ABI,
      functionName: "getPair",
      args: [tokenA as `0x${string}`, tokenB as `0x${string}`],
    });
    const raw = await ethCallRaw(rpc, factoryAddress, calldata);
    if (raw && raw !== "0x" && raw.length >= 66) {
      const addr = "0x" + raw.slice(-40);
      if (addr.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        return addr;
      }
    }
  } catch {}
  return undefined;
}

// ─── addLiquidityOrahAmm ─────────────────────────────────────────────────────

export interface AddLiquidityOrahAmmParams {
  base:     string;
  quote:    string;
  amountA:  number;
  amountB:  number;
  address:  string;
  chainId:  number;
  /** Slippage tolerance in basis points (50 = 0.5%). Defaults to 50 bps. */
  slippageBps?: number;
  onStatus: (s: LiquidityTxStatus) => void;
}

/**
 * Add liquidity via OrahRouter02 on any chain where OrahDEX AMM is deployed.
 * Uses window.ethereum directly so it works on any wallet+chain without wagmi
 * network config (important for Sepolia which isn't in REOWN_NETWORKS).
 */
export async function addLiquidityOrahAmm(
  params: AddLiquidityOrahAmmParams,
): Promise<void> {
  const { base, quote, amountA, amountB, address, chainId, onStatus } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const update = (s: LiquidityTxStatus) => onStatus(s);

  const amm = getOrahAmm(chainId);
  if (!amm) {
    update({ step: "error", error: "OrahDEX AMM not deployed on this chain." });
    return;
  }

  const eth = (window as any).ethereum;
  if (!eth) {
    update({ step: "error", error: "No injected wallet found." });
    return;
  }

  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) {
    update({ step: "error", error: `No RPC URL for chain ${chainId}.` });
    return;
  }

  const tokens     = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};
  const isETHBase  = base.toUpperCase()  === "ETH";
  const isETHQuote = quote.toUpperCase() === "ETH";
  const baseKey    = isETHBase  ? "WETH" : base.toUpperCase()  === "BTC" ? "WBTC" : base.toUpperCase();
  const quoteKey   = isETHQuote ? "WETH" : quote.toUpperCase() === "BTC" ? "WBTC" : quote.toUpperCase();

  const baseDecimals  = TOKEN_DECIMALS[base.toUpperCase()]  ?? 18;
  const quoteDecimals = TOKEN_DECIMALS[quote.toUpperCase()] ?? 6;
  const baseWei       = toWei(amountA, baseDecimals);
  const quoteWei      = toWei(amountB, quoteDecimals);
  const baseMin       = applySlippage(baseWei,  slippageBps);
  const quoteMin      = applySlippage(quoteWei, slippageBps);
  const deadline      = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const router        = amm.router;

  const resolvedTokenA = tokens[baseKey]  ?? amm.weth;
  const resolvedTokenB = tokens[quoteKey] ?? amm.weth;

  update({ step: "checking" });

  // Pre-read pair address so we can look it up before the pair might be created
  let pairAddress = await getOrahPairAddress(rpc, amm.factory, resolvedTokenA, resolvedTokenB);

  // ── Branch A: ETH + ERC-20 pair (addLiquidityETH) ─────────────────────────
  if (isETHBase || isETHQuote) {
    const tokenAddr   = (isETHBase  ? tokens[quoteKey] : tokens[baseKey]) as string | undefined;
    const tokenAmount = isETHBase  ? quoteWei : baseWei;
    const ethWei      = isETHBase  ? baseWei  : quoteWei;

    if (!tokenAddr) {
      update({ step: "error", error: `${isETHBase ? quote : base} token not configured for chain ${chainId}.` });
      return;
    }

    // Approve ERC-20 token to router
    const allowanceData = "0xdd62ed3e" + padAddr(address) + padAddr(router);
    const allowanceRaw  = await ethCallRaw(rpc, tokenAddr, allowanceData);
    const allowance     = allowanceRaw && allowanceRaw !== "0x" ? BigInt(allowanceRaw) : 0n;

    if (allowance < tokenAmount) {
      update({ step: "approving" });
      const approveData = "0x095ea7b3" + padAddr(router) + "f".repeat(64);
      let approveHash: string;
      try {
        approveHash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: tokenAddr, data: approveData }],
        });
      } catch (err: any) {
        update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : (err?.message ?? "Approval failed.") });
        return;
      }
      update({ step: "approval_pending", txHash: approveHash });
      try { await waitOrahTx(approveHash, rpc); }
      catch (err: any) { update({ step: "error", txHash: approveHash, error: err?.message ?? "Approval failed." }); return; }
    }

    update({ step: "depositing" });
    const calldata = encodeFunctionData({
      abi: ORAH_ROUTER_ABI,
      functionName: "addLiquidityETH",
      args: [
        tokenAddr as `0x${string}`,
        tokenAmount,
        applySlippage(tokenAmount, slippageBps),
        applySlippage(ethWei,      slippageBps),
        address as `0x${string}`,
        deadline,
      ],
    });

    let txHash: string;
    try {
      txHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: router, data: calldata, value: "0x" + ethWei.toString(16) }],
      });
    } catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Transaction rejected." : (err?.message ?? "Transaction failed.") });
      return;
    }

    update({ step: "deposit_pending", txHash });
    try { await waitOrahTx(txHash, rpc); }
    catch (err: any) { update({ step: "error", txHash, error: err?.message ?? "Deposit failed." }); return; }

    // Re-read pair address now that the pool may have been created
    if (!pairAddress) {
      pairAddress = await getOrahPairAddress(rpc, amm.factory, resolvedTokenA, resolvedTokenB);
    }

    const valueUsd = amountA * (SPOT_PRICES[base.toUpperCase()] ?? 1) + amountB * (SPOT_PRICES[quote.toUpperCase()] ?? 1);
    const lpTokens = valueUsd / 12.5;
    update({ step: "success", txHash, lpTokens, valueUsd, lpTokenAddress: pairAddress });
    return;
  }

  // ── Branch B: ERC-20 + ERC-20 pair (addLiquidity) ─────────────────────────
  const tokenAAddr = tokens[baseKey];
  const tokenBAddr = tokens[quoteKey];

  if (!tokenAAddr) {
    update({ step: "error", error: `${base} token not configured for chain ${chainId}.` });
    return;
  }
  if (!tokenBAddr) {
    update({ step: "error", error: `${quote} token not configured for chain ${chainId}.` });
    return;
  }

  // Approve tokenA
  const allowanceDataA = "0xdd62ed3e" + padAddr(address) + padAddr(router);
  const allowanceRawA  = await ethCallRaw(rpc, tokenAAddr, allowanceDataA);
  const allowanceA     = allowanceRawA && allowanceRawA !== "0x" ? BigInt(allowanceRawA) : 0n;

  if (allowanceA < baseWei) {
    update({ step: "approving" });
    const approveDataA = "0x095ea7b3" + padAddr(router) + "f".repeat(64);
    let approveHashA: string;
    try {
      approveHashA = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: tokenAAddr, data: approveDataA }],
      });
    } catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : (err?.message ?? "Approval failed.") });
      return;
    }
    update({ step: "approval_pending", txHash: approveHashA });
    try { await waitOrahTx(approveHashA, rpc); }
    catch (err: any) { update({ step: "error", txHash: approveHashA, error: err?.message ?? "Approval failed." }); return; }
  }

  // Approve tokenB
  const allowanceDataB = "0xdd62ed3e" + padAddr(address) + padAddr(router);
  const allowanceRawB  = await ethCallRaw(rpc, tokenBAddr, allowanceDataB);
  const allowanceB     = allowanceRawB && allowanceRawB !== "0x" ? BigInt(allowanceRawB) : 0n;

  if (allowanceB < quoteWei) {
    update({ step: "approving" });
    const approveDataB = "0x095ea7b3" + padAddr(router) + "f".repeat(64);
    let approveHashB: string;
    try {
      approveHashB = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: tokenBAddr, data: approveDataB }],
      });
    } catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : (err?.message ?? "Approval failed.") });
      return;
    }
    update({ step: "approval_pending", txHash: approveHashB });
    try { await waitOrahTx(approveHashB, rpc); }
    catch (err: any) { update({ step: "error", txHash: approveHashB, error: err?.message ?? "Approval failed." }); return; }
  }

  update({ step: "depositing" });
  const calldata = encodeFunctionData({
    abi: ORAH_ROUTER_ABI,
    functionName: "addLiquidity",
    args: [
      tokenAAddr as `0x${string}`, tokenBAddr as `0x${string}`,
      baseWei, quoteWei, baseMin, quoteMin,
      address as `0x${string}`, deadline,
    ],
  });

  let txHash: string;
  try {
    txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: router, data: calldata }],
    });
  } catch (err: any) {
    update({ step: "error", error: err?.code === 4001 ? "Transaction rejected." : (err?.message ?? "Transaction failed.") });
    return;
  }

  update({ step: "deposit_pending", txHash });
  try {
    await waitOrahTx(txHash, rpc);
  } catch (err: any) {
    update({ step: "error", txHash, error: err?.message ?? "Deposit transaction failed." });
    return;
  }

  if (!pairAddress) {
    pairAddress = await getOrahPairAddress(rpc, amm.factory, tokenAAddr, tokenBAddr);
  }

  const valueUsd = amountA * (SPOT_PRICES[base.toUpperCase()] ?? 1) + amountB * (SPOT_PRICES[quote.toUpperCase()] ?? 1);
  const lpTokens = valueUsd / 12.5;
  update({ step: "success", txHash, lpTokens, valueUsd, lpTokenAddress: pairAddress });
}

// ─── removeLiquidityOrahAmm ──────────────────────────────────────────────────

export interface RemoveLiquidityOrahAmmParams {
  base:            string;
  quote:           string;
  pct:             number;          // 1–100
  address:         string;
  chainId:         number;
  lpTokenAddress?: string;          // pair contract address if already stored
  /** Slippage tolerance in basis points (50 = 0.5%). Defaults to 50 bps. */
  slippageBps?:    number;
  onStatus:        (s: LiquidityTxStatus) => void;
}

/**
 * Remove liquidity via OrahRouter02.
 * Reads the user's on-chain LP balance, approves the pair LP token to the router,
 * then calls removeLiquidity or removeLiquidityETH.
 */
export async function removeLiquidityOrahAmm(
  params: RemoveLiquidityOrahAmmParams,
): Promise<void> {
  const { base, quote, pct, address, chainId, lpTokenAddress: knownPair, onStatus } = params;
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const update = (s: LiquidityTxStatus) => onStatus(s);

  const amm = getOrahAmm(chainId);
  if (!amm) {
    update({ step: "error", error: "OrahDEX AMM not deployed on this chain." });
    return;
  }

  const eth = (window as any).ethereum;
  if (!eth) {
    update({ step: "error", error: "No injected wallet found." });
    return;
  }

  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) {
    update({ step: "error", error: `No RPC URL for chain ${chainId}.` });
    return;
  }

  const tokens     = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};
  const isETHBase  = base.toUpperCase()  === "ETH";
  const isETHQuote = quote.toUpperCase() === "ETH";
  const baseKey    = isETHBase  ? "WETH" : base.toUpperCase()  === "BTC" ? "WBTC" : base.toUpperCase();
  const quoteKey   = isETHQuote ? "WETH" : quote.toUpperCase() === "BTC" ? "WBTC" : quote.toUpperCase();
  const tokenAAddr = (tokens[baseKey]  ?? amm.weth) as string;
  const tokenBAddr = (tokens[quoteKey] ?? amm.weth) as string;
  const router     = amm.router;
  const deadline   = BigInt(Math.floor(Date.now() / 1000) + 1800);

  update({ step: "checking" });

  // ── Resolve pair address ───────────────────────────────────────────────────
  let pairAddress = knownPair;
  if (!pairAddress) {
    pairAddress = await getOrahPairAddress(rpc, amm.factory, tokenAAddr, tokenBAddr);
  }

  if (!pairAddress) {
    update({ step: "error", error: `Pool ${base}/${quote} not found on-chain. Add liquidity first.` });
    return;
  }

  // ── Read LP balance ────────────────────────────────────────────────────────
  const balanceData = "0x70a08231" + padAddr(address);
  const balanceRaw  = await ethCallRaw(rpc, pairAddress, balanceData);
  const lpBalance   = balanceRaw && balanceRaw !== "0x" ? BigInt(balanceRaw) : 0n;

  if (lpBalance === 0n) {
    update({ step: "error", error: "No LP tokens found in wallet for this pair." });
    return;
  }

  const liquidity = (lpBalance * BigInt(pct)) / 100n;
  if (liquidity === 0n) {
    update({ step: "error", error: "Remove amount too small." });
    return;
  }

  // ── Approve LP tokens to router ───────────────────────────────────────────
  const lpAllowanceData = "0xdd62ed3e" + padAddr(address) + padAddr(router);
  const lpAllowanceRaw  = await ethCallRaw(rpc, pairAddress, lpAllowanceData);
  const lpAllowance     = lpAllowanceRaw && lpAllowanceRaw !== "0x" ? BigInt(lpAllowanceRaw) : 0n;

  if (lpAllowance < liquidity) {
    update({ step: "approving" });
    const approveData = "0x095ea7b3" + padAddr(router) + "f".repeat(64);
    let approveHash: string;
    try {
      approveHash = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: pairAddress, data: approveData }],
      });
    } catch (err: any) {
      update({ step: "error", error: err?.code === 4001 ? "Approval rejected." : (err?.message ?? "Approval failed.") });
      return;
    }
    update({ step: "approval_pending", txHash: approveHash });
    try { await waitOrahTx(approveHash, rpc); }
    catch (err: any) { update({ step: "error", txHash: approveHash, error: err?.message ?? "LP approval failed." }); return; }
  }

  // ── Call removeLiquidity / removeLiquidityETH ──────────────────────────────
  update({ step: "depositing" });

  const hasETH = isETHBase || isETHQuote;
  let calldata: string;

  // ── Read reserves + token0 so we can map mins to router argument order ──
  // OrahPair.getReserves() → (uint112 reserve0, uint112 reserve1, uint32 ts)
  // OrahPair.token0()      → address (lower of the two sorted tokens)
  // We need to map reserve0/reserve1 onto whichever token is named first in
  // the router call so amountAMin/amountBMin (or amountTokenMin/amountETHMin
  // for the ETH branch) are not transposed — a transposed min can revert a
  // valid withdrawal when reserves are skewed.
  const reservesData    = "0x0902f1ac";
  const totalSupplyData = "0x18160ddd";
  const token0Data      = "0x0dfe1681";
  const [reservesRaw, totalSupplyRaw, token0Raw] = await Promise.all([
    ethCallRaw(rpc, pairAddress, reservesData),
    ethCallRaw(rpc, pairAddress, totalSupplyData),
    ethCallRaw(rpc, pairAddress, token0Data),
  ]);

  let amountAMinPair = 0n;
  let amountBMinPair = 0n;
  if (
    reservesRaw && reservesRaw.length >= 194 &&
    totalSupplyRaw && totalSupplyRaw !== "0x" &&
    token0Raw && token0Raw !== "0x"
  ) {
    const clean    = reservesRaw.replace("0x", "");
    const reserve0 = BigInt("0x" + clean.slice(0, 64));
    const reserve1 = BigInt("0x" + clean.slice(64, 128));
    const totalSupply = BigInt(totalSupplyRaw);

    // token0Raw is a 32-byte ABI word; the address is its low 20 bytes.
    const token0Addr = ("0x" + token0Raw.slice(-40)).toLowerCase();

    // Decide which router arg position the user's "first" token (tokenAAddr,
    // or for the ETH branch, the ERC-20 token) is in, then map reserves
    // accordingly.
    let firstArgAddr: string;
    if (hasETH) {
      // Router arg order: (token, liquidity, amountTokenMin, amountETHMin, ...)
      firstArgAddr = (isETHBase ? tokens[quoteKey] : tokens[baseKey]) ?? tokenBAddr;
    } else {
      // Router arg order: (tokenA, tokenB, liquidity, amountAMin, amountBMin, ...)
      firstArgAddr = tokenAAddr;
    }

    if (totalSupply > 0n) {
      const expected0 = (liquidity * reserve0) / totalSupply;
      const expected1 = (liquidity * reserve1) / totalSupply;

      const firstIsToken0 = firstArgAddr.toLowerCase() === token0Addr;
      const expectedFirst  = firstIsToken0 ? expected0 : expected1;
      const expectedSecond = firstIsToken0 ? expected1 : expected0;

      amountAMinPair = applySlippage(expectedFirst,  slippageBps);
      amountBMinPair = applySlippage(expectedSecond, slippageBps);
    }
  }

  if (hasETH) {
    const erc20Addr = (isETHBase ? tokens[quoteKey] : tokens[baseKey]) ?? tokenBAddr;
    calldata = encodeFunctionData({
      abi: ORAH_ROUTER_ABI,
      functionName: "removeLiquidityETH",
      args: [
        erc20Addr as `0x${string}`,
        liquidity,
        amountAMinPair,    // amountTokenMin (mapped to ERC-20 token via token0 check)
        amountBMinPair,    // amountETHMin
        address as `0x${string}`,
        deadline,
      ],
    });
  } else {
    calldata = encodeFunctionData({
      abi: ORAH_ROUTER_ABI,
      functionName: "removeLiquidity",
      args: [
        tokenAAddr as `0x${string}`, tokenBAddr as `0x${string}`,
        liquidity,
        amountAMinPair,    // amountAMin → tokenA (token-order safe via token0 check)
        amountBMinPair,    // amountBMin → tokenB
        address as `0x${string}`, deadline,
      ],
    });
  }

  let txHash: string;
  try {
    txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: router, data: calldata }],
    });
  } catch (err: any) {
    update({ step: "error", error: err?.code === 4001 ? "Transaction rejected." : (err?.message ?? "Transaction failed.") });
    return;
  }

  update({ step: "deposit_pending", txHash });
  try { await waitOrahTx(txHash, rpc); }
  catch (err: any) { update({ step: "error", txHash, error: err?.message ?? "Remove transaction failed." }); return; }
  update({ step: "success", txHash });
}
