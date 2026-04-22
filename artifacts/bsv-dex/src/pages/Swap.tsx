/**
 * Swap.tsx — Hybrid DEX Swap
 *
 * MODE 1: "On-Chain DEX" — wallet signs real Uniswap V3 / PancakeSwap V3 swaps.
 *   - Real quotes via QuoterV2 (static simulation, no gas)
 *   - Real execution via SwapRouter02 (wallet signs, non-custodial)
 *   - Chains: Ethereum, Base, BSC, Arbitrum, Optimism, Polygon, Avalanche
 *
 * MODE 2: "Exchange" — custodial internal order matching (existing system).
 *   - Fast, no gas, uses OrahDEX internal ledger balances
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowUpDown, Settings2, ChevronDown, Loader2,
  Zap, ExternalLink, AlertTriangle, CheckCircle2,
  RefreshCw, ArrowRight, Info, Wallet, X, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CoinLogo } from "@/components/CoinLogo";
import { ALL_SPOT_MOCK } from "@/lib/mock-data";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { Account } from "viem";
import { writeContract as coreWriteContract } from "@wagmi/core";
import { getWagmiConfig, CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS } from "@/lib/reown";
import { checkAllowance, pollTxReceipt } from "@/lib/reown";
import { getViemAccountForOrahWallet } from "@/lib/passkeyWallet";
import { Fingerprint } from "lucide-react";
import { useEvmBalances } from "@/hooks/useEvmBalances";
import { API_BASE } from "@/lib/api";

// ─── Chain config ────────────────────────────────────────────────────────────

const DEX_CHAINS = [
  { id: 1,     name: "Ethereum", nativeSymbol: "ETH",  logo: "ETH",   explorer: "https://etherscan.io/tx/",         color: "#627EEA" },
  { id: 8453,  name: "Base",     nativeSymbol: "ETH",  logo: "ETH",   explorer: "https://basescan.org/tx/",         color: "#0052FF" },
  { id: 56,    name: "BSC",      nativeSymbol: "BNB",  logo: "BNB",   explorer: "https://bscscan.com/tx/",          color: "#F0B90B" },
  { id: 42161, name: "Arbitrum", nativeSymbol: "ETH",  logo: "ETH",   explorer: "https://arbiscan.io/tx/",          color: "#28A0F0" },
  { id: 10,    name: "Optimism", nativeSymbol: "ETH",  logo: "ETH",   explorer: "https://optimistic.etherscan.io/tx/", color: "#FF0420" },
  { id: 137,   name: "Polygon",  nativeSymbol: "POL",  logo: "MATIC", explorer: "https://polygonscan.com/tx/",      color: "#8247E5" },
  { id: 43114, name: "Avalanche",nativeSymbol: "AVAX", logo: "AVAX",  explorer: "https://snowtrace.io/tx/",         color: "#E84142" },
] as const;

type SupportedChainId = 1 | 8453 | 56 | 42161 | 10 | 137 | 43114;

// ─── Token list ───────────────────────────────────────────────────────────────

interface Token {
  symbol:    string;
  name:      string;
  decimals:  number;
  address:   `0x${string}`;
  isNative?: boolean;
  logo?:     string;
}

const NATIVE_PLACEHOLDER = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as `0x${string}`;

const TOKENS: Record<SupportedChainId, Token[]> = {
  1: [
    { symbol: "ETH",  name: "Ethereum",         decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC", name: "USD Coin",          decimals: 6,  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { symbol: "USDT", name: "Tether",            decimals: 6,  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    { symbol: "WBTC", name: "Wrapped Bitcoin",   decimals: 8,  address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" },
    { symbol: "DAI",  name: "Dai",               decimals: 18, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
    { symbol: "LINK", name: "Chainlink",         decimals: 18, address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" },
    { symbol: "UNI",  name: "Uniswap",           decimals: 18, address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" },
    { symbol: "AAVE", name: "Aave",              decimals: 18, address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" },
    { symbol: "MKR",  name: "Maker",             decimals: 18, address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" },
    { symbol: "CRV",  name: "Curve DAO",         decimals: 18, address: "0xD533a949740bb3306d119CC777fa900bA034cd52" },
  ],
  8453: [
    { symbol: "ETH",   name: "Ethereum",   decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC",  name: "USD Coin",   decimals: 6,  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { symbol: "USDT",  name: "Tether",     decimals: 6,  address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" },
    { symbol: "WBTC",  name: "WBTC",       decimals: 8,  address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" },
    { symbol: "DAI",   name: "Dai",        decimals: 18, address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" },
    { symbol: "DEGEN", name: "Degen",      decimals: 18, address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" },
    { symbol: "BRETT", name: "Brett",      decimals: 18, address: "0x532f27101965dd16442E59d40670FaF5eBB142E4" },
    { symbol: "TOSHI", name: "Toshi",      decimals: 18, address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4" },
  ],
  56: [
    { symbol: "BNB",  name: "BNB",              decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDT", name: "Tether",           decimals: 18, address: "0x55d398326f99059fF775485246999027B3197955" },
    { symbol: "USDC", name: "USD Coin",         decimals: 18, address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
    { symbol: "BTCB", name: "Bitcoin BEP-20",   decimals: 18, address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c" },
    { symbol: "ETH",  name: "Ethereum BEP-20",  decimals: 18, address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8" },
    { symbol: "CAKE", name: "PancakeSwap",      decimals: 18, address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" },
    { symbol: "XVS",  name: "Venus",            decimals: 18, address: "0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63" },
    { symbol: "ADA",  name: "Cardano BEP-20",   decimals: 18, address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47" },
  ],
  42161: [
    { symbol: "ETH",  name: "Ethereum",       decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC", name: "USD Coin",        decimals: 6,  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    { symbol: "USDT", name: "Tether",          decimals: 6,  address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8,  address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" },
    { symbol: "ARB",  name: "Arbitrum",        decimals: 18, address: "0x912CE59144191C1204E64559FE8253a0e49E6548" },
    { symbol: "DAI",  name: "Dai",             decimals: 18, address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
    { symbol: "LINK", name: "Chainlink",       decimals: 18, address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4" },
    { symbol: "GMX",  name: "GMX",             decimals: 18, address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" },
  ],
  10: [
    { symbol: "ETH",  name: "Ethereum",       decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC", name: "USD Coin",        decimals: 6,  address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
    { symbol: "USDT", name: "Tether",          decimals: 6,  address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8,  address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095" },
    { symbol: "DAI",  name: "Dai",             decimals: 18, address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1" },
    { symbol: "OP",   name: "Optimism",        decimals: 18, address: "0x4200000000000000000000000000000000000042" },
    { symbol: "LINK", name: "Chainlink",       decimals: 18, address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6" },
    { symbol: "SNX",  name: "Synthetix",       decimals: 18, address: "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4" },
  ],
  137: [
    { symbol: "POL",    name: "Polygon",           decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC.e", name: "USD Coin (Bridged)", decimals: 6,  address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" },
    { symbol: "USDC",   name: "USD Coin (Native)",  decimals: 6,  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    { symbol: "USDT",   name: "Tether",             decimals: 6,  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
    { symbol: "WBTC",   name: "Wrapped Bitcoin",    decimals: 8,  address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
    { symbol: "DAI",    name: "Dai",                decimals: 18, address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
    { symbol: "WETH",   name: "Wrapped ETH",        decimals: 18, address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
    { symbol: "LINK",   name: "Chainlink",          decimals: 18, address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39" },
    { symbol: "AAVE",   name: "Aave",               decimals: 18, address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B" },
  ],
  43114: [
    { symbol: "AVAX", name: "Avalanche",       decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC", name: "USD Coin",        decimals: 6,  address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6C" },
    { symbol: "USDT", name: "Tether",          decimals: 6,  address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7" },
    { symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8,  address: "0x50b7545627a5162F82A992c33b87aDc75187B218" },
    { symbol: "DAI",  name: "Dai",             decimals: 18, address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70" },
    { symbol: "JOE",  name: "Trader Joe",      decimals: 18, address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd" },
    { symbol: "QI",   name: "BENQI",           decimals: 18, address: "0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5" },
    { symbol: "GMX",  name: "GMX",             decimals: 18, address: "0x62edc0692BD897D2295872a9FFCac5425011c661" },
  ],
};

// ─── Contract addresses ───────────────────────────────────────────────────────

const QUOTER_V2: Record<SupportedChainId, `0x${string}`> = {
  1:     "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  8453:  "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  56:    "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  42161: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  10:    "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  137:   "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  43114: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
};

const SWAP_ROUTER: Record<SupportedChainId, `0x${string}`> = {
  1:     "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  8453:  "0x2626664c2603336E57B271c5C0b26F421741e481",
  56:    "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
  42161: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  10:    "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  137:   "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  43114: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
};

const WETH: Record<SupportedChainId, `0x${string}`> = {
  1:     "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  8453:  "0x4200000000000000000000000000000000000006",
  56:    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  10:    "0x4200000000000000000000000000000000000006",
  137:   "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  43114: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
};

const FEE_TIERS = [100, 500, 3000, 10000];

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const QUOTER_V2_ABI = [
  {
    inputs: [{ components: [
      { name: "tokenIn",          type: "address" },
      { name: "tokenOut",         type: "address" },
      { name: "amountIn",         type: "uint256" },
      { name: "fee",              type: "uint24"  },
      { name: "sqrtPriceLimitX96",type: "uint160" },
    ], name: "params", type: "tuple" }],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut",                type: "uint256" },
      { name: "sqrtPriceX96After",        type: "uint160" },
      { name: "initializedTicksCrossed",  type: "uint32"  },
      { name: "gasEstimate",              type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    inputs: [{ components: [
      { name: "tokenIn",          type: "address" },
      { name: "tokenOut",         type: "address" },
      { name: "fee",              type: "uint24"  },
      { name: "recipient",        type: "address" },
      { name: "amountIn",         type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "sqrtPriceLimitX96",type: "uint160" },
    ], name: "params", type: "tuple" }],
    name: "exactInputSingle",
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient",     type: "address" },
    ],
    name: "unwrapWETH9",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// ─── Quote helper ─────────────────────────────────────────────────────────────

interface QuoteResult {
  amountOut:   bigint;
  gasEstimate: bigint;
  fee:         number;
}

async function tryQuoteOnRpc(
  rpcUrl: string,
  quoterAddr: `0x${string}`,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
): Promise<QuoteResult | null> {
  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await publicClient.simulateContract({
        address:      quoterAddr,
        abi:          QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee: fee as 100|500|3000|10000, sqrtPriceLimitX96: 0n }],
      });
      if ((result as bigint[])[0] > 0n) {
        return { amountOut: (result as bigint[])[0], gasEstimate: (result as bigint[])[3], fee };
      }
    } catch {}
  }
  return null;
}

async function getSwapQuote(
  chainId: SupportedChainId,
  fromToken: Token,
  toToken: Token,
  amountIn: bigint,
): Promise<QuoteResult | null> {
  const quoterAddr = QUOTER_V2[chainId];
  const primaryRpc = CHAIN_RPC_URLS[chainId];
  if (!quoterAddr || !primaryRpc || amountIn === 0n) return null;

  const tokenIn  = fromToken.isNative ? WETH[chainId] : fromToken.address;
  const tokenOut = toToken.isNative   ? WETH[chainId] : toToken.address;

  // Try primary RPC first
  const primary = await tryQuoteOnRpc(primaryRpc, quoterAddr, tokenIn, tokenOut, amountIn);
  if (primary) return primary;

  // If primary returned nothing, try fallback RPC before giving up
  const fallbackRpc = CHAIN_RPC_FALLBACKS[chainId];
  if (fallbackRpc && fallbackRpc !== primaryRpc) {
    const fallback = await tryQuoteOnRpc(fallbackRpc, quoterAddr, tokenIn, tokenOut, amountIn);
    if (fallback) return fallback;
  }

  return null;
}

// ─── Swap executor ────────────────────────────────────────────────────────────

async function executeSwap(
  chainId: SupportedChainId,
  fromToken: Token,
  toToken: Token,
  amountIn: bigint,
  amountOutMin: bigint,
  fee: number,
  userAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const routerAddr = SWAP_ROUTER[chainId];
  const weth       = WETH[chainId];
  const config     = getWagmiConfig();
  const tokenIn    = fromToken.isNative ? weth : fromToken.address;
  const tokenOut   = toToken.isNative   ? weth : toToken.address;
  const isEthIn    = fromToken.isNative;
  const isEthOut   = toToken.isNative;

  if (!isEthIn) {
    const currentAllowance = await checkAllowance(fromToken.address, userAddress, routerAddr, chainId);
    if (currentAllowance < amountIn) {
      await coreWriteContract(config, {
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [routerAddr, maxUint256],
        chainId,
      });
    }
  }

  if (isEthOut) {
    const swapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: fee as 100|500|3000|10000, recipient: routerAddr, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
    });
    const unwrapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "unwrapWETH9",
      args: [amountOutMin, userAddress],
    });
    return await coreWriteContract(config, {
      address: routerAddr,
      abi: SWAP_ROUTER_ABI,
      functionName: "multicall",
      args: [[swapCalldata, unwrapCalldata]],
      value: isEthIn ? amountIn : 0n,
      chainId,
    });
  }

  return await coreWriteContract(config, {
    address: routerAddr,
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{ tokenIn, tokenOut, fee: fee as 100|500|3000|10000, recipient: userAddress, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
    value: isEthIn ? amountIn : 0n,
    chainId,
  });
}

// ─── Swap executor (Orah passkey wallet — uses local viem walletClient) ───────

async function executeSwapWithLocalAccount(
  chainId: SupportedChainId,
  fromToken: Token,
  toToken: Token,
  amountIn: bigint,
  amountOutMin: bigint,
  fee: number,
  userAddress: `0x${string}`,
  account: Account,
  chainName: string,
  nativeSymbol: string,
): Promise<`0x${string}`> {
  const routerAddr = SWAP_ROUTER[chainId];
  const weth       = WETH[chainId];
  const rpcUrl     = CHAIN_RPC_URLS[chainId];
  const tokenIn    = fromToken.isNative ? weth : fromToken.address;
  const tokenOut   = toToken.isNative   ? weth : toToken.address;
  const isEthIn    = fromToken.isNative;
  const isEthOut   = toToken.isNative;

  const chain = {
    id: chainId,
    name: chainName,
    nativeCurrency: { name: nativeSymbol, symbol: nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: chain as Parameters<typeof createWalletClient>[0]["chain"],
  });

  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  if (!isEthIn) {
    const currentAllowance = await checkAllowance(fromToken.address, userAddress, routerAddr, chainId);
    if (currentAllowance < amountIn) {
      const approveHash = await walletClient.writeContract({
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [routerAddr, maxUint256],
        chain: chain as Parameters<typeof createWalletClient>[0]["chain"],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  }

  if (isEthOut) {
    const swapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{ tokenIn, tokenOut, fee: fee as 100|500|3000|10000, recipient: routerAddr, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
    });
    const unwrapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "unwrapWETH9",
      args: [amountOutMin, userAddress],
    });
    return await walletClient.writeContract({
      address: routerAddr,
      abi: SWAP_ROUTER_ABI,
      functionName: "multicall",
      args: [[swapCalldata, unwrapCalldata]],
      value: amountIn,
      chain: chain as Parameters<typeof createWalletClient>[0]["chain"],
    });
  }

  return await walletClient.writeContract({
    address: routerAddr,
    abi: SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [{ tokenIn, tokenOut, fee: fee as 100|500|3000|10000, recipient: userAddress, amountIn, amountOutMinimum: amountOutMin, sqrtPriceLimitX96: 0n }],
    value: isEthIn ? amountIn : 0n,
    chain: chain as Parameters<typeof createWalletClient>[0]["chain"],
  });
}

// ─── Token picker ─────────────────────────────────────────────────────────────

function TokenPicker({
  tokens, selected, onChange, label,
}: {
  tokens: Token[]; selected: Token; onChange: (t: Token) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(search.toLowerCase()) ||
    t.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="relative">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 hover:bg-muted border border-border/40 transition-colors min-w-[120px]"
      >
        <CoinLogo symbol={selected.symbol} size={20} />
        <span className="font-bold text-sm">{selected.symbol}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-64 bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                placeholder="Search tokens…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map(t => (
              <button
                key={t.address}
                onClick={() => { onChange(t); setOpen(false); setSearch(""); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors",
                  selected.address === t.address && "bg-primary/5",
                )}
              >
                <CoinLogo symbol={t.symbol} size={24} />
                <div className="text-left">
                  <p className="text-sm font-semibold">{t.symbol}</p>
                  <p className="text-xs text-muted-foreground">{t.name}</p>
                </div>
                {selected.address === t.address && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gas Top-Up Panel (Rabby-style) ───────────────────────────────────────────

const GAS_PRESETS_USD = [2, 5, 10, 20];

function GasTopUpPanel({
  chainId, chainName, nativeSymbol, gasBalance, address, isOrahWallet, onSuccess, tokens,
}: {
  chainId: SupportedChainId;
  chainName: string;
  nativeSymbol: string;
  gasBalance: number | null;
  address: string | null;
  isOrahWallet: boolean;
  onSuccess: () => void;
  tokens: Token[];
}) {
  const [open, setOpen]           = useState(false);
  const [payWith, setPayWith]     = useState<"USDC" | "USDT">("USDC");
  const [presetUSD, setPresetUSD] = useState(5);
  const [nativePrice, setNativePrice] = useState<number | null>(null);
  const [gasQuote, setGasQuote]   = useState<QuoteResult | null>(null);
  const [quoting, setQuoting]     = useState(false);
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash]       = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const { toast }                 = useToast();

  const availableStables = tokens.filter(t => t.symbol === "USDC.e" || t.symbol === "USDC" || t.symbol === "USDT");
  const hasUsdc = availableStables.some(t => t.symbol === "USDC.e" || t.symbol === "USDC");
  const hasUsdt = availableStables.some(t => t.symbol === "USDT");

  const stablecoin = useMemo(() => {
    // Prefer USDC.e on Polygon (has the deepest Uniswap V3 liquidity), then USDC, then USDT
    const preferred = tokens.find(t => t.symbol === "USDC.e") ?? tokens.find(t => t.symbol === payWith);
    if (preferred) return preferred;
    return tokens.find(t => t.symbol === "USDC" || t.symbol === "USDT") ?? null;
  }, [tokens, payWith]);

  const nativeToken = useMemo(() => tokens.find(t => t.isNative) ?? null, [tokens]);

  useEffect(() => {
    if (!open || !stablecoin || !nativeToken) return;
    let cancelled = false;
    const run = async () => {
      setQuoting(true); setGasQuote(null); setError(null);
      try {
        const amtIn = parseUnits(presetUSD.toString(), stablecoin.decimals);
        const result = await getSwapQuote(chainId, stablecoin, nativeToken, amtIn);
        if (cancelled) return;
        if (result) {
          setGasQuote(result);
          const gotNative = parseFloat(formatUnits(result.amountOut, 18));
          if (gotNative > 0) setNativePrice(presetUSD / gotNative);
        } else {
          setError("No liquidity found for this pair on this chain");
        }
      } catch (e: any) { if (!cancelled) setError(e.message ?? "Quote failed"); }
      if (!cancelled) setQuoting(false);
    };
    run();
    return () => { cancelled = true; };
  }, [open, chainId, stablecoin, nativeToken, presetUSD]);

  const handleGetGas = async () => {
    if (!address || !gasQuote || !stablecoin || !nativeToken) return;
    setExecuting(true); setError(null); setTxHash(null); setTxSuccess(false);
    try {
      const amtIn     = parseUnits(presetUSD.toString(), stablecoin.decimals);
      const amtOutMin = gasQuote.amountOut * 95n / 100n;
      let hash: `0x${string}`;
      if (isOrahWallet) {
        toast({ title: "Biometric authentication", description: "Authenticate with your passkey to top up gas…" });
        const account = await getViemAccountForOrahWallet(address as `0x${string}`);
        hash = await executeSwapWithLocalAccount(chainId, stablecoin, nativeToken, amtIn, amtOutMin, gasQuote.fee, address as `0x${string}`, account, chainName, nativeSymbol);
      } else {
        hash = await executeSwap(chainId, stablecoin, nativeToken, amtIn, amtOutMin, gasQuote.fee, address as `0x${string}`);
      }
      setTxHash(hash);
      toast({ title: "Gas top-up sent", description: "Waiting for on-chain confirmation…" });
      await new Promise<void>((resolve, reject) => {
        pollTxReceipt(hash, chainId, {
          onReceipt: (r: any) => {
            const s = r?.status;
            (s === "0x1" || s === 1 || s === true) ? resolve() : reject(new Error("Transaction reverted"));
          },
          onTimeout: () => reject(new Error("Timed out waiting for confirmation")),
        });
      });
      setTxSuccess(true);
      const gotAmt = parseFloat(formatUnits(gasQuote.amountOut, 18));
      toast({ title: "Gas received!", description: `Got ${gotAmt.toFixed(5)} ${nativeSymbol} — you're ready to transact` });
      onSuccess();
    } catch (e: any) {
      const msg = e.shortMessage ?? e.message ?? "Failed";
      setError(msg);
      toast({ title: "Gas top-up failed", description: msg, variant: "destructive" });
    }
    setExecuting(false);
  };

  const gasLevel = gasBalance == null ? "empty"
    : gasBalance >= 0.01 ? "good"
    : gasBalance >= 0.003 ? "low"
    : gasBalance > 0 ? "critical"
    : "empty";

  const gasColors   = { good: "text-green-400",  low: "text-yellow-400", critical: "text-orange-400", empty: "text-red-400" } as const;
  const gasBarColor = { good: "bg-green-500",     low: "bg-yellow-500",  critical: "bg-orange-500",   empty: "bg-red-500"   } as const;
  const gasLabels   = { good: "Sufficient",       low: "Low",            critical: "Critical",         empty: "No gas"       } as const;

  const chainExplorer  = DEX_CHAINS.find(c => c.id === chainId)?.explorer ?? "";
  const estimatedGas   = gasQuote ? parseFloat(formatUnits(gasQuote.amountOut, 18)) : null;
  const dexName        = chainId === 56 ? "PancakeSwap" : "Uniswap";

  const pulseClass = gasLevel !== "good" ? "animate-pulse" : "";

  return (
    <div className="space-y-2">
      {/* Trigger pill */}
      <button
        onClick={() => { setOpen(o => !o); setTxHash(null); setTxSuccess(false); setError(null); }}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shrink-0",
          open
            ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
            : gasLevel !== "good"
              ? `bg-amber-500/10 border-amber-400/30 text-amber-400 ${pulseClass}`
              : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
        )}
      >
        ⛽ Get Gas
        {gasBalance != null && (
          <span className={cn("font-mono ml-1", gasColors[gasLevel])}>
            {gasBalance < 0.0001 && gasBalance > 0 ? gasBalance.toFixed(5) : gasBalance.toFixed(4)} {nativeSymbol}
          </span>
        )}
        {gasLevel !== "good" && gasLevel !== "empty" && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 ml-0.5 uppercase tracking-wide">
            {gasLabels[gasLevel]}
          </span>
        )}
        {gasLevel === "empty" && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 ml-0.5 uppercase tracking-wide">
            No Gas
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/5 to-transparent p-4 space-y-3.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">Gas Top-Up</span>
              {gasBalance != null && (
                <span className={cn("text-[11px] font-semibold flex items-center gap-1", gasColors[gasLevel])}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                  {gasLabels[gasLevel]}
                </span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Gas balance bar */}
          {gasBalance != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Your {nativeSymbol} balance</span>
                <span className={cn("font-mono font-semibold", gasColors[gasLevel])}>
                  {gasBalance.toFixed(5)} {nativeSymbol}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", gasBarColor[gasLevel])}
                  style={{ width: `${Math.min(100, (gasBalance / 0.05) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/60">
                <span>Empty</span>
                <span>0.01 recommended</span>
                <span>0.05+</span>
              </div>
            </div>
          )}

          {/* Pay with toggle */}
          {availableStables.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pay with:</span>
              {hasUsdc && (
                <button
                  onClick={() => setPayWith("USDC")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                    payWith === "USDC" ? "bg-primary/10 border-primary/30 text-primary" : "border-border/40 text-muted-foreground hover:border-border",
                  )}
                >
                  <CoinLogo symbol="USDC" size={12} /> USDC
                </button>
              )}
              {hasUsdt && (
                <button
                  onClick={() => setPayWith("USDT")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                    payWith === "USDT" ? "bg-primary/10 border-primary/30 text-primary" : "border-border/40 text-muted-foreground hover:border-border",
                  )}
                >
                  <CoinLogo symbol="USDT" size={12} /> USDT
                </button>
              )}
            </div>
          )}

          {/* Preset amount chips */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Gas amount (USD):</span>
            <div className="grid grid-cols-4 gap-2">
              {GAS_PRESETS_USD.map(usd => (
                <button
                  key={usd}
                  onClick={() => setPresetUSD(usd)}
                  className={cn(
                    "py-2 rounded-xl text-xs font-bold border transition-colors",
                    presetUSD === usd
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  ${usd}
                </button>
              ))}
            </div>
          </div>

          {/* Quote preview */}
          <div className="rounded-xl bg-muted/30 px-3 py-2.5 space-y-1.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>You pay</span>
              <span className="font-mono font-semibold text-foreground">${presetUSD} {stablecoin?.symbol ?? "USDC"}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>You receive (gas)</span>
              {quoting
                ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Quoting…</span>
                : estimatedGas != null
                  ? <span className="font-mono font-semibold text-amber-300">≈ {estimatedGas.toFixed(5)} {nativeSymbol}</span>
                  : <span className="text-muted-foreground/50">—</span>
              }
            </div>
            {nativePrice != null && (
              <div className="flex justify-between text-muted-foreground border-t border-border/30 pt-1.5 mt-0.5">
                <span>Market rate</span>
                <span className="font-mono">${nativePrice.toFixed(0)} / {nativeSymbol}</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* TX success */}
          {txHash && txSuccess && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Gas topped up!</span>
              <a href={`${chainExplorer}${txHash}`} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 hover:text-green-300">
                View <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* CTA */}
          {!address ? (
            <p className="text-xs text-center text-muted-foreground py-1">Connect wallet to top up gas</p>
          ) : !stablecoin ? (
            <p className="text-xs text-center text-muted-foreground py-1">No stablecoin available on this chain</p>
          ) : (
            <button
              onClick={handleGetGas}
              disabled={executing || quoting || !gasQuote}
              className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {executing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting gas…</>
                : quoting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Quoting…</>
                  : <>⛽ Get {estimatedGas != null ? estimatedGas.toFixed(5) : "…"} {nativeSymbol}</>
              }
            </button>
          )}

          <p className="text-[11px] text-muted-foreground/50 text-center">
            Swaps {stablecoin?.symbol ?? "USDC"} → {nativeSymbol} via {dexName} V3 on {chainName}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Slippage picker ──────────────────────────────────────────────────────────

function SlippageSettings({ slippage, onChange }: { slippage: number; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState("");
  const presets = [0.1, 0.5, 1.0];
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Slippage:</span>
      {presets.map(p => (
        <button
          key={p}
          onClick={() => { onChange(p); setCustom(""); }}
          className={cn(
            "text-xs px-2 py-0.5 rounded-lg border transition-colors",
            slippage === p
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-border/40 text-muted-foreground hover:border-border",
          )}
        >{p}%</button>
      ))}
      <input
        type="number"
        placeholder="Custom"
        value={custom}
        onChange={e => { setCustom(e.target.value); onChange(parseFloat(e.target.value) || 0.5); }}
        className="w-16 text-xs px-2 py-0.5 rounded-lg border border-border/40 bg-transparent text-muted-foreground"
      />
    </div>
  );
}

// ─── Exchange Swap Panel — real internal AMM swap ─────────────────────────────

const EXCHANGE_ASSETS = [
  "1INCH","AAVE","ADA","AERO","AGIX","AKT","ALFA","ALGO","ALICE","ALPACA","ALT","APT","ARB","ARKM",
  "ATOM","AVAX","AXS","BABYDOGE","BAKE","BAL","BALD","BAND","BASED","BB","BCH","BEAM","BGB","BIGTIME",
  "BNB","BOBA","BOME","BONK","BRETT","BSV","BTC","BUILD","BUSD","CAKE","CATI","CBBTC","CBETH","CELO",
  "CFG","CFX","COINAGE","COMP","CORE","CRO","CRV","CTXC","CVX","DAI","DASH","DEGEN","DOGE","DOGINME",
  "DOGS","DOT","DYDX","DYM","EGLD","EIGEN","ENJ","ENJOY","ENS","EOS","ETC","ETH","EVMOS","FET","FIL",
  "FLOKI","FLR","FRAX","FRIEND","FTM","FWOG","FXS","GALA","GHST","GIGA","GLM","GMT","GMX","GODS",
  "GRT","GT","HBAR","HIGHER","HMSTR","HNT","HT","ICP","ICX","ILV","IMAGINE","IMX","INJ","IOTX","JUNO",
  "KAS","KAVA","KCS","KDA","LDO","LINEA","LINK","LISTA","LPT","LTC","LUNA","LUNC","LUSD","MAGA",
  "MAGIC","MANA","MATIC","MC","METIS","MEW","MICHI","MINT","MKR","MNT","MOCHI","MOG","MOONWELL",
  "MORPHO","MPL","NEAR","NEIRO","NMR","NOMAD","NORMIE","NOT","NOTES","NTRN","OCEAN","OKB","ONCHAIN",
  "ONDO","ONE","OP","ORAI","ORDI","OSMO","PAXG","PENDLE","PEPE","PERP","PIXEL","PONKE","POPCAT",
  "POST","POWR","PRIME","RAINBOW","RATS","RBTC","RETH","REZ","RNDR","RON","ROSE","RPL","RUNE","SAND",
  "SATS","SCR","SCRT","SEAM","SEI","SHIB","SLERF","SLP","SNX","SOL","SPELL","SSV","STARS","STORJ",
  "STRD","STRK","STX","SUI","SUSHI","TAO","TBTC","THETA","TIA","TLM","TNSR","TON","TOSHI","TRUMP",
  "TRX","TURBO","TWT","UNI","USDC","USDT","VET","VIRAL","W","WAXP","WBNB","WBT","WBTC","WELL",
  "WETH","WIF","WLD","WSTETH","XAUT","XLM","XMR","XRP","YFI","ZEC","ZEN","ZK","ZORA","ZRO",
];

// ─── All market pairs (from ALL_SPOT_MOCK, deduplicated) ─────────────────────
const EXCHANGE_PAIRS: { base: string; quote: string; symbol: string }[] = (() => {
  const seen = new Set<string>();
  const result: { base: string; quote: string; symbol: string }[] = [];
  for (const m of ALL_SPOT_MOCK) {
    const base  = (m.baseAsset  as string)?.toUpperCase();
    const quote = (m.quoteAsset as string)?.toUpperCase();
    if (!base || !quote) continue;
    // Strip -PERP / futures
    if (m.type === "futures" || m.symbol?.includes("PERP")) continue;
    const key = `${base}/${quote}`;
    if (!seen.has(key)) { seen.add(key); result.push({ base, quote, symbol: key }); }
  }
  return result.sort((a, b) => a.symbol.localeCompare(b.symbol));
})();

// Searchable pair picker — shows all defined trading pairs, sets both From & To
function ExchangePairPicker({
  onSelect,
}: {
  onSelect: (base: string, quote: string) => void;
}) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const inputRef              = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toUpperCase().replace(/[-/ ]/g, "");
    if (!q) return EXCHANGE_PAIRS;
    return EXCHANGE_PAIRS.filter(p =>
      p.symbol.replace("/", "").includes(q) ||
      p.base.includes(q) ||
      p.quote.includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowUpDown className="w-3.5 h-3.5" />
        <span>Browse {EXCHANGE_PAIRS.length} pairs</span>
        <ChevronDown className="w-3 h-3 ml-0.5" />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: 340 }}
        >
          {/* Search header */}
          <div className="p-2.5 border-b border-border/60 flex items-center gap-2">
            <X
              className="w-3.5 h-3.5 text-muted-foreground shrink-0 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
            />
            <input
              ref={inputRef}
              placeholder={`Search ${EXCHANGE_PAIRS.length} pairs…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-muted-foreground/60 hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Pair list */}
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No pairs found</p>
            )}
            {filtered.map(p => (
              <button
                key={p.symbol}
                onClick={() => { onSelect(p.base, p.quote); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors text-left"
              >
                <div className="flex items-center -space-x-1.5 shrink-0">
                  <CoinLogo symbol={p.base}  size={18} />
                  <CoinLogo symbol={p.quote} size={14} className="ring-1 ring-card rounded-full" />
                </div>
                <span className="text-xs font-bold">{p.base}</span>
                <span className="text-xs text-muted-foreground">/{p.quote}</span>
              </button>
            ))}
          </div>

          {/* Footer count */}
          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 text-center">
            {filtered.length} of {EXCHANGE_PAIRS.length} pairs
          </div>
        </div>
      )}
    </div>
  );
}

