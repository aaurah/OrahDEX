/**
 * OrahDEX — On-chain Trade Execution
 *
 * EVM  : Uniswap v2-compatible router swaps (swapExactTokensForTokens /
 *         swapExactETHForTokens / swapExactTokensForETH) via eth_sendTransaction.
 *         Uses viem's encodeFunctionData so no extra dependency is needed.
 *
 * BSV  : UTXO fetching via the OrahDEX API proxy (WhatsonChain backend),
 *         plus a broadcast endpoint for raw signed hex transactions.
 *         The DEX settlement tx is built and signed by the API server's
 *         settlement wallet (P2PKH using @noble/secp256k1).
 *
 * References implemented from the attached design document:
 *   connectEvmWallet / getEvmTokenBalance / approveEvmToken / evmTrade /
 *   connectBsvWallet / fetchBsvUtxos / bsvTrade / signAndBroadcastBsvTx /
 *   runEvmFlow / runBsvFlow
 */

import { encodeFunctionData, decodeFunctionResult } from "viem";
import { CHAIN_RPC_URLS } from "./reown";
import { getChainRouter as _getChainRouter } from "./chainConfig";
import { getOrahAmm } from "./orahAmmAddresses";

/**
 * Return the correct DEX router for a chain.
 * OrahDEX AMM chains (e.g. Sepolia) use OrahRouter02 instead of the
 * Uniswap v2 fallback stored in chainConfig.
 */
function getChainRouter(chainId: number): string {
  const amm = getOrahAmm(chainId);
  if (amm) return amm.router;
  return _getChainRouter(chainId);
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Uniswap v2 Router minimal ABI ─────────────────────────────────────────────
const ROUTER_V2_ABI = [
  {
    name: "getAmountsOut",
    type: "function" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "amountIn", type: "uint256" as const },
      { name: "path",     type: "address[]" as const },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" as const }],
  },
  {
    name: "swapExactTokensForTokens",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amountIn",    type: "uint256" as const },
      { name: "amountOutMin",type: "uint256" as const },
      { name: "path",        type: "address[]" as const },
      { name: "to",          type: "address" as const },
      { name: "deadline",    type: "uint256" as const },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" as const }],
  },
  {
    name: "swapExactETHForTokens",
    type: "function" as const,
    stateMutability: "payable" as const,
    inputs: [
      { name: "amountOutMin", type: "uint256" as const },
      { name: "path",         type: "address[]" as const },
      { name: "to",           type: "address" as const },
      { name: "deadline",     type: "uint256" as const },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" as const }],
  },
  {
    name: "swapExactTokensForETH",
    type: "function" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "amountIn",    type: "uint256" as const },
      { name: "amountOutMin",type: "uint256" as const },
      { name: "path",        type: "address[]" as const },
      { name: "to",          type: "address" as const },
      { name: "deadline",    type: "uint256" as const },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" as const }],
  },
] as const;

/**
 * Wrapped native token address per chain.
 * Needed to build WETH→TOKEN or TOKEN→WETH paths on the router.
 */
export const WRAPPED_NATIVE: Record<number, string> = {
  1:        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH  (Ethereum)
  56:       "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB  (BNB Chain)
  137:      "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC (Polygon)
  42161:    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH  (Arbitrum)
  10:       "0x4200000000000000000000000000000000000006", // WETH  (Optimism)
  8453:     "0x4200000000000000000000000000000000000006", // WETH  (Base)
  43114:    "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // WAVAX (Avalanche)
  250:      "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83", // WFTM  (Fantom)
  25:       "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23", // WCRO  (Cronos)
  59144:    "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F", // WETH  (Linea)
  5000:     "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", // WMNT  (Mantle)
  324:      "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91", // WETH  (zkSync Era)
  534352:   "0x5300000000000000000000000000000000000004", // WETH  (Scroll)
  11155111: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // WETH  (Sepolia — OrahDEX WETH)
};

// ── Internal helpers ──────────────────────────────────────────────────────────

