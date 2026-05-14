/**
 * erc8004.ts — ERC-8004 Trustless Agent Identity, Discovery & Reputation
 *
 * Implements the full ERC-8004 stack for OrahDEX:
 *
 *   Identity Registry  — Register OrahDEX (and Keepers) as on-chain agents
 *                        (ERC-721 NFT minted at 0x8004A169…)
 *   Reputation Registry — Submit and query standardized 0-100 feedback scores
 *                        (0x8004BAa1…) bridging OrahDEX's internal Keeper
 *                        reputation engine to the public on-chain record.
 *   Discovery          — Enumerate agents in the Identity Registry, fetch
 *                        agent cards, and surface trading counterparties.
 *
 * Contract addresses (ETH mainnet, audited by Cyfrin + Nethermind + EF):
 *   IdentityRegistry   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   ReputationRegistry 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *
 * Sepolia testnet mirrors:
 *   IdentityRegistry   0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   ReputationRegistry 0x8004B663056A597Dffe9eCcC1965A193B7388713
 *
 * Key references:
 *   EIP spec  https://eips.ethereum.org/EIPS/eip-8004
 *   Contracts https://github.com/erc-8004/erc-8004-contracts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ── Network selection ─────────────────────────────────────────────────────────

const USE_MAINNET = (process.env.ERC8004_NETWORK ?? "mainnet") !== "sepolia";

export const IDENTITY_REGISTRY: Address = USE_MAINNET
  ? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  : "0x8004A818BFB912233c491871b3d84c89A494BD9e";

export const REPUTATION_REGISTRY: Address = USE_MAINNET
  ? "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63"
  : "0x8004B663056A597Dffe9eCcC1965A193B7388713";

export const VIEM_CHAIN   = USE_MAINNET ? mainnet : sepolia;
const ETH_RPC_URL  = process.env.ETH_RPC_URL ?? "https://ethereum.publicnode.com";

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const IDENTITY_ABI = parseAbi([
  // Registration
  "function register(string tokenURI) external returns (uint256 agentId)",
  "function register(string tokenURI, (string key, bytes value)[] metadata) external returns (uint256 agentId)",
  // Metadata
  "function setMetadata(uint256 agentId, string key, bytes value) external",
  "function getMetadata(uint256 agentId, string key) external view returns (bytes)",
  // ERC-721
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function tokenByIndex(uint256 index) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  // Events
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string tokenURI)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const REPUTATION_ABI = parseAbi([
  // Write
  "function submitFeedback(uint256 agentId, uint8 score, bytes32 tag, string feedbackURI) external",
  "function preauthorize(uint256 agentId, address reviewer) external",
  // Read
  "function getAggregateScore(uint256 agentId) external view returns (uint8 score, uint256 count)",
  "function getFeedbackCount(uint256 agentId) external view returns (uint256)",
  // Events
  "event FeedbackSubmitted(uint256 indexed agentId, address indexed reviewer, uint8 score, bytes32 tag)",
]);

// ── Viem clients ──────────────────────────────────────────────────────────────

function publicClient() {
  return createPublicClient({
    chain:     VIEM_CHAIN,
    transport: http(ETH_RPC_URL),
  });
}

function walletClient() {
  const raw = process.env.EVM_WALLET_SECRET ?? "";
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (stripped.length !== 64 || !/^[0-9a-fA-F]+$/.test(stripped)) {
    throw new Error("EVM_WALLET_SECRET is not a valid 32-byte hex private key");
  }
  const account = privateKeyToAccount(("0x" + stripped) as Hex);
  return {
    client: createWalletClient({
      account,
      chain:     VIEM_CHAIN,
      transport: http(ETH_RPC_URL),
    }),
    account,
  };
}

// ── Platform settings helpers ─────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(platformSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target:  platformSettingsTable.key,
      set:     { value, updatedAt: new Date() },
    });
}

export async function getOrahDexAgentId(): Promise<string | null> {
  return getSetting("erc8004_orahdex_agent_id");
}

export async function getKeeperAgentId(address: string): Promise<string | null> {
  return getSetting(`erc8004_keeper_${address.toLowerCase()}`);
}

// ── Agent card builder ────────────────────────────────────────────────────────

export interface Erc8004AgentCard {
  type:          string;
  name:          string;
  description:   string;
  image?:        string;
  endpoints:     { name: string; endpoint: string }[];
  supportedTrust: string[];
  registrations?: { agentId: number | string; agentRegistry: string }[];
}

/**
 * Build the ERC-8004 agent card JSON for OrahDEX.
 * Served at /.well-known/agent.json and stored as the tokenURI payload.
 */
