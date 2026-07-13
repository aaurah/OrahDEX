/**
 * OrahDEX on-chain escrow utilities.
 *
 * Uses viem to encode calldata; sends via window.ethereum (injected wallets)
 * or wagmi core (WalletConnect / Reown AppKit).
 *
 * Contract:  OrahDEXEscrow @ Sepolia 0x4deb6023abD9E1C640aDa35201be8ff591d21cF2
 */

import { encodeFunctionData, keccak256, toBytes, erc20Abi, createWalletClient, createPublicClient, http, parseUnits } from "viem";
import {
  switchChain as wagmiSwitchChain,
  getAccount as wagmiGetAccount,
} from "@wagmi/core";
import { ESCROW_ADDRESSES, ESCROW_ABI, ESCROW_CHAIN_ID } from "./escrowConfig";
import { CHAIN_TOKEN_ADDRESSES, TOKEN_DECIMALS } from "./onChainLiquidity";
import { CHAIN_RPC_URLS, CHAIN_RPC_FALLBACKS, getWagmiConfig } from "./reown";
import { getAppKitWagmiConfig } from "./reown-appkit";
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

  // Guard: a zero or negative amount cannot be locked in the contract.
  // This happens for market buy orders when the price feed hasn't loaded yet
  // (price = 0) — returning null disables the lock button instead of sending
  // a tx that will revert with "OrahDEXEscrow: zero ETH / zero amount".
  if (assetAmount <= 0) return null;

  const decimals = TOKEN_DECIMALS[assetSymbol] ?? 18;

  // Use parseUnits (viem) instead of float arithmetic so that amounts like
  // 0.123 ETH produce the exact 18-decimal bigint representation.
  // Floating-point multiplication (assetAmount * 10 ** 18) overflows
  // Number.MAX_SAFE_INTEGER for most ETH-scale amounts and silently
  // produces wrong wei counts.
  const rawAmount = parseUnits(assetAmount.toFixed(decimals), decimals);

  // Final guard: parseUnits can still produce 0n when assetAmount rounds to
  // sub-wei precision; treat that as unresolvable to prevent a reverted tx.
  if (rawAmount === 0n) return null;

  // Determine on-chain token address (null = native ETH/BNB/MATIC/AVAX/SEI…)
  const nativeSymbols = new Set(["ETH", "BNB", "MATIC", "AVAX", "SEI", "OP"]);
  if (nativeSymbols.has(assetSymbol)) {
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

// ── Universal provider helper ─────────────────────────────────────────────────

/**
 * Try a raw `eth_sendTransaction` against a single EIP-1193 provider.
 * Switches the provider to `chainId` first if needed.
 * Returns the tx hash on success, null on non-rejection errors, throws on user rejection.
 */
async function tryTxWithProvider(
  provider: any,
  params: { from: string; to: string; value?: bigint; data: `0x${string}`; chainId: number; gasHex?: string },
): Promise<string | null> {
  try {
    const chainHex = "0x" + params.chainId.toString(16);
    const currentHex: string = await provider.request({ method: "eth_chainId" });
    if (parseInt(currentHex, 16) !== params.chainId) {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
    }
    const tx: Record<string, string> = { from: params.from, to: params.to, data: params.data };
    if (params.value !== undefined && params.value > 0n) {
      tx.value = "0x" + params.value.toString(16);
    }
    if (params.gasHex) tx.gas = params.gasHex;
    const hash: string = await provider.request({ method: "eth_sendTransaction", params: [tx] });
    return hash ?? null;
  } catch (err: any) {
    const msg = (err?.message ?? "").toLowerCase();
    const isReject = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
      msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel");
    if (isReject) throw err;
    return null;
  }
}

/**
 * Send a transaction through ALL available wallet providers in order:
 *   1. window.ethereum (MetaMask extension, Coinbase Wallet, MetaMask mobile browser)
 *   2. All wagmi connectors (WalletConnect / Reown AppKit)
 *
 * Returns the tx hash. Throws user-rejection errors immediately.
 * Falls through providers on non-rejection failures so a stale WalletConnect
 * session can't permanently block an injected wallet (and vice-versa).
 *
 * Gas is pre-estimated using our own public RPC and embedded in every
 * eth_sendTransaction call so external wallets (ThirdWeb, imToken, Rainbow…)
 * never need to call eth_estimateGas via their own provider.  Some providers
 * (e.g. zan.top for ThirdWeb on Sepolia) rate-limit eth_estimateGas for
 * unregistered accounts; without the pre-populated gas field, those wallets
 * return a non-rejection error that previously caused every connector to be
 * silently skipped, producing the misleading "No wallet found" message.
 */
async function sendTxUniversal(params: {
  from:    string;
  to:      string;
  value?:  bigint;
  data:    `0x${string}`;
  chainId: number;
}): Promise<string> {
  // Pre-estimate gas with our own RPC (200 % padding) so wallets don't need to
  // call eth_estimateGas themselves.  Silently falls back to wallet estimation
  // if our RPC is also unavailable.
  let gasHex: string | undefined;
  try {
    const pub = getPublicClient(params.chainId);
    const est = await pub.estimateGas({
      account: params.from as `0x${string}`,
      to:      params.to   as `0x${string}`,
      value:   params.value,
      data:    params.data,
    });
    gasHex = "0x" + ((est * 200n) / 100n).toString(16);
  } catch { /* wallet will estimate on its own */ }

  const paramsWithGas = { ...params, gasHex };

  const injected = (window as any).ethereum;
  if (injected) {
    const h = await tryTxWithProvider(injected, paramsWithGas);
    if (h) return h;
  }

  // Try the minimal wagmiConfig connectors (legacy path, usually empty for WC)
  const config = getWagmiConfig();
  if (config) {
    for (const connector of (config as any).connectors ?? []) {
      try {
        const provider = await (connector as any).getProvider?.();
        if (!provider) continue;
        const h = await tryTxWithProvider(provider, paramsWithGas);
        if (h) return h;
      } catch (err: any) {
        const msg = (err?.message ?? "").toLowerCase();
        const isReject = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
          msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel");
        if (isReject) throw err;
      }
    }
  }

  // Track the last real error from an active WalletConnect provider so we can
  // surface it instead of the generic "No wallet found" if all connectors fail.
  let lastProviderError: Error | null = null;

  // Try AppKit (Reown/WalletConnect) connectors.
  // IMPORTANT: do NOT use tryTxWithProvider here — it uses raw wallet_switchEthereumChain
  // which silently fails (non-rejection) for WalletConnect relays. Instead use
  // wagmiSwitchChain (which sends a proper WC session_update) then send directly.
  const appKitConfig = getAppKitWagmiConfig();
  if (appKitConfig) {
    try {
      const acct = wagmiGetAccount(appKitConfig);
      if (acct.address && acct.chainId !== undefined && acct.chainId !== params.chainId) {
        await wagmiSwitchChain(appKitConfig, { chainId: params.chainId });
      }
      const txObj: Record<string, string> = { from: params.from, to: params.to, data: params.data };
      if (params.value !== undefined && params.value > 0n) {
        txObj.value = "0x" + params.value.toString(16);
      }
      if (gasHex) txObj.gas = gasHex;
      for (const connector of (appKitConfig as any).connectors ?? []) {
        try {
          const provider = await (connector as any).getProvider?.();
          if (!provider) continue;
          const hash: string = await provider.request({ method: "eth_sendTransaction", params: [txObj] });
          if (hash) return hash;
        } catch (err: any) {
          const msg = (err?.message ?? "").toLowerCase();
          const isReject = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
            msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel");
          if (isReject) throw err;
          // Record the error — it came from an active provider, so it's meaningful
          lastProviderError = err instanceof Error ? err : new Error(String(err?.message ?? err));
        }
      }
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      const isReject = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
        msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel");
      if (isReject) throw err;
      // Chain switch or provider setup failed non-rejection → fall through to error
    }
  }

  // Surface the last real provider error rather than the generic "No wallet found"
  // so users (and developers) see the actual failure reason.
  if (lastProviderError) throw lastProviderError;

  throw new Error(
    "No wallet found. Open MetaMask, connect via WalletConnect, or use the Orah Wallet.",
  );
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
 * Sends an `approve` tx first, waits for confirmation, then a `lockERC20` tx.
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

  // Step 1: approve — wait for on-chain confirmation so the allowance is
  // visible when lockERC20 executes (mirrors lockErc20ViaOrah/Reown).
  const approveTxHash: string = await eth.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to:   tokenAddress,
      data: buildApproveCalldata(escrow, rawAmount),
    }],
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });

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

