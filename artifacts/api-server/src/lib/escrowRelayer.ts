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
import {
  mainnet, sepolia,
  base, baseSepolia,
  arbitrum, arbitrumSepolia,
  optimism, optimismSepolia,
  polygon, polygonAmoy,
  bsc, bscTestnet,
  avalanche, avalancheFuji,
  zksync,
  linea, lineaSepolia,
  scroll, scrollSepolia,
  sei,
  unichain, unichainSepolia,
} from "viem/chains";
import { logger } from "./logger.js";

// ── Contract config ───────────────────────────────────────────────────────────

export const ESCROW_ABI = parseAbi([
  "function lockETH(bytes32 orderId) external payable",
  "function lockERC20(bytes32 orderId, address token, uint256 amount) external",
  "function release(bytes32 orderId, address recipient) external",
  "function cancel(bytes32 orderId) external",
  "function getDeposit(bytes32 orderId) external view returns (address depositor, address token, uint256 amount, uint64 lockedAt, bool released)",
  "event OrderReleased(bytes32 indexed orderId, address indexed recipient, address token, uint256 amount)",
]);

// Canonical mainnet escrow address — deployed via CREATE2 at the SAME address
// on every chain below (verified on-chain via eth_getCode + relayer() read on
// 2026-09-05; relayer = 0x5A391a3A2d6d885C412FE24be624126694de08dA).
const MAINNET_ESCROW_ADDRESS = "0xeE234cEb85697b64800E696699b7841e00413B4f" as const;

// Populated as contracts are deployed on each chain.
// Deploy script (deploy-escrow-standalone.mjs) writes addresses here automatically.
export const ESCROW_ADDRESSES: Record<number, `0x${string}`> = {
  // ── Mainnets (all verified deployed at the canonical CREATE2 address) ──────
  1:      MAINNET_ESCROW_ADDRESS,   // Ethereum      — DEPLOYED ✓
  10:     MAINNET_ESCROW_ADDRESS,   // Optimism      — DEPLOYED ✓
  56:     MAINNET_ESCROW_ADDRESS,   // BSC           — DEPLOYED ✓
  43114:  MAINNET_ESCROW_ADDRESS,   // Avalanche     — DEPLOYED ✓
  59144:  MAINNET_ESCROW_ADDRESS,   // Linea         — DEPLOYED ✓
  534352: MAINNET_ESCROW_ADDRESS,   // Scroll        — DEPLOYED ✓
  8453:   MAINNET_ESCROW_ADDRESS,   // Base          — DEPLOYED ✓
  42161:  MAINNET_ESCROW_ADDRESS,   // Arbitrum      — DEPLOYED ✓
  137:    MAINNET_ESCROW_ADDRESS,   // Polygon       — DEPLOYED ✓
  324:    MAINNET_ESCROW_ADDRESS,   // zkSync Era    — DEPLOYED ✓
  1329:   MAINNET_ESCROW_ADDRESS,   // Sei           — DEPLOYED ✓
  130:    MAINNET_ESCROW_ADDRESS,   // Unichain      — DEPLOYED ✓
  // ── Testnets ────────────────────────────────────────────────────────────────
  11155111: "0x4deb6023abD9E1C640aDa35201be8ff591d21cF2", // Sepolia — DEPLOYED ✓
};

/**
 * Chain IDs where the escrow contract is actually deployed and verified.
 * Any chain NOT in this set must be blocked, even if ESCROW_ADDRESSES has
 * an entry. Add a chain ID here only after deploying + verifying the
 * contract on-chain and updating ESCROW_ADDRESSES to the real address.
 */
export const DEPLOYED_ESCROW_CHAINS = new Set<number>([
  1, 10, 56, 43114, 59144, 534352, 8453, 42161, 137, 324, 1329, 130, // mainnets ✓
  11155111, // Sepolia
]);

/**
 * Returns true only for chains where the escrow contract is both present in
 * ESCROW_ADDRESSES AND is a real deployed contract (not the placeholder).
 * Use this instead of `isEscrowChain` whenever the check involves locking
 * or releasing real user funds.
 */
export function isEscrowDeployed(chainId: number): boolean {
  return DEPLOYED_ESCROW_CHAINS.has(chainId) &&
    !!ESCROW_ADDRESSES[chainId];
}

const CHAIN_BY_ID = {
  // ── Mainnets ────────────────────────────────────────────────────────────────
  1:      mainnet,
  8453:   base,
  42161:  arbitrum,
  10:     optimism,
  137:    polygon,
  56:     bsc,
  43114:  avalanche,
  324:    zksync,
  59144:  linea,
  534352: scroll,
  1329:   sei,
  130:    unichain,
  // ── Testnets ────────────────────────────────────────────────────────────────
  11155111: sepolia,
  84532:    baseSepolia,
  421614:   arbitrumSepolia,
  11155420: optimismSepolia,
  80002:    polygonAmoy,
  97:       bscTestnet,
  43113:    avalancheFuji,
} as const;