export function buildOrahDexAgentCard(agentId?: string): Erc8004AgentCard {
  const domain = process.env.ORAHDEX_DOMAIN
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://orahdex.com");

  const card: Erc8004AgentCard = {
    type:        "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name:        "OrahDEX",
    description: [
      "Unified sovereign multi-chain non-custodial exchange.",
      "Provides atomic HTLC settlement, cross-chain swaps, and spot/perpetuals trading",
      "across 958 markets (ETH, Polygon, BSC, Base, Arbitrum, Optimism + BSV).",
      "Self-custody first — users hold their own keys; funds settle directly on-chain.",
      "Keeper network provides decentralised HTLC relay and reputation.",
    ].join(" "),
    image: `${domain}/logo.png`,
    endpoints: [
      { name: "web",   endpoint: domain },
      { name: "A2A",   endpoint: `${domain}/.well-known/agent.json` },
      { name: "MCP",   endpoint: `${domain}/api/mcp` },
    ],
    supportedTrust: ["reputation", "crypto-economic"],
  };

  if (agentId) {
    card.registrations = [{
      agentId,
      agentRegistry: `eip155:${VIEM_CHAIN.id}:${IDENTITY_REGISTRY}`,
    }];
  }

  return card;
}

/**
 * Build the agent card for an OrahDEX Keeper.
 */
export function buildKeeperAgentCard(params: {
  address:     string;
  displayName: string;
  avatarUrl?:  string | null;
  roles:       string[];
  tier:        string;
  score:       number;
  agentId?:    string;
}): Erc8004AgentCard {
  const domain = process.env.ORAHDEX_DOMAIN
    ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://orahdex.com");

  const card: Erc8004AgentCard = {
    type:  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name:  params.displayName || `OrahDEX Keeper ${params.address.slice(0, 8)}`,
    description: [
      `OrahDEX Keeper — roles: ${params.roles.join(", ")}.`,
      `Reputation tier: ${params.tier} (score ${params.score}).`,
      "Provides HTLC relay, liquidity, and oracle services on OrahDEX.",
    ].join(" "),
    image: params.avatarUrl ?? undefined,
    endpoints: [
      { name: "web",           endpoint: `${domain}/keeper/${params.address}` },
      { name: "agentWallet",   endpoint: `eip155:1:${params.address}` },
    ],
    supportedTrust: ["reputation"],
  };

  if (params.agentId) {
    card.registrations = [{
      agentId:       params.agentId,
      agentRegistry: `eip155:${VIEM_CHAIN.id}:${IDENTITY_REGISTRY}`,
    }];
  }

  return card;
}

// ── Identity Registry — read ──────────────────────────────────────────────────

export interface AgentEntry {
  agentId:  string;
  owner:    string;
  tokenURI: string;
  card?:    Erc8004AgentCard;
}

/** Total number of agents registered in the Identity Registry. */
export async function getTotalAgents(): Promise<number> {
  try {
    const client = publicClient();
    const n = await client.readContract({
      address:      IDENTITY_REGISTRY,
      abi:          IDENTITY_ABI,
      functionName: "totalSupply",
    });
    return Number(n);
  } catch (err) {
    logger.warn({ err }, "erc8004: totalSupply call failed");
    return 0;
  }
}