async function ethCall(rpc: string, to: string, data: string): Promise<string | null> {
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

// ── EVM SIDE ──────────────────────────────────────────────────────────────────

/**
 * Connect to the injected EVM wallet (MetaMask, Rabby, Coinbase, etc.)
 * and return the signer address + chainId.
 * Mirrors the reference connectEvmWallet() function.
 */
export async function connectEvmWallet(): Promise<{
  address: string;
  chainId: number;
} | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const chainHex: string   = await eth.request({ method: "eth_chainId" });
    return {
      address: accounts[0],
      chainId: parseInt(chainHex, 16),
    };
  } catch {
    return null;
  }
}

/**
 * Read ERC-20 token balance for an address.
 * Equivalent to the reference getEvmTokenBalance() but without ethers.js.
 */
export async function getEvmTokenBalance(
  tokenAddress: string,
  ownerAddress: string,
  chainId: number,
  decimals = 18,
): Promise<{ raw: bigint; formatted: string } | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc) return null;

  const padAddr = (a: string) => a.replace("0x", "").padStart(64, "0");
  const data = "0x70a08231" + padAddr(ownerAddress); // balanceOf(address)
  const result = await ethCall(rpc, tokenAddress, data);
  if (!result || result === "0x") return null;

  try {
    const raw = BigInt(result);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const frac  = (raw % divisor).toString().padStart(decimals, "0").slice(0, 6);
    return { raw, formatted: `${whole}.${frac}` };
  } catch {
    return null;
  }
}

/**
 * Request ERC-20 approval for a spender (DEX router).
 * Equivalent to the reference approveEvmToken().
 * Returns the approval tx hash, or null on rejection.
 */
export async function approveEvmToken(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  fromAddress: string,
): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;
  try {
    const paddedSpender = spenderAddress.replace("0x", "").padStart(64, "0");
    const paddedAmount  = amount.toString(16).padStart(64, "0");
    const data = "0x095ea7b3" + paddedSpender + paddedAmount; // approve(address,uint256)
    const txHash: string = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: tokenAddress, data }],
    });
    return txHash ?? null;
  } catch {
    return null;
  }
}

/**
 * Quote the expected output amount from a Uniswap v2-style router.
 * Call this before evmTrade() to compute the amountOutMin with slippage.
 */
export async function getAmountsOut(
  routerAddress: string,
  amountIn: bigint,
  path: string[],
  chainId: number,
): Promise<bigint | null> {
  const rpc = CHAIN_RPC_URLS[chainId];
  if (!rpc || path.length < 2 || amountIn === 0n) return null;

  try {
    const calldata = encodeFunctionData({
      abi:          ROUTER_V2_ABI,
      functionName: "getAmountsOut",
      args:         [amountIn, path as `0x${string}`[]],
    });

    const result = await ethCall(rpc, routerAddress, calldata);
    if (!result || result === "0x") return null;

    const decoded = decodeFunctionResult({
      abi:          ROUTER_V2_ABI,
      functionName: "getAmountsOut",
      data:         result as `0x${string}`,
    }) as readonly bigint[];

    return decoded[decoded.length - 1] ?? null;
  } catch {
    return null;
  }
}

export interface EvmTradeParams {
  chainId:         number;
  routerAddress:   string;
  amountIn:        bigint;
  amountOutMin:    bigint;
  path:            string[];
  to:              string;
  slippageBps?:    number;   // basis points, default 50 = 0.5%
  deadlineMinutes?: number;  // default 10
  isNativeIn?:     boolean;  // true when input is the chain's native coin
  isNativeOut?:    boolean;  // true when output is the chain's native coin
}

/**
 * Execute a token swap via a Uniswap v2-compatible router.
 *
 * Handles three variants:
 *   isNativeIn  → swapExactETHForTokens  (value = amountIn)
 *   isNativeOut → swapExactTokensForETH
 *   otherwise   → swapExactTokensForTokens
 *
 * Mirrors the reference evmTrade() function.
 * Returns the tx hash, or null on user rejection.
 * Throws with code "USER_REJECTED" when the user cancels the wallet prompt.
 */
