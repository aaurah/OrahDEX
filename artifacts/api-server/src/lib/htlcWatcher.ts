/**
 * HTLC Watcher — OrahDEX Relayer / Keeper subsystem
 *
 * Maintains a DB-backed registry of cross-chain HTLC outputs and polls their
 * on-chain status every 90 seconds. The in-memory map is a speed cache;
 * PostgreSQL is the canonical ledger — restart-safe, historically queryable.
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *
 *   orders.ts          → registerHtlc()     → htlc_registry (DB) + memory map
 *   poll cycle         → queryHtlcStatus()  → update htlc_registry + insert htlc_events
 *   relayer-events API ← getActiveHtlcs()   ← memory map (fast)
 *   relayer-events API ← getHtlcEvents()    ← htlc_events (DB, full history)
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
 *              Notify the user immediately.
 *
 *   REFUNDED → User swept the output via CLTV. Trade is unwound on-chain.
 *              Keeper notification allows re-matching or manual resolution.
 *
 * ── Persistence invariants ────────────────────────────────────────────────────
 *
 *   • Every registerHtlc() writes to htlc_registry before returning.
 *   • Every status transition writes to htlc_events (append-only).
 *   • Terminal states (CLAIMED, REFUNDED) are removed from the memory map
 *     but remain in htlc_registry for audit — their status column is updated.
 *   • On startup, startHtlcWatcher() hydrates the memory map from DB rows
 *     where status is NOT in (CLAIMED, REFUNDED).
 */

import crypto from "node:crypto";
import { db } from "@workspace/db";
import { htlcRegistryTable, htlcEventsTable } from "@workspace/db/schema";
import { eq, notInArray } from "drizzle-orm";
import { queryHtlcStatus, type HtlcStatus } from "./bsvChainMonitor.js";
import { pushNotification } from "./notifQueue.js";
import { logger } from "./logger.js";

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

// ── In-memory cache ───────────────────────────────────────────────────────────

const TERMINAL:    HtlcStatus[] = ["CLAIMED", "REFUNDED"];
const POLL_MS      = 90_000;   // 90 s — staggered from 60 s chain monitor

const registry = new Map<string, HtlcEntry>(); // key: tradeId — non-terminal only
const relayerAddresses = new Set<string>();     // Relayer Keepers for push notifications

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register an HTLC for monitoring immediately after broadcast.
 * Writes to htlc_registry (DB) then adds to the in-memory cache.
 */
export async function registerHtlc(
  entry: Omit<HtlcEntry, "status" | "registeredAt">,
): Promise<void> {
  const now = new Date();

  // Upsert into DB — idempotent if orders.ts retries the broadcast
  await db.insert(htlcRegistryTable).values({
    tradeId:        entry.tradeId,
    htlcAddress:    entry.htlcAddress,
    secretHash:     entry.secretHash,
    locktimeBlocks: entry.locktimeBlocks,
    settlementTxid: entry.settlementTxid,
    pair:           entry.pair,
    userAddress:    entry.userAddress,
    status:         "LOCKED",
    createdAt:      now,
    updatedAt:      now,
  }).onConflictDoNothing();

  // Update in-memory cache
  registry.set(entry.tradeId, {
    ...entry,
    status:       "LOCKED",
    registeredAt: now.toISOString(),
  });

  logger.info(
    { tradeId: entry.tradeId, htlcAddress: entry.htlcAddress, pair: entry.pair },
    "HTLC watcher: registered new HTLC (DB + memory)"
  );
}

/**
 * Register a Relayer Keeper address for push notifications on status change.
 * Called by GET /api/keeper/relayer-events when the caller has the Relayer role.
 */
export function registerRelayerKeeper(address: string): void {
  relayerAddresses.add(address);
}

/** Return all non-terminal HTLCs currently in the in-memory cache. */
export function getActiveHtlcs(): HtlcEntry[] {
  return Array.from(registry.values());
}

/**
 * Return the HTLC event log from DB, newest first.
 * This is the full historical record — survives restarts.
 */
export async function getHtlcEvents(limit = 50): Promise<HtlcEvent[]> {
  try {
    const rows = await db
      .select()
      .from(htlcEventsTable)
      .orderBy(htlcEventsTable.createdAt) // will reverse below
      .limit(limit);

    // Return newest first
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
    logger.warn({ err }, "HTLC watcher: getHtlcEvents DB query failed — returning empty");
    return [];
  }
}

// ── Background polling ────────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  if (registry.size === 0) return;

  const entries = Array.from(registry.values());
  logger.debug({ count: entries.length }, "HTLC watcher: polling active HTLCs");

  for (const entry of entries) {
    try {
      const result = await queryHtlcStatus(entry.htlcAddress, entry.locktimeBlocks);
      if (result.status === entry.status) continue;

      const eventId = crypto.randomUUID();
      const now     = new Date();

      // Persist the transition event (append-only)
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
        createdAt:      now,
      });

      // Update the registry row status
      await db.update(htlcRegistryTable)
        .set({ status: result.status, spendTxid: result.spendTxid ?? null, updatedAt: now })
        .where(eq(htlcRegistryTable.tradeId, entry.tradeId));

      logger.info(
        { tradeId: entry.tradeId, from: entry.status, to: result.status, pair: entry.pair },
        `HTLC watcher: ${entry.status} → ${result.status}`
      );

      // Notify registered Relayer Keepers
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

      if (result.status === "EXPIRED" || result.status === "REFUNDED") {
        logger.warn(
          { tradeId: entry.tradeId, status: result.status, relayers: relayerAddresses.size },
          "HTLC watcher: action required — Relayer Keepers notified"
        );
      }

      // Update in-memory entry
      entry.status    = result.status;
      entry.spendTxid = result.spendTxid;

      // Remove terminal HTLCs from the active cache
      if (TERMINAL.includes(result.status)) {
        registry.delete(entry.tradeId);
      }
    } catch (err) {
      logger.warn({ err, tradeId: entry.tradeId }, "HTLC watcher: poll error");
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
      return `HTLC swept via CLTV refund path at block #${blockHeight.toLocaleString()}. Trade unwound.`;
    default:
      return `Status changed to ${status}`;
  }
}

// ── Startup — hydrate from DB ─────────────────────────────────────────────────

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

/** Start the background watcher. Call once at server startup. */
export async function startHtlcWatcher(): Promise<void> {
  logger.info("HTLC watcher starting — hydrating from DB, then polling every 90 s");
  await hydrateFromDb();
  setInterval(() => {
    pollOnce().catch(err => logger.warn({ err }, "HTLC watcher: poll cycle error"));
  }, POLL_MS);
}
