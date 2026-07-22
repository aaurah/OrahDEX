---
name: Postgres connection storm fix
description: Root cause and fix for the API server crashing from DB connection exhaustion every ~30 min in production
---

## Rule
`idleTimeoutMillis` in the pg Pool MUST be longer than the shortest background
service interval, or the pool churns constantly (destroy + recreate per tick).

## Root cause observed in production
- `idleTimeoutMillis: 5_000` — pool destroyed all connections after 5s idle
- Background services fire every 30–120s → every connection was cold at the start of each tick
- 12+ services overlapping → simultaneous TLS connection creation storm → pool saturated
- `connectionTimeoutMillis: 15_000` × 3 retries + 2s+4s+8s backoff = up to 59s total
- selfHealing engines have a 25s tick timeout → retries always exceeded it → useless
- Result: hitCount=84 "Connection terminated unexpectedly" in ~30 minutes

## Fix applied (lib/db/src/index.ts + app.ts)
1. `idleTimeoutMillis: 5_000 → 30_000` — connections stay warm across service ticks
2. `RETRY_BASE_MS: 2_000 → 500` — retries now fit within the 25s selfHeal timeout
3. DB pool keepalive in app.ts — `SELECT 1` every 90s (.unref()) to prevent cold-start storms

## Why 30s idle timeout is safe
- Neon kills idle server-side at ~60s, so 30s gives comfortable headroom
- Price updater runs every 60s, so a 30s idle timeout means connections cycle once between ticks
- Liquidity bot runs every 120s, so connections are cold for ~90s — but keepalive covers that gap

## Neon 57P01 (compute suspend)
Neon's FATAL "terminating connection due to administrator command" (code 57P01)
kills ALL active connections simultaneously during compute suspend/maintenance.
- isTransientPgError must check BOTH message text AND err.code === "57P01"
- Pool max=40 with 2 replicas = 80 reconnect attempts during wakeup → exhaustion
- Fix: max=15 (2×15=30 total, within Neon plan limits); keepalive prevents 5-min idle suspend

## How to apply
Any Node.js server with multiple background services and a pg pool:
- Set idleTimeoutMillis to ≥ (longest service tick / 2), but < server-side idle kill time
- Set RETRY_BASE_MS so that MAX_RETRIES × (base + connectionTimeout) < selfHeal tick timeout
- Add a keepalive ping for quiet periods (e.g., nights, low traffic)
- Set pool max to (Neon connection limit / number of replicas) — default max=40 is too high for most plans
