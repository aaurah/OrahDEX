/**
 * HTLC Watcher — Orah Relayer / Keeper subsystem (v3)
 *
 * Maintains a DB-backed registry of cross-chain HTLC outputs with:
 *   • Adaptive polling (nextCheckAt) — HTLCs near locktime polled more often
 *   • Terminal timestamps (terminalAt) — fast analytics and scoring windows
 *   • Keeper action log (keeper_actions) — foundation for reputation scoring
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *
 *   orders.ts          → registerHtlc()     → htlc_registry (DB) + memory map
 *   poll cycle         → queryHtlcStatus()  → htlc_registry + htlc_events + keeper_actions
 *   relayer-events API ← getActiveHtlcs()   ← memory map (fast path)
 *   relayer-events API ← getHtlcEvents()    ← htlc_events table (full history)
 *   reputation API     ← getKeeperActions() ← keeper_actions table
 *
 * ── Adaptive polling schedule ─────────────────────────────────────────────────
 *
 *   status=EXPIRED     → nextCheckAt = now + 15 s  (urgent — refund window open)
 *   blocksLeft ≤ 6     → nextCheckAt = now + 30 s  (~1 h of BSV block time)
 *   blocksLeft ≤ 24    → nextCheckAt = now + 60 s  (~4 h of BSV block time)
 *   default            → nextCheckAt = now + 90 s  (normal cadence)
 *
 *   The poll loop runs every 15 s and skips entries whose nextCheckAt > now,
 *   so entries adapt their rate without spawning multiple timers.
 *
 * ── Who acts on each status? ──────────────────────────────────────────────────
 *
 *   LOCKED   → Relayer detects secretHash in OP_RETURN, prepares claim tx,
 *              waits for counterparty chain confirmation.
 *
 *   CLAIMED  → Relayer spent the P2SH output by revealing the preimage.
 *              Swap is complete. Keeper earns bridge fee. No further action.
 *
 *   EXPIRED  → CLTV locktime passed without claim. Relayer DID NOT act in time.
 *              The sender may now broadcast the CLTV refund path transaction.
 *
 *   REFUNDED → User swept the output via CLTV. Trade is unwound on-chain.
 *              Keeper notification allows re-matching or manual resolution.
 *
 * ── Persistence invariants ────────────────────────────────────────────────────
 *
 *   • registerHtlc() writes to htlc_registry before updating memory.
 *   • Every transition writes to htlc_events (append-only).
 *   • Terminal transitions also write keeper_actions (one per registered Relayer).
 *   • terminalAt is set atomically with the terminal status update.
 *   • Terminal HTLCs leave htlc_registry (for audit) but exit the memory map.
 *   • On startup: hydrate memory from non-terminal DB rows; respect nextCheckAt.
 *
 * ── DB = truth  /  Memory = speed  /  Watcher = orchestrator ─────────────────
 */

import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  htlcRegistryTable,
  htlcEventsTable,
  keeperActionsTable,
} from "@workspace/db/schema";
import { eq, notInArray } from "drizzle-orm";
import { queryHtlcStatus, getBsvChainStatus, type HtlcStatus } from "./bsvChainMonitor.js";
import { pushNotification } from "./notifQueue.js";
import { logger } from "./logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL: HtlcStatus[] = ["CLAIMED", "REFUNDED"];

/** The poll loop tick — shorter than any check interval so nextCheckAt is respected. */
const LOOP_MS = 15_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HtlcEntry {
  tradeId:         string;
  htlcAddress:     string;
  secretHash:      string;
  locktimeBlocks:  number;
  settlementTxid:  string;
  pair:            string;
  userAddress:     string;
  registeredAt:    string;
  status:          HtlcStatus;
  spendTxid?:      string;
  /** Adaptive: skip polling until this timestamp passes. */
  nextCheckAt:     Date;
}

