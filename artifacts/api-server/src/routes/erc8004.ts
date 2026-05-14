/**
 * erc8004.ts — ERC-8004 Trustless Agent API routes
 *
 * Public endpoints (no auth required):
 *   GET  /erc8004/card                   — OrahDEX agent card JSON
 *   GET  /erc8004/discover               — enumerate agents in Identity Registry
 *   GET  /erc8004/agent/:agentId         — single agent by ID
 *   GET  /erc8004/reputation/:agentId    — on-chain aggregate reputation score
 *   GET  /erc8004/keeper/:address/reputation — OrahDEX Keeper reputation (internal + on-chain)
 *   GET  /erc8004/keepers                — all active Keepers with reputation
 *   GET  /erc8004/status                 — registration status (no private data)
 *
 * Admin endpoints (requireAdminToken):
 *   POST /erc8004/admin/register         — register OrahDEX in Identity Registry
 *   POST /erc8004/admin/keeper/:address/register — register one Keeper
 *   POST /erc8004/admin/keeper/:address/sync     — push keeper score to Reputation Registry
 *   POST /erc8004/admin/keepers/sync-all — bulk sync all active Keepers
 *   POST /erc8004/admin/preauthorize     — preauthorize a reviewer for an agent
 *
 * The /.well-known/agent.json endpoint is registered directly in app.ts
 * (before body parsers) and calls buildOrahDexAgentCard().
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { keepersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { requireAdminToken } from "../middleware/adminAuth.js";
import { computeKeeperReputation } from "../lib/keeperReputation.js";
import {
  buildOrahDexAgentCard,
  buildKeeperAgentCard,
  discoverAgents,
  getAgent,
  getAgentReputation,
  getOrahDexAgentId,
  getKeeperAgentId,
  ensureOrahDexRegistered,
  ensureKeeperRegistered,
  submitKeeperReputationOnChain,
  preauthorizeReviewer,
  normaliseKeeperScore,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  VIEM_CHAIN,
  fetchAgentCard,
} from "../lib/erc8004.js";

const router = Router();

/* Rate limiter for sensitive admin operations */
const adminOpsLimiter = rateLimit({
  windowMs:        60_000,
  max:             10,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  handler:         (_req, res) => res.status(429).json({ error: "Too many admin requests — please slow down." }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseUrl(req: any): string {
  return (
    process.env.ORAHDEX_DOMAIN ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `${req.protocol}://${req.get("host")}`)
  );
}

// ── Public: agent card ────────────────────────────────────────────────────────

/**
 * GET /api/erc8004/card
 * Returns OrahDEX's ERC-8004 agent card JSON.
 * Also served at /.well-known/agent.json (registered in app.ts).
 */
router.get("/erc8004/card", async (req, res) => {
  const agentId = await getOrahDexAgentId();
  const card    = buildOrahDexAgentCard(agentId ?? undefined);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(card);
});

// ── Public: discovery ─────────────────────────────────────────────────────────

/**
 * GET /api/erc8004/discover?limit=20&offset=0&cards=false
 * Enumerates agents registered in the on-chain Identity Registry.
 * Fetches agent card JSON when cards=true (slower; each card is a fetch).
 */
router.get("/erc8004/discover", async (req, res) => {
  const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
  const offset = Math.max(Number(req.query.offset ?? 0),  0);
  const cards  = req.query.cards === "true";

  try {
    const agents = await discoverAgents({ limit, offset, fetchCards: cards });
    res.json({
      agents,
      count:    agents.length,
      offset,
      limit,
      registry: IDENTITY_REGISTRY,
      network:  VIEM_CHAIN.name,
    });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "erc8004: discoverAgents failed");
    res.status(502).json({ error: "Failed to query Identity Registry", details: err?.message });
  }
});

/**
 * GET /api/erc8004/agent/:agentId
 * Returns owner, tokenURI, and (if resolvable) agent card for a single agent.
 */
router.get("/erc8004/agent/:agentId", async (req, res) => {
  const id = req.params.agentId;
  if (!id || isNaN(Number(id))) {
    res.status(400).json({ error: "Invalid agentId — must be a numeric token ID" });
    return;
  }
  try {
    const agent = await getAgent(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    // Try to resolve the card (non-fatal if it fails)
    try {
      agent.card = await fetchAgentCard(agent.tokenURI);
    } catch { /* leave card undefined */ }
    res.json(agent);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to fetch agent", details: err?.message });
  }
});

// ── Public: reputation ────────────────────────────────────────────────────────

/**
 * GET /api/erc8004/reputation/:agentId
 * Returns the on-chain aggregate reputation score from the Reputation Registry.
 */
router.get("/erc8004/reputation/:agentId", async (req, res) => {
  const id = req.params.agentId;
  if (!id || isNaN(Number(id))) {
    res.status(400).json({ error: "Invalid agentId" });
    return;
  }
  try {
    const rep = await getAgentReputation(id);
    res.json({ ...rep, registry: REPUTATION_REGISTRY, network: VIEM_CHAIN.name });
  } catch (err: any) {
    res.status(502).json({ error: "Failed to query Reputation Registry", details: err?.message });
  }
});

// ── Public: keeper reputation (internal + on-chain) ───────────────────────────

/**
 * GET /api/erc8004/keeper/:address/reputation
 * Returns the Keeper's internal OrahDEX reputation + ERC-8004 on-chain score
 * (if they have been registered as an agent).
 * Used as the feedbackURI when submitting on-chain reputation feedback.
 */
router.get("/erc8004/keeper/:address/reputation", async (req, res) => {
  const address = (req.params.address ?? "").toLowerCase();
  if (!address.startsWith("0x") || address.length !== 42) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  const [internal, agentId] = await Promise.all([
    computeKeeperReputation(address).catch(() => null),
    getKeeperAgentId(address),
  ]);

  const onChain = agentId
    ? await getAgentReputation(agentId).catch(() => null)
    : null;

  res.json({
    keeperAddress: address,
    internal:      internal ?? { score: 0, tier: "Dormant", totalActions: 0, badges: [] },
    erc8004: {
      agentId:       agentId ?? null,
      registered:    !!agentId,
      onChainScore:  onChain?.score ?? null,
      feedbackCount: onChain?.feedbackCount ?? null,
      normalised:    internal ? normaliseKeeperScore(internal.score) : null,
      registry:      REPUTATION_REGISTRY,
    },
  });
});

// ── Public: keepers list ──────────────────────────────────────────────────────

/**
 * GET /api/erc8004/keepers?limit=50
 * Lists all active OrahDEX Keepers with their ERC-8004 registration status
 * and internal reputation scores.
 */
router.get("/erc8004/keepers", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  try {
    const keepers = await db
      .select()
      .from(keepersTable)
      .where(eq(keepersTable.active, true))
      .limit(limit);

    const results = await Promise.all(
      keepers.map(async (k) => {
        const [reputation, agentId] = await Promise.all([
          computeKeeperReputation(k.walletAddress).catch(() => null),
          getKeeperAgentId(k.walletAddress),
        ]);
        return {
          address:     k.walletAddress,
          displayName: k.displayName,
          avatarUrl:   k.avatarUrl,
          roles:       k.roles,
          erc8004: {
            agentId:    agentId ?? null,
            registered: !!agentId,
          },
          reputation: reputation
            ? {
                score:        reputation.score,
                tier:         reputation.tier,
                totalActions: reputation.totalActions,
                badges:       reputation.badges.filter(b => b.earned).map(b => b.name),
                normalised:   normaliseKeeperScore(reputation.score),
              }
            : null,
        };
      })
    );

    res.json({ keepers: results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list keepers" });
  }
});

// ── Public: registration status ───────────────────────────────────────────────

/**
 * GET /api/erc8004/status
 * Returns OrahDEX's own ERC-8004 registration status without revealing
 * any private key information.
 */
router.get("/erc8004/status", async (req, res) => {
  const agentId = await getOrahDexAgentId();
  res.json({
    registered:        !!agentId,
    agentId:           agentId ?? null,
    identityRegistry:  IDENTITY_REGISTRY,
    reputationRegistry: REPUTATION_REGISTRY,
    network:           VIEM_CHAIN.name,
    chainId:           VIEM_CHAIN.id,
    agentCardUrl:      `${baseUrl(req)}/.well-known/agent.json`,
    spec:              "https://eips.ethereum.org/EIPS/eip-8004",
  });
});

// ── Admin: register OrahDEX ───────────────────────────────────────────────────

router.post("/erc8004/admin/register", requireAdminToken, async (req, res) => {
  if (!process.env.EVM_WALLET_SECRET) {
    res.status(503).json({ error: "EVM_WALLET_SECRET not set — cannot send transactions" });
    return;
  }
  try {
    const result = await ensureOrahDexRegistered();
    logger.info({ agentId: result.agentId }, "admin: OrahDEX ERC-8004 registration");
    res.json({
      ok:               true,
      agentId:          result.agentId,
      txHash:           result.txHash,
      alreadyRegistered: result.alreadyRegistered,
      agentCardUrl:     `${baseUrl(req)}/.well-known/agent.json`,
      message:          result.alreadyRegistered
        ? `Already registered as agent #${result.agentId}`
        : `Registered OrahDEX as ERC-8004 agent #${result.agentId}`,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: OrahDEX ERC-8004 register failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── Admin: register one Keeper ────────────────────────────────────────────────

router.post("/erc8004/admin/keeper/:address/register", requireAdminToken, async (req, res) => {
  const address = ((req.params.address as string) ?? "").toLowerCase();
  if (!address.startsWith("0x") || address.length !== 42) {
    res.status(400).json({ error: "Invalid keeper address" });
    return;
  }
  if (!process.env.EVM_WALLET_SECRET) {
    res.status(503).json({ error: "EVM_WALLET_SECRET not set" });
    return;
  }

  try {
    const [kRow] = await db
      .select()
      .from(keepersTable)
      .where(and(eq(keepersTable.walletAddress, address), eq(keepersTable.active, true)));

    if (!kRow) {
      res.status(404).json({ error: "Keeper not found or inactive" });
      return;
    }

    const reputation = await computeKeeperReputation(address).catch(() => null);

    const result = await ensureKeeperRegistered({
      address,
      displayName: kRow.displayName ?? `Keeper ${address.slice(0, 8)}`,
      avatarUrl:   kRow.avatarUrl,
      roles:       (kRow.roles as string[]) ?? [],
      tier:        reputation?.tier ?? "Dormant",
      score:       reputation?.score ?? 0,
    });

    res.json({
      ok:               true,
      keeperAddress:    address,
      agentId:          result.agentId,
      txHash:           result.txHash,
      alreadyRegistered: result.alreadyRegistered,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, address }, "admin: Keeper ERC-8004 register failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

// ── Admin: sync one Keeper's reputation on-chain ─────────────────────────────

router.post("/erc8004/admin/keeper/:address/sync", requireAdminToken, async (req, res) => {
  const address = ((req.params.address as string) ?? "").toLowerCase();
  if (!address.startsWith("0x") || address.length !== 42) {
    res.status(400).json({ error: "Invalid keeper address" });
    return;
  }
  if (!process.env.EVM_WALLET_SECRET) {
    res.status(503).json({ error: "EVM_WALLET_SECRET not set" });
    return;
  }

  try {
    const agentId = await getKeeperAgentId(address);
    if (!agentId) {
      res.status(409).json({
        error: "Keeper has no ERC-8004 agentId — register first via POST /erc8004/admin/keeper/:address/register",
      });
      return;
    }

    const reputation = await computeKeeperReputation(address);
    const txHash = await submitKeeperReputationOnChain({
      keeperAddress:   address,
      agentId,
      internalScore:   reputation.score,
      feedbackBaseUrl: baseUrl(req),
    });

    res.json({
      ok:            true,
      keeperAddress: address,
      agentId,
      internalScore: reputation.score,
      normalisedScore: normaliseKeeperScore(reputation.score),
      tier:          reputation.tier,
      txHash,
    });
  } catch (err: any) {
    logger.error({ err: err?.message, address }, "admin: Keeper reputation sync failed");
    res.status(500).json({ error: "Reputation sync failed" });
  }
});

// ── Admin: bulk sync all active Keepers ──────────────────────────────────────

router.post("/erc8004/admin/keepers/sync-all", requireAdminToken, async (req, res) => {
  if (!process.env.EVM_WALLET_SECRET) {
    res.status(503).json({ error: "EVM_WALLET_SECRET not set" });
    return;
  }

  try {
    const keepers = await db
      .select()
      .from(keepersTable)
      .where(eq(keepersTable.active, true));

    const results: {
      address: string;
      agentId: string | null;
      registered: boolean;
      synced: boolean;
      error?: string;
    }[] = [];

    for (const k of keepers) {
      try {
        const reputation = await computeKeeperReputation(k.walletAddress);

        // Register if not yet registered
        let agentId = await getKeeperAgentId(k.walletAddress);
        let registered = !!agentId;

        if (!agentId) {
          const reg = await ensureKeeperRegistered({
            address:     k.walletAddress,
            displayName: k.displayName ?? `Keeper ${k.walletAddress.slice(0, 8)}`,
            avatarUrl:   k.avatarUrl,
            roles:       (k.roles as string[]) ?? [],
            tier:        reputation.tier,
            score:       reputation.score,
          });
          agentId = reg.agentId;
          registered = !reg.alreadyRegistered;
        }

        // Submit reputation score
        await submitKeeperReputationOnChain({
          keeperAddress:   k.walletAddress,
          agentId,
          internalScore:   reputation.score,
          feedbackBaseUrl: baseUrl(req),
        });

        results.push({ address: k.walletAddress, agentId, registered, synced: true });
      } catch (err: any) {
        results.push({
          address:    k.walletAddress,
          agentId:    await getKeeperAgentId(k.walletAddress),
          registered: false,
          synced:     false,
          error:      err?.message,
        });
      }
    }

    const synced    = results.filter(r => r.synced).length;
    const failed    = results.filter(r => !r.synced).length;
    const newlyReg  = results.filter(r => r.registered).length;

    logger.info({ synced, failed, newlyReg }, "admin: ERC-8004 bulk keeper sync complete");
    res.json({ ok: true, synced, failed, newlyRegistered: newlyReg, results });
  } catch (err: any) {
    logger.error({ err: err?.message }, "admin: bulk keeper sync failed");
    res.status(500).json({ error: "Bulk sync failed" });
  }
});

// ── Admin: preauthorize a reviewer ───────────────────────────────────────────

/**
 * POST /api/erc8004/admin/preauthorize
 * Body: { agentId, reviewerAddress }
 * Pre-authorises reviewerAddress to submit feedback for agentId.
 * Required before submitFeedback can be called by a non-owner.
 */
router.post("/erc8004/admin/preauthorize", adminOpsLimiter, requireAdminToken, async (req, res) => {
  const { agentId, reviewerAddress } = req.body ?? {};
  if (!agentId || !reviewerAddress) {
    res.status(400).json({ error: "agentId and reviewerAddress are required" });
    return;
  }
  if (!process.env.EVM_WALLET_SECRET) {
    res.status(503).json({ error: "EVM_WALLET_SECRET not set" });
    return;
  }
  try {
    const txHash = await preauthorizeReviewer(agentId, reviewerAddress);
    res.json({ ok: true, agentId, reviewerAddress, txHash });
  } catch (err: any) {
    res.status(500).json({ error: "Preauthorize failed" });
  }
});

export default router;
