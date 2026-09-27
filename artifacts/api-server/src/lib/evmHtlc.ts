/**
 * evmHtlc.ts — EVM HTLC settlement service for OrahDEX
 *
 * ── PURPOSE ───────────────────────────────────────────────────────────────────
 *
 *   Manages atomic settlement sessions for EVM-to-EVM trades (e.g. ETH/USDT).
 *   Each session tracks a pair of HTLC locks on an EVM chain:
 *     • Seller locks ETH (or ERC-20) → buyer receives on reveal
 *     • Buyer  locks USDT (or ERC-20) → seller receives on reveal
 *
 *   The OrahDEX server generates the secret; users lock from their own wallets
 *   (MetaMask/WalletConnect) by calling `lockETH()` or `lockToken()` on the
 *   deployed OrahDEXHTLC contract.
 *
 * ── NON-CUSTODIAL MODEL ───────────────────────────────────────────────────────
 *
 *   OrahDEX never holds user funds. The contract holds them atomically.
 *   The server only:
 *     1. Generates the random secret (server-side entropy)
 *     2. Returns lock instructions (contract address, secretHash, calldata)
 *     3. Monitors for Locked events via JSON-RPC polling
 *     4. Calls reveal() once both parties have locked
 *
 * ── SETTLEMENT FLOW ──────────────────────────────────────────────────────────
 *
 *   orders.ts matching engine detects EVM↔EVM fill
 *     → initiateEvmHtlcSession()
 *     → returns { sellerInstructions, buyerInstructions }
 *   frontend shows "Lock X ETH" MetaMask button to seller
 *   frontend shows "Lock Y USDT" MetaMask button to buyer
 *   EVM HTLC watcher polls for Locked events (pollEvmHtlcSessions)
 *     → when both locked → relayer calls reveal() on both locks
 *   status transitions: PENDING → SELLER_LOCKED / BUYER_LOCKED → BOTH_LOCKED
 *     → REVEALING → COMPLETED
 *
 * ── SUPPORTED CHAINS ─────────────────────────────────────────────────────────
 *
 *   chainId=1   (Ethereum Mainnet)  — env: EVM_HTLC_CONTRACT_ETH
 *   chainId=137 (Polygon Mainnet)   — env: EVM_HTLC_CONTRACT_POLYGON
 *   chainId=56  (BNB Smart Chain)   — env: EVM_HTLC_CONTRACT_BSC
 *
 * ── TIMELOCK WINDOWS ─────────────────────────────────────────────────────────
 *
 *   Seller lock: now + 30 min  (revealed FIRST by the relayer)
 *   Buyer  lock: now + 60 min  (revealed SECOND — must outlive seller's)
 *
 *   The relayer reveals the seller leg first, publishing the secret; the
 *   buyer leg must remain revealable afterwards, so buyer's timelock STRICTLY
 *   exceeds seller's. Never invert one without the other (enforced below).
 */

