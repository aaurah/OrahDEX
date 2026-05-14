/**
 * Keeper Reputation Engine — Orah Settlement Layer
 *
 * Computes a deterministic reputation score for a Keeper address from the
 * raw signals in keeper_actions + htlc_registry.
 *
 * ── Scoring model ─────────────────────────────────────────────────────────────
 *
 *   Base points (per action):
 *     CLAIMED          +10  — preimage revealed; cross-chain swap complete
 *     REFUNDED         + 5  — CLTV sweep detected; user made whole
 *     OBSERVED         + 1  — passive notification acknowledged
 *
 *   Timeliness bonus (per terminal action):
 *     blocksLeft ≤ 6   +15  — acted in the critical window (1 BSV hour)
 *     blocksLeft ≤ 24  + 5  — acted within 4 BSV hours
 *
 *   Consistency bonus:
 *     +5 per 10 OBSERVED actions — rewards sustained participation
 *
 * ── Reputation tiers (separate from fee tiers) ───────────────────────────────
 *
 *   Score ≥ 500 → "Grandmaster Relayer"
 *   Score ≥ 200 → "Locksmith"
 *   Score ≥ 100 → "Relayer"
 *   Score ≥  30 → "Dawn Relayer"
 *   Score ≥   5 → "Watcher"
 *              → "Dormant"
 *
 * ── Badges ────────────────────────────────────────────────────────────────────
 *
 *   Dawn Relayer           3+ terminal actions (claim or refund)
 *   Locksmith             10+ terminal actions
 *   Watcher of Thresholds  1+ timely claim/refund within 6 blocks of locktime
 *   Consistent Observer   50+ OBSERVED actions logged
 *   Grandmaster Relayer  score ≥ 500
 *
 * ── Future scoring signals ────────────────────────────────────────────────────
 *   SKIPPED  — keeper did not act when eligible (negative penalty candidate)
 *   DISPUTED — keeper submitted incorrect claim (slashing candidate)
 *   Value-weighted scoring once sat amounts are tracked in htlc_registry
 */