const RPC_URLS: Record<number, string> = {
  // ── Mainnets ────────────────────────────────────────────────────────────────
  1:      process.env.ETH_RPC_URL       ?? "https://eth.llamarpc.com",
  8453:   process.env.BASE_RPC_URL      ?? "https://mainnet.base.org",
  42161:  process.env.ARBITRUM_RPC_URL  ?? "https://arb1.arbitrum.io/rpc",
  10:     process.env.OPTIMISM_RPC_URL  ?? "https://mainnet.optimism.io",
  137:    process.env.POLYGON_RPC_URL   ?? "https://polygon-bor-rpc.publicnode.com",
  56:     process.env.BSC_RPC_URL       ?? "https://bsc-dataseed.binance.org",
  43114:  process.env.AVALANCHE_RPC_URL ?? "https://api.avax.network/ext/bc/C/rpc",
  324:    process.env.ZKSYNC_RPC_URL    ?? "https://mainnet.era.zksync.io",
  59144:  process.env.LINEA_RPC_URL    ?? "https://rpc.linea.build",
  534352: process.env.SCROLL_RPC_URL   ?? "https://rpc.scroll.io",
  1329:   process.env.SEI_RPC_URL      ?? "https://sei-evm-rpc.publicnode.com",
  130:    process.env.UNICHAIN_RPC_URL  ?? "https://mainnet.unichain.org",
  // ── Testnets ────────────────────────────────────────────────────────────────
  11155111: process.env.SEPOLIA_RPC_URL       ?? "https://ethereum-sepolia-rpc.publicnode.com",
  84532:    process.env.BASE_SEPOLIA_RPC_URL   ?? "https://sepolia.base.org",
  421614:   process.env.ARB_SEPOLIA_RPC_URL    ?? "https://sepolia-rollup.arbitrum.io/rpc",
  11155420: process.env.OP_SEPOLIA_RPC_URL     ?? "https://sepolia.optimism.io",
  80002:    process.env.POLYGON_AMOY_RPC_URL   ?? "https://rpc-amoy.polygon.technology",
  97:       process.env.BSC_TESTNET_RPC_URL    ?? "https://bsc-testnet-rpc.publicnode.com",
  43113:    process.env.AVAX_FUJI_RPC_URL      ?? "https://api.avax-test.network/ext/bc/C/rpc",
};

const EXPLORER: Record<number, string> = {
  // ── Mainnets ────────────────────────────────────────────────────────────────
  1:      "https://etherscan.io/tx/",
  8453:   "https://basescan.org/tx/",
  42161:  "https://arbiscan.io/tx/",
  10:     "https://optimistic.etherscan.io/tx/",
  137:    "https://polygonscan.com/tx/",
  56:     "https://bscscan.com/tx/",
  43114:  "https://snowtrace.io/tx/",
  324:    "https://explorer.zksync.io/tx/",
  59144:  "https://lineascan.build/tx/",
  534352: "https://scrollscan.com/tx/",
  1329:   "https://seitrace.com/tx/",
  130:    "https://uniscan.xyz/tx/",
  // ── Testnets ────────────────────────────────────────────────────────────────
  11155111: "https://sepolia.etherscan.io/tx/",
  84532:    "https://sepolia.basescan.org/tx/",
  421614:   "https://sepolia.arbiscan.io/tx/",
  11155420: "https://sepolia-optimism.etherscan.io/tx/",
  80002:    "https://amoy.polygonscan.com/tx/",
  97:       "https://testnet.bscscan.com/tx/",
  43113:    "https://testnet.snowtrace.io/tx/",
};

// Read lazily so the module loads even when EVM_WALLET_SECRET is absent.
const EVM_WALLET_SECRET = process.env.EVM_WALLET_SECRET ?? "";

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
  const raw = EVM_WALLET_SECRET;
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
  // Only scan chains where escrow is actually deployed — never probe
  // placeholder or unconfigured chains (fail-closed safety).
  const chainIds = [...DEPLOYED_ESCROW_CHAINS];
  // ── Fail-closed: any per-chain RPC error throws. ─────────────────────
  // We intentionally do NOT use allSettled here — if even one chain we
  // can't read, we can't tell whether the deposit is there. The caller
  // (orders.ts precheck) catches this and skips the match.
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
  // ── FAIL-CLOSED: do NOT swallow RPC errors here. ─────────────────────
  // The contract returns a zero-depositor struct when no deposit exists,
  // so a successful read with depositor=0x0 means "no deposit." A thrown
  // error means "RPC unreachable / unknown state" and the caller MUST
  // decide whether to retry or gate the trade. Returning null on error
  // would let RPC outages look identical to "no deposit" → unsafe
  // settlement decisions.
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
const RELEASE_TIMEOUT_MS = 90_000;

