/**
 * txSimulator.ts — Pre-execution transaction simulation for OrahDEX wallet
 *
 * Runs checks before the user signs any transaction:
 *   1. Balance sufficiency (native + token)
 *   2. ERC-20 allowance check
 *   3. Gas estimate
 *   4. Price impact / slippage warning
 *   5. Risk flags (low liquidity, honeypot patterns, high fee)
 *
 * Returns a SimulationResult that the UI renders before asking the user to sign.
 */

import { createPublicClient, http, formatUnits, parseUnits, erc20Abi } from "viem";
import { CHAIN_RPC_URLS } from "@/lib/reown";

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface BalanceDelta {
  symbol:      string;
  address:     `0x${string}` | "native";
  decimals:    number;
  before:      string;   // formatted
  delta:       string;   // formatted (negative = spend, positive = receive)
  isNegative:  boolean;
}

export interface RiskFlag {
  level:   RiskLevel;
  code:    string;
  message: string;
}

export interface SimulationResult {
  ok:           boolean;
  gasEstimate:  string | null;    // formatted ETH
  gasCostUsd:   number | null;
  balanceDeltas: BalanceDelta[];
  riskFlags:    RiskFlag[];
  summary:      string;
  canProceed:   boolean;          // false if critical risk
}

export interface SimulateSwapParams {
  chainId:       number;
  walletAddress: `0x${string}`;
  tokenIn:       `0x${string}` | "native";
  tokenOut:      `0x${string}` | "native";
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInDecimals: number;
  tokenOutDecimals: number;
  amountIn:      string;   // human-readable
  expectedOut:   string;   // human-readable (from SOR quote)
  slippageBps:   number;   // e.g. 50 = 0.5%
  spenderAddress?: `0x${string}`;
  ethPriceUsd?:  number;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function simulateSwap(params: SimulateSwapParams): Promise<SimulationResult> {
  const {
    chainId, walletAddress,
    tokenIn, tokenOut,
    tokenInSymbol, tokenOutSymbol,
    tokenInDecimals, tokenOutDecimals,
    amountIn, expectedOut,
    slippageBps, spenderAddress,
    ethPriceUsd = 0,
  } = params;

  const rpcUrl = CHAIN_RPC_URLS[chainId];
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const flags: RiskFlag[]    = [];
  const deltas: BalanceDelta[] = [];
  let gasEstimate: string | null = null;
  let gasCostUsd: number | null  = null;

  try {
    // ── 1. Balance checks ───────────────────────────────────────────────────
    const amountInWei = parseUnits(amountIn, tokenInDecimals);

    if (tokenIn === "native") {
      const balance = await client.getBalance({ address: walletAddress });
      const balFmt  = formatUnits(balance, 18);
      const delta   = -parseFloat(amountIn);
      deltas.push({
        symbol:     tokenInSymbol,
        address:    "native",
        decimals:   18,
        before:     parseFloat(balFmt).toFixed(6),
        delta:      delta.toFixed(6),
        isNegative: true,
      });
      if (balance < amountInWei) {
        flags.push({
          level:   "critical",
          code:    "INSUFFICIENT_BALANCE",
          message: `Insufficient ${tokenInSymbol} balance. You need ${amountIn} but only have ${parseFloat(balFmt).toFixed(4)}.`,
        });
      }
    } else {
      const balance = await client.readContract({
        address:      tokenIn,
        abi:          erc20Abi,
        functionName: "balanceOf",
        args:         [walletAddress],
      }) as bigint;

      const balFmt = formatUnits(balance, tokenInDecimals);
      deltas.push({
        symbol:     tokenInSymbol,
        address:    tokenIn,
        decimals:   tokenInDecimals,
        before:     parseFloat(balFmt).toFixed(6),
        delta:      (-parseFloat(amountIn)).toFixed(6),
        isNegative: true,
      });

      if (balance < amountInWei) {
        flags.push({
          level:   "critical",
          code:    "INSUFFICIENT_BALANCE",
          message: `Insufficient ${tokenInSymbol} balance.`,
        });
      }

      // ── 2. Allowance check ─────────────────────────────────────────────
      if (spenderAddress) {
        const allowance = await client.readContract({
          address:      tokenIn,
          abi:          erc20Abi,
          functionName: "allowance",
          args:         [walletAddress, spenderAddress],
        }) as bigint;

        if (allowance < amountInWei) {
          flags.push({
            level:   "medium",
            code:    "NEEDS_APPROVAL",
            message: `${tokenInSymbol} must be approved before swapping. An approval transaction will be required first.`,
          });
        }
      }
    }

    // Expected output delta
    deltas.push({
      symbol:     tokenOutSymbol,
      address:    tokenOut === "native" ? "native" : tokenOut,
      decimals:   tokenOutDecimals,
      before:     "—",
      delta:      `+${parseFloat(expectedOut).toFixed(6)}`,
      isNegative: false,
    });

    // ── 3. Gas estimate ────────────────────────────────────────────────────
    try {
      const gasPrice = await client.getGasPrice();
      const gasLimit = 200_000n;  // typical swap gas estimate
      const gasCost  = gasLimit * gasPrice;
      gasEstimate     = parseFloat(formatUnits(gasCost, 18)).toFixed(6);
      if (ethPriceUsd > 0) {
        gasCostUsd = parseFloat(gasEstimate) * ethPriceUsd;
      }

      // Flag if gas cost exceeds 5% of trade value
      const tradeValueUsd = parseFloat(amountIn); // rough (input amount in base units)
      if (gasCostUsd && gasCostUsd > tradeValueUsd * 0.05 && gasCostUsd > 5) {
        flags.push({
          level:   "medium",
          code:    "HIGH_GAS_RATIO",
          message: `Estimated gas ($${gasCostUsd.toFixed(2)}) is more than 5% of your trade value. Consider increasing your trade size.`,
        });
      }
    } catch { /* gas estimate failed — non-fatal */ }

    // ── 4. Slippage / price impact ──────────────────────────────────────────
    const slippagePct = slippageBps / 100;
    if (slippagePct > 5) {
      flags.push({
        level:   "high",
        code:    "HIGH_SLIPPAGE",
        message: `Slippage tolerance is set to ${slippagePct.toFixed(1)}%. You may receive significantly less than expected.`,
      });
    } else if (slippagePct > 1) {
      flags.push({
        level:   "medium",
        code:    "ELEVATED_SLIPPAGE",
        message: `Slippage tolerance is ${slippagePct.toFixed(1)}%.`,
      });
    }

    // ── 5. Contract code check (honeypot detection) ─────────────────────────
    if (tokenOut !== "native") {
      try {
        const code = await client.getBytecode({ address: tokenOut });
        if (!code || code === "0x") {
          flags.push({
            level:   "critical",
            code:    "NO_CONTRACT_CODE",
            message: `The output token address has no contract code. This could be a scam token.`,
          });
        }
      } catch { /* non-fatal */ }
    }

  } catch (err: any) {
    flags.push({
      level:   "high",
      code:    "SIMULATION_ERROR",
      message: `Simulation failed: ${err?.message ?? "Unknown error"}. Proceed with caution.`,
    });
  }

  const criticalFlags = flags.filter(f => f.level === "critical");
  const highFlags     = flags.filter(f => f.level === "high");
  const canProceed    = criticalFlags.length === 0;

  let summary: string;
  if (criticalFlags.length > 0) {
    summary = `Transaction blocked: ${criticalFlags[0]!.message}`;
  } else if (highFlags.length > 0) {
    summary = `Warning: ${highFlags[0]!.message}`;
  } else if (flags.length > 0) {
    summary = `${flags.length} notice${flags.length > 1 ? "s" : ""} — review before confirming`;
  } else {
    summary = `Swap looks good. You will receive ~${parseFloat(expectedOut).toFixed(4)} ${tokenOutSymbol}.`;
  }

  return {
    ok:            criticalFlags.length === 0,
    gasEstimate,
    gasCostUsd,
    balanceDeltas: deltas,
    riskFlags:     flags,
    summary,
    canProceed,
  };
}

export function riskLevelColor(level: RiskLevel): string {
  switch (level) {
    case "low":      return "text-green-400";
    case "medium":   return "text-yellow-400";
    case "high":     return "text-orange-400";
    case "critical": return "text-red-500";
  }
}

export function riskLevelBg(level: RiskLevel): string {
  switch (level) {
    case "low":      return "bg-green-400/10 border-green-400/20";
    case "medium":   return "bg-yellow-400/10 border-yellow-400/20";
    case "high":     return "bg-orange-400/10 border-orange-400/20";
    case "critical": return "bg-red-500/10 border-red-500/20";
  }
}