import crypto, {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { db, withDbRetry } from "@workspace/db";
import { evmHtlcSessionsTable } from "@workspace/db/schema";
import { eq, and, lt, notInArray, inArray } from "drizzle-orm";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { logger } from "./logger.js";
import { isDbConnError } from "./dbErrors.js";

// ── HTLC secret encryption (AES-256-GCM) ─────────────────────────────────────
// Secrets are encrypted at rest to prevent DB dump / read-replica disclosure.
// Key is derived via SHA-256 from EVM_RELAYER_KEY or EVM_WALLET_SECRET.
//
// IMPORTANT: The source env var must be high-entropy (>= 32 random bytes / 64
// hex chars, e.g. a secp256k1 private key).  A low-entropy passphrase could be
// brute-forced to recover historical secrets.
//
// Storage format: "iv_hex:authTag_hex:ciphertext_hex" (colon-delimited).
// Legacy plain-hex secrets (no ":") are read back as-is for migration compatibility.

function getHtlcEncryptionKey(): Buffer {
  const raw = process.env.EVM_RELAYER_KEY ?? process.env.EVM_WALLET_SECRET ?? "";
  if (!raw) {
    throw new Error("[FATAL] EVM_RELAYER_KEY or EVM_WALLET_SECRET must be set to encrypt HTLC secrets.");
  }
  // Derive a 32-byte key deterministically from the raw secret via SHA-256.
  return Buffer.from(
    crypto.createHash("sha256").update(raw, "utf8").digest()
  );
}

function encryptHtlcSecret(plainHex: string): string {
  const key = getHtlcEncryptionKey();
  const iv  = randomBytes(12); // 96-bit IV for GCM
  const c   = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plainHex, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

function decryptHtlcSecret(stored: string): string {
  // Legacy plain hex secrets (pre-encryption migration): no ":" separators
  if (!stored.includes(":")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 3) {
    // Malformed — throw rather than returning garbage as a "secret".
    // The caller must surface this to the operator; using a corrupt secret
    // could cause an incorrect HTLC reveal and potential fund loss.
    throw new Error(`evmHtlc: malformed encrypted secret (${parts.length} parts, expected 3) — db migration required`);
  }
  const [ivHex, tagHex, encHex] = parts;
  if (!ivHex || !tagHex || !encHex) {
    throw new Error("evmHtlc: malformed encrypted secret (empty part) — cannot decrypt");
  }
  const key = getHtlcEncryptionKey();
  const d   = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"), { authTagLength: 16 });
  d.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([d.update(Buffer.from(encHex, "hex")), d.final()]).toString("utf8");
}

// ── Contract ABI (subset — only methods we call from the relayer) ─────────────

const HTLC_ABI = parseAbi([
  "function lockETH(bytes32 id, bytes32 secretHash, address recipient, uint256 timelockUnix) payable",
  "function lockToken(bytes32 id, bytes32 secretHash, address token, uint256 amount, address recipient, uint256 timelockUnix)",
  "function reveal(bytes32 id, bytes32 secret)",
  "function refund(bytes32 id)",
  "function getLock(bytes32 id) view returns (address sender, address recipient, address token, uint256 amount, bytes32 secretHash, uint256 timelockUnix, bool revealed, bool refunded)",
  "function isLocked(bytes32 id) view returns (bool)",
  "event Locked(bytes32 indexed id, address indexed sender, address indexed recipient, address token, uint256 amount, bytes32 secretHash, uint256 timelockUnix)",
  "event Revealed(bytes32 indexed id, bytes32 secret, address indexed recipient, uint256 amount)",
  "event Refunded(bytes32 indexed id, address indexed sender, uint256 amount)",
]);

// ── Chain configuration ────────────────────────────────────────────────────────

export interface ChainConfig {
  chainId:         number;
  name:            string;
  rpcUrl:          string;
  contractAddress: Address | null;
  nativeSymbol:    string;
  blockExplorer:   string;
  usdtAddress:     Address | null;
  usdcAddress:     Address | null;
}

// Deployed OrahDEXEscrow contract address (same address on all mainnet chains via CREATE2).
// Used as the settlement contract for EVM HTLC sessions on chains where EVM_HTLC_CONTRACT_*
// env vars are not explicitly set.
// HTLC contract per chain: env EVM_HTLC_CONTRACT_* or null (settlement refused). Never fall back to another contract.

export const EVM_CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId:         1,
    name:            "Ethereum Mainnet",
    rpcUrl:          process.env.ETH_RPC_URL ?? "https://eth.llamarpc.com",
    contractAddress: (process.env.EVM_HTLC_CONTRACT_ETH as Address | undefined) ?? null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://etherscan.io",
    usdtAddress:     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    usdcAddress:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  137: {
    chainId:         137,
    name:            "Polygon Mainnet",
    rpcUrl:          process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com",
    contractAddress: (process.env.EVM_HTLC_CONTRACT_POLYGON as Address | undefined) ?? null,
    nativeSymbol:    "MATIC",
    blockExplorer:   "https://polygonscan.com",
    usdtAddress:     "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    usdcAddress:     "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  },
  56: {
    chainId:         56,
    name:            "BNB Smart Chain",
    rpcUrl:          process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org",
    contractAddress: (process.env.EVM_HTLC_CONTRACT_BSC as Address | undefined) ?? null,
    nativeSymbol:    "BNB",
    blockExplorer:   "https://bscscan.com",
    usdtAddress:     "0x55d398326f99059fF775485246999027B3197955",
    usdcAddress:     "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  },
  8453: {
    chainId:         8453,
    name:            "Base",
    rpcUrl:          process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://basescan.org",
    usdtAddress:     null,
    usdcAddress:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  42161: {
    chainId:         42161,
    name:            "Arbitrum One",
    rpcUrl:          process.env.ARB_RPC_URL ?? "https://arb1.arbitrum.io/rpc",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://arbiscan.io",
    usdtAddress:     "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    usdcAddress:     "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  10: {
    chainId:         10,
    name:            "Optimism",
    rpcUrl:          process.env.OP_RPC_URL ?? "https://mainnet.optimism.io",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://optimistic.etherscan.io",
    usdtAddress:     "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    usdcAddress:     "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
  43114: {
    chainId:         43114,
    name:            "Avalanche",
    rpcUrl:          process.env.AVAX_RPC_URL ?? "https://api.avax.network/ext/bc/C/rpc",
    contractAddress: null,
    nativeSymbol:    "AVAX",
    blockExplorer:   "https://snowtrace.io",
    usdtAddress:     "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    usdcAddress:     "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  },
  324: {
    chainId:         324,
    name:            "zkSync Era",
    rpcUrl:          process.env.ZKSYNC_RPC_URL ?? "https://mainnet.era.zksync.io",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://explorer.zksync.io",
    usdtAddress:     null,
    usdcAddress:     "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
  },
  59144: {
    chainId:         59144,
    name:            "Linea",
    rpcUrl:          process.env.LINEA_RPC_URL ?? "https://rpc.linea.build",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://lineascan.build",
    usdtAddress:     "0xA219439258ca9da29E9Cc4cE5596924745e12B93",
    usdcAddress:     "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
  },
  534352: {
    chainId:         534352,
    name:            "Scroll",
    rpcUrl:          process.env.SCROLL_RPC_URL ?? "https://rpc.scroll.io",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://scrollscan.com",
    usdtAddress:     "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
    usdcAddress:     "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
  },
  1329: {
    chainId:         1329,
    name:            "Sei",
    rpcUrl:          process.env.SEI_RPC_URL ?? "https://sei-evm-rpc.publicnode.com",
    contractAddress: null,
    nativeSymbol:    "SEI",
    blockExplorer:   "https://seitrace.com",
    usdtAddress:     null,
    usdcAddress:     "0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1",
  },
  130: {
    chainId:         130,
    name:            "Unichain",
    rpcUrl:          process.env.UNICHAIN_RPC_URL ?? "https://mainnet.unichain.org",
    contractAddress: null,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://uniscan.xyz",
    usdtAddress:     null,
    usdcAddress:     "0x078D782b760474a361dDA0AF3839290b0EbBD45c",
  },
  11155111: {
    chainId:         11155111,
    name:            "Sepolia",
    rpcUrl:          process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
    contractAddress: (process.env.EVM_HTLC_CONTRACT_SEPOLIA as Address | undefined) ?? "" as Address,
    nativeSymbol:    "ETH",
    blockExplorer:   "https://sepolia.etherscan.io",
    usdtAddress:     null,
    usdcAddress:     null,
  },
};

// ── Timelock constants ─────────────────────────────────────────────────────────

const SELLER_TIMELOCK_SECS = 30 * 60;   // 30 minutes (outer)
const BUYER_TIMELOCK_SECS  = 60 * 60;   // 60 minutes (inner — must OUTLIVE the 30m seller lock: secret is public after seller reveal, buyer lock must still be revealable)
const SESSION_TIMEOUT_SECS = 75 * 60;   // 75 min — must exceed the 60m buyer timelock so PARTIAL_REVEAL can retry to the end

// PROTOCOL INVARIANT: the relayer reveals the SELLER leg FIRST; the secret is
// public from that instant, so the BUYER leg must remain revealable long
// after — buyer's timelock MUST exceed seller's. Never invert one without
// the other (audit P0).
if (BUYER_TIMELOCK_SECS <= SELLER_TIMELOCK_SECS + 15 * 60) {
  throw new Error("HTLC invariant violated: BUYER_TIMELOCK must exceed SELLER_TIMELOCK by >15m (seller leg reveals first)");
}

// ── Hash helpers ──────────────────────────────────────────────────────────────

/**
 * Compute keccak256 over a Buffer.  Returns 0x-prefixed 32-byte hex string.
 * Matches Solidity's keccak256(abi.encodePacked(bytes)) for raw byte inputs.
 */
function keccak256Hex(data: Buffer): Hex {
  const hash = keccak_256(new Uint8Array(data));
  return ("0x" + Buffer.from(hash).toString("hex")) as Hex;
}

/**
 * Derive a deterministic lock ID from the trade ID and side suffix.
 *
 *   sellerLockId = keccak256(tradeId + "_seller")
 *   buyerLockId  = keccak256(tradeId + "_buyer")
 *
 * Matches the Solidity equivalent used in event indexing.
 */
function deriveLockId(tradeId: string, sessionId: string, side: "seller" | "buyer"): Hex {
  return keccak256Hex(Buffer.from(`${tradeId}_${sessionId}_${side}`, "utf8"));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvmHtlcSessionParams {
  tradeId:       string;
  pair:          string;
  chainId:       number;
  sellerAddress: Address;
  buyerAddress:  Address;
  sellerAsset:   string;           // e.g. "ETH"
  sellerAmount:  string;           // in wei (string for precision)
  sellerToken:   Address | null;   // null = native ETH
  buyerAsset:    string;           // e.g. "USDT"
  buyerAmount:   string;           // in token's smallest unit
  buyerToken:    Address | null;   // null = native; usually USDT address
}

export interface LockInstruction {
  contractAddress: Address | null;
  lockId:          Hex;
  secretHash:      Hex;
  asset:           string;
  amount:          string;
  tokenAddress:    Address | null;
  timelockUnix:    number;
  /** Pre-encoded calldata for MetaMask `eth_sendTransaction` */
  calldata:        Hex;
  /** Human-readable instructions for the user */
  instructions:    string[];
}

export interface EvmHtlcSession {
  id:                 string;
  tradeId:            string;
  pair:               string;
  chainId:            number;
  contractAddress:    Address | null;
  secretHash:         Hex;
  status:             string;
  sellerAddress:      Address;
  buyerAddress:       Address;
  sellerLock:         LockInstruction;
  buyerLock:          LockInstruction;
  expiresAt:          number;  // Unix timestamp
  sellerLocked:       boolean;
  buyerLocked:        boolean;
  sellerLockTxid:     string | null;
  buyerLockTxid:      string | null;
  revealSellerTxid:   string | null;
  revealBuyerTxid:    string | null;
  createdAt:          string;
}

// ── Session creation ──────────────────────────────────────────────────────────

/**
 * Create a new EVM HTLC settlement session.
 *
 * Called by the orders route when an EVM/EVM trade fill is detected.
 * Returns full session details including pre-encoded calldata for both parties.
 *
 * If no HTLC contract is deployed on the requested chain, returns instructions
 * describing what the user needs to lock — UI shows a "pending deployment" card.
 */
export async function initiateEvmHtlcSession(
  params: EvmHtlcSessionParams
): Promise<EvmHtlcSession> {
  const {
    tradeId, pair, chainId,
    sellerAddress, buyerAddress,
    sellerAsset, sellerAmount, sellerToken,
    buyerAsset, buyerAmount, buyerToken,
  } = params;

  const chain = EVM_CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported EVM chain: ${chainId}`);
  const now   = Math.floor(Date.now() / 1000);

  const sellerTimelockUnix = now + SELLER_TIMELOCK_SECS;
  const buyerTimelockUnix  = now + BUYER_TIMELOCK_SECS;

  // Generate random 32-byte secret (server-side)
  const secretBuf  = crypto.randomBytes(32);
  const secret     = secretBuf.toString("hex");
  const secretHash = ("0x" + crypto.createHash("sha256").update(secretBuf).digest("hex")) as Hex;

  const sessionId   = crypto.randomUUID();
  const sellerLockId = deriveLockId(tradeId, sessionId, "seller");
  const buyerLockId  = deriveLockId(tradeId, sessionId, "buyer");

  const expiresAt = new Date((now + SESSION_TIMEOUT_SECS) * 1000);

  // ── Build lock instructions ──────────────────────────────────────────────

  const sellerInstruction = buildLockInstruction({
    lockId:         sellerLockId,
    secretHash,
    asset:          sellerAsset,
    amount:         sellerAmount,
    tokenAddress:   sellerToken,
    recipient:      buyerAddress,
    timelockUnix:   sellerTimelockUnix,
    contractAddress: chain.contractAddress,
  });

  const buyerInstruction = buildLockInstruction({
    lockId:         buyerLockId,
    secretHash,
    asset:          buyerAsset,
    amount:         buyerAmount,
    tokenAddress:   buyerToken,
    recipient:      sellerAddress,
    timelockUnix:   buyerTimelockUnix,
    contractAddress: chain.contractAddress,
  });

  // ── Persist to DB ────────────────────────────────────────────────────────
  // Store the secret encrypted at rest (AES-256-GCM). The plain secret is
  // only ever held in process memory for the duration of this call.

  const encryptedSecret = encryptHtlcSecret(secret);

  await db.insert(evmHtlcSessionsTable).values({
    id:               sessionId,
    tradeId,
    pair,
    chainId,
    contractAddress:  chain.contractAddress ?? "UNDEPLOYED",
    secret:           encryptedSecret,
    secretHash,
    sellerAddress:    sellerAddress.toLowerCase(),
    buyerAddress:     buyerAddress.toLowerCase(),
    sellerAsset,
    sellerAmount,
    sellerToken:      sellerToken ?? null,
    buyerAsset,
    buyerAmount,
    buyerToken:       buyerToken ?? null,
    sellerLockId,
    buyerLockId,
    sellerTimelockUnix,
    buyerTimelockUnix,
    status:           "PENDING_LOCKS",
    expiresAt,
  });

  logger.info(
    {
      sessionId,
      tradeId,
      pair,
      chainId,
      sellerAddress,
      buyerAddress,
      secretHash: secretHash.slice(0, 18) + "…",
      contractAddress: chain.contractAddress,
    },
    "evmHtlc: EVM HTLC session created"
  );

  return {
    id:               sessionId,
    tradeId,
    pair,
    chainId,
    contractAddress:  chain.contractAddress,
    secretHash,
    status:           "PENDING_LOCKS",
    sellerAddress,
    buyerAddress,
    sellerLock:       sellerInstruction,
    buyerLock:        buyerInstruction,
    expiresAt:        now + SESSION_TIMEOUT_SECS,
    sellerLocked:     false,
    buyerLocked:      false,
    sellerLockTxid:   null,
    buyerLockTxid:    null,
    revealSellerTxid: null,
    revealBuyerTxid:  null,
    createdAt:        new Date().toISOString(),
  };
}

// ── Lock instruction builder ──────────────────────────────────────────────────

function buildLockInstruction(p: {
  lockId:          Hex;
  secretHash:      Hex;
  asset:           string;
  amount:          string;
  tokenAddress:    Address | null;
  recipient:       Address;
  timelockUnix:    number;
  contractAddress: Address | null;
}): LockInstruction {
  const { lockId, secretHash, asset, amount, tokenAddress, recipient, timelockUnix, contractAddress } = p;
  const isNative = tokenAddress === null;

  let calldata: Hex;
  let instructions: string[];

  if (!contractAddress) {
    calldata     = "0x";
    instructions = [
      `OrahDEXHTLC contract not yet deployed on this chain.`,
      `Contact OrahDEX support to complete settlement.`,
    ];
  } else if (isNative) {
    calldata = encodeFunctionData({
      abi:          HTLC_ABI,
      functionName: "lockETH",
      args:         [lockId, secretHash, recipient, BigInt(timelockUnix)],
    });
    instructions = [
      `Send ${formatAmount(amount, 18)} ${asset} to the OrahDEX HTLC contract.`,
      `Contract: ${contractAddress}`,
      `Lock ID: ${lockId}`,
      `The MetaMask transaction value must equal your trade amount.`,
      `Your funds will be released to the counterparty when the trade secret is revealed.`,
      `If the trade is not completed within 30 minutes, you can reclaim your ${asset}.`,
    ];
  } else {
    calldata = encodeFunctionData({
      abi:          HTLC_ABI,
      functionName: "lockToken",
      args:         [lockId, secretHash, tokenAddress, BigInt(amount), recipient, BigInt(timelockUnix)],
    });
    instructions = [
      `Approve and lock ${asset} in the OrahDEX HTLC contract.`,
      `Contract: ${contractAddress}`,
      `Token: ${tokenAddress}`,
      `Lock ID: ${lockId}`,
      `Step 1: Approve the HTLC contract to spend your ${asset} (ERC-20 approve).`,
      `Step 2: Call lockToken() to lock your ${asset} in escrow.`,
      `Your funds are released to the counterparty when the trade secret is revealed.`,
      `If not completed within 60 minutes, you can reclaim your ${asset}.`,
    ];
  }

  return {
    contractAddress,
    lockId,
    secretHash,
    asset,
    amount,
    tokenAddress,
    timelockUnix,
    calldata,
    instructions,
  };
}

function formatAmount(amountWei: string, decimals: number): string {
  const bn = BigInt(amountWei);
  const divisor = BigInt(10 ** decimals);
  const whole = bn / divisor;
  const frac  = bn % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

// ── Session lookup ────────────────────────────────────────────────────────────

export async function getEvmHtlcSession(sessionId: string): Promise<EvmHtlcSession | null> {
  const rows = await db
    .select()
    .from(evmHtlcSessionsTable)
    .where(eq(evmHtlcSessionsTable.id, sessionId));

  if (!rows[0]) return null;
  return rowToSession(rows[0]);
}

export async function getEvmHtlcSessionByTrade(tradeId: string): Promise<EvmHtlcSession | null> {
  const rows = await db
    .select()
    .from(evmHtlcSessionsTable)
    .where(eq(evmHtlcSessionsTable.tradeId, tradeId));

  if (!rows[0]) return null;
  return rowToSession(rows[0]);
}

function rowToSession(row: typeof evmHtlcSessionsTable.$inferSelect): EvmHtlcSession {
  const chain = EVM_CHAINS[row.chainId] ?? (() => { throw new Error(`Unsupported EVM chain: ${row.chainId}`); })();
  const ca    = (row.contractAddress !== "UNDEPLOYED" ? row.contractAddress : null) as Address | null;

  const sellerLock = buildLockInstruction({
    lockId:          row.sellerLockId as Hex,
    secretHash:      row.secretHash as Hex,
    asset:           row.sellerAsset,
    amount:          row.sellerAmount,
    tokenAddress:    (row.sellerToken as Address | null) ?? null,
    recipient:       row.buyerAddress as Address,
    timelockUnix:    row.sellerTimelockUnix,
    contractAddress: ca,
  });

  const buyerLock = buildLockInstruction({
    lockId:          row.buyerLockId as Hex,
    secretHash:      row.secretHash as Hex,
    asset:           row.buyerAsset,
    amount:          row.buyerAmount,
    tokenAddress:    (row.buyerToken as Address | null) ?? null,
    recipient:       row.sellerAddress as Address,
    timelockUnix:    row.buyerTimelockUnix,
    contractAddress: ca,
  });

  return {
    id:               row.id,
    tradeId:          row.tradeId,
    pair:             row.pair,
    chainId:          row.chainId,
    contractAddress:  ca,
    secretHash:       row.secretHash as Hex,
    status:           row.status,
    sellerAddress:    row.sellerAddress as Address,
    buyerAddress:     row.buyerAddress as Address,
    sellerLock,
    buyerLock,
    expiresAt:        Math.floor(row.expiresAt.getTime() / 1000),
    sellerLocked:     row.sellerLocked,
    buyerLocked:      row.buyerLocked,
    sellerLockTxid:   row.sellerLockTxid ?? null,
    buyerLockTxid:    row.buyerLockTxid ?? null,
    revealSellerTxid: row.revealSellerTxid ?? null,
    revealBuyerTxid:  row.revealBuyerTxid ?? null,
    createdAt:        row.createdAt.toISOString(),
  };
}

// ── Watcher / Background poller ───────────────────────────────────────────────

const TERMINAL_STATUSES = ["COMPLETED", "SELLER_REFUNDED", "BUYER_REFUNDED", "EXPIRED"];

let watcherRunning = false;

/**
 * Start the EVM HTLC background watcher.
 * Polls active sessions every 30 seconds for on-chain Locked events.
 * Calls reveal() once both parties have locked.
 */
export async function startEvmHtlcWatcher(): Promise<void> {
  if (watcherRunning) return;
  watcherRunning = true;

  logger.info("evmHtlc: EVM HTLC watcher starting (30 s poll interval)");

  let pollRunning = false;
  setInterval(() => {
    if (pollRunning) return;
    pollRunning = true;
    pollEvmHtlcSessions()
      .catch(err => isDbConnError(err)
        ? logger.debug({ err }, "evmHtlc: poll cycle DB connect error (already handled)")
        : logger.warn({ err }, "evmHtlc: poll cycle error"))
      .finally(() => { pollRunning = false; });
  }, 30_000);

  // First poll immediately instead of waiting a full interval (P1)
  setTimeout(() => {
    if (pollRunning) return;
    pollRunning = true;
    pollEvmHtlcSessions().catch(err => logger.warn({ err }, "evmHtlc: initial poll error")).finally(() => { pollRunning = false; });
  }, 1_000);
}

async function pollEvmHtlcSessions(): Promise<void> {
  const now = new Date();

  let sessions: (typeof evmHtlcSessionsTable.$inferSelect)[];
  try {
    sessions = await withDbRetry(() =>
      db.select()
        .from(evmHtlcSessionsTable)
        .where(and(notInArray(evmHtlcSessionsTable.status, TERMINAL_STATUSES)))
    );
  } catch (err) {
    if (isDbConnError(err)) {
      logger.warn("evmHtlc: DB unavailable, skipping poll cycle");
    } else {
      logger.error({ err }, "evmHtlc: unexpected DB error in poll cycle");
    }
    return;
  }

  for (const session of sessions) {
    // Check expiry
    if (session.expiresAt < now) {
      await withDbRetry(() =>
        db.update(evmHtlcSessionsTable)
          .set({ status: "EXPIRED", updatedAt: new Date() })
          .where(eq(evmHtlcSessionsTable.id, session.id))
      );
      logger.info({ sessionId: session.id, tradeId: session.tradeId }, "evmHtlc: session expired");
      continue;
    }

    const chain = EVM_CHAINS[session.chainId];
    if (!chain || !chain.contractAddress || session.contractAddress === "UNDEPLOYED") continue;

    try {
      await checkSessionOnChain(session, chain);
    } catch (err) {
      logger.warn({ err, sessionId: session.id }, "evmHtlc: chain check failed");
    }
  }
}

/** P0 hardening: verify the COMPLETE on-chain lock (sender, recipient, token,
 * amount, secretHash, timelock, not revealed/refunded) — isLocked() alone only
 * proves "some nonzero lock exists", not that it is THIS session's intended lock. */
async function verifyLockFields(
  client: ReturnType<typeof createPublicClient>,
  contractAddress: Address,
  lockId: Hex,
  expected: { sender: string; recipient: string; token: string | null; amount: string; secretHash: string; timelockUnix: number },
): Promise<boolean> {
  try {
    const l = await client.readContract({ address: contractAddress, abi: HTLC_ABI, functionName: "getLock", args: [lockId] });
    const ZERO = "0x0000000000000000000000000000000000000000";
    const eq = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
    return (
      eq(l[0], expected.sender) &&
      eq(l[1], expected.recipient) &&
      eq(l[2] === ZERO ? null : (l[2] as string), expected.token) &&
      BigInt(l[3]).toString() === BigInt(expected.amount).toString() &&
      (l[4] as string).toLowerCase() === expected.secretHash.toLowerCase() &&
      Number(l[5]) === expected.timelockUnix &&
      l[6] === false && l[7] === false
    );
  } catch { return false; }
}

/** Concurrency/crash hardening: a reveal may have been confirmed on-chain
 * but the DB update lost to a crash — or a concurrent worker may have revealed
 * first. The chain is the truth; never resubmit reveal() against a revealed leg
 * (it reverts, and the receipt-check would misread that as settlement failure). */
async function isLegRevealed(
  client: ReturnType<typeof createPublicClient>,
  contractAddress: Address,
  lockId: Hex,
): Promise<boolean> {
  try {
    const l = await client.readContract({ address: contractAddress, abi: HTLC_ABI, functionName: "getLock", args: [lockId] });
    return l[6] === true;
  } catch { return false; }
}

async function checkSessionOnChain(
  session: typeof evmHtlcSessionsTable.$inferSelect,
  chain:   ChainConfig
): Promise<void> {
  const client = createPublicClient({
    transport: http(chain.rpcUrl),
  });

  const contractAddress = chain.contractAddress!;

  let sellerLocked = session.sellerLocked;
  let buyerLocked  = session.buyerLocked;

  if (!sellerLocked) {
    try {
      const locked = await verifyLockFields(client, contractAddress, session.sellerLockId as Hex, {
        sender: session.sellerAddress, recipient: session.buyerAddress,
        token: session.sellerToken, amount: session.sellerAmount,
        secretHash: session.secretHash, timelockUnix: session.sellerTimelockUnix,
      });
      if (locked) {
        sellerLocked = true;
        await db
          .update(evmHtlcSessionsTable)
          .set({
            sellerLocked: true,
            status:       buyerLocked ? "BOTH_LOCKED" : "SELLER_LOCKED",
            updatedAt:    new Date(),
          })
          .where(eq(evmHtlcSessionsTable.id, session.id));
        logger.info({ sessionId: session.id }, "evmHtlc: seller locked detected");
      }
    } catch { /* isLocked may revert if not found */ }
  }

  if (!buyerLocked) {
    try {
      const locked = await verifyLockFields(client, contractAddress, session.buyerLockId as Hex, {
        sender: session.buyerAddress, recipient: session.sellerAddress,
        token: session.buyerToken, amount: session.buyerAmount,
        secretHash: session.secretHash, timelockUnix: session.buyerTimelockUnix,
      });
      if (locked) {
        buyerLocked = true;
        await db
          .update(evmHtlcSessionsTable)
          .set({
            buyerLocked: true,
            status:      sellerLocked ? "BOTH_LOCKED" : "BUYER_LOCKED",
            updatedAt:   new Date(),
          })
          .where(eq(evmHtlcSessionsTable.id, session.id));
        logger.info({ sessionId: session.id }, "evmHtlc: buyer locked detected");
      }
    } catch { /* isLocked may revert if not found */ }
  }

  // Trigger reveal: fresh BOTH_LOCKED, retryable PARTIAL_REVEAL, or a stale
  // REVEALING left by a crashed worker (reconciled from chain below).
  const staleRevealing =
    session.status === "REVEALING" &&
    Date.now() - session.updatedAt.getTime() > 5 * 60 * 1000;

  if (sellerLocked && buyerLocked && (session.status === "BOTH_LOCKED" || staleRevealing)) {
    await revealBothLocks(session, chain);
  } else if (session.status === "PARTIAL_REVEAL") {
    // Seller was already revealed; retry the buyer leg.
    await revealBothLocks(session, chain);
  } else if (staleRevealing) {
    // Crash recovery (audit P0): a reveal worker died mid-operation. Read both
    // legs on-chain, repair DB state; next cycle re-claims via BOTH_LOCKED/PARTIAL.
    const sellerDone = await isLegRevealed(client, contractAddress, session.sellerLockId as Hex);
    const buyerDone  = await isLegRevealed(client, contractAddress, session.buyerLockId as Hex);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (sellerDone) patch.revealSellerTxid = "REVEALED_ON_CHAIN";
    if (buyerDone)  patch.revealBuyerTxid  = "REVEALED_ON_CHAIN";
    patch.status = sellerDone && buyerDone ? "COMPLETED" : sellerDone ? "PARTIAL_REVEAL" : "BOTH_LOCKED";
    await db.update(evmHtlcSessionsTable).set(patch).where(eq(evmHtlcSessionsTable.id, session.id));
    logger.info({ sessionId: session.id, sellerDone, buyerDone, status: patch.status }, "evmHtlc: stale REVEALING reconciled from chain");
  }
}

// ── Reveal (relayer action) ───────────────────────────────────────────────────

/**
 * Called by the watcher when both parties have locked.
 * The OrahDEX relayer wallet calls reveal() on both locks to settle the trade.
 *
 * Requires: EVM_RELAYER_KEY env variable with the relayer's EVM private key.
 */
async function revealBothLocks(
  session: typeof evmHtlcSessionsTable.$inferSelect,
  chain:   ChainConfig
): Promise<void> {
  const relayerKey = process.env.EVM_RELAYER_KEY as Hex | undefined;
  if (!relayerKey) {
    logger.warn(
      { sessionId: session.id },
      "evmHtlc: EVM_RELAYER_KEY not set — cannot auto-reveal. Set it to enable atomic settlement."
    );
    return;
  }

  // Serialize reveal work per session: take a row lock; if another worker is
  // already revealing (or the session completed), bail out. PARTIAL_REVEAL is the
  // only re-entry point — it means seller revealed, buyer leg needs a retry.
  // Atomic claim (audit P0): conditional UPDATE against the FRESH row status.
  // A stale in-memory PARTIAL_REVEAL can never admit a second worker — only
  // the transaction that changes exactly one row owns the reveal attempt.
  const claim = await db
    .update(evmHtlcSessionsTable)
    .set({ status: "REVEALING", updatedAt: new Date() })
    .where(and(
      eq(evmHtlcSessionsTable.id, session.id),
      inArray(evmHtlcSessionsTable.status, ["BOTH_LOCKED", "PARTIAL_REVEAL"]),
    ))
    .returning({ id: evmHtlcSessionsTable.id });
  if (!claim.length) {
    logger.debug({ sessionId: session.id }, "evmHtlc: reveal claim failed — owned by another worker, wrong state, or completed");
    return;
  }

  const account = privateKeyToAccount(relayerKey);
  const viemChain = buildViemChain(chain);
  const publicClient = createPublicClient({ transport: http(chain.rpcUrl), chain: viemChain });

  const walletClient = createWalletClient({
    account,
    transport: http(chain.rpcUrl),
    chain: viemChain,
  });

  const secretHex = ("0x" + decryptHtlcSecret(session.secret)) as Hex;

  // Re-fetch the freshest session to know which legs have already been revealed.
  const [fresh] = await db
    .select({ revealSellerTxid: evmHtlcSessionsTable.revealSellerTxid })
    .from(evmHtlcSessionsTable)
    .where(eq(evmHtlcSessionsTable.id, session.id));
  let sellerAlreadyRevealed = !!(fresh?.revealSellerTxid);

  // Idempotency/crash-recovery: a prior attempt may have confirmed the seller
  // reveal on-chain but died before the DB write. Trust the chain, not the DB.
  if (!sellerAlreadyRevealed && await isLegRevealed(publicClient, chain.contractAddress!, session.sellerLockId as Hex)) {
    await db
      .update(evmHtlcSessionsTable)
      .set({ revealSellerTxid: "REVEALED_ON_CHAIN", updatedAt: new Date() })
      .where(eq(evmHtlcSessionsTable.id, session.id));
    sellerAlreadyRevealed = true;
  }

  let sellerRevealed = sellerAlreadyRevealed;

  if (!sellerAlreadyRevealed) {
    try {
      const sellerRevealHash = await walletClient.writeContract({
        address:      chain.contractAddress!,
        abi:          HTLC_ABI,
        functionName: "reveal",
        args:         [session.sellerLockId as Hex, secretHex],
      });

      const sellerRc = await publicClient.waitForTransactionReceipt({ hash: sellerRevealHash });
      if (sellerRc.status !== "success") throw new Error(`seller reveal reverted (tx ${sellerRevealHash})`);
      logger.info({ sessionId: session.id, txHash: sellerRevealHash }, "evmHtlc: seller reveal() confirmed on-chain");

      await db
        .update(evmHtlcSessionsTable)
        .set({ revealSellerTxid: sellerRevealHash, updatedAt: new Date() })
        .where(eq(evmHtlcSessionsTable.id, session.id));

      sellerRevealed = true;
    } catch (err) {
      logger.warn({ err, sessionId: session.id }, "evmHtlc: seller reveal() failed");
      // Leave session in REVEALING so the next poll cycle retries.
      return;
    }
  }

  // Only attempt buyer reveal once seller is confirmed revealed.
  if (sellerRevealed) {
    // Idempotency/crash-recovery for the buyer leg (same pattern as seller).
    if (await isLegRevealed(publicClient, chain.contractAddress!, session.buyerLockId as Hex)) {
      await db
        .update(evmHtlcSessionsTable)
        .set({ revealBuyerTxid: "REVEALED_ON_CHAIN", status: "COMPLETED", updatedAt: new Date() })
        .where(eq(evmHtlcSessionsTable.id, session.id));
      logger.info({ sessionId: session.id }, "evmHtlc: EVM HTLC settlement COMPLETED (buyer leg already revealed on-chain)");
    } else try {
      const buyerRevealHash = await walletClient.writeContract({
        address:      chain.contractAddress!,
        abi:          HTLC_ABI,
        functionName: "reveal",
        args:         [session.buyerLockId as Hex, secretHex],
      });

      const buyerRc = await publicClient.waitForTransactionReceipt({ hash: buyerRevealHash });
      if (buyerRc.status !== "success") throw new Error(`buyer reveal reverted (tx ${buyerRevealHash})`);
      logger.info({ sessionId: session.id, txHash: buyerRevealHash }, "evmHtlc: buyer reveal() confirmed on-chain");
      // COMPLETED below is now only reachable after BOTH receipts are success

      await db
        .update(evmHtlcSessionsTable)
        .set({
          revealBuyerTxid: buyerRevealHash,
          status:          "COMPLETED",
          updatedAt:       new Date(),
        })
        .where(eq(evmHtlcSessionsTable.id, session.id));

      logger.info({ sessionId: session.id }, "evmHtlc: EVM HTLC settlement COMPLETED");
    } catch (err) {
      // Seller revealed but buyer reveal failed. Mark PARTIAL_REVEAL so the
      // poller will retry this session on the next cycle until it succeeds or
      // the timelock expires. This prevents unilateral loss for the seller.
      logger.warn({ err, sessionId: session.id }, "evmHtlc: buyer reveal() failed — marking PARTIAL_REVEAL for retry");
      await db
        .update(evmHtlcSessionsTable)
        .set({ status: "PARTIAL_REVEAL", updatedAt: new Date() })
        .where(eq(evmHtlcSessionsTable.id, session.id));
    }
  }
}

function buildViemChain(chain: ChainConfig) {
  const { createPublicClient: _, ...viem } = { createPublicClient };
  void _;
  return {
    id:   chain.chainId,
    name: chain.name,
    nativeCurrency: chain.chainId === 56
      ? { name: "BNB",   symbol: "BNB",  decimals: 18 }
      : { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };
}

// ── Real-time lock detection via webhook ─────────────────────────────────────

/**
 * Called by the EVM webhook handler when a Locked event is detected on-chain
 * (replaces waiting for the 30 s poll cycle). Works with any webhook provider
 * that delivers EVM log events to /api/webhooks/evm.
 *
 * Flow:
 *  1. Find the active HTLC session whose sellerLockId or buyerLockId matches.
 *  2. Record the lock via confirmLockTx() (same path as frontend callback).
 *  3. If both parties are now locked, immediately call revealBothLocks() so
 *     settlement fires within seconds of the second lock confirming.
 *
 * @param lockId  bytes32 hex from topics[1] of the Locked event.
 * @param txHash  Transaction hash carrying the Locked event.
 */
export async function triggerEvmHtlcCheckByLockId(
  lockId: string,
  txHash: string,
): Promise<void> {
  // Fetch all non-terminal sessions — there are typically very few active at once.
  const sessions = await db
    .select()
    .from(evmHtlcSessionsTable)
    .where(notInArray(evmHtlcSessionsTable.status, TERMINAL_STATUSES));

  const session = sessions.find(
    s => s.sellerLockId === lockId || s.buyerLockId === lockId,
  );

  if (!session) {
    logger.debug(
      { lockId },
      "evmHtlc: triggerEvmHtlcCheckByLockId — no active session found (may be a different dApp)",
    );
    return;
  }

  const side: "seller" | "buyer" =
    session.sellerLockId === lockId ? "seller" : "buyer";

  logger.info(
    { sessionId: session.id, tradeId: session.tradeId, side, lockId, txHash },
    "evmHtlc: Locked event from QN Streams — recording lock",
  );

  // Record the lock (idempotent — safe to call even if already recorded)
  await confirmLockTx(session.id, side, txHash);

  // Re-fetch after update to get accurate locked flags
  const refreshed = await db
    .select()
    .from(evmHtlcSessionsTable)
    .where(eq(evmHtlcSessionsTable.id, session.id));

  const updated = refreshed[0];
  if (!updated) return;

  if (
    updated.sellerLocked &&
    updated.buyerLocked &&
    updated.status !== "REVEALING" &&
    updated.status !== "COMPLETED"
  ) {
    const chain = EVM_CHAINS[updated.chainId];
    if (!chain || !chain.contractAddress) {
      logger.warn(
        { sessionId: updated.id, chainId: updated.chainId },
        "evmHtlc: both locked but chain config missing — cannot auto-reveal",
      );
      return;
    }
    logger.info(
      { sessionId: updated.id },
      "evmHtlc: both locks confirmed via Streams — triggering immediate reveal",
    );
    await revealBothLocks(updated, chain);
  }
}

// ── Manual lock confirmation (webhook / frontend callback) ────────────────────

/**
 * Record a lock transaction when reported by the frontend.
 * (Supplementary to on-chain polling — faster UX.)
 */
export async function confirmLockTx(
  sessionId: string,
  side:      "seller" | "buyer",
  txHash:    string
): Promise<{ ok: boolean; status: string }> {
  const rows = await db
    .select()
    .from(evmHtlcSessionsTable)
    .where(eq(evmHtlcSessionsTable.id, sessionId));

  if (!rows[0]) return { ok: false, status: "SESSION_NOT_FOUND" };
  const session = rows[0];

  // Canonical gate: a reported lock tx is a HINT. Only getLock() field
  // verification promotes it to locked state. (P0 hardening)
  const chain = EVM_CHAINS[session.chainId];
  if (!chain || !chain.contractAddress) return { ok: false, status: "CHAIN_NOT_CONFIGURED" };
  const client = createPublicClient({ transport: http(chain.rpcUrl), chain: buildViemChain(chain) });
  const lockId = (side === "seller" ? session.sellerLockId : session.buyerLockId) as Hex;
  const expected = side === "seller"
    ? { sender: session.sellerAddress, recipient: session.buyerAddress, token: session.sellerToken, amount: session.sellerAmount, secretHash: session.secretHash, timelockUnix: session.sellerTimelockUnix }
    : { sender: session.buyerAddress, recipient: session.sellerAddress, token: session.buyerToken, amount: session.buyerAmount, secretHash: session.secretHash, timelockUnix: session.buyerTimelockUnix };
  if (!(await verifyLockFields(client, chain.contractAddress, lockId, expected))) {
    logger.warn({ sessionId, side, txHash }, "evmHtlc: lock failed on-chain field verification — not marking locked");
    return { ok: false, status: "LOCK_VERIFICATION_FAILED" };
  }

  const updates =
    side === "seller"
      ? { sellerLocked: true, sellerLockTxid: txHash }
      : { buyerLocked:  true, buyerLockTxid:  txHash };

  const newSellerLocked = side === "seller" ? true : session.sellerLocked;
  const newBuyerLocked  = side === "buyer"  ? true : session.buyerLocked;
  const newStatus = newSellerLocked && newBuyerLocked
    ? "BOTH_LOCKED"
    : side === "seller" ? "SELLER_LOCKED" : "BUYER_LOCKED";

  await db
    .update(evmHtlcSessionsTable)
    .set({ ...updates, status: newStatus, updatedAt: new Date() })
    .where(eq(evmHtlcSessionsTable.id, sessionId));

  logger.info({ sessionId, side, txHash, newStatus }, "evmHtlc: lock tx confirmed by frontend");
  return { ok: true, status: newStatus };
}