/** Enumerate agents by index range (cheap enumeration via ERC-721 Enumerable). */
export async function discoverAgents(params: {
  limit?:  number;
  offset?: number;
  fetchCards?: boolean;
}): Promise<AgentEntry[]> {
  const { limit = 20, offset = 0, fetchCards = false } = params;
  const client  = publicClient();

  let total: number;
  try {
    const n = await client.readContract({
      address:      IDENTITY_REGISTRY,
      abi:          IDENTITY_ABI,
      functionName: "totalSupply",
    });
    total = Number(n);
  } catch {
    return [];
  }

  const entries: AgentEntry[] = [];
  const end = Math.min(offset + limit, total);

  for (let i = offset; i < end; i++) {
    try {
      const agentId = await client.readContract({
        address:      IDENTITY_REGISTRY,
        abi:          IDENTITY_ABI,
        functionName: "tokenByIndex",
        args:         [BigInt(i)],
      });
      const [owner, tokenURI] = await Promise.all([
        client.readContract({
          address:      IDENTITY_REGISTRY,
          abi:          IDENTITY_ABI,
          functionName: "ownerOf",
          args:         [agentId],
        }),
        client.readContract({
          address:      IDENTITY_REGISTRY,
          abi:          IDENTITY_ABI,
          functionName: "tokenURI",
          args:         [agentId],
        }),
      ]);

      const entry: AgentEntry = {
        agentId:  agentId.toString(),
        owner:    owner as string,
        tokenURI: tokenURI as string,
      };

      if (fetchCards) {
        try {
          entry.card = await fetchAgentCard(tokenURI as string);
        } catch {
          // Non-fatal — card may be IPFS or temporarily unreachable
        }
      }

      entries.push(entry);
    } catch {
      // Token may not exist at this index — skip
    }
  }

  return entries;
}

/** Get a single agent by its agentId. */
export async function getAgent(agentId: string): Promise<AgentEntry | null> {
  const client = publicClient();
  const id = BigInt(agentId);
  try {
    const [owner, tokenURI] = await Promise.all([
      client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "ownerOf",   args: [id] }),
      client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "tokenURI",  args: [id] }),
    ]);
    return {
      agentId,
      owner:    owner as string,
      tokenURI: tokenURI as string,
    };
  } catch {
    return null;
  }
}

/** Get all agent IDs owned by a given address. */
export async function getAgentsByOwner(address: Address): Promise<AgentEntry[]> {
  const client  = publicClient();
  const entries: AgentEntry[] = [];
  try {
    const balance = await client.readContract({
      address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "balanceOf", args: [address],
    });
    for (let i = 0n; i < (balance as bigint); i++) {
      const agentId = await client.readContract({
        address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "tokenOfOwnerByIndex", args: [address, i],
      });
      const tokenURI = await client.readContract({
        address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: "tokenURI", args: [agentId as bigint],
      });
      entries.push({ agentId: (agentId as bigint).toString(), owner: address, tokenURI: tokenURI as string });
    }
  } catch { /* not enumerable or empty */ }
  return entries;
}

/** Fetch and parse the agent card JSON from a tokenURI (https or data:). */
export async function fetchAgentCard(tokenURI: string): Promise<Erc8004AgentCard> {
  if (tokenURI.startsWith("data:application/json;base64,")) {
    const b64 = tokenURI.slice("data:application/json;base64,".length);
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  }
  if (tokenURI.startsWith("data:application/json,")) {
    return JSON.parse(decodeURIComponent(tokenURI.slice("data:application/json,".length)));
  }
  // SSRF protection: tokenURI comes from the blockchain and can be any URL.
  // Only allow HTTPS and block private/loopback ranges.
  let parsedUri: URL;
  try {
    parsedUri = new URL(tokenURI);
  } catch {
    throw new Error("fetchAgentCard: invalid tokenURI");
  }
  if (parsedUri.protocol !== "https:") {
    throw new Error(`fetchAgentCard: only HTTPS tokenURIs are supported (got ${parsedUri.protocol})`);
  }
  const h = parsedUri.hostname.toLowerCase();
  if (
    h === "localhost" || h === "0.0.0.0" || h === "::1" ||
    /^127\./.test(h) || /^10\./.test(h) ||
    /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.endsWith(".local") || h.endsWith(".internal")
  ) {
    throw new Error("fetchAgentCard: SSRF blocked — private/loopback address");
  }

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(parsedUri.toString(), {
      headers: { "User-Agent": "OrahDEX/1.0 ERC-8004" },
      signal:  ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as Erc8004AgentCard;
  } finally {
    clearTimeout(timer);
  }
}

// ── Identity Registry — write ─────────────────────────────────────────────────

/**
 * Register an agent in the Identity Registry.
 * Encodes the agent card as a data-URI so it is fully on-chain (no IPFS needed).
 * Returns the agentId (token ID) as a string.
 */
export async function registerAgent(card: Erc8004AgentCard): Promise<{
  agentId: string;
  txHash:  string;
}> {
  const { client, account } = walletClient();
  const json   = JSON.stringify(card, null, 2);
  const b64    = Buffer.from(json, "utf8").toString("base64");
  const dataUri = `data:application/json;base64,${b64}`;

  logger.info({ name: card.name, tokenURILength: dataUri.length }, "erc8004: registering agent");

  const hash = await client.writeContract({
    address:      IDENTITY_REGISTRY,
    abi:          IDENTITY_ABI,
    functionName: "register",
    args:         [dataUri],
    account,
  });

  logger.info({ txHash: hash, owner: account.address }, "erc8004: register() tx submitted — waiting for receipt");

  const pub    = publicClient();
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });

  // The AgentRegistered event carries the new agentId
  const agentId = extractAgentIdFromReceipt(receipt);

  logger.info({ agentId, txHash: hash }, "erc8004: agent registered on-chain");
  return { agentId, txHash: hash };
}