/**
 * Lock native ETH in the escrow using any available wallet provider.
 * Tries window.ethereum first, then all wagmi/WalletConnect connectors.
 * Handles chain switching automatically.
 */
export async function lockEthUniversal(
  orderId:   string,
  rawAmount: bigint,
  from:      string,
  chainId:   number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow contract on chainId ${chainId}`);
  const txHash = await sendTxUniversal({
    from, to: escrow, value: rawAmount,
    data: buildLockEthCalldata(orderId), chainId,
  });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

/**
 * Approve + lock an ERC-20 token in the escrow using any available wallet provider.
 * Uses the same provider for both the approve tx and the lockERC20 tx to avoid
 * cross-wallet nonce races.
 */
export async function lockErc20Universal(
  orderId:      string,
  tokenAddress: string,
  rawAmount:    bigint,
  from:         string,
  chainId:      number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow contract on chainId ${chainId}`);

  // Find a working provider to use for both approve + lock
  async function getWorkingProvider(): Promise<any> {
    const chainHex = "0x" + chainId.toString(16);
    async function canUse(provider: any): Promise<boolean> {
      try {
        const currentHex: string = await provider.request({ method: "eth_chainId" });
        if (parseInt(currentHex, 16) !== chainId) {
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
        }
        return true;
      } catch { return false; }
    }
    const injected = (window as any).ethereum;
    if (injected && await canUse(injected)) return injected;
    // Try minimal wagmiConfig connectors first, then AppKit connectors
    for (const cfg of [getWagmiConfig(), getAppKitWagmiConfig()]) {
      if (!cfg) continue;
      for (const connector of (cfg as any).connectors ?? []) {
        try {
          const provider = await (connector as any).getProvider?.();
          if (provider && await canUse(provider)) return provider;
        } catch { /* try next */ }
      }
    }
    throw new Error("No wallet found. Connect MetaMask or use WalletConnect.");
  }

  const provider = await getWorkingProvider();

  // Step 1: approve
  const approveTx: string = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: tokenAddress, data: buildApproveCalldata(escrow, rawAmount) }],
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: approveTx as `0x${string}` });

  // Step 2: lockERC20
  const txHash: string = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: escrow, data: buildLockErc20Calldata(orderId, tokenAddress, rawAmount) }],
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

