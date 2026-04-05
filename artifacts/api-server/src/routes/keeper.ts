/**
 * Keeper Registry API
 *
 * The Keeper Registry is the identity spine of OrahDEX.
 * Keepers are wallets that register with roles and metadata.
 *
 * Roles:
 *   Trader          — standard trading, order placement
 *   LiquidityKeeper — LP provision, earns fee revenue share
 *   Relayer         — cross-chain bridge relaying, earns bridge fees
 *   OracleKeeper    — price oracle contribution (Phase 4)
 *
 * Endpoints:
 *   POST   /api/keeper/register          — register or update a Keeper
 *   GET    /api/keeper/:address          — get Keeper profile + tier + earnings
 *   GET    /api/keepers                  — list all active Keepers
 *   DELETE /api/keeper/:address          — deactivate a Keeper
 *   GET    /api/keeper/:address/roles    — check roles
 *   GET    /api/keeper/:address/earnings — cumulative fee earnings
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  keepersTable,
  keeperEarningsTable,
  ordersTable,
  liquidityPositionsTable,
} from "@workspace/db/schema";
import { eq, and, sum, count, sql as drizzleSql, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getActiveHtlcs,
  getHtlcEvents,
  getKeeperActions,
  registerRelayerKeeper,
} from "../lib/htlcWatcher.js";
import { computeKeeperReputation } from "../lib/keeperReputation.js";

const router = Router();

// Valid roles as defined by the architecture document
const VALID_ROLES = ["Trader", "LiquidityKeeper", "Relayer", "OracleKeeper"] as const;
type KeeperRole = typeof VALID_ROLES[number];

// ── Tier config (mirrors v1.ts but role-aware) ────────────────────────────────
// Registered role bonuses stack on top of volume-based tier:
//   LiquidityKeeper registered → +1 tier (because they commit capital)
//   Relayer registered         → access to bridge fee earning
//   OracleKeeper               → +1 tier (Phase 4 reserved, no-op now)
const TIER_CONFIG = [
  { tier: 3 as const, name: "Archon"   as const, feeBps: 15, discountPct: 50, threshold: 500 },
  { tier: 2 as const, name: "Elder"    as const, feeBps: 20, discountPct: 33, threshold: 50  },
  { tier: 1 as const, name: "Guardian" as const, feeBps: 25, discountPct: 17, threshold: 5   },
  { tier: 0 as const, name: "Standard" as const, feeBps: 30, discountPct: 0,  threshold: 0   },
];

async function computeKeeperTier(
  address: string,
  roles: string[],
): Promise<{ tier: 0|1|2|3; tierName: string; feeBps: number; discountPct: number }> {
  // Volume from filled orders
  let volumeBsv = 0;
  try {
    const [res] = await db.select({
      v: drizzleSql<string>`COALESCE(SUM(quantity::numeric * COALESCE(price::numeric, 0)), 0)`,
    }).from(ordersTable).where(
      and(eq(ordersTable.walletAddress, address), eq(ordersTable.status, "filled")),
    );
    volumeBsv = parseFloat(res?.v ?? "0");
  } catch { /* ignore */ }

  // Base tier from volume
  let tier = 0 as 0|1|2|3;
  for (const cfg of TIER_CONFIG) {
    if (volumeBsv >= cfg.threshold) { tier = cfg.tier; break; }
  }

  // Role bonus: LiquidityKeeper or OracleKeeper registered → +1 tier (capped at 3)
  if ((roles.includes("LiquidityKeeper") || roles.includes("OracleKeeper")) && tier < 3) {
    tier = (tier + 1) as 0|1|2|3;
  }

  const cfg = TIER_CONFIG.find(c => c.tier === tier) ?? TIER_CONFIG[3];
  return { tier, tierName: cfg.name, feeBps: cfg.feeBps, discountPct: cfg.discountPct };
}