function extractAgentIdFromReceipt(receipt: { logs: { topics: string[] }[] }): string {
  for (const log of receipt.logs) {
    // AgentRegistered(uint256 indexed agentId, ...) — topic[1] = agentId
    if (log.topics[1]) {
      try {
        return BigInt(log.topics[1]).toString();
      } catch { /* continue */ }
    }
  }
  // Fallback: Transfer(from=0x0, to, tokenId) — topic[3] = tokenId for ERC-721 mint
  for (const log of receipt.logs) {
    if (
      log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
      log.topics[1] === "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      try {
        return BigInt(log.topics[3] ?? "0x1").toString();
      } catch { /* continue */ }
    }
  }
  return "0";
}

/**
 * Update the agent card on-chain by calling setMetadata.
 * Useful for adding or refreshing services / endpoint URLs.
 */
export async function updateAgentMetadata(
  agentId: string,
  key:     string,
  value:   string,
): Promise<string> {
  const { client, account } = walletClient();
  const encoded = Buffer.from(value, "utf8");
  const hash = await client.writeContract({
    address:      IDENTITY_REGISTRY,
    abi:          IDENTITY_ABI,
    functionName: "setMetadata",
    args:         [BigInt(agentId), key, ("0x" + encoded.toString("hex")) as Hex],
    account,
  });
  logger.info({ agentId, key, txHash: hash }, "erc8004: setMetadata tx submitted");
  return hash;
}

// ── Reputation Registry — read ────────────────────────────────────────────────

export interface AgentReputation {
  agentId:       string;
  score:         number;   // 0-100 aggregate
  feedbackCount: number;
}

export async function getAgentReputation(agentId: string): Promise<AgentReputation> {
  const client = publicClient();
  const id = BigInt(agentId);
  try {
    const [agg, cnt] = await Promise.all([
      client.readContract({
        address: REPUTATION_REGISTRY, abi: REPUTATION_ABI, functionName: "getAggregateScore", args: [id],
      }),
      client.readContract({
        address: REPUTATION_REGISTRY, abi: REPUTATION_ABI, functionName: "getFeedbackCount",  args: [id],
      }),
    ]);
    const [score, _] = agg as [number, bigint];
    return { agentId, score: Number(score), feedbackCount: Number(cnt) };
  } catch {
    return { agentId, score: 0, feedbackCount: 0 };
  }
}

// ── Reputation Registry — write ───────────────────────────────────────────────

// Standard tag for OrahDEX Keeper HTLC relaying activity
export const KEEPER_TAG_HEX =
  "0x48544c435f52454c415945520000000000000000000000000000000000000000" as Hex; // "HTLC_RELAYER" left-padded

/**
 * Pre-authorise OrahDEX to submit reputation feedback for an agent.
 * The agent owner must call this first (or OrahDEX must own the agent).
 */
export async function preauthorizeReviewer(agentId: string, reviewerAddress: Address): Promise<string> {
  const { client, account } = walletClient();
  const hash = await client.writeContract({
    address:      REPUTATION_REGISTRY,
    abi:          REPUTATION_ABI,
    functionName: "preauthorize",
    args:         [BigInt(agentId), reviewerAddress],
    account,
  });
  logger.info({ agentId, reviewerAddress, txHash: hash }, "erc8004: preauthorize tx submitted");
  return hash;
}

