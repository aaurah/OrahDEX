---
name: Drizzle atomic two-phase ops
description: When two DB operations must be atomic (e.g. lock funds then insert record), they must share a single pool.connect() transaction — not two separate commits.
---

## Rule

Never split a two-phase write (debit + insert, lock + create) across two independent transactions. Use a single `pool.connect()` client that issues `BEGIN … COMMIT` covering both writes.

**Bad pattern (race window):**
```typescript
await lockFuturesMargin(walletAddress, margin);       // commits txn A
await db.insert(futuresPositionsTable).values({...}); // separate txn B
// crash here → margin locked, no position exists → funds stuck
```

**Correct pattern:**
```typescript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // Phase 1: lock margin (SELECT FOR UPDATE → UPDATE)
  await client.query(`UPDATE futures_margin_accounts SET ...`, [...]);
  // Phase 2: insert position in the SAME transaction
  await client.query(`INSERT INTO futures_positions ...`, [...]);
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  client.release();
}
```

**Why:** Between two separate commits there is a window where the server can crash, be killed, or another request can observe inconsistent state (funds deducted but no matching record). A single transaction is all-or-nothing.

**How to apply:** Any helper function that does "lock funds + create record" or "debit + credit" must inline both operations in one `pool.connect()` session. Don't compose two helpers that each open their own transaction.
