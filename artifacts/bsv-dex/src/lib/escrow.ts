/**
 * OrahDEX on-chain escrow utilities.
 *
 * Uses viem to encode calldata; sends via window.ethereum (injected wallets)
 * or wagmi core (WalletConnect / Reown AppKit).
 *
 * Contract:  OrahDEXEscrow @ Sepolia 0x4deb6023abD9E1C640aDa35201be8ff591d21cF2
 */

import { encodeFunctionData, keccak256, toBytes, erc20Abi, createWalletClient, createPublicClient, http } from "viem";
import {
  sendTransaction as wagmiSendTransaction,
  waitForTransactionReceipt as wagmiWaitForTxReceipt,
  getTransactionCount as wagmiGetTxCount,
  switchChain as wagmiSwitchChain,
  getAccount as wagmiGetAccount,
} from "@wagmi/core";
import { ESCROW_ADDRESSES, ESCROW_ABI, ESCROW_CHAIN_ID } from "./escrowConfig";
import { CHAIN_TOKEN_ADDRESSES, TOKEN_DECIMALS } from "./onChainLiquidity";
import { CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS, getWagmiConfig } from "./reown";
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

/** Human-readable chain name used in escrow lock UI strings. */
const CHAIN_LABELS: Record<number, string> = {
  1:        "Ethereum",
  137:      "Polygon",
  56:       "BSC",
  8453:     "Base",
  42161:    "Arbitrum",
  10:       "Optimism",
  43114:    "Avalanche",
  324:      "zkSync",
  11155111: "Sepolia",
  84532:    "Base Sepolia",
  421614:   "Arbitrum Sepolia",
  11155420: "Optimism Sepolia",
  80002:    "Polygon Amoy",
  97:       "BSC Testnet",
  43113:    "Avalanche Fuji",
};

export function chainLabel(chainId: number | null | undefined): string {
  if (!chainId) return "this network";
  return CHAIN_LABELS[chainId] ?? `chain ${chainId}`;
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

/**
 * Read the escrow contract to check whether `orderId` is already locked
 * on-chain. Used after a page refresh (mobile Safari kills tabs when imToken
 * takes over) to detect that a user actually completed the lock while we
 * thought they were mid-flow.
 *
 * Returns `null` when no escrow exists on the chain or the order has never
 * been locked. Returns the deposit struct when funds are sitting in escrow.
 */
export async function checkEscrowDeposit(
  orderId: string,
  chainId: number,
): Promise<{ depositor: string; token: string; amount: bigint; lockedAt: number; released: boolean } | null> {
  const escrow = escrowAddress(chainId);
  if (!escrow) return null;
  try {
    const pub = getPublicClient(chainId);
    const data = await pub.readContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: "getDeposit",
      args: [orderIdToBytes32(orderId)],
    }) as readonly [`0x${string}`, `0x${string}`, bigint, bigint, boolean];
    const depositor = data[0];
    if (!depositor || depositor === "0x0000000000000000000000000000000000000000") return null;
    return {
      depositor,
      token:    data[1],
      amount:   data[2],
      lockedAt: Number(data[3]),
      released: data[4],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the freshest nonce from the network using the "pending" tag so
 * that recent (just-confirmed or in-mempool) transactions are reflected.
 * Without this, viem can pick a stale nonce after the user just sent a tx
 * and the node hasn't surfaced it on the "latest" block yet → "nonce too low".
 */
async function freshNonce(chainId: number, address: string): Promise<number> {
  const pub = getPublicClient(chainId);
  return await pub.getTransactionCount({
    address: address as `0x${string}`,
    blockTag: "pending",
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
  const nonce  = await freshNonce(chainId, from);
  const txHash = await client.sendTransaction({
    to:    escrow,
    value: rawAmount,
    data:  buildLockEthCalldata(orderId),
    nonce,
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

  // Step 1: approve — fetch nonce first
  const approveNonce = await freshNonce(chainId, from);
  const approveTx = await client.sendTransaction({
    to:   tokenAddress as `0x${string}`,
    data: buildApproveCalldata(escrow, rawAmount),
    nonce: approveNonce,
  } as any);
  await pub.waitForTransactionReceipt({ hash: approveTx });

  // Step 2: lockERC20 — re-fetch nonce so we follow the approve tx
  const lockNonce = await freshNonce(chainId, from);
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount),
    nonce: lockNonce,
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
  const nonce  = await freshNonce(chainId, from);
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: buildCancelCalldata(orderId),
    nonce,
  } as any);
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

// ── Reown / WalletConnect path (mobile wallets like imToken / Rabby Mobile) ──
// These wallets connect via WalletConnect and DO NOT inject window.ethereum,
// so eth_sendTransaction calls have to go through wagmi-core against the
// Reown AppKit's wagmiConfig.

/** Ensure the wagmi connector is on the right chain before sending a tx. */
async function ensureWagmiChain(chainId: number) {
  const config = getWagmiConfig();
  if (!config) throw new Error("Wallet connector not initialized");
  const acct = wagmiGetAccount(config);
  if (acct.chainId !== chainId) {
    await wagmiSwitchChain(config, { chainId });
  }
  return config;
}

export async function lockEthViaReown(
  orderId:   string,
  rawAmount: bigint,
  chainId:   number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const config = await ensureWagmiChain(chainId);
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  const nonce = await wagmiGetTxCount(config, {
    address: acct.address,
    blockTag: "pending",
    chainId,
  });
  const txHash = await wagmiSendTransaction(config, {
    to:    escrow,
    value: rawAmount,
    data:  buildLockEthCalldata(orderId),
    nonce,
    chainId,
  } as any);
  await wagmiWaitForTxReceipt(config, { hash: txHash, chainId });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export async function lockErc20ViaReown(
  orderId:      string,
  tokenAddress: string,
  rawAmount:    bigint,
  chainId:      number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const config = await ensureWagmiChain(chainId);
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  // Step 1: approve
  const approveNonce = await wagmiGetTxCount(config, {
    address: acct.address, blockTag: "pending", chainId,
  });
  const approveTx = await wagmiSendTransaction(config, {
    to:   tokenAddress as `0x${string}`,
    data: buildApproveCalldata(escrow, rawAmount),
    nonce: approveNonce,
    chainId,
  } as any);
  await wagmiWaitForTxReceipt(config, { hash: approveTx, chainId });

  // Step 2: lockERC20 — re-fetch nonce after approve confirms
  const lockNonce = await wagmiGetTxCount(config, {
    address: acct.address, blockTag: "pending", chainId,
  });
  const txHash = await wagmiSendTransaction(config, {
    to:   escrow,
    data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount),
    nonce: lockNonce,
    chainId,
  } as any);
  await wagmiWaitForTxReceipt(config, { hash: txHash, chainId });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export async function cancelEscrowViaReown(
  orderId: string,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);
  const config = await ensureWagmiChain(chainId);
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  const nonce = await wagmiGetTxCount(config, {
    address: acct.address, blockTag: "pending", chainId,
  });
  const txHash = await wagmiSendTransaction(config, {
    to:   escrow,
    data: buildCancelCalldata(orderId),
    nonce,
    chainId,
  } as any);
  await wagmiWaitForTxReceipt(config, { hash: txHash, chainId });
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
