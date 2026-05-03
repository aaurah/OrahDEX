/**
 * OrahDEX on-chain escrow utilities.
 *
 * Uses viem to encode calldata; sends via window.ethereum (injected wallets)
 * or wagmi core (WalletConnect / Reown AppKit).
 *
 * Contract:  OrahDEXEscrow @ Sepolia 0x4deb6023abD9E1C640aDa35201be8ff591d21cF2
 */

import { encodeFunctionData, keccak256, toBytes, erc20Abi, createWalletClient, createPublicClient, http } from "viem";
import { ESCROW_ADDRESSES, ESCROW_ABI, ESCROW_CHAIN_ID } from "./escrowConfig";
import { CHAIN_TOKEN_ADDRESSES, TOKEN_DECIMALS } from "./onChainLiquidity";
import { CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS } from "./reown";
import { getViemAccountForAddress } from "./walletSigner";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a string orderId (UUID) to the bytes32 used in the contract */
export function orderIdToBytes32(orderId: string): `0x${string}` {
  return keccak256(toBytes(orderId));
}

/** Returns the escrow contract address for the given chainId, or null */
export function escrowAddress(chainId: number | null | undefined): `0x${string}` | null {
  if (!chainId) return null;
  const addr = ESCROW_ADDRESSES[chainId];
  return addr ? (addr as `0x${string}`) : null;
}

/** True when the given chainId has an escrow contract deployed */
export function hasEscrow(chainId: number | null | undefined): boolean {
  return !!escrowAddress(chainId);
}

// ── Amount computation ─────────────────────────────────────────────────────────

/**
 * Compute the raw token amount (BigInt, in smallest units) that must be locked
 * in escrow for an order.
 *
 * For a BUY  order: lock the QUOTE asset (what the user spends).
 * For a SELL order: lock the BASE  asset (what the user sells).
 *
 * Returns null when the asset cannot be resolved for this chain.
 */
export interface EscrowAsset {
  symbol:   string;
  address:  string | null;  // null = native ETH
  rawAmount: bigint;
  decimals: number;
}

export function resolveEscrowAsset(
  chainId:   number,
  side:      "buy" | "sell",
  base:      string,     // e.g. "ETH", "BTC"
  quote:     string,     // e.g. "USDT", "ETH"
  quantity:  number,     // base quantity
  price:     number,     // limit price (or last price for market orders)
): EscrowAsset | null {
  const assetSymbol = side === "buy" ? quote : base;
  const assetAmount = side === "buy"
    ? quantity * price   // quote spent
    : quantity;          // base sold

  const decimals = TOKEN_DECIMALS[assetSymbol] ?? 18;
  const rawAmount = BigInt(Math.round(assetAmount * 10 ** decimals));

  // Determine on-chain token address (null = native ETH)
  const nativeSymbol = assetSymbol === "ETH" || assetSymbol === "BNB" || assetSymbol === "MATIC";
  if (nativeSymbol) {
    return { symbol: assetSymbol, address: null, rawAmount, decimals };
  }

  const tokenAddress = (CHAIN_TOKEN_ADDRESSES[chainId] ?? {})[assetSymbol] ?? null;
  if (!tokenAddress) return null;  // unsupported token for this chain

  return { symbol: assetSymbol, address: tokenAddress, rawAmount, decimals };
}

// ── Calldata builders ─────────────────────────────────────────────────────────

/** Build the `lockETH(bytes32)` calldata */
export function buildLockEthCalldata(orderId: string): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "lockETH",
    args: [orderIdToBytes32(orderId)],
  });
}

/** Build the `lockERC20(bytes32, address, uint256)` calldata */
export function buildLockErc20Calldata(
  orderId:      string,
  tokenAddress: string,
  rawAmount:    bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "lockERC20",
    args: [orderIdToBytes32(orderId), tokenAddress as `0x${string}`, rawAmount],
  });
}

/** Build the `approve(spender, amount)` calldata for an ERC-20 token */
export function buildApproveCalldata(
  spenderAddress: string,
  rawAmount:      bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spenderAddress as `0x${string}`, rawAmount],
  });
}

/** Build the `cancel(bytes32)` calldata */
export function buildCancelCalldata(orderId: string): `0x${string}` {
  return encodeFunctionData({
    abi: ESCROW_ABI,
    functionName: "cancel",
    args: [orderIdToBytes32(orderId)],
  });
}

// ── Transaction senders ───────────────────────────────────────────────────────

export interface EscrowTxResult {
  txHash: string;
  explorerUrl: string;
}

