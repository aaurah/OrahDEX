/**
 * escrowRelayer.ts — On-chain settlement for self-custody (escrow) trades.
 *
 * When a buyer and seller both lock their funds into the OrahDEXEscrow
 * contract before a match, this module is responsible for the second half
 * of the atomic swap: the relayer (= deployer wallet) calls
 *   release(orderId, recipient)
 * for each leg, sending the seller's locked base asset to the buyer's
 * wallet and the buyer's locked quote asset to the seller's wallet.
 *
 * Required env: EVM_WALLET_SECRET — the relayer's private key (hex,
 * with or without 0x prefix). The deployer of OrahDEXEscrow is the only
 * address authorised by the contract to call release().
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";

// ── Contract config ───────────────────────────────────────────────────────────

export const ESCROW_ABI = parseAbi([
  "function lockETH(bytes32 orderId) external payable",
  "function lockERC20(bytes32 orderId, address token, uint256 amount) external",
  "function release(bytes32 orderId, address recipient) external",
  "function cancel(bytes32 orderId) external",
  "function getDeposit(bytes32 orderId) external view returns (address depositor, address token, uint256 amount, uint64 lockedAt, bool released)",
  "event OrderReleased(bytes32 indexed orderId, address indexed recipient, address token, uint256 amount)",
]);

export const ESCROW_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0xeE234cEb85697b64800E696699b7841e00413B4f",
  11155111: "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2",
};

const CHAIN_BY_ID = {
  1: mainnet,
  11155111: sepolia,
} as const;

const RPC_URLS: Record<number, string> = {
  1: process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com",
  11155111: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
};

const EXPLORER: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  11155111: "https://sepolia.etherscan.io/tx/",
};

export function escrowExplorerUrl(chainId: number, txHash: string): string {
  const base = EXPLORER[chainId] ?? EXPLORER[1]!;
  return `${base}${txHash}`;
}

export function isEscrowChain(chainId: number): boolean {
  return chainId in ESCROW_ADDRESSES;
}

// ── Relayer key handling ──────────────────────────────────────────────────────

/**
 * Returns the relayer private key as a 0x-prefixed hex string, or null
 * when EVM_WALLET_SECRET is not a private key (e.g. a random passphrase).
 * Without a real key we fall back to logging the intended release without
 * broadcasting — the trade still records as filled internally.
 */
function getRelayerPrivateKey(): Hex | null {
  const raw = process.env.EVM_WALLET_SECRET ?? "";
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (stripped.length === 64 && /^[0-9a-fA-F]+$/.test(stripped)) {
    return ("0x" + stripped) as Hex;
  }
  return null;
}

// ── orderId → bytes32 (must match the dApp's encoding) ────────────────────────

/**
 * Convert a server order id (UUID string or "0x…32-byte hex") into the
 * bytes32 form that the escrow contract uses as a key. MUST match the
 * client-side `orderIdToBytes32` in artifacts/bsv-dex/src/lib/escrow.ts.
 */
export function orderIdToBytes32(orderId: string): Hex {
  if (orderId.startsWith("0x") && orderId.length === 66) return orderId as Hex;
  return keccak256(toBytes(orderId));
}

// ── Read: deposit status ──────────────────────────────────────────────────────

export interface EscrowDeposit {
  depositor: `0x${string}`;
  token:     `0x${string}`;
  amount:    bigint;
  lockedAt:  number;
  released:  boolean;
}

/**
 * Scan every deployed escrow contract for a deposit matching this orderId.
 * Returns the chainId where the deposit lives, or null when no chain has it.
 *
 * This is what makes "auto-detect chain" work: users can lock on any chain
 * where escrow is deployed, and the relayer finds them without having to
 * trust the order metadata. Reads are parallel so total time is ~max(rpc).
 */
export async function findEscrowChain(orderId: string): Promise<number | null> {
  const chainIds = Object.keys(ESCROW_ADDRESSES).map(Number);
  const results = await Promise.all(
    chainIds.map(async (cid) => {
      const dep = await getEscrowDeposit(orderId, cid);
      return dep && !dep.released ? cid : null;
    }),
  );
  return results.find((c): c is number => c !== null) ?? null;
}