// Searchable asset picker for the exchange panel
function ExchangeAssetPicker({
  value, onChange, exclude, label,
}: {
  value: string; onChange: (v: string) => void; exclude: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = EXCHANGE_ASSETS.filter(a => a !== exclude);
    if (!q) return list;
    // Put prefix matches first, then substring
    const prefix = list.filter(a => a.toLowerCase().startsWith(q));
    const rest   = list.filter(a => !a.toLowerCase().startsWith(q) && a.toLowerCase().includes(q));
    return [...prefix, ...rest];
  }, [search, exclude]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted border border-border/60 hover:border-border font-bold text-sm transition-colors min-w-[90px]"
      >
        <CoinLogo symbol={value} size={16} />
        <span>{value}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-56 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: 300 }}>
          <div className="p-2 border-b border-border/60 flex items-center gap-1.5">
            <X className="w-3.5 h-3.5 text-muted-foreground shrink-0 cursor-pointer" onClick={() => setOpen(false)} />
            <input
              ref={inputRef}
              placeholder={`Search ${EXCHANGE_ASSETS.length} assets…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No assets found</p>
            )}
            {filtered.map(a => (
              <button
                key={a}
                onClick={() => { onChange(a); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 transition-colors text-sm",
                  a === value && "bg-primary/5 text-primary",
                )}
              >
                <CoinLogo symbol={a} size={20} />
                <span className="font-semibold">{a}</span>
                {a === value && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 text-center">
            {filtered.length} of {EXCHANGE_ASSETS.length - 1} assets
          </div>
        </div>
      )}
    </div>
  );
}

interface ExchangeQuote {
  assetIn: string; assetOut: string;
  amountIn: string; amountOut: string;
  fee: string; rate: string;
}
interface ExBalance { asset: string; available: string }

function ExchangeSwapPanel({
  address,
  onOpenWallet,
}: {
  address: string | null;
  onOpenWallet: () => void;
}) {
  const { toast } = useToast();
  // Use the wallet's actual connected chainId (not the on-chain DEX chain picker)
  const { chainId: walletChainId } = useWalletStore();
  const [fromAsset, setFromAsset] = useState("ETH");
  const [toAsset,   setToAsset]   = useState("USDT");
  const [amount,    setAmount]    = useState("");
  const [quote,     setQuote]     = useState<ExchangeQuote | null>(null);
  const [quoting,   setQuoting]   = useState(false);
  const [quoteErr,  setQuoteErr]  = useState<string | null>(null);
  const [swapping,  setSwapping]  = useState(false);
  const [result,    setResult]    = useState<ExchangeQuote | null>(null);
  const [swapErr,   setSwapErr]   = useState<string | null>(null);
  const [balances,       setBalances]       = useState<ExBalance[]>([]);
  const [balancesLoaded, setBalancesLoaded] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the wallet's actual on-chain balance (uses the real connected chain, not DEX chain picker)
  const { balances: onChainWalletBals } = useEvmBalances(address ?? null, walletChainId ?? null);

  const loadBalances = useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`${API_BASE}/balances?walletAddress=${address}`);
      if (r.ok) {
        const data = await r.json();
        setBalances(Array.isArray(data) ? data : (data.balances ?? []));
        setBalancesLoaded(true);
      }
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => {
    setBalancesLoaded(false);
    loadBalances();
  }, [loadBalances]);

  // Returns 0 (not null) once balances have loaded, so percentage buttons always
  // appear for connected wallets — buttons are disabled when balance is 0.
  const balFor = (asset: string) => {
    const row = balances.find(b => b.asset.toUpperCase() === asset.toUpperCase());
    if (row) return parseFloat(row.available);
    return balancesLoaded ? 0 : null;
  };

  // On-chain wallet balance — fetched directly from the user's real connected chain
  const walletBalFor = (asset: string) => {
    const row = onChainWalletBals.find(b => b.symbol.toUpperCase() === asset.toUpperCase());
    return row ? row.amount : null;
  };

  const fetchQuote = useCallback(async (val: string) => {
    if (!val || parseFloat(val) <= 0 || fromAsset === toAsset) {
      setQuote(null); setQuoteErr(null); return;
    }
    setQuoting(true); setQuoteErr(null);
    try {
      const r = await fetch(`${API_BASE}/swap/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIn: fromAsset, assetOut: toAsset, amountIn: val }),
      });
      const data = await r.json();
      if (!r.ok) { setQuoteErr(data.error ?? "No price found"); setQuote(null); }
      else setQuote(data);
    } catch { setQuoteErr("Quote failed"); setQuote(null); }
    setQuoting(false);
  }, [fromAsset, toAsset]);

  const handleAmountChange = (val: string) => {
    setAmount(val); setResult(null); setSwapErr(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchQuote(val), 400);
  };

  const handleFlip = () => {
    setFromAsset(toAsset); setToAsset(fromAsset);
    setQuote(null); setAmount(""); setResult(null);
  };

  const handleSwap = async () => {
    if (!address || !amount || !quote || swapping) return;
    setSwapping(true); setSwapErr(null); setResult(null);
    try {
      const minOut = (parseFloat(quote.amountOut) * 0.995).toFixed(8);
      const r = await fetch(`${API_BASE}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, assetIn: fromAsset, assetOut: toAsset, amountIn: amount, minAmountOut: minOut }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error ?? "Swap failed";
        setSwapErr(msg);
        toast({ title: "Swap failed", description: msg, variant: "destructive" });
      } else {
        setResult(data);
        setAmount(""); setQuote(null);
        toast({ title: "Swap complete!", description: `${data.amountIn} ${data.assetIn} → ${parseFloat(data.amountOut).toFixed(6)} ${data.assetOut}` });
        setTimeout(loadBalances, 600);
      }
    } catch (err: any) {
      setSwapErr(err.message ?? "Network error");
    }
    setSwapping(false);
  };

  const fromBal = balFor(fromAsset);
  const isNewUser = balances.length === 0;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <RefreshCw className="w-4 h-4 text-primary" />
          OrahDEX Exchange
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-semibold">No Gas</span>
      </div>

      {/* Quick pair selector */}
      <ExchangePairPicker
        onSelect={(base, quote) => {
          setFromAsset(base);
          setToAsset(quote);
          setQuote(null);
          setAmount("");
          setResult(null);
        }}
      />


      {/* From */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-2">
        {/* Label + balances row */}
        <div className="flex items-start justify-between text-xs gap-2">
          <span className="text-muted-foreground font-medium shrink-0 pt-0.5">Sell</span>
          <div className="flex flex-col items-end gap-0.5">
            {(() => {
              const wb = walletBalFor(fromAsset);
              return wb != null ? (
                <span className="text-muted-foreground/70">
                  Balance:{" "}
                  <span className={`font-mono font-semibold ${wb > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {wb < 0.0001 && wb > 0 ? wb.toFixed(8) : wb.toFixed(4)}
                  </span>{" "}
                  {fromAsset}
                  {fromBal === 0 && wb > 0 && (
                    <span className="ml-1 text-amber-400 font-medium">(deposit to trade)</span>
                  )}
                </span>
              ) : null;
            })()}
          </div>
        </div>
        {/* Asset + amount row */}
        <div className="flex items-center gap-2">
          <ExchangeAssetPicker
            value={fromAsset}
            onChange={v => { setFromAsset(v); setQuote(null); setAmount(""); }}
            exclude={toAsset}
            label="You pay"
          />
          <input
            type="number" min="0" placeholder="0.0" value={amount}
            onChange={e => handleAmountChange(e.target.value)}
            className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 text-right"
          />
        </div>
        {/* Percentage quick-fill — show whenever balance is loaded (even 0) */}
        {fromBal != null && (
          <div className="flex items-center gap-1.5">
            {[25, 50, 75].map(pct => (
              <button
                key={pct}
                onClick={() => {
                  const val = (fromBal * pct / 100).toFixed(8).replace(/\.?0+$/, "") || "0";
                  handleAmountChange(val);
                }}
                disabled={fromBal <= 0}
                className="flex-1 py-1 rounded-lg text-[11px] font-bold border border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 active:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {pct}%
              </button>
            ))}
            <button
              onClick={() => handleAmountChange(fromBal.toFixed(8))}
              disabled={fromBal <= 0}
              className="flex-1 py-1 rounded-lg text-[11px] font-bold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 active:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              MAX
            </button>
          </div>
        )}
      </div>

      {/* Flip */}
      <div className="flex justify-center -my-1">
        <button onClick={handleFlip} className="p-2 rounded-full border border-border bg-card hover:bg-muted/60 transition-colors">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* To */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-2">
        {/* Label + balances row */}
        <div className="flex items-start justify-between text-xs gap-2">
          <span className="text-muted-foreground font-medium shrink-0 pt-0.5">Buy</span>
          <div className="flex flex-col items-end gap-0.5">
            {(() => {
              const wb = walletBalFor(toAsset);
              return wb != null ? (
                <span className="text-muted-foreground/70">
                  Balance:{" "}
                  <span className={`font-mono font-semibold ${wb > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {wb < 0.0001 && wb > 0 ? wb.toFixed(8) : wb.toFixed(4)}
                  </span>{" "}
                  {toAsset}
                </span>
              ) : null;
            })()}
          </div>
        </div>
        {/* Asset + amount row */}
        <div className="flex items-center gap-2">
          <ExchangeAssetPicker
            value={toAsset}
            onChange={v => { setToAsset(v); setQuote(null); setAmount(""); }}
            exclude={fromAsset}
            label="You receive"
          />
          <div className="flex-1 text-2xl font-bold text-right">
            {quoting ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground ml-auto" />
              : <span className={quote ? "text-foreground" : "text-muted-foreground/40"}>
                  {quote ? parseFloat(quote.amountOut).toFixed(6) : "0.0"}
                </span>}
          </div>
        </div>
      </div>

      {/* Rate / error */}
      {quote && (
        <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs flex items-center justify-between text-muted-foreground">
          <span>Rate</span>
          <span className="font-mono">1 {fromAsset} ≈ {parseFloat(quote.rate).toFixed(6)} {toAsset}</span>
        </div>
      )}
      {quoteErr && (
        <div className="flex items-center gap-2 text-xs text-amber-400 px-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{quoteErr}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Swapped {result.amountIn} {result.assetIn} → {parseFloat(result.amountOut).toFixed(6)} {result.assetOut}
        </div>
      )}
      {swapErr && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{swapErr}
        </div>
      )}

      {/* CTA */}
      {!address ? (
        <button onClick={onOpenWallet}
          className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow hover:shadow-lg hover:-translate-y-0.5 transition-all">
          Connect Wallet to Swap
        </button>
      ) : !amount || parseFloat(amount) <= 0 ? (
        <button disabled className="w-full py-3.5 rounded-xl font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed">
          Enter an amount
        </button>
      ) : !quote ? (
        <button disabled className="w-full py-3.5 rounded-xl font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed">
          {quoting ? "Getting quote…" : "No price found for this pair"}
        </button>
      ) : (
        <button onClick={handleSwap} disabled={swapping}
          className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
          {swapping ? <><Loader2 className="w-4 h-4 animate-spin" /> Swapping…</>
            : <><RefreshCw className="w-4 h-4" /> Swap {fromAsset} → {toAsset}</>}
        </button>
      )}

      <p className="text-[11px] text-muted-foreground/60 text-center">
        Instant · No gas · 0.3% fee · Uses OrahDEX internal balance
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Swap() {
  useSEO({ title: "Swap — OrahDEX", description: "Swap tokens on-chain via Uniswap V3 and PancakeSwap V3" });
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const { address, chainId: walletChainId, provider } = useWalletStore();
  const isOrahWallet = provider === "orah-wallet";
  const { open: openWalletModal } = useWalletModalStore();
  const { toast } = useToast();

  // Default: all wallets start in on-chain DEX mode (Uniswap V3).
  // Orah passkey wallets sign transactions via biometric auth — no seed phrase stored.
  const [chainId,   setChainId]   = useState<SupportedChainId>(1);
  const tokens = TOKENS[chainId];

  const [fromToken, setFromToken] = useState<Token>(tokens[0]);
  const [toToken,   setToToken]   = useState<Token>(tokens[1]);
  const [amountIn,  setAmountIn]  = useState("");
  const [slippage,  setSlippage]  = useState(0.5);

  const [quote,     setQuote]     = useState<QuoteResult | null>(null);
  const [quoting,   setQuoting]   = useState(false);
  const [quoteErr,  setQuoteErr]  = useState<string | null>(null);

  const [swapping,  setSwapping]  = useState(false);
  const [txHash,    setTxHash]    = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chainConfig = DEX_CHAINS.find(c => c.id === chainId)!;

  // Fetch on-chain balances for the selected chain so we can show "Balance: X.XX ETH"
  const { balances: onChainBalances, refresh: refreshBalances } = useEvmBalances(
    address ?? null,
    chainId,
  );

  const fromTokenBalance = useMemo(() => {
    if (!onChainBalances.length) return null;
    const match = onChainBalances.find(b =>
      fromToken.isNative ? !!b.isNative : b.symbol.toUpperCase() === fromToken.symbol.toUpperCase()
    );
    return match ? match.amount : null;
  }, [onChainBalances, fromToken]);

  const toTokenBalance = useMemo(() => {
    if (!onChainBalances.length) return null;
    const match = onChainBalances.find(b =>
      toToken.isNative ? !!b.isNative : b.symbol.toUpperCase() === toToken.symbol.toUpperCase()
    );
    return match ? match.amount : null;
  }, [onChainBalances, toToken]);

  const handleMax = () => {
    if (fromTokenBalance == null) return;
    // Reserve gas for native swaps only when balance is comfortably above the buffer.
    // If balance ≤ 0.002 ETH, use the full amount — the wallet will warn on gas.
    const gasBuffer = 0.002;
    const maxAmt = fromToken.isNative && fromTokenBalance > gasBuffer
      ? fromTokenBalance - gasBuffer
      : fromTokenBalance;
    const val = maxAmt.toFixed(8).replace(/\.?0+$/, "") || "0";
    setAmountIn(val);
    setTxHash(null); setTxSuccess(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchQuote(val), 300);
  };

  // Refresh balances after a confirmed swap
  useEffect(() => {
    if (txSuccess) refreshBalances();
  }, [txSuccess, refreshBalances]);


  // Re-init tokens when chain changes
  useEffect(() => {
    const t = TOKENS[chainId];
    setFromToken(t[0]);
    setToToken(t[1]);
    setQuote(null);
    setAmountIn("");
  }, [chainId]);

  // Sync chainId with connected wallet when possible
  useEffect(() => {
    const SUPPORTED = [1, 8453, 56, 42161, 10, 137, 43114];
    if (walletChainId && SUPPORTED.includes(walletChainId)) {
      setChainId(walletChainId as SupportedChainId);
    }
  }, [walletChainId]);

  // Debounced quote fetch
  const fetchQuote = useCallback(async (val: string) => {
    if (!val || parseFloat(val) <= 0 || fromToken.address === toToken.address) {
      setQuote(null); setQuoteErr(null); return;
    }
    setQuoting(true);
    setQuoteErr(null);
    try {
      const amtIn = parseUnits(val, fromToken.decimals);
      const result = await getSwapQuote(chainId, fromToken, toToken, amtIn);
      if (result) { setQuote(result); }
      else         { setQuoteErr(`No liquidity pool found for ${fromToken.symbol} → ${toToken.symbol} on this chain. Try a different token pair or switch chains.`); setQuote(null); }
    } catch (e: any) {
      setQuoteErr(e.message ?? "Quote failed.");
      setQuote(null);
    }
    setQuoting(false);
  }, [chainId, fromToken, toToken]);

  const handleAmountChange = (val: string) => {
    setAmountIn(val);
    setTxHash(null); setTxSuccess(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchQuote(val), 500);
  };

  const handleFlip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmountIn("");
    setQuote(null);
  };

  const handleSwap = async () => {
    if (!address || !quote || !amountIn) return;
    setSwapping(true);
    setTxHash(null);
    setTxSuccess(false);
    try {
      const amtIn       = parseUnits(amountIn, fromToken.decimals);
      const slippageBps = BigInt(Math.round(slippage * 100));
      const amtOutMin   = quote.amountOut * (10000n - slippageBps) / 10000n;

      let hash: `0x${string}`;

      if (isOrahWallet) {
        // Passkey wallet: biometric auth decrypts private key in-memory → signs Uniswap tx
        toast({ title: "Biometric authentication", description: "Authenticate with your passkey to sign the swap…" });
        let account: Account;
        try {
          account = await getViemAccountForOrahWallet(address);
        } catch (authErr: any) {
          const msg: string = authErr?.message ?? "";
          if (msg.startsWith("NO_PASSKEY_WALLET")) {
            toast({
              title: "Authentication failed",
              description: "On-chain swaps require a connected wallet. Please connect your wallet and try again.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Authentication failed", description: msg, variant: "destructive" });
          }
          setSwapping(false);
          return;
        }
        hash = await executeSwapWithLocalAccount(
          chainId, fromToken, toToken, amtIn, amtOutMin, quote.fee,
          address as `0x${string}`, account,
          chainConfig.name, chainConfig.nativeSymbol,
        );
      } else {
        hash = await executeSwap(
          chainId, fromToken, toToken, amtIn, amtOutMin, quote.fee,
          address as `0x${string}`,
        );
      }

      setTxHash(hash);
      toast({ title: "Transaction sent", description: "Waiting for confirmation…" });

      await new Promise<void>((resolve, reject) => {
        pollTxReceipt(hash, chainId, {
          onReceipt: (r: any) => {
            const status = r?.status;
            if (status === "0x1" || status === 1 || status === true) resolve();
            else reject(new Error("Transaction reverted on-chain."));
          },
          onTimeout: () => reject(new Error("Transaction timed out waiting for confirmation.")),
        });
      });
      setTxSuccess(true);

      toast({
        title: "Swap confirmed!",
        description: `${amountIn} ${fromToken.symbol} → ${parseFloat(formatUnits(quote.amountOut, toToken.decimals)).toFixed(6)} ${toToken.symbol}`,
      });
    } catch (e: any) {
      toast({ title: "Swap failed", description: e.shortMessage ?? e.message ?? "Transaction rejected.", variant: "destructive" });
    }
    setSwapping(false);
  };

  const amountOut    = quote ? formatUnits(quote.amountOut, toToken.decimals) : "";
  const rateDisplay  = quote && amountIn ? `1 ${fromToken.symbol} ≈ ${(parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)} ${toToken.symbol}` : null;
  const explorerUrl  = txHash ? `${chainConfig.explorer}${txHash}` : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-md space-y-4">

        {/* Swap / Bridge tab selector */}
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/40">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-background border border-border/60 shadow-sm text-foreground"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Swap
          </button>
          <button
            onClick={() => setLocation(isMobile ? "/deposit-bsv" : "/bridge")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            Bridge
          </button>
        </div>

        <>
            {/* Chain selector + Gas top-up */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                {DEX_CHAINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setChainId(c.id as SupportedChainId)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors",
                      chainId === c.id
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-border/40 text-muted-foreground hover:border-border",
                    )}
                  >
                    <CoinLogo symbol={c.logo} size={14} />
                    {c.name}
                  </button>
                ))}
              </div>

            </div>

            {/* Swap card */}
            <div className="rounded-2xl border border-border bg-card shadow-lg space-y-2 p-4">

              {/* From */}
              <div className="rounded-xl bg-muted/40 p-3 space-y-2">
                {/* Label + balance */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Sell</span>
                  {fromTokenBalance != null && (
                    <span className="text-muted-foreground">
                      Balance:{" "}
                      <span className="font-mono text-foreground font-semibold">
                        {fromTokenBalance < 0.0001 && fromTokenBalance > 0
                          ? fromTokenBalance.toFixed(8)
                          : fromTokenBalance.toFixed(4)}
                      </span>{" "}
                      {fromToken.symbol}
                    </span>
                  )}
                </div>
                {/* Token + amount row */}
                <div className="flex items-center gap-2">
                  <TokenPicker
                    tokens={tokens}
                    selected={fromToken}
                    onChange={t => { setFromToken(t); setQuote(null); setAmountIn(""); }}
                    label=""
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="0.0"
                    value={amountIn}
                    onChange={e => handleAmountChange(e.target.value)}
                    className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 text-right"
                  />
                </div>
                {/* Percentage quick-fill (only when balance is known) */}
                {fromTokenBalance != null && fromTokenBalance > 0 && (
                  <div className="flex items-center gap-1.5">
                    {[25, 50, 75].map(pct => (
                      <button
                        key={pct}
                        onClick={() => {
                          // No gas reserve for partial %; user manages gas themselves
                          const val = (fromTokenBalance * pct / 100).toFixed(8).replace(/\.?0+$/, "") || "0";
                          handleAmountChange(val);
                        }}
                        className="flex-1 py-1 rounded-lg text-[11px] font-bold border border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors"
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      onClick={handleMax}
                      className="flex-1 py-1 rounded-lg text-[11px] font-bold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 active:bg-primary/30 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                )}
              </div>

              {/* Flip button */}
              <div className="flex justify-center">
                <button
                  onClick={handleFlip}
                  className="p-2 rounded-full border border-border bg-card hover:bg-muted/60 transition-colors"
                >
                  <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* To */}
              <div className="rounded-xl bg-muted/40 p-3 space-y-2">
                {/* Label + balance */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Buy</span>
                  {toTokenBalance != null && (
                    <span className="text-muted-foreground">
                      Balance:{" "}
                      <span className="font-mono text-foreground font-semibold">
                        {toTokenBalance < 0.0001 && toTokenBalance > 0
                          ? toTokenBalance.toFixed(8)
                          : toTokenBalance.toFixed(4)}
                      </span>{" "}
                      {toToken.symbol}
                    </span>
                  )}
                </div>
                {/* Token + amount row */}
                <div className="flex items-center gap-2">
                  <TokenPicker
                    tokens={tokens}
                    selected={toToken}
                    onChange={t => { setToToken(t); setQuote(null); setAmountIn(""); }}
                    label=""
                  />
                  <div className="flex-1 text-right">
                    {quoting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />
                    ) : (
                      <span className={cn("text-2xl font-bold", amountOut ? "" : "text-muted-foreground/40")}>
                        {amountOut ? parseFloat(amountOut).toFixed(6) : "0.0"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quote details */}
              {quote && rateDisplay && (
                <div className="rounded-xl bg-muted/30 px-3 py-2 space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Rate</span>
                    <span className="font-mono">{rateDisplay}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Fee tier</span>
                    <span className="font-mono">{quote.fee / 10000}%</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Min received ({slippage}% slippage)</span>
                    <span className="font-mono">
                      {(parseFloat(amountOut) * (1 - slippage / 100)).toFixed(6)} {toToken.symbol}
                    </span>
                  </div>
                </div>
              )}

              {quoteErr && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {quoteErr}
                </div>
              )}

              {/* Slippage */}
              <SlippageSettings slippage={slippage} onChange={setSlippage} />

              {/* Success / TX link */}
              {txHash && (
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs border",
                  txSuccess
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-muted/40 border-border/40 text-muted-foreground",
                )}>
                  {txSuccess
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    : <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{txSuccess ? "Swap confirmed!" : "Confirming…"}</span>
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 hover:text-foreground">
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Swap button */}
              {!address ? (
                <button
                  onClick={openWalletModal}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
                >
                  Connect Wallet to Swap
                </button>
              ) : !amountIn || parseFloat(amountIn) <= 0 ? (
                <button disabled className="w-full py-3.5 rounded-xl font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed">
                  Enter an amount
                </button>
              ) : !quote ? (
                <button disabled className="w-full py-3.5 rounded-xl font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed">
                  {quoting ? "Getting quote…" : "No route found"}
                </button>
              ) : (
                <>
                  {isOrahWallet && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-400">
                      <Fingerprint className="w-3.5 h-3.5 shrink-0" />
                      <span>Your passkey will authenticate this swap — no seed phrase needed.</span>
                    </div>
                  )}
                  <button
                    onClick={handleSwap}
                    disabled={swapping}
                    className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {swapping
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Swapping…</>
                      : isOrahWallet
                        ? <><Fingerprint className="w-4 h-4" /> Swap {fromToken.symbol} → {toToken.symbol}</>
                        : <><Zap className="w-4 h-4" /> Swap {fromToken.symbol} → {toToken.symbol}</>}
                  </button>
                </>
              )}
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b className="text-foreground">On-Chain DEX:</b> Swaps execute on {chainConfig.name} via
                {chainId === 56 ? " PancakeSwap V3" : " Uniswap V3"}.{isOrahWallet ? " Your passkey signs the transaction — OrahDEX never holds your funds or keys." : " Your wallet signs the transaction directly — OrahDEX never holds your funds."}
              </span>
            </div>
          </>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-[11px] text-muted-foreground/60 font-medium">or swap via OrahDEX Exchange</span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        {/* Exchange Swap Panel (custodial, 223 assets, no gas) */}
        <ExchangeSwapPanel address={address} onOpenWallet={openWalletModal} />

        {/* Liquidity CTA */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border/30 bg-muted/10 text-xs">
          <span className="text-muted-foreground">Want to earn fees? Provide liquidity to pools.</span>
          <a href="/liquidity" className="text-primary font-semibold hover:underline flex items-center gap-1">
            Pools <ArrowRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
