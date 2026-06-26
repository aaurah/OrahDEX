/**
 * arcStatusPoller.ts — OrahDEX
 *
 * Background job that polls TAAL's ARC GET /v1/tx/{txid} endpoint for any
 * BSV transactions that were submitted via ARC but have not yet reached a
 * terminal status (MINED or DOUBLE_SPEND_ATTEMPTED / REJECTED).
 *
 * Covered records:
 *   withdrawal_requests — BSV withdrawals with arc_txid set and arc_status not MINED
 *   bsv_intent_sessions — claim/refund txids with arc_txid set and arc_status not MINED
 *
 * The poller runs every 60 s. It stops updating a record once its arc_status
 * reaches a terminal value ("MINED", "DOUBLE_SPEND_ATTEMPTED", "REJECTED").
 */

import { db } from "@workspace/db";
import { withdrawalRequestsTable, bsvIntentSessionsTable } from "@workspace/db/schema";
import { eq, and, isNotNull, notInArray } from "drizzle-orm";
import { logger } from "./logger.js";
import { guardedInterval } from "./selfHealing.js";
import { pollArcStatus } from "./arcBroadcaster.js";

const TERMINAL_ARC_STATUSES = ["MINED", "DOUBLE_SPEND_ATTEMPTED", "REJECTED"];

async function pollWithdrawals(): Promise<void> {
  const pending = await db
    .select({ id: withdrawalRequestsTable.id, arcTxid: withdrawalRequestsTable.arcTxid })
    .from(withdrawalRequestsTable)
    .where(
      and(
        isNotNull(withdrawalRequestsTable.arcTxid),
        notInArray(withdrawalRequestsTable.arcStatus, TERMINAL_ARC_STATUSES),
      ),
    )
    .limit(50);

  for (const row of pending) {
    if (!row.arcTxid) continue;
    const status = await pollArcStatus(row.arcTxid);
    if (!status) continue;

    await db
      .update(withdrawalRequestsTable)
      .set({ arcStatus: status.txStatus })
      .where(eq(withdrawalRequestsTable.id, row.id));

    logger.debug({ id: row.id, arcTxid: row.arcTxid, arcStatus: status.txStatus }, "arcStatusPoller: withdrawal updated");
  }
}

async function pollIntentSessions(): Promise<void> {
  const pending = await db
    .select({ id: bsvIntentSessionsTable.id, arcTxid: bsvIntentSessionsTable.arcTxid })
    .from(bsvIntentSessionsTable)
    .where(
      and(
        isNotNull(bsvIntentSessionsTable.arcTxid),
        notInArray(bsvIntentSessionsTable.arcStatus, TERMINAL_ARC_STATUSES),
      ),
    )
    .limit(50);

  for (const row of pending) {
    if (!row.arcTxid) continue;
    const status = await pollArcStatus(row.arcTxid);
    if (!status) continue;

    await db
      .update(bsvIntentSessionsTable)
      .set({ arcStatus: status.txStatus, updatedAt: new Date() })
      .where(eq(bsvIntentSessionsTable.id, row.id));

    logger.debug({ id: row.id, arcTxid: row.arcTxid, arcStatus: status.txStatus }, "arcStatusPoller: intent session updated");
  }
}

async function pollCycle(): Promise<void> {
  await pollWithdrawals();
  await pollIntentSessions();
}

export function startArcStatusPoller(): void {
  logger.info("ARC status poller starting — 60 s poll interval");
  guardedInterval("arc-status-poller", pollCycle, 60_000, {
    timeoutMs:      55_000,
    initialDelayMs: 90_000,
  });
}