/**
 * Submit a reputation feedback score for an agent.
 * Score is 0-100 (100 = perfect).
 * Caller must be pre-authorised by the agent owner.
 */
export async function submitReputationFeedback(params: {
  agentId:     string;
  score:       number;   // 0-100
  tag:         Hex;
  feedbackUri: string;
}): Promise<string> {
  const { client, account } = walletClient();
  const safeScore = Math.max(0, Math.min(100, Math.round(params.score)));

  const hash = await client.writeContract({
    address:      REPUTATION_REGISTRY,
    abi:          REPUTATION_ABI,
    functionName: "submitFeedback",
    args:         [BigInt(params.agentId), safeScore, params.tag, params.feedbackUri],
    account,
  });
  logger.info({ ...params, score: safeScore, txHash: hash }, "erc8004: submitFeedback tx submitted");
  return hash;
}

// ── Score normalisation ───────────────────────────────────────────────────────

/**
 * Normalise OrahDEX's internal Keeper reputation score to ERC-8004's 0-100 range.
 *   Internal scale: 0 (Dormant) → 500+ (Grandmaster)
 *   ERC-8004 target: 0-100
 *   Cap at 500 → maps to 100; scales linearly below.
 */
export function normaliseKeeperScore(internalScore: number): number {
  const capped = Math.min(internalScore, 500);
  return Math.round((capped / 500) * 100);
}

// ── OrahDEX registration helpers ─────────────────────────────────────────────

/**
 * Register OrahDEX in the Identity Registry if not already registered.
 * Stores the resulting agentId in platform_settings.
 * Returns { agentId, txHash, alreadyRegistered }.
 */
export async function ensureOrahDexRegistered(): Promise<{
  agentId:           string;
  txHash:            string | null;
  alreadyRegistered: boolean;
}> {
  const existing = await getOrahDexAgentId();
  if (existing) {
    return { agentId: existing, txHash: null, alreadyRegistered: true };
  }

  const card = buildOrahDexAgentCard();
  const { agentId, txHash } = await registerAgent(card);

  // Persist agentId
  await setSetting("erc8004_orahdex_agent_id", agentId);

  // Update card with self-reference registration
  const updatedCard = buildOrahDexAgentCard(agentId);
  const json  = JSON.stringify(updatedCard, null, 2);
  const b64   = Buffer.from(json, "utf8").toString("base64");
  const dataUri = `data:application/json;base64,${b64}`;

  // Store the updated card URI in metadata key "card"
  try {
    await updateAgentMetadata(agentId, "card", dataUri);
  } catch (err) {
    logger.warn({ err }, "erc8004: failed to update card metadata (non-fatal)");
  }

  return { agentId, txHash, alreadyRegistered: false };
}

/**
 * Register a Keeper in the Identity Registry and record their agentId.
 * If the keeper is already registered, returns existing agentId.
 */
export async function ensureKeeperRegistered(keeper: {
  address:     string;
  displayName: string;
  avatarUrl?:  string | null;
  roles:       string[];
  tier:        string;
  score:       number;
}): Promise<{ agentId: string; txHash: string | null; alreadyRegistered: boolean }> {
  const existing = await getKeeperAgentId(keeper.address);
  if (existing) {
    return { agentId: existing, txHash: null, alreadyRegistered: true };
  }

  const card = buildKeeperAgentCard(keeper);
  const { agentId, txHash } = await registerAgent(card);
  await setSetting(`erc8004_keeper_${keeper.address.toLowerCase()}`, agentId);
  return { agentId, txHash, alreadyRegistered: false };
}

/**
 * Submit an OrahDEX-authored reputation feedback for a Keeper's agentId.
 * Uses OrahDEX's internal score normalised to 0-100.
 * OrahDEX must be pre-authorised to review the keeper's agent.
 */
export async function submitKeeperReputationOnChain(params: {
  keeperAddress:  string;
  agentId:        string;
  internalScore:  number;
  feedbackBaseUrl: string;
}): Promise<string> {
  const normalised = normaliseKeeperScore(params.internalScore);
  const feedbackUri = `${params.feedbackBaseUrl}/api/erc8004/keeper/${params.keeperAddress}/reputation`;
  return submitReputationFeedback({
    agentId:     params.agentId,
    score:       normalised,
    tag:         KEEPER_TAG_HEX,
    feedbackUri,
  });
}