export async function getEscrowDeposit(
  orderId: string,
  chainId: number,
): Promise<EscrowDeposit | null> {
  const escrow = ESCROW_ADDRESSES[chainId];
  if (!escrow) return null;
  const chain = CHAIN_BY_ID[chainId as keyof typeof CHAIN_BY_ID];
  const rpc   = RPC_URLS[chainId];
  if (!chain || !rpc) return null;

  const pub = createPublicClient({ chain, transport: http(rpc) });
  try {
    const data = await pub.readContract({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: "getDeposit",
      args: [orderIdToBytes32(orderId)],
    }) as readonly [`0x${string}`, `0x${string}`, bigint, bigint, boolean];

    const depositor = data[0];
    if (depositor === "0x0000000000000000000000000000000000000000") return null;
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

// ── Write: release ────────────────────────────────────────────────────────────

export interface ReleaseResult {
  ok:       boolean;
  txHash?:  Hex;
  reason?:  string;
  explorerUrl?: string;
}

/**
 * Call OrahDEXEscrow.release(orderId, recipient) using the relayer key.
 * Returns ok=false (with a reason) when the relayer key is missing,
 * the chain has no escrow deployed, the deposit doesn't exist, or the
 * deposit has already been released. Idempotent against double-release.
 */
export async function releaseEscrow(
  orderId:   string,
  recipient: string,
  chainId:   number,
): Promise<ReleaseResult> {
  const escrow = ESCROW_ADDRESSES[chainId];
  if (!escrow)     return { ok: false, reason: `no escrow on chainId ${chainId}` };
  const chain = CHAIN_BY_ID[chainId as keyof typeof CHAIN_BY_ID];
  const rpc   = RPC_URLS[chainId];
  if (!chain || !rpc) return { ok: false, reason: `no rpc for chainId ${chainId}` };

  const key = getRelayerPrivateKey();
  if (!key) return { ok: false, reason: "EVM_WALLET_SECRET is not a private key — relayer cannot sign" };

  // Idempotency: skip if there's no deposit or it's already released.
  const dep = await getEscrowDeposit(orderId, chainId);
  if (!dep)              return { ok: false, reason: "no deposit for orderId" };
  if (dep.released)      return { ok: true,  reason: "already released" };

  const account = privateKeyToAccount(key);
  const wallet  = createWalletClient({ account, chain, transport: http(rpc) });
  const pub     = createPublicClient({ chain, transport: http(rpc) });

  // Use pending-tag nonce to avoid "nonce too low" when the relayer is
  // releasing several orders in rapid succession (one per fill).
  const nonce = await pub.getTransactionCount({
    address:  account.address,
    blockTag: "pending",
  });

  try {
    const txHash = await wallet.writeContract({
      address: escrow,
      abi:     ESCROW_ABI,
      functionName: "release",
      args:    [orderIdToBytes32(orderId), recipient as `0x${string}`],
      nonce,
    });
    return { ok: true, txHash, explorerUrl: escrowExplorerUrl(chainId, txHash) };
  } catch (err: any) {
    // Surface revert reasons (e.g. "already released", "not relayer") so
    // the caller can log them; the trade remains filled in the internal
    // ledger so the UI is consistent regardless.
    return { ok: false, reason: err?.shortMessage ?? err?.message ?? String(err) };
  }
}

// ── Convenience: settle both legs of a matched trade ──────────────────────────

export interface SettleEscrowMatchParams {
  buyerOrderId:   string;
  sellerOrderId:  string;
  buyerAddress:   string;
  sellerAddress:  string;
  chainId:        number;
}

export interface SettleEscrowMatchResult {
  baseLeg:  ReleaseResult;   // seller's locked base asset → buyer
  quoteLeg: ReleaseResult;   // buyer's locked quote asset → seller
}

/**
 * Release both legs atomically *from the relayer's POV*. Network-level
 * atomicity is not possible (two separate txs), but the contract guarantees
 * that each release is one-shot and safe to retry on revert.
 *
 * ── SAFETY GATE ──────────────────────────────────────────────────────────
 * Both legs must be locked in escrow BEFORE we release either one. If only
 * one side locked, releasing it would send their funds to a counterparty
 * who never deposited anything → unilateral loss. This check is the only
 * thing protecting users from that, since the contract itself can't see
 * the other chain or the matching order.
 *
 * Returns `skipped` legs (with reason) when the match isn't safe to release
 * automatically. The caller should leave the user funds in escrow and
 * surface a clear message — the user can then call cancel() to recover.
 */
export async function settleEscrowMatch(
  p: SettleEscrowMatchParams,
): Promise<SettleEscrowMatchResult & {
  bothLocked: boolean;
  skipReason?: string;
  resolvedChainId?: number;
}> {
  // ── Auto-detect: which chain does each leg live on? ─────────────────────
  // Don't trust the caller's chainId hint; scan all deployed escrows.
  // This is what makes the system robust against wallets switching chains
  // mid-flow and against a buyer/seller using different L2s.
  const [sellerChain, buyerChain] = await Promise.all([
    findEscrowChain(p.sellerOrderId),
    findEscrowChain(p.buyerOrderId),
  ]);

  // Case 1: neither side actually locked → safe no-op.
  if (sellerChain === null && buyerChain === null) {
    return {
      bothLocked: false,
      skipReason: "neither side has a live escrow deposit",
      baseLeg:  { ok: false, reason: "safety gate: neither side locked" },
      quoteLeg: { ok: false, reason: "safety gate: neither side locked" },
    };
  }

  // Case 2: only one side locked → DO NOT release. Their funds stay safe
  // in escrow; user can call cancel() to recover. Releasing would send
  // their funds to a counterparty who paid nothing.
  if (sellerChain === null || buyerChain === null) {
    const missing = sellerChain === null ? "seller" : "buyer";
    return {
      bothLocked: false,
      skipReason: `${missing} did not complete on-chain lock`,
      baseLeg:  { ok: false, reason: `safety gate: ${missing} did not lock` },
      quoteLeg: { ok: false, reason: `safety gate: ${missing} did not lock` },
    };
  }

  // Case 3: both locked but on DIFFERENT chains → no protocol can move
  // tokens across chains within a single contract call. We need a real
  // cross-chain bridge (LayerZero/Across/HTLC) to settle this safely.
  // Until that's built, leave funds in their respective escrows.
  if (sellerChain !== buyerChain) {
    return {
      bothLocked: false,
      skipReason: `cross-chain settlement not supported (seller on ${sellerChain}, buyer on ${buyerChain})`,
      baseLeg:  { ok: false, reason: `cross-chain: seller=${sellerChain} buyer=${buyerChain}` },
      quoteLeg: { ok: false, reason: `cross-chain: seller=${sellerChain} buyer=${buyerChain}` },
      resolvedChainId: sellerChain,
    };
  }

  // Case 4: both locked on the same chain → safe to release each leg.
  const chainId = sellerChain;
  const baseLeg  = await releaseEscrow(p.sellerOrderId, p.buyerAddress,  chainId);
  const quoteLeg = await releaseEscrow(p.buyerOrderId,  p.sellerAddress, chainId);
  return { bothLocked: true, baseLeg, quoteLeg, resolvedChainId: chainId };
}