const EXPLORER_BASE: Record<number, string> = {
  // Mainnets
  1:        "https://etherscan.io",
  137:      "https://polygonscan.com",
  56:       "https://bscscan.com",
  8453:     "https://basescan.org",
  42161:    "https://arbiscan.io",
  10:       "https://optimistic.etherscan.io",
  43114:    "https://snowtrace.io",
  324:      "https://explorer.zksync.io",
  // Testnets
  11155111: "https://sepolia.etherscan.io",
  84532:    "https://sepolia.basescan.org",
  421614:   "https://sepolia.arbiscan.io",
  11155420: "https://sepolia-optimism.etherscan.io",
  80002:    "https://amoy.polygonscan.com",
  97:       "https://testnet.bscscan.com",
  43113:    "https://testnet.snowtrace.io",
};

function explorerTxUrl(chainId: number, txHash: string): string {
  const base = EXPLORER_BASE[chainId] ?? "https://etherscan.io";
  return `${base}/tx/${txHash}`;
}

/**
 * Lock native ETH in the escrow using window.ethereum (injected wallet).
 * Throws if the user rejects or the transaction fails.
 */
export async function lockEthViaInjected(
  orderId:    string,
  rawAmount:  bigint,
  from:       string,
  chainId:    number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No injected wallet found");

  const txHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to:    escrow,
      value: "0x" + rawAmount.toString(16),
      data:  buildLockEthCalldata(orderId),
    }],
  });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

/**
 * Lock an ERC-20 token in the escrow via injected wallet.
 * Sends an `approve` tx first, then a `lockERC20` tx.
 */
export async function lockErc20ViaInjected(
  orderId:      string,
  tokenAddress: string,
  rawAmount:    bigint,
  from:         string,
  chainId:      number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No injected wallet found");

  // Step 1: approve
  await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to:   tokenAddress,
      data: buildApproveCalldata(escrow, rawAmount),
    }],
  });

  // Step 2: lockERC20
  const txHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to:   escrow,
      data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount),
    }],
  });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

// ── Orah Wallet (in-app key) signing path ──────────────────────────────────────
// Uses viem's WalletClient with a local Account derived from the user's stored
// PIN/passkey-protected secret. Sends transactions through the public RPC for
// the active chain — no injected wallet required.

function rpcTransport(chainId: number) {
  const url = CHAIN_RPC_URLS[chainId] ?? CHAIN_RPC_FALLBACKS[chainId];
  if (!url) throw new Error(`No RPC URL for chainId ${chainId}`);
  return http(url);
}

function inlineChain(chainId: number) {
  const url = CHAIN_RPC_URLS[chainId] ?? CHAIN_RPC_FALLBACKS[chainId];
  return {
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] }, public: { http: [url] } },
  } as const;
}

async function getOrahWalletClient(from: string, chainId: number) {
  const account = await getViemAccountForAddress(from, {
    title:    "Authorize on-chain lock",
    subtitle: "Move funds to the OrahDEX escrow contract.",
  });
  return createWalletClient({
    account,
    chain: inlineChain(chainId) as any,
    transport: rpcTransport(chainId),
  });
}

function getPublicClient(chainId: number) {
  return createPublicClient({
    chain: inlineChain(chainId) as any,
    transport: rpcTransport(chainId),
  });
}

export async function lockEthViaOrah(
  orderId:   string,
  rawAmount: bigint,
  from:      string,
  chainId:   number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const client = await getOrahWalletClient(from, chainId);
  const txHash = await client.sendTransaction({
    to:    escrow,
    value: rawAmount,
    data:  buildLockEthCalldata(orderId),
  } as any);
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export async function lockErc20ViaOrah(
  orderId:      string,
  tokenAddress: string,
  rawAmount:    bigint,
  from:         string,
  chainId:      number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const client = await getOrahWalletClient(from, chainId);
  const pub    = getPublicClient(chainId);

  // Step 1: approve
  const approveTx = await client.sendTransaction({
    to:   tokenAddress as `0x${string}`,
    data: buildApproveCalldata(escrow, rawAmount),
  } as any);
  await pub.waitForTransactionReceipt({ hash: approveTx });

  // Step 2: lockERC20
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount),
  } as any);
  await pub.waitForTransactionReceipt({ hash: txHash });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export async function cancelEscrowViaOrah(
  orderId: string,
  from:    string,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const client = await getOrahWalletClient(from, chainId);
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: buildCancelCalldata(orderId),
  } as any);
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

/**
 * Cancel (refund) an escrow lock via injected wallet.
 */
export async function cancelEscrowViaInjected(
  orderId: string,
  from:    string,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No injected wallet found");

  const txHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to:   escrow,
      data: buildCancelCalldata(orderId),
    }],
  });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export { ESCROW_CHAIN_ID };
