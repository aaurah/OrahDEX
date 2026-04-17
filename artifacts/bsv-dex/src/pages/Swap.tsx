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

import { useState, useEffect, useCallback, useRef } from "react";
import { useSEO } from "@/hooks/useSEO";
import {
  ArrowUpDown, Settings2, ChevronDown, Loader2,
  Zap, ExternalLink, AlertTriangle, CheckCircle2,
  RefreshCw, ArrowRight, Info, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWalletStore } from "@/store/useWalletStore";
import { useWalletModalStore } from "@/store/useWalletModalStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CoinLogo } from "@/components/CoinLogo";
import { createPublicClient, http, parseUnits, formatUnits, encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { writeContract as coreWriteContract } from "@wagmi/core";
import { getWagmiConfig, CHAIN_RPC_URLS } from "@/lib/reown";
import { checkAllowance, pollTxReceipt } from "@/lib/reown";

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
    { symbol: "POL",  name: "Polygon",         decimals: 18, address: NATIVE_PLACEHOLDER,                          isNative: true },
    { symbol: "USDC", name: "USD Coin",         decimals: 6,  address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    { symbol: "USDT", name: "Tether",           decimals: 6,  address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
    { symbol: "WBTC", name: "Wrapped Bitcoin",  decimals: 8,  address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" },
    { symbol: "DAI",  name: "Dai",              decimals: 18, address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
    { symbol: "WETH", name: "Wrapped ETH",      decimals: 18, address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" },
    { symbol: "LINK", name: "Chainlink",        decimals: 18, address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39" },
    { symbol: "AAVE", name: "Aave",             decimals: 18, address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B" },
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

async function getSwapQuote(
  chainId: SupportedChainId,
  fromToken: Token,
  toToken: Token,
  amountIn: bigint,
): Promise<QuoteResult | null> {
  const quoterAddr = QUOTER_V2[chainId];
  const rpcUrl     = CHAIN_RPC_URLS[chainId];
  if (!quoterAddr || !rpcUrl || amountIn === 0n) return null;

  const tokenIn  = fromToken.isNative ? WETH[chainId] : fromToken.address;
  const tokenOut = toToken.isNative   ? WETH[chainId] : toToken.address;

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
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
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

// ─── Main component ───────────────────────────────────────────────────────────

export function Swap() {
  useSEO({ title: "Swap — OrahDEX", description: "Swap tokens on-chain via Uniswap V3 and PancakeSwap V3" });

  const { address, chainId: walletChainId } = useWalletStore();
  const { open: openWalletModal } = useWalletModalStore();
  const { toast } = useToast();

  const [mode,      setMode]      = useState<"dex" | "exchange">("dex");
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
      else         { setQuoteErr("No liquidity pool found for this pair."); setQuote(null); }
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

      const hash = await executeSwap(
        chainId,
        fromToken,
        toToken,
        amtIn,
        amtOutMin,
        quote.fee,
        address as `0x${string}`,
      );
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
      toast({ title: "Swap confirmed!", description: `${amountIn} ${fromToken.symbol} → ${parseFloat(formatUnits(quote.amountOut, toToken.decimals)).toFixed(6)} ${toToken.symbol}` });
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

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight">Swap</h1>
          <p className="text-sm text-muted-foreground">Trade tokens on-chain or via the OrahDEX exchange</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setMode("dex")}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
              mode === "dex" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            On-Chain DEX
          </button>
          <button
            onClick={() => setMode("exchange")}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
              mode === "exchange" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Exchange
          </button>
        </div>

        {mode === "dex" ? (
          <>
            {/* Chain selector */}
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

            {/* Swap card */}
            <div className="rounded-2xl border border-border bg-card shadow-lg space-y-2 p-4">

              {/* From */}
              <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                <TokenPicker
                  tokens={tokens}
                  selected={fromToken}
                  onChange={t => { setFromToken(t); setQuote(null); setAmountIn(""); }}
                  label="You pay"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={e => handleAmountChange(e.target.value)}
                  className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40 mt-1"
                />
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
              <div className="rounded-xl bg-muted/40 p-3 space-y-1">
                <TokenPicker
                  tokens={tokens}
                  selected={toToken}
                  onChange={t => { setToToken(t); setQuote(null); setAmountIn(""); }}
                  label="You receive"
                />
                <div className="flex items-center gap-2 mt-1">
                  {quoting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className={cn("text-2xl font-bold", amountOut ? "" : "text-muted-foreground/40")}>
                      {amountOut ? parseFloat(amountOut).toFixed(6) : "0.0"}
                    </span>
                  )}
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
                <button
                  onClick={handleSwap}
                  disabled={swapping}
                  className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {swapping
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Swapping…</>
                    : <><Zap className="w-4 h-4" /> Swap {fromToken.symbol} → {toToken.symbol}</>}
                </button>
              )}
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <b className="text-foreground">On-Chain DEX:</b> Swaps execute on {chainConfig.name} via
                {chainId === 56 ? " PancakeSwap V3" : " Uniswap V3"}. Your wallet signs the transaction directly — OrahDEX never holds your funds.
              </span>
            </div>
          </>
        ) : (
          /* ── Exchange mode ── */
          <div className="rounded-2xl border border-border bg-card shadow-lg p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <RefreshCw className="w-4 h-4 text-primary" />
              OrahDEX Exchange (Custodial)
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Trade instantly using your OrahDEX internal balance — no gas fees, instant execution, BSV + multi-asset support.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["No gas fees", "Trades settle against internal liquidity"],
                ["BSV + EVM", "All major assets supported"],
                ["Instant fills", "Order matched in milliseconds"],
                ["Demo balances", "New users get seeded balances"],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-xl bg-muted/40 p-2.5">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
            <a
              href="/trade/ETH-USDT"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              Open Exchange Trading
            </a>
          </div>
        )}

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