export async function evmTrade(params: EvmTradeParams): Promise<string | null> {
  const eth = (window as any).ethereum;
  if (!eth) return null;

  const {
    routerAddress, amountIn, amountOutMin,
    path, to, slippageBps = 50, deadlineMinutes = 10,
    isNativeIn = false, isNativeOut = false,
  } = params;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
  // Apply slippage: reduce amountOutMin by slippageBps
  const minOut = amountOutMin - (amountOutMin * BigInt(slippageBps)) / 10_000n;

  let calldata: string;
  let value = "0x0";

  try {
    if (isNativeIn) {
      calldata = encodeFunctionData({
        abi:          ROUTER_V2_ABI,
        functionName: "swapExactETHForTokens",
        args:         [minOut, path as `0x${string}`[], to as `0x${string}`, deadline],
      });
      value = "0x" + amountIn.toString(16);
    } else if (isNativeOut) {
      calldata = encodeFunctionData({
        abi:          ROUTER_V2_ABI,
        functionName: "swapExactTokensForETH",
        args:         [amountIn, minOut, path as `0x${string}`[], to as `0x${string}`, deadline],
      });
    } else {
      calldata = encodeFunctionData({
        abi:          ROUTER_V2_ABI,
        functionName: "swapExactTokensForTokens",
        args:         [amountIn, minOut, path as `0x${string}`[], to as `0x${string}`, deadline],
      });
    }

    const txHash: string = await eth.request({
      method: "eth_sendTransaction",
      params: [{
        from:  to,
        to:    routerAddress,
        data:  calldata,
        value,
      }],
    });

    return txHash ?? null;
  } catch (err: any) {
    if (err?.code === 4001) {
      const rejection = new Error("User rejected the swap transaction") as Error & { code: string };
      rejection.code = "USER_REJECTED";
      throw rejection;
    }
    throw err;
  }
}

/**
 * High-level EVM flow helper — mirrors runEvmFlow() from the reference.
 *
 * 1. Ensure allowance is sufficient (approve if needed)
 * 2. Quote the expected output via getAmountsOut
 * 3. Execute the swap via evmTrade
 *
 * Returns { txHash, amountOutMin } on success.
 */
export async function runEvmFlow(opts: {
  chainId:      number;
  fromAddress:  string;
  tokenInAddr:  string;    // "native" for chain's native coin
  tokenOutAddr: string;
  amountIn:     bigint;
  tokenInDecimals:  number;
  tokenOutDecimals: number;
  slippageBps?: number;
}): Promise<{ txHash: string; amountOutMin: bigint } | null> {
  const {
    chainId, fromAddress, tokenInAddr, tokenOutAddr,
    amountIn, slippageBps = 50,
  } = opts;

  const routerAddress = getChainRouter(chainId);
  const wNative       = WRAPPED_NATIVE[chainId];
  const isNativeIn    = tokenInAddr === "native";
  const isNativeOut   = tokenOutAddr === "native";

  // Build the token path (native uses its wrapped equivalent in the pool)
  const inAddr  = isNativeIn  ? wNative : tokenInAddr;
  const outAddr = isNativeOut ? wNative : tokenOutAddr;
  const path    = [inAddr, outAddr].filter(Boolean) as string[];

  // Step 1: Approve router to spend tokenIn (skip for native-in)
  if (!isNativeIn && tokenInAddr !== "native") {
    const padAddr  = (a: string) => a.replace("0x", "").padStart(64, "0");
    const rpc      = CHAIN_RPC_URLS[chainId];
    if (rpc) {
      const allowData   = "0xdd62ed3e" + padAddr(fromAddress) + padAddr(routerAddress);
      const allowResult = await ethCall(rpc, tokenInAddr, allowData);
      const allowed     = allowResult ? BigInt(allowResult) : 0n;
      if (allowed < amountIn) {
        const maxApproval = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;
        await approveEvmToken(tokenInAddr, routerAddress, maxApproval, fromAddress);
      }
    }
  }

  // Step 2: Quote expected output
  const quoted = await getAmountsOut(routerAddress, amountIn, path, chainId);
  const amountOutMin = quoted ?? 0n;

  // Step 3: Execute swap
  const txHash = await evmTrade({
    chainId, routerAddress, amountIn, amountOutMin,
    path, to: fromAddress, slippageBps, isNativeIn, isNativeOut,
  });

  if (!txHash) return null;
  return { txHash, amountOutMin };
}

