/**
 * useLpBalance — reads the user's OrahDEX LP token balance on-chain.
 *
 * Workflow:
 *   1. Call OrahFactory.getPair(tokenA, tokenB) → pair address
 *   2. Call OrahPair.balanceOf(userAddress)      → raw LP balance (wei)
 *   3. Call OrahPair.totalSupply()               → total LP supply (wei)
 *   4. Call OrahPair.getReserves()               → reserve0, reserve1
 *   5. Derive the user's share of pool value in USD
 *
 * Returns null values while loading or when AMM is not deployed on chain.
 * Polls every POLL_INTERVAL_MS milliseconds while the component is mounted.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getOrahAmm, ORAH_FACTORY_ABI, ORAH_PAIR_ABI } from "@/lib/orahAmmAddresses";
import { CHAIN_TOKEN_ADDRESSES, TOKEN_DECIMALS } from "@/lib/onChainLiquidity";

const POLL_INTERVAL_MS = 30_000;
const ZERO_ADDRESS     = "0x0000000000000000000000000000000000000000";
const LP_DECIMALS      = 18;

export interface LpBalanceResult {
  /** Raw LP token balance as a decimal number (e.g. 1.234567...) */
  lpBalance:    number | null;
  /** User's proportional share of the pool (0–1) */
  poolShare:    number | null;
  /** Estimated USD value of the position */
  valueUsd:     number | null;
  /** Address of the LP token contract (= pair address) */
  pairAddress:  string | null;
  /** True while the first fetch is still loading */
  loading:      boolean;
  /** Error message if something failed */
  error:        string | null;
  /** Manually re-trigger a refresh */
  refresh:      () => void;
}

/** Spot prices for USD valuation — kept in sync with Liquidity.tsx SPOT map */
const SPOT_PRICES: Record<string, number> = {
  BTC: 83_000, ETH: 1_800, SOL: 130, BSV: 55,
  BNB: 580, XRP: 0.52, ADA: 0.44, DOGE: 0.12,
  DOT: 6.8, LINK: 14.5, USDT: 1, USDC: 1,
  WETH: 1_800, WBTC: 83_000,
};

/** Minimal JSON-RPC call — works with any public EVM RPC without extra deps */
async function ethCall(
  rpcUrl: string,
  to: string,
  data: string,
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "eth_call failed");
  return json.result as string;
}

/** ABI-encode a call to a function that takes two address args */
function encodeGetPair(tokenA: string, tokenB: string): string {
  // getPair(address,address) selector = keccak256("getPair(address,address)")[0:4]
  const selector = "e6a43905";
  const padAddr  = (a: string) => a.replace("0x", "").toLowerCase().padStart(64, "0");
  return "0x" + selector + padAddr(tokenA) + padAddr(tokenB);
}

/** ABI-encode balanceOf(address) */
function encodeBalanceOf(account: string): string {
  const selector = "70a08231";
  return "0x" + selector + account.replace("0x", "").toLowerCase().padStart(64, "0");
}

/** ABI-encode totalSupply() */
function encodeTotalSupply(): string { return "0x18160ddd"; }

/** ABI-encode getReserves() */
function encodeGetReserves(): string { return "0x0902f1ac"; }

/** ABI-encode token0() */
function encodeToken0(): string { return "0x0dfe1681"; }

/** Decode a uint256 from an eth_call result (hex string) */
function decodeUint256(hex: string): bigint {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex.slice(0, 2) === "0x" ? hex : "0x" + hex);
}

/** Decode an address from an eth_call result (last 20 bytes of 32-byte word) */
function decodeAddress(hex: string): string {
  if (!hex || hex.length < 42) return ZERO_ADDRESS;
  const clean = hex.replace("0x", "");
  return "0x" + clean.slice(-40);
}

/**
 * Convert a wei bigint to a decimal number safely for amounts that may exceed
 * 2^53. Splits into integer + fractional parts so neither overflows JS Number
 * precision. The result is a best-effort double; for exact display use string
 * formatting instead.
 */
function fromWei(raw: bigint, decimals: number): number {
  if (raw === 0n) return 0;
  const denom = 10n ** BigInt(decimals);
  const whole = raw / denom;
  const frac  = raw % denom;
  return Number(whole) + Number(frac) / Number(denom);
}

/** Resolve a pool's token symbols to contract addresses on the given chain */
function resolveTokenAddresses(
  chainId: number,
  base: string,
  quote: string,
): { tokenA: string | null; tokenB: string | null } {
  const tokens = CHAIN_TOKEN_ADDRESSES[chainId] ?? {};

  const baseKey  = base.toUpperCase()  === "ETH" ? "WETH"
                 : base.toUpperCase()  === "BTC"  ? "WBTC"
                 : base.toUpperCase();
  const quoteKey = quote.toUpperCase() === "ETH" ? "WETH"
                 : quote.toUpperCase() === "BTC"  ? "WBTC"
                 : quote.toUpperCase();

  return {
    tokenA: tokens[baseKey]  ?? null,
    tokenB: tokens[quoteKey] ?? null,
  };
}