// ── POST /api/keeper/register ─────────────────────────────────────────────────
router.post("/keeper/register", async (req, res) => {
  try {
    const {
      walletAddress,
      uri = "",
      roles = ["Trader"],
      displayName = "",
      avatarUrl = "",
    } = req.body as {
      walletAddress?: string;
      uri?: string;
      roles?: string[];
      displayName?: string;
      avatarUrl?: string;
    };

    if (!walletAddress || typeof walletAddress !== "string" || walletAddress.trim().length < 10) {
      res.status(400).json({ error: "Valid walletAddress is required" });
      return;
    }

    const addr = walletAddress.trim().toLowerCase();

    // Validate roles
    const validatedRoles = roles.filter(r => VALID_ROLES.includes(r as KeeperRole));
    if (validatedRoles.length === 0) validatedRoles.push("Trader");

    const [keeper] = await db.insert(keepersTable).values({
      walletAddress: addr,
      uri:           uri.trim(),
      roles:         validatedRoles,
      displayName:   displayName.trim(),
      avatarUrl:     avatarUrl.trim(),
      active:        true,
      registeredAt:  new Date(),
      updatedAt:     new Date(),
    })
    .onConflictDoUpdate({
      target: keepersTable.walletAddress,
      set: {
        uri:         uri.trim(),
        roles:       validatedRoles,
        displayName: displayName.trim(),
        avatarUrl:   avatarUrl.trim(),
        active:      true,
        updatedAt:   new Date(),
      },
    })
    .returning();

    const tierInfo = await computeKeeperTier(addr, validatedRoles);

    logger.info({ addr, roles: validatedRoles, tier: tierInfo.tier }, "Keeper registered");

    res.json({
      success:      true,
      walletAddress: addr,
      roles:        validatedRoles,
      ...tierInfo,
      displayName:  keeper.displayName,
      avatarUrl:    keeper.avatarUrl,
      registeredAt: keeper.registeredAt,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "POST /keeper/register failed");
    res.status(500).json({ error: err?.message ?? "Registration failed" });
  }
});

// ── GET /api/keeper/relayer-events ────────────────────────────────────────────
// MUST be registered before /keeper/:address to avoid /:address catching it.
//
// Returns active HTLC positions and recent status-transition events so
// Relayer Keepers know which cross-chain settlements need action.
//
// Query params:
//   address (optional) — auto-register caller as Relayer Keeper for notifications
//   limit   (optional) — max events to return (default 50, max 200)
//
router.get("/keeper/relayer-events", async (req, res) => {
  try {
    const address = (req.query.address as string | undefined)?.toLowerCase();
    const limit   = Math.min(200, parseInt((req.query.limit as string) ?? "50", 10) || 50);

    // Auto-register confirmed Relayer keepers for push notifications
    if (address) {
      try {
        const [row] = await db.select({ roles: keepersTable.roles })
          .from(keepersTable)
          .where(eq(keepersTable.walletAddress, address));
        const roles: string[] = Array.isArray(row?.roles) ? (row.roles as string[]) : [];
        if (roles.includes("Relayer")) registerRelayerKeeper(address);
      } catch {
        // non-fatal
      }
    }

    const active  = getActiveHtlcs();
    const events  = await getHtlcEvents(limit);
    const actions = await getKeeperActions(address, limit);

    res.json({
      activeCount:   active.length,
      active,
      events,
      // keeperActions: actions for this specific keeper (if address supplied),
      //                or all recent actions (if no address supplied)
      keeperActions: actions,
      fetchedAt:     new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error({ err }, "keeper/relayer-events: fetch failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch relayer events" });
  }
});

// ── GET /api/keeper/:address ──────────────────────────────────────────────────
router.get("/keeper/:address", async (req, res) => {
  try {
    const addr = req.params.address?.toLowerCase() ?? "";
    if (!addr) { res.status(400).json({ error: "address required" }); return; }

    const [keeper] = await db.select().from(keepersTable)
      .where(eq(keepersTable.walletAddress, addr));

    const roles = (keeper?.active ? keeper.roles : []) as string[];
    const tierInfo = await computeKeeperTier(addr, roles);

    // LP position count
    let lpCount = 0;
    try {
      const [lp] = await db.select({ c: count() }).from(liquidityPositionsTable)
        .where(and(
          eq(liquidityPositionsTable.walletAddress, addr),
          eq(liquidityPositionsTable.status, "active"),
        ));
      lpCount = lp?.c ?? 0;
    } catch { /* ignore */ }

    // Cumulative earnings
    let totalEarningsUsdt = "0";
    try {
      const [earn] = await db.select({
        total: drizzleSql<string>`COALESCE(SUM(amount::numeric), 0)`,
      }).from(keeperEarningsTable)
        .where(eq(keeperEarningsTable.walletAddress, addr));
      totalEarningsUsdt = earn?.total ?? "0";
    } catch { /* ignore */ }

    if (!keeper) {
      // Return a non-Keeper profile — still shows tier info
      res.json({
        walletAddress: addr,
        isKeeper:    false,
        active:      false,
        roles:       [],
        ...tierInfo,
        lpPositionCount: lpCount,
        totalEarningsUsdt,
      });
      return;
    }

    res.json({
      walletAddress: addr,
      isKeeper:      true,
      active:        keeper.active,
      roles:         keeper.roles,
      uri:           keeper.uri,
      displayName:   keeper.displayName,
      avatarUrl:     keeper.avatarUrl,
      registeredAt:  keeper.registeredAt,
      updatedAt:     keeper.updatedAt,
      ...tierInfo,
      lpPositionCount: lpCount,
      totalEarningsUsdt,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /keeper/:address failed");
    res.status(500).json({ error: err?.message ?? "Failed to fetch Keeper" });
  }
});

// ── GET /api/keepers ──────────────────────────────────────────────────────────
router.get("/keepers", async (req, res) => {
  try {
    const limitN = Math.min(parseInt((req.query.limit as string) ?? "50"), 200);
    const role   = req.query.role as string | undefined;

    const keepers = await db.select().from(keepersTable)
      .where(eq(keepersTable.active, true))
      .orderBy(desc(keepersTable.registeredAt))
      .limit(limitN);

    const filtered = role
      ? keepers.filter(k => (k.roles as string[]).includes(role))
      : keepers;

    // Attach tier info for each keeper
    const result = await Promise.all(
      filtered.map(async k => {
        const tierInfo = await computeKeeperTier(
          k.walletAddress,
          k.roles as string[],
        );
        return {
          walletAddress: k.walletAddress,
          displayName:   k.displayName,
          avatarUrl:     k.avatarUrl,
          roles:         k.roles,
          registeredAt:  k.registeredAt,
          ...tierInfo,
        };
      }),
    );

    res.json({ keepers: result, total: result.length });
  } catch (err: any) {
    logger.error({ err: err?.message }, "GET /keepers failed");
    res.status(500).json({ error: err?.message ?? "Failed to list Keepers" });
  }
});

// ── DELETE /api/keeper/:address ───────────────────────────────────────────────
router.delete("/keeper/:address", async (req, res) => {
  try {
    const addr = req.params.address?.toLowerCase() ?? "";
    if (!addr) { res.status(400).json({ error: "address required" }); return; }

    await db.update(keepersTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(keepersTable.walletAddress, addr));

    res.json({ success: true, walletAddress: addr, active: false });
  } catch (err: any) {
    logger.error({ err: err?.message }, "DELETE /keeper/:address failed");
    res.status(500).json({ error: err?.message ?? "Deactivation failed" });
  }
});

// ── GET /api/keeper/:address/roles ────────────────────────────────────────────
router.get("/keeper/:address/roles", async (req, res) => {
  try {
    const addr = req.params.address?.toLowerCase() ?? "";
    const [keeper] = await db.select({ roles: keepersTable.roles, active: keepersTable.active })
      .from(keepersTable)
      .where(eq(keepersTable.walletAddress, addr));

    const roles = keeper?.active ? (keeper.roles as string[]) : [];
    res.json({
      walletAddress: addr,
      isKeeper:      !!keeper?.active,
      roles,
      hasRole: (role: string) => roles.includes(role),
      isTrader:          roles.includes("Trader"),
      isLiquidityKeeper: roles.includes("LiquidityKeeper"),
      isRelayer:         roles.includes("Relayer"),
      isOracleKeeper:    roles.includes("OracleKeeper"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch roles" });
  }
});

// ── GET /api/keeper/:address/earnings ─────────────────────────────────────────
router.get("/keeper/:address/earnings", async (req, res) => {
  try {
    const addr   = req.params.address?.toLowerCase() ?? "";
    const limitN = Math.min(parseInt((req.query.limit as string) ?? "50"), 200);

    const rows = await db.select().from(keeperEarningsTable)
      .where(eq(keeperEarningsTable.walletAddress, addr))
      .orderBy(desc(keeperEarningsTable.earnedAt))
      .limit(limitN);

    const [totals] = await db.select({
      total: drizzleSql<string>`COALESCE(SUM(amount::numeric), 0)`,
    }).from(keeperEarningsTable)
      .where(eq(keeperEarningsTable.walletAddress, addr));

    const bySource = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.source] = (acc[r.source] ?? 0) + parseFloat(r.amount);
      return acc;
    }, {});

    res.json({
      walletAddress:    addr,
      totalUsdt:        parseFloat(totals?.total ?? "0"),
      bySource,
      recentEarnings:   rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch earnings" });
  }
});

// ── GET /api/keeper/:address/reputation ──────────────────────────────────────
//   Deterministic reputation score for a Keeper address.
//   Scoring model and badge definitions are documented in keeperReputation.ts.
//   Computable for any address — score 0 if no keeper_actions rows exist.
//
router.get("/keeper/:address/reputation", async (req, res) => {
  try {
    const addr = req.params.address?.toLowerCase();
    if (!addr) { res.status(400).json({ error: "address required" }); return; }

    const reputation = await computeKeeperReputation(addr);
    res.json(reputation);
  } catch (err: any) {
    logger.error({ err }, "keeper/reputation: computation failed");
    res.status(500).json({ error: err?.message ?? "Failed to compute reputation" });
  }
});

// ── GET /api/keeper/:address/actions ─────────────────────────────────────────
//   Per-keeper HTLC action history — foundation for Keeper reputation scoring.
//   Returns OBSERVED / CLAIMED / REFUNDED entries for this keeper address,
//   newest first. Query ?limit=N (max 200, default 50).
//
router.get("/keeper/:address/actions", async (req, res) => {
  try {
    const addr  = req.params.address?.toLowerCase();
    const limit = Math.min(200, parseInt((req.query.limit as string) ?? "50", 10) || 50);
    if (!addr) { res.status(400).json({ error: "address required" }); return; }

    const actions = await getKeeperActions(addr, limit);

    const summary = actions.reduce<Record<string, number>>((acc, a) => {
      acc[a.action] = (acc[a.action] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      walletAddress: addr,
      totalActions:  actions.length,
      summary,       // e.g. { OBSERVED: 14, CLAIMED: 3 }
      actions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch keeper actions" });
  }
});

export default router;