export function getPublicClient(chainId: number) {
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
  const data   = buildLockEthCalldata(orderId);
  // Pre-estimate gas with our own publicnode RPC so ThirdWeb's viem adapter
  // doesn't call eth_estimateGas through zan.top (which blocks unregistered accounts).
  const gas = await estimateGasForReown({ from, to: escrow, value: rawAmount, data }, chainId, 300000n);
  const txHash = await client.sendTransaction({
    to:    escrow,
    value: rawAmount,
    data,
    nonce,
    gas,
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

  // Step 1: approve — pre-estimate gas to avoid zan.top estimation in ThirdWeb adapter
  const approveData  = buildApproveCalldata(escrow, rawAmount);
  const approveGas   = await estimateGasForReown({ from, to: tokenAddress, data: approveData }, chainId, 200000n);
  const approveNonce = await freshNonce(chainId, from);
  const approveTx = await client.sendTransaction({
    to:   tokenAddress as `0x${string}`,
    data: approveData,
    nonce: approveNonce,
    gas:   approveGas,
  } as any);
  await pub.waitForTransactionReceipt({ hash: approveTx });

  // Step 2: lockERC20 — re-fetch nonce, pre-estimate gas
  const lockData  = buildLockErc20Calldata(orderId, tokenAddress, rawAmount);
  const lockGas   = await estimateGasForReown({ from, to: escrow, data: lockData }, chainId, 350000n);
  const lockNonce = await freshNonce(chainId, from);
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: lockData,
    nonce: lockNonce,
    gas:   lockGas,
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
  const cancelData = buildCancelCalldata(orderId);
  const cancelGas  = await estimateGasForReown({ from, to: escrow, data: cancelData }, chainId, 200000n);
  const txHash = await client.sendTransaction({
    to:   escrow,
    data: cancelData,
    nonce,
    gas: cancelGas,
  } as any);
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

// ── Reown / WalletConnect path (mobile wallets like imToken / Rabby Mobile) ──
// These wallets connect via WalletConnect and DO NOT inject window.ethereum.
//
// IMPORTANT: wagmiSendTransaction / viem's sendTransaction throw
// "this request method is not supported" (EIP-1193 error 4200) on some
// WalletConnect sessions because viem@2.47.x internally calls extra
// JSON-RPC methods (wallet type detection, EIP-1559 fee estimation) that the
// WalletConnect relay doesn't proxy.  The fix is to call eth_sendTransaction
// directly on the connector's raw EIP-1193 provider, exactly as sendTxUniversal
// does for the injected-wallet path.

/**
 * Estimate gas using our own public RPC (not the wallet's potentially rate-limited
 * node) and return it padded by 30% so the wallet never needs to call eth_estimateGas.
 * Falls back to a conservative static limit on any RPC error.
 */
async function estimateGasForReown(
  params: { from: string; to: string; value?: bigint; data: `0x${string}` },
  chainId: number,
  staticFallback: bigint,
): Promise<bigint> {
  try {
    const pub = getPublicClient(chainId);
    const estimated = await pub.estimateGas({
      account: params.from as `0x${string}`,
      to:      params.to as `0x${string}`,
      value:   params.value,
      data:    params.data,
    });
    // 200% padding — WalletConnect signs at a later block than estimation,
    // so state-dependent gas costs can spike. Double the estimate is safer.
    return (estimated * 200n) / 100n;
  } catch {
    return staticFallback;
  }
}

/**
 * Send a raw eth_sendTransaction via the Reown/WalletConnect connector's
 * EIP-1193 provider, bypassing viem's sendTransaction wrapper which calls
 * internal methods not supported by WalletConnect relays.
 *
 * Switches the connector to the target chain first.
 * Returns the tx hash on success, throws on user rejection.
 */
async function sendRawViaReown(params: {
  from:    string;
  to:      string;
  value?:  bigint;
  data:    `0x${string}`;
  gas:     bigint;
  chainId: number;
}): Promise<string> {
  // Use AppKit wagmiConfig — this is the config that holds the live WC session.
  // The minimal wagmiConfig from reown.ts has zero WalletConnect connectors.
  const appKitConfig = getAppKitWagmiConfig();
  const config = appKitConfig ?? getWagmiConfig();
  if (!config) throw new Error("Wallet connector not initialized");

  // Switch chain via wagmi
  const acct = wagmiGetAccount(config);
  if (acct.chainId !== params.chainId) {
    await wagmiSwitchChain(config, { chainId: params.chainId });
  }

  const chainHex = "0x" + params.chainId.toString(16);
  const gasHex   = "0x" + params.gas.toString(16);

  const txObj: Record<string, string> = {
    from: params.from,
    to:   params.to,
    data: params.data,
    gas:  gasHex,
  };
  if (params.value !== undefined && params.value > 0n) {
    txObj.value = "0x" + params.value.toString(16);
  }

  // Try connectors from AppKit config first, then minimal wagmiConfig as fallback
  for (const cfg of [appKitConfig, getWagmiConfig()]) {
    if (!cfg) continue;
    for (const connector of (cfg as any).connectors ?? []) {
      try {
        const provider = await (connector as any).getProvider?.();
        if (!provider) continue;

        const currentHex: string = await provider.request({ method: "eth_chainId" });
        if (parseInt(currentHex, 16) !== params.chainId) {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainHex }],
          });
        }

        const hash: string = await provider.request({
          method: "eth_sendTransaction",
          params: [txObj],
        });
        if (hash) return hash;
      } catch (err: any) {
        const msg = (err?.message ?? "").toLowerCase();
        const isReject = err?.code === 4001 || err?.code === "ACTION_REJECTED" ||
          msg.includes("rejected") || msg.includes("denied") || msg.includes("cancel");
        if (isReject) throw err;
      }
    }
  }

  throw new Error("No WalletConnect session found. Please reconnect your wallet.");
}