/** Get the public RPC for a chain (used only for read-only calls here) */
const CHAIN_RPCS: Record<number, string> = {
  1:        "https://ethereum-rpc.publicnode.com",
  8453:     "https://mainnet.base.org",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532:    "https://sepolia.base.org",
};

export function useLpBalance(
  userAddress: string | null,
  chainId: number | null,
  base: string,
  quote: string,
): LpBalanceResult {
  const [lpBalance,   setLpBalance]   = useState<number | null>(null);
  const [poolShare,   setPoolShare]   = useState<number | null>(null);
  const [valueUsd,    setValueUsd]    = useState<number | null>(null);
  const [pairAddress, setPairAddress] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!userAddress || !chainId) {
      setLpBalance(null); setPoolShare(null); setValueUsd(null);
      setPairAddress(null); setError(null); setLoading(false);
      return;
    }

    const amm = getOrahAmm(chainId);
    if (!amm) {
      // AMM not deployed on this chain — nothing to show
      setLpBalance(null); setPoolShare(null); setValueUsd(null);
      setPairAddress(null); setError(null); setLoading(false);
      return;
    }

    const rpc = CHAIN_RPCS[chainId];
    if (!rpc) {
      setError(`No RPC configured for chainId ${chainId}`);
      return;
    }

    const { tokenA, tokenB } = resolveTokenAddresses(chainId, base, quote);
    if (!tokenA || !tokenB) {
      setError(`Token pair ${base}/${quote} not supported on chain ${chainId}`);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      // 1. Get pair address from factory
      const pairHex = await ethCall(rpc, amm.factory, encodeGetPair(tokenA, tokenB));
      const pair    = decodeAddress(pairHex);

      if (pair === ZERO_ADDRESS || pair.toLowerCase() === ZERO_ADDRESS) {
        // Pair doesn't exist yet — balance is zero
        setLpBalance(0); setPoolShare(0); setValueUsd(0);
        setPairAddress(null); setLoading(false);
        return;
      }

      setPairAddress(pair);

      // 2. Fetch balanceOf, totalSupply, getReserves, token0 in parallel
      const [balHex, supplyHex, reservesHex, token0Hex] = await Promise.all([
        ethCall(rpc, pair, encodeBalanceOf(userAddress)),
        ethCall(rpc, pair, encodeTotalSupply()),
        ethCall(rpc, pair, encodeGetReserves()),
        ethCall(rpc, pair, encodeToken0()),
      ]);

      const rawBalance     = decodeUint256(balHex);
      const rawTotalSupply = decodeUint256(supplyHex);

      // getReserves returns (uint112 reserve0, uint112 reserve1, uint32 ts)
      // packed into 3 × 32-byte slots
      const clean    = reservesHex.replace("0x", "");
      const reserve0 = BigInt("0x" + clean.slice(0, 64));
      const reserve1 = BigInt("0x" + clean.slice(64, 128));

      // token0 determines which reserve belongs to which token
      const t0 = decodeAddress(token0Hex).toLowerCase();
      const isToken0Base = t0 === tokenA.toLowerCase();

      const baseDecimals  = TOKEN_DECIMALS[base.toUpperCase()]  ?? 18;
      const quoteDecimals = TOKEN_DECIMALS[quote.toUpperCase()] ?? 6;

      const baseReserve  = fromWei(isToken0Base ? reserve0 : reserve1, baseDecimals);
      const quoteReserve = fromWei(isToken0Base ? reserve1 : reserve0, quoteDecimals);

      const lpBal   = fromWei(rawBalance,     LP_DECIMALS);
      const lpTotal = fromWei(rawTotalSupply, LP_DECIMALS);

      // Compute pool share with bigint math to avoid Number(bigint) precision
      // loss for large LP totals (>2^53). Use a 1e18 fixed-point ratio.
      const SCALE = 1_000_000_000_000_000_000n;
      const shareScaled = rawTotalSupply > 0n
        ? Number((rawBalance * SCALE) / rawTotalSupply) / 1e18
        : 0;
      const share = shareScaled;

      const basePrice  = SPOT_PRICES[base.toUpperCase()]  ?? 0;
      const quotePrice = SPOT_PRICES[quote.toUpperCase()] ?? 0;
      const poolTvl    = baseReserve * basePrice + quoteReserve * quotePrice;
      const usd        = share * poolTvl;
      void lpBal; void lpTotal;

      setLpBalance(fromWei(rawBalance, LP_DECIMALS));
      setPoolShare(share);
      setValueUsd(usd);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message ?? "Failed to fetch LP balance");
      }
    } finally {
      setLoading(false);
    }
  }, [userAddress, chainId, base, quote]);

  // Initial fetch
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Polling
  useEffect(() => {
    const id = setInterval(fetchBalance, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchBalance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  return { lpBalance, poolShare, valueUsd, pairAddress, loading, error, refresh: fetchBalance };
}
