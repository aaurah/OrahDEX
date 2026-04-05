/**
 * HTLC Watcher — OrahDEX Relayer / Keeper subsystem
 *
 * Maintains an in-memory registry of active cross-chain HTLC outputs and
 * polls their on-chain status every 90 seconds. When a status transition is
 * detected (LOCKED → CLAIMED / EXPIRED / REFUNDED) it:
 *   1. Records the transition event in the event log (capped at 200 entries).
 *   2. Logs a structured entry for Keeper observability.
 *   3. Pushes a notification to registered Relayer keepers via the
 *      notification queue so they can act immediately.
 *
 * ── Who acts on each status? ──────────────────────────────────────────────────
 *
 *   LOCKED   → Relayer Keeper detects the secretHash in OP_RETURN, prepares
 *              the claim transaction, and waits for counterparty confirmation.
 *
 *   CLAIMED  → Relayer has spent the P2SH output by revealing the secret.
 *              No further action needed. Keeper earns bridge fee.
 *
 *   EXPIRED  → CLTV locktime passed without a claim. Relayer did NOT claim.
 *              The sender (user) can now sweep via the refund path. The
 *              settlement should be marked as refundable.
 *
 *   REFUNDED → User swept the output via CLTV. Trade is unwound on-chain.
 *              Keeper notification allows re-matching or manual resolution.
 *
 * ── HTLC registration ────────────────────────────────────────────────────────
 *
 *   Call registerHtlc() immediately after a cross-chain settlement broadcast.
 *   Call startHtlcWatcher() once at server startup.
 *   Call getHtlcEvents() to surface the event log to the Keeper API.
 */

import { queryHtlcStatus, type HtlcStatus } from "./bsvChainMonitor.js";
import { pushNotification } from "./notifQueue.js";
import { logger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HtlcEntry {
  /** Unique trade ID */
  tradeId:         string;
  /** BSV P2SH address of the HTLC output */
  htlcAddress:     string;
  /** SHA-256 secret hash embedded in the redeem script */
  secretHash:      string;
  /** Absolute BSV block height of the CLTV refund locktime */
  locktimeBlocks:  number;
  /** BSV settlement txid (OP_RETURN transaction) */
  settlementTxid:  string;
  /** Trading pair (e.g. "ETH/BSV") */
  pair:            string;
  /** Wallet address of the user on the non-BSV chain */
  userAddress:     string;
  /** Registered at (ISO timestamp) */
  registeredAt:    string;
  /** Current status (updated by watcher) */
  status:          HtlcStatus;
  /** Spending txid — set when CLAIMED or REFUNDED */
  spendTxid?:      string;
}

export interface HtlcEvent {
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

// ── In-memory registry ────────────────────────────────────────────────────────

const MAX_EVENTS   = 200;
const POLL_INTERVAL_MS = 90_000; // 90 s — stagger from the 60 s chain monitor

const registry = new Map<string, HtlcEntry>(); // key: tradeId
const eventLog: HtlcEvent[] = [];              // capped at MAX_EVENTS, newest first

// Addresses of registered Relayer keepers for notifications
const relayerAddresses = new Set<string>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register an HTLC for monitoring immediately after broadcast.
 * Terminal HTLCs (CLAIMED/REFUNDED) are de-registered automatically.
 */
export function registerHtlc(entry: Omit<HtlcEntry, "status" | "registeredAt">): void {
  registry.set(entry.tradeId, {
    ...entry,
    status:       "LOCKED",
    registeredAt: new Date().toISOString(),
  });
  logger.info(
    { tradeId: entry.tradeId, htlcAddress: entry.htlcAddress, pair: entry.pair },
    "HTLC watcher: registered new HTLC"
  );
}

/**
 * Register a Relayer keeper address for HTLC event notifications.
 * Called when a keeper with role "Relayer" is confirmed active.
 */
export function registerRelayerKeeper(address: string): void {
  relayerAddresses.add(address);
}

/** Return all active (non-terminal) HTLCs in the registry. */
export function getActiveHtlcs(): HtlcEntry[] {
  return Array.from(registry.values());
}

/** Return the event log, newest first. */
export function getHtlcEvents(limit = 50): HtlcEvent[] {
  return eventLog.slice(0, limit);
}

// ── Background polling ────────────────────────────────────────────────────────

async function pollOnce(): Promise<void> {
  if (registry.size === 0) return;

  const entries = Array.from(registry.values());
  logger.debug({ count: entries.length }, "HTLC watcher: polling active HTLCs");

  for (const entry of entries) {
    try {
      const result = await queryHtlcStatus(entry.htlcAddress, entry.locktimeBlocks);
      if (result.status === entry.status) continue; // no change

      const event: HtlcEvent = {
        tradeId:        entry.tradeId,
        htlcAddress:    entry.htlcAddress,
        settlementTxid: entry.settlementTxid,
        pair:           entry.pair,
        fromStatus:     entry.status,
        toStatus:       result.status,
        spendTxid:      result.spendTxid,
        blockHeight:    result.blockHeight,
        timestamp:      new Date().toISOString(),
      };

      // Update registry entry
      entry.status    = result.status;
      entry.spendTxid = result.spendTxid;

      // Push to event log (newest first, capped)
      eventLog.unshift(event);
      if (eventLog.length > MAX_EVENTS) eventLog.pop();

      logger.info(
        { tradeId: entry.tradeId, from: event.fromStatus, to: event.toStatus, pair: entry.pair },
        `HTLC watcher: status transition ${event.fromStatus} → ${event.toStatus}`
      );

      // Notify registered Relayer keepers of the transition
      for (const relayerAddr of relayerAddresses) {
        const isAction = result.status === "EXPIRED" || result.status === "REFUNDED";
        pushNotification(relayerAddr, {
          type:  "order_filled", // use existing notification type
          title: `HTLC ${result.status}: ${entry.pair}`,
          body:  statusNotificationBody(event),
          pair:  entry.pair,
          txid:  result.spendTxid ?? entry.settlementTxid,
          side:  "buy" as const,
        });

        if (isAction) {
          logger.warn(
            { relayerAddr, tradeId: entry.tradeId, status: result.status },
            "HTLC watcher: action required — notified Relayer Keeper"
          );
        }
      }

      // De-register terminal HTLCs (CLAIMED and REFUNDED are final)
      if (result.status === "CLAIMED" || result.status === "REFUNDED") {
        registry.delete(entry.tradeId);
      }
    } catch (err) {
      logger.warn({ err, tradeId: entry.tradeId }, "HTLC watcher: poll error for entry");
    }
  }
}

function statusNotificationBody(event: HtlcEvent): string {
  switch (event.toStatus) {
    case "CLAIMED":
      return `Secret revealed — cross-chain swap complete. Spend: ${event.spendTxid?.slice(0, 12)}…`;
    case "EXPIRED":
      return `Locktime reached at block #${event.blockHeight}. User may now claim refund.`;
    case "REFUNDED":
      return `HTLC swept via CLTV refund path. Trade unwound on-chain.`;
    default:
      return `Status changed to ${event.toStatus}`;
  }
}

/** Start the background watcher. Call once at server startup. */
export function startHtlcWatcher(): void {
  logger.info("HTLC watcher starting — polling every 90 s");
  setInterval(() => {
    pollOnce().catch(err => logger.warn({ err }, "HTLC watcher: poll cycle error"));
  }, POLL_INTERVAL_MS);
}