// ── BSV SIDE ──────────────────────────────────────────────────────────────────

export interface BsvUtxo {
  txId:        string;
  outputIndex: number;
  script:      string;  // P2PKH hex script (may be empty — API fills it)
  satoshis:    number;
}

/**
 * Connect to the BSV wallet currently stored in the OrahDEX wallet store.
 * Mirrors connectBsvWallet() from the reference.
 *
 * signRawTx is a placeholder — for BSV, the settlement key lives server-side;
 * user-facing BSV wallets (HandCash, Sensilet) would be wired here.
 */
export function connectBsvWallet(address: string): {
  address: string;
  signRawTx: (rawHex: string) => Promise<string>;
} {
  return {
    address,
    signRawTx: async (rawHex: string) => {
      // In production: forward to HandCash SDK or Sensilet wallet API.
      // The OrahDEX API server holds the settlement private key and builds the tx.
      return rawHex;
    },
  };
}

/**
 * Fetch unspent outputs for a BSV address via the OrahDEX API proxy.
 * Mirrors fetchBsvUtxos() from the reference.
 */
export async function fetchBsvUtxos(address: string): Promise<BsvUtxo[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/bsv/utxos/${encodeURIComponent(address)}`,
    );
    if (!res.ok) return [];
    return await res.json() as BsvUtxo[];
  } catch {
    return [];
  }
}

/**
 * Broadcast a raw signed BSV transaction hex via the OrahDEX API proxy.
 * Mirrors signAndBroadcastBsvTx() from the reference.
 * Returns the txid string, or null on failure.
 */
export async function broadcastBsvTx(rawHex: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/bsv/broadcast`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ rawHex }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.txid ?? null;
  } catch {
    return null;
  }
}

export interface BsvTradeParams {
  walletAddress:     string;
  symbol:            string;
  side:              "buy" | "sell";
  type:              "market" | "limit";
  amountInBsv:       number;
  priceBsv?:         number;
  evmSignature?:     string;
}

/**
 * Submit a BSV DEX trade via the OrahDEX order engine.
 *
 * The API server:
 *   1. Receives the order
 *   2. Attempts to match against an open counter-order
 *   3. Builds a P2PKH settlement tx (using @noble/secp256k1)
 *   4. Broadcasts to WhatsonChain
 *   5. Returns the txid + explorerUrl
 *
 * Mirrors bsvTrade() + signAndBroadcastBsvTx() from the reference
 * but delegates the heavy tx-building work to the server.
 */
export async function bsvTradeViaApi(
  params: BsvTradeParams,
): Promise<{ txid: string | null; explorerUrl: string | null; matched: boolean } | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        walletAddress: params.walletAddress,
        symbol:        params.symbol,
        side:          params.side,
        type:          params.type,
        quantity:      params.amountInBsv,
        price:         params.priceBsv,
        networkType:   "bsv",
        evmSignature:  params.evmSignature,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * High-level BSV flow — mirrors runBsvFlow() from the reference.
 * Fetches UTXOs, submits the trade via the API, and returns the result.
 */
export async function runBsvFlow(opts: {
  address:        string;
  symbol:         string;
  side:           "buy" | "sell";
  type:           "market" | "limit";
  amountInSats:   number;
  minAmountOutSats?: number;
  price?:         number;
}): Promise<{ txid: string | null; matched: boolean } | null> {
  const { address, amountInSats } = opts;

  // Fetch UTXOs so the caller can inspect available balance
  const utxos  = await fetchBsvUtxos(address);
  const totalSats = utxos.reduce((s, u) => s + u.satoshis, 0);

  if (totalSats < amountInSats) {
    throw new Error(`Insufficient BSV balance: need ${amountInSats} sats, have ${totalSats}`);
  }

  const result = await bsvTradeViaApi({
    walletAddress: address,
    symbol:        opts.symbol,
    side:          opts.side,
    type:          opts.type,
    amountInBsv:   amountInSats / 1e8,
    priceBsv:      opts.price,
  });

  if (!result) return null;
  return { txid: result.txid, matched: result.matched };
}