export async function releaseEscrow(
  orderId:   string,
  recipient: string,
  chainId:   number,
): Promise<ReleaseResult> {
  // Safety gate: block any chain that doesn't have a real deployed contract.
  if (!isEscrowDeployed(chainId)) {
    return {
      ok:     false,
      reason: `Escrow contract not deployed on chain ${chainId}. ` +
              `Escrow is live on Ethereum, Optimism, BSC, Avalanche, Linea, Scroll, ` +
              `Base, Arbitrum, Polygon, zkSync Era, Sei, Unichain, and Sepolia.`,
    };
  }

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
    // Enforce a hard timeout so a stuck RPC or unresponsive node cannot hang
    // the relayer indefinitely, which would block subsequent escrow settlements.
    const txHash = await Promise.race([
      wallet.writeContract({
        address: escrow,
        abi:     ESCROW_ABI,
        functionName: "release",
        args:    [orderIdToBytes32(orderId), recipient as `0x${string}`],
        nonce,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`releaseEscrow timed out after ${RELEASE_TIMEOUT_MS / 1000}s on chain ${chainId}`)),
          RELEASE_TIMEOUT_MS,
        )
      ),
    ]);
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
  p: SettleEscrowMatchParams & {
    /** Optional pre-resolved chain hints (from orders.ts precheck) — when
     *  provided, we skip re-scanning all chains and reuse the precheck's
     *  decision so the per-request settlement view is consistent. */
    prefetchedSellerChain?: number | null;
    prefetchedBuyerChain?:  number | null;
  },
): Promise<SettleEscrowMatchResult & {
  bothLocked: boolean;
  skipReason?: string;
  resolvedChainId?: number;
}> {
  // ── Auto-detect: which chain does each leg live on? ─────────────────────
  // Reuse precheck values when provided to avoid double-scanning all chains
  // (which would double the RPC cost AND can yield contradictory decisions
  // under flaky RPC). Falls back to scan when no hint provided.
  const [sellerChain, buyerChain] = await Promise.all([
    p.prefetchedSellerChain !== undefined
      ? Promise.resolve(p.prefetchedSellerChain)
      : findEscrowChain(p.sellerOrderId),
    p.prefetchedBuyerChain !== undefined
      ? Promise.resolve(p.prefetchedBuyerChain)
      : findEscrowChain(p.buyerOrderId),
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

  // Case 3: both locked but on DIFFERENT chains → release each leg on its
  // own chain. Both runs start in parallel; any that fail are retried up to
  // 2 times with exponential back-off (each release is idempotent on the contract).
  if (sellerChain !== buyerChain) {
    let [baseLeg, quoteLeg] = await Promise.all([
      releaseEscrow(p.sellerOrderId, p.buyerAddress,  sellerChain),
      releaseEscrow(p.buyerOrderId,  p.sellerAddress, buyerChain),
    ]);
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (baseLeg.ok && quoteLeg.ok) break;
      await new Promise(r => setTimeout(r, attempt * 2_000));
      if (!baseLeg.ok) {
        logger.warn({ sellerOrderId: p.sellerOrderId, attempt }, "escrowRelayer: retrying base-leg (cross-chain)");
        baseLeg  = await releaseEscrow(p.sellerOrderId, p.buyerAddress,  sellerChain);
      }
      if (!quoteLeg.ok) {
        logger.warn({ buyerOrderId: p.buyerOrderId, attempt }, "escrowRelayer: retrying quote-leg (cross-chain)");
        quoteLeg = await releaseEscrow(p.buyerOrderId,  p.sellerAddress, buyerChain);
      }
    }
    return { bothLocked: true, baseLeg, quoteLeg, resolvedChainId: sellerChain };
  }

  // Case 4: both locked on the same chain → release base leg first, then quote.
  // If base succeeds but quote fails, auto-retry the quote leg up to 2 times.
  // The contract is idempotent — replaying a completed release is a safe no-op.
  const chainId = sellerChain;
  const baseLeg = await releaseEscrow(p.sellerOrderId, p.buyerAddress, chainId);
  let quoteLeg  = await releaseEscrow(p.buyerOrderId,  p.sellerAddress, chainId);
  if (baseLeg.ok && !quoteLeg.ok) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await new Promise(r => setTimeout(r, attempt * 2_000));
      logger.warn({ buyerOrderId: p.buyerOrderId, attempt }, "escrowRelayer: retrying quote-leg (same-chain)");
      quoteLeg = await releaseEscrow(p.buyerOrderId, p.sellerAddress, chainId);
      if (quoteLeg.ok) break;
    }
  }
  return { bothLocked: true, baseLeg, quoteLeg, resolvedChainId: chainId };
}
