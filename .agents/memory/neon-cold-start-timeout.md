---
name: Neon cold-start query timeout
description: Neon serverless compute wakes slowly; query_timeout must be high enough to survive the full wakeup window.
---

## The Rule
Set `query_timeout` on the pg Pool to **at least 60 000 ms** for a Neon serverless database.

```typescript
query_timeout: 60_000,   // was 30_000 — too tight for Neon cold-start
```

**Why:** Neon suspends compute when idle. On first connection after suspend, the compute needs 10–30 s to wake before it can execute queries. With `query_timeout: 30_000`, cold-start queries on the 55 K-row markets table (and any other non-trivial SELECT) were terminated at exactly the moment Neon's compute was coming online. This left pg-pool in a degraded state: every background service that started during the wakeup window hit the timeout, all their retries hit it again, and the error cascade lasted 1–2 minutes.

**How to apply:** Keep `query_timeout: 60_000` in `lib/db/src/index.ts`. If a genuinely runaway query becomes a concern, set a `statement_timeout` at the session level for specific heavy operations rather than lowering the pool-wide limit.

## Related context
- `DB_POOL_MAX=10` is set in `[userenv.production]` of `.replit` — keeps the pool small for Neon's free/launch tier.
- `connectionTimeoutMillis: 15_000` covers slot-wait time (when all 10 connections are busy).
- `idleTimeoutMillis: 5_000` evicts stale connections before Neon kills them server-side (~60 s).