import { db } from "@workspace/db";
import { keeperActionsTable, htlcRegistryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ── Scoring constants ─────────────────────────────────────────────────────────

const BASE_CLAIMED   = 10;
const BASE_REFUNDED  =  5;
const BASE_OBSERVED  =  1;

const BONUS_TIMELY_CLOSE = 15;  // acted within ≤ 6 blocks of locktime
const BONUS_TIMELY_NEAR  =  5;  // acted within ≤ 24 blocks of locktime

const BONUS_OBSERVER_PER_10 = 5;  // consistency reward per 10 OBSERVED actions

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KeeperBadge {
  id:          string;
  name:        string;
  description: string;
  emoji:       string;
  earned:      boolean;
}

export interface ScoreBreakdown {
  claimedBase:       number;
  refundedBase:      number;
  observedBase:      number;
  timelinessBonus:   number;
  consistencyBonus:  number;
  total:             number;
}

export interface KeeperReputation {
  keeperAddress:     string;
  score:             number;
  tier:              string;
  tierDescription:   string;
  tierColor:         string;   // Tailwind colour token for UI
  totalActions:      number;
  claimedCount:      number;
  refundedCount:     number;
  observedCount:     number;
  timelyClaimsCount: number;   // terminal actions within ≤ 6 blocks of locktime
  breakdown:         ScoreBreakdown;
  badges:            KeeperBadge[];
  computedAt:        string;
}

// ── Tier table ────────────────────────────────────────────────────────────────

interface TierDef {
  tier:        string;
  description: string;
  color:       string;
  minScore:    number;
}

const TIERS: TierDef[] = [
  { tier: "Grandmaster Relayer", description: "Elite Keeper — exemplary cross-chain settlement record across high-value HTLCs", color: "amber",  minScore: 500 },
  { tier: "Locksmith",           description: "Proven Keeper — consistently resolves HTLCs with strong timing and volume",      color: "violet", minScore: 200 },
  { tier: "Relayer",             description: "Active Keeper — reliable cross-chain settlement agent across multiple swaps",   color: "blue",   minScore: 100 },
  { tier: "Dawn Relayer",        description: "Emerging Keeper — first on-chain HTLC settlements recorded",                  color: "green",  minScore:  30 },
  { tier: "Watcher",             description: "Observing Keeper — monitoring HTLCs but limited terminal actions so far",      color: "slate",  minScore:   5 },
  { tier: "Dormant",             description: "Registered Keeper — no notable HTLC activity yet",                            color: "zinc",   minScore:   0 },
];

function resolveRepTier(score: number): TierDef {
  return TIERS.find(t => score >= t.minScore) ?? TIERS[TIERS.length - 1];
}

// ── Badge definitions ─────────────────────────────────────────────────────────

function buildBadges(
  claimedCount: number,
  refundedCount: number,
  observedCount: number,
  timelyClaimsCount: number,
  score: number,
): KeeperBadge[] {
  const terminal = claimedCount + refundedCount;
  return [
    {
      id:          "dawn_relayer",
      name:        "Dawn Relayer",
      emoji:       "🌄",
      description: "Claimed or refunded 3+ HTLCs — first light of a Relayer career",
      earned:      terminal >= 3,
    },
    {
      id:          "locksmith",
      name:        "Locksmith",
      emoji:       "🔑",
      description: "Resolved 10+ HTLCs across both claim and refund paths",
      earned:      terminal >= 10,
    },
    {
      id:          "watcher_of_thresholds",
      name:        "Watcher of Thresholds",
      emoji:       "⏳",
      description: "Claimed or refunded an HTLC within 6 blocks of locktime expiry — critical-window precision",
      earned:      timelyClaimsCount >= 1,
    },
    {
      id:          "consistent_observer",
      name:        "Consistent Observer",
      emoji:       "👁",
      description: "Accumulated 50+ OBSERVED HTLC transitions — sustained network participation",
      earned:      observedCount >= 50,
    },
    {
      id:          "grandmaster_relayer",
      name:        "Grandmaster Relayer",
      emoji:       "🏆",
      description: "Reputation score of 500+ — elite standing among all Keepers",
      earned:      score >= 500,
    },
  ];
}

// ── Main scorer ───────────────────────────────────────────────────────────────

export async function computeKeeperReputation(
  keeperAddress: string,
): Promise<KeeperReputation> {
  const lc = keeperAddress.toLowerCase();

  // Fetch all actions for this keeper from DB
  const actions = await db
    .select()
    .from(keeperActionsTable)
    .where(eq(keeperActionsTable.keeperAddress, lc));

  // Separate by action type
  const claimedActions  = actions.filter(a => a.action === "CLAIMED");
  const refundedActions = actions.filter(a => a.action === "REFUNDED");
  const observedActions = actions.filter(a => a.action === "OBSERVED");

  // Base point totals
  const claimedBase  = claimedActions.length  * BASE_CLAIMED;
  const refundedBase = refundedActions.length * BASE_REFUNDED;
  const observedBase = observedActions.length * BASE_OBSERVED;

  // Timeliness bonus — join terminal actions to htlc_registry
  let timelinessBonus    = 0;
  let timelyClaimsCount  = 0;

  const terminalActions = [...claimedActions, ...refundedActions];

  // Batch-load registry rows (one query per unique tradeId is fine for typical volumes)
  const tradeIds = [...new Set(terminalActions.map(a => a.tradeId))];
  const locktimeMap = new Map<string, number>();

  for (const tradeId of tradeIds) {
    try {
      const [row] = await db
        .select({ locktimeBlocks: htlcRegistryTable.locktimeBlocks })
        .from(htlcRegistryTable)
        .where(eq(htlcRegistryTable.tradeId, tradeId));
      if (row) locktimeMap.set(tradeId, row.locktimeBlocks);
    } catch {
      // Non-fatal — skip timeliness bonus for this entry
    }
  }

  for (const action of terminalActions) {
    const locktime = locktimeMap.get(action.tradeId);
    if (!locktime || action.blockHeight <= 0) continue;
    const blocksLeft = locktime - action.blockHeight;
    if (blocksLeft <= 6) {
      timelinessBonus   += BONUS_TIMELY_CLOSE;
      timelyClaimsCount += 1;
    } else if (blocksLeft <= 24) {
      timelinessBonus += BONUS_TIMELY_NEAR;
    }
  }

  // Consistency bonus: +5 per 10 OBSERVED actions
  const consistencyBonus = Math.floor(observedActions.length / 10) * BONUS_OBSERVER_PER_10;

  const total =
    claimedBase + refundedBase + observedBase +
    timelinessBonus + consistencyBonus;

  const repTier = resolveRepTier(total);

  const badges = buildBadges(
    claimedActions.length,
    refundedActions.length,
    observedActions.length,
    timelyClaimsCount,
    total,
  );

  return {
    keeperAddress:     lc,
    score:             total,
    tier:              repTier.tier,
    tierDescription:   repTier.description,
    tierColor:         repTier.color,
    totalActions:      actions.length,
    claimedCount:      claimedActions.length,
    refundedCount:     refundedActions.length,
    observedCount:     observedActions.length,
    timelyClaimsCount,
    breakdown: {
      claimedBase,
      refundedBase,
      observedBase,
      timelinessBonus,
      consistencyBonus,
      total,
    },
    badges,
    computedAt: new Date().toISOString(),
  };
}