export async function lockEthViaReown(
  orderId:   string,
  rawAmount: bigint,
  chainId:   number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);

  const config = getAppKitWagmiConfig() ?? getWagmiConfig();
  if (!config) throw new Error("Wallet connector not initialized");
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  const data = buildLockEthCalldata(orderId);
  const gas  = await estimateGasForReown(
    { from: acct.address, to: escrow, value: rawAmount, data },
    chainId, 300000n,
  );

  const txHash = await sendRawViaReown({
    from: acct.address, to: escrow, value: rawAmount, data, gas, chainId,
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash as `0x${string}` });
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

  const config = getAppKitWagmiConfig() ?? getWagmiConfig();
  if (!config) throw new Error("Wallet connector not initialized");
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  // Step 1: approve
  const approveData = buildApproveCalldata(escrow, rawAmount);
  const approveGas  = await estimateGasForReown(
    { from: acct.address, to: tokenAddress, data: approveData },
    chainId, 200000n,
  );
  const approveTx = await sendRawViaReown({
    from: acct.address, to: tokenAddress, data: approveData, gas: approveGas, chainId,
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: approveTx as `0x${string}` });

  // Step 2: lockERC20
  const lockData = buildLockErc20Calldata(orderId, tokenAddress, rawAmount);
  const lockGas  = await estimateGasForReown(
    { from: acct.address, to: escrow, data: lockData },
    chainId, 350000n,
  );
  const txHash = await sendRawViaReown({
    from: acct.address, to: escrow, data: lockData, gas: lockGas, chainId,
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

export async function cancelEscrowViaReown(
  orderId: string,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow on chainId ${chainId}`);

  const config = getAppKitWagmiConfig() ?? getWagmiConfig();
  if (!config) throw new Error("Wallet connector not initialized");
  const acct = wagmiGetAccount(config);
  if (!acct.address) throw new Error("No connected wallet");

  const data = buildCancelCalldata(orderId);
  const gas  = await estimateGasForReown(
    { from: acct.address, to: escrow, data },
    chainId, 200000n,
  );
  const txHash = await sendRawViaReown({
    from: acct.address, to: escrow, data, gas, chainId,
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  return { txHash, explorerUrl: explorerTxUrl(chainId, txHash) };
}

/**
 * Cancel (refund) an escrow lock via any available wallet provider.
 */
export async function cancelEscrowUniversal(
  orderId: string,
  from:    string,
  chainId: number,
): Promise<EscrowTxResult> {
  const escrow = escrowAddress(chainId);
  if (!escrow) throw new Error(`No escrow contract on chainId ${chainId}`);
  const txHash = await sendTxUniversal({ from, to: escrow, data: buildCancelCalldata(orderId), chainId });
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