export interface HtlcEvent {
  id:             string;
  tradeId:        string;
  htlcAddress:    string;
  settlementTxid: string;
  pair:           string;
  fromStatus:     HtlcStatus;
  toStatus:       HtlcStatus;
  spendTxid?:     string;
  blockHeight:    number;
  timestamp:      string;
}

export interface KeeperAction {
  id:            string;
  keeperAddress: string;
  htlcAddress:   string;
  tradeId:       string;
  pair:          string;
  action:        string;
  txid?:         string;
  blockHeight:   number;
  createdAt:     string;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

const registry = new Map<string, HtlcEntry>();  // key: tradeId — non-terminal only
const relayerAddresses = new Set<string>();      // Relayer Keepers for notifications

// ── Adaptive scheduling ───────────────────────────────────────────────────────

/**
 * Compute the next poll timestamp based on proximity to locktime and status.
 *
 *   EXPIRED            → 15 s  (urgent — user can claim refund now)
 *   blocksLeft ≤ 6     → 30 s  (within ~1 BSV hour)
 *   blocksLeft ≤ 24    → 60 s  (within ~4 BSV hours)
 *   default            → 90 s
 */
function nextCheckAt(locktimeBlocks: number, currentHeight: number, status: HtlcStatus): Date {
  const now   = Date.now();
  const left  = locktimeBlocks - currentHeight;

  if (status === "EXPIRED")  return new Date(now + 15_000);
  if (left    <= 6)          return new Date(now + 30_000);
  if (left    <= 24)         return new Date(now + 60_000);
  return                            new Date(now + 90_000);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register an HTLC for monitoring immediately after broadcast.
 * Idempotent via ON CONFLICT DO NOTHING.
 */
export async function registerHtlc(
  entry: Omit<HtlcEntry, "status" | "registeredAt" | "nextCheckAt">,
): Promise<void> {
  const now     = new Date();
  const checkAt = new Date(now.getTime() + 90_000);

  await db.insert(htlcRegistryTable).values({
    tradeId:        entry.tradeId,
    htlcAddress:    entry.htlcAddress,
    secretHash:     entry.secretHash,
    locktimeBlocks: entry.locktimeBlocks,
    settlementTxid: entry.settlementTxid,
    pair:           entry.pair,
    userAddress:    entry.userAddress,
    status:         "LOCKED",
    nextCheckAt:    checkAt,
    createdAt:      now,
    updatedAt:      now,
  }).onConflictDoNothing();

  registry.set(entry.tradeId, {
    ...entry,
    status:       "LOCKED",
    registeredAt: now.toISOString(),
    nextCheckAt:  checkAt,
  });

  logger.info(
    { tradeId: entry.tradeId, htlcAddress: entry.htlcAddress, pair: entry.pair },
    "HTLC watcher: registered (DB + memory)"
  );
}

/** Register a Relayer Keeper address to receive push notifications. */
export function registerRelayerKeeper(address: string): void {
  relayerAddresses.add(address);
}

/** All non-terminal HTLCs currently in the in-memory cache. */
export function getActiveHtlcs(): HtlcEntry[] {
  return Array.from(registry.values());
}

/** Full HTLC event history from DB, newest first. Survives restarts. */
export async function getHtlcEvents(limit = 50): Promise<HtlcEvent[]> {
  try {
    const rows = await db
      .select()
      .from(htlcEventsTable)
      .orderBy(htlcEventsTable.createdAt)
      .limit(limit);

    return rows.reverse().map(r => ({
      id:             r.id,
      tradeId:        r.tradeId,
      htlcAddress:    r.htlcAddress,
      settlementTxid: r.settlementTxid,
      pair:           r.pair,
      fromStatus:     r.fromStatus as HtlcStatus,
      toStatus:       r.toStatus as HtlcStatus,
      spendTxid:      r.spendTxid ?? undefined,
      blockHeight:    r.blockHeight,
      timestamp:      r.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.warn({ err }, "HTLC watcher: getHtlcEvents DB query failed");
    return [];
  }
}

/**
 * Keeper action history — foundation for reputation scoring.
 * Returns actions for a specific keeper, or all actions if omitted.
 */
export async function getKeeperActions(keeperAddress?: string, limit = 50): Promise<KeeperAction[]> {
  try {
    const query = keeperAddress
      ? db.select().from(keeperActionsTable)
          .where(eq(keeperActionsTable.keeperAddress, keeperAddress))
          .orderBy(keeperActionsTable.createdAt)
          .limit(limit)
      : db.select().from(keeperActionsTable)
          .orderBy(keeperActionsTable.createdAt)
          .limit(limit);

    const rows = await query;
    return rows.reverse().map(r => ({
      id:            r.id,
      keeperAddress: r.keeperAddress,
      htlcAddress:   r.htlcAddress,
      tradeId:       r.tradeId,
      pair:          r.pair,
      action:        r.action,
      txid:          r.txid ?? undefined,
      blockHeight:   r.blockHeight,
      createdAt:     r.createdAt.toISOString(),
    }));
  } catch (err) {
    logger.warn({ err }, "HTLC watcher: getKeeperActions DB query failed");
    return [];
  }
}

// ── Poll cycle ────────────────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  if (registry.size === 0) return;

  const now     = new Date();
  const due     = Array.from(registry.values()).filter(e => e.nextCheckAt <= now);
  if (due.length === 0) return;

  logger.debug(
    { due: due.length, total: registry.size },
    "HTLC watcher: adaptive poll tick"
  );

  // Get current BSV height once per tick to avoid redundant API calls
  let currentHeight = 0;
  try {
    const status = await getBsvChainStatus();
    currentHeight = status.blockHeight;
  } catch {
    // Non-fatal — nextCheckAt will default to 90 s
  }

  for (const entry of due) {
    try {
      const result = await queryHtlcStatus(entry.htlcAddress, entry.locktimeBlocks);

      // Always recompute nextCheckAt even if status hasn't changed
      const checkAt = nextCheckAt(entry.locktimeBlocks, result.blockHeight || currentHeight, result.status);

      if (result.status !== entry.status) {
        // ── Status transition detected ──────────────────────────────────────

        const eventId    = crypto.randomUUID();
        const isTerminal = TERMINAL.includes(result.status);
        const dbNow      = new Date();

        // 1. Append to htlc_events (immutable)
        await db.insert(htlcEventsTable).values({
          id:             eventId,
          tradeId:        entry.tradeId,
          htlcAddress:    entry.htlcAddress,
          settlementTxid: entry.settlementTxid,
          pair:           entry.pair,
          fromStatus:     entry.status,
          toStatus:       result.status,
          spendTxid:      result.spendTxid ?? null,
          blockHeight:    result.blockHeight,
          createdAt:      dbNow,
        });

        // 2. Update htlc_registry — terminalAt set only for terminal states
        await db.update(htlcRegistryTable)
          .set({
            status:      result.status,
            spendTxid:   result.spendTxid ?? null,
            terminalAt:  isTerminal ? dbNow : null,
            nextCheckAt: checkAt,
            updatedAt:   dbNow,
          })
          .where(eq(htlcRegistryTable.tradeId, entry.tradeId));

        // 3. Write keeper_actions for every registered Relayer Keeper
        //    Action = CLAIMED / REFUNDED for terminal states, OBSERVED otherwise
        const action = isTerminal ? result.status : "OBSERVED";
        for (const keeperAddr of relayerAddresses) {
          await db.insert(keeperActionsTable).values({
            id:            crypto.randomUUID(),
            keeperAddress: keeperAddr,
            htlcAddress:   entry.htlcAddress,
            tradeId:       entry.tradeId,
            pair:          entry.pair,
            action,
            txid:          result.spendTxid ?? null,
            blockHeight:   result.blockHeight,
            createdAt:     dbNow,
          }).onConflictDoNothing();
        }

        // 4. Push notifications to registered Relayer Keepers
        const body = notificationBody(result.status, result.blockHeight, result.spendTxid);
        for (const addr of relayerAddresses) {
          pushNotification(addr, {
            type:  "order_filled",
            title: `HTLC ${result.status}: ${entry.pair}`,
            body,
            pair:  entry.pair,
            txid:  result.spendTxid ?? entry.settlementTxid,
            side:  "buy",
          });
        }

        logger.info(
          {
            tradeId:  entry.tradeId,
            from:     entry.status,
            to:       result.status,
            pair:     entry.pair,
            terminal: isTerminal,
          },
          `HTLC watcher: ${entry.status} → ${result.status}`
        );

        if (result.status === "EXPIRED" || result.status === "REFUNDED") {
          logger.warn(
            { tradeId: entry.tradeId, status: result.status, relayers: relayerAddresses.size },
            "HTLC watcher: action required — Relayer Keepers notified"
          );
        }

        // 5. Update or evict from memory
        entry.status    = result.status;
        entry.spendTxid = result.spendTxid;
        entry.nextCheckAt = checkAt;

        if (isTerminal) {
          registry.delete(entry.tradeId);
        }
      } else {
        // No status change — just update nextCheckAt in DB and memory
        await db.update(htlcRegistryTable)
          .set({ nextCheckAt: checkAt, updatedAt: new Date() })
          .where(eq(htlcRegistryTable.tradeId, entry.tradeId));

        entry.nextCheckAt = checkAt;
      }
    } catch (err) {
      logger.warn({ err, tradeId: entry.tradeId }, "HTLC watcher: poll error for entry");
      // Back off — retry in 90 s to avoid hammering a failing endpoint
      entry.nextCheckAt = new Date(Date.now() + 90_000);
    }
  }
}

function notificationBody(status: HtlcStatus, blockHeight: number, spendTxid?: string): string {
  switch (status) {
    case "CLAIMED":
      return `Secret revealed — cross-chain swap complete. Spend: ${spendTxid?.slice(0, 12) ?? "?"}…`;
    case "EXPIRED":
      return `Locktime reached at block #${blockHeight.toLocaleString()}. User may now claim refund.`;
    case "REFUNDED":
      return `HTLC swept via CLTV at block #${blockHeight.toLocaleString()}. Trade unwound.`;
    default:
      return `Status changed to ${status}`;
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function hydrateFromDb(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(htlcRegistryTable)
      .where(notInArray(htlcRegistryTable.status, TERMINAL));

    for (const row of rows) {
      registry.set(row.tradeId, {
        tradeId:        row.tradeId,
        htlcAddress:    row.htlcAddress,
        secretHash:     row.secretHash,
        locktimeBlocks: row.locktimeBlocks,
        settlementTxid: row.settlementTxid,
        pair:           row.pair,
        userAddress:    row.userAddress,
        registeredAt:   row.createdAt.toISOString(),
        status:         row.status as HtlcStatus,
        spendTxid:      row.spendTxid ?? undefined,
        // Respect the persisted nextCheckAt so a restart doesn't over-poll
        nextCheckAt:    row.nextCheckAt ?? new Date(),
      });
    }

    logger.info(
      { hydratedCount: rows.length },
      "HTLC watcher: hydrated in-memory registry from DB"
    );
  } catch (err) {
    logger.warn({ err }, "HTLC watcher: DB hydration failed — starting with empty registry");
  }
}

/**
 * Start the background watcher.
 * Call once at server startup — async so hydration completes before first poll.
 */
export async function startHtlcWatcher(): Promise<void> {
  logger.info(
    { loopMs: LOOP_MS },
    "HTLC watcher starting (adaptive polling, DB-backed, keeper actions)"
  );
  await hydrateFromDb();

  // 15 s loop — actual poll frequency per HTLC governed by nextCheckAt
  setInterval(() => {
    pollOnce().catch(err => logger.warn({ err }, "HTLC watcher: poll cycle error"));
  }, LOOP_MS);
}
