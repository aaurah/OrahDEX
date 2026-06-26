---
name: ARC broadcaster pattern
description: Key differences between ARC and WoC broadcast APIs; DB migration approach for new BSV columns.
---

## ARC vs WoC body format
- ARC POST /v1/tx body: `{ rawTx: "<hex>" }` (NOT `txhex`)
- WoC POST /tx/raw body: `{ txhex: "<hex>" }`
- ARC response: `{ txid, txStatus, ... }` — txStatus values: QUEUED, SEEN_ON_NETWORK, MINED, DOUBLE_SPEND_ATTEMPTED, REJECTED
- ARC auth: `Authorization: Bearer <ARC_API_KEY>` — omit header if key is empty (testnet/open endpoint)

**Why:** The field name difference (`rawTx` vs `txhex`) is easy to mix up and causes silent 400 errors.

## DB migration approach
- `drizzle-kit push` requires a TTY (interactive prompt for schema conflicts) — fails in CI/agent shells
- Use `pool.query("ALTER TABLE … ADD COLUMN IF NOT EXISTS …")` at app startup instead (same pattern as the chain_id column migration in app.ts)

**Why:** Avoid interactive drizzle-kit push; idempotent SQL at startup is reliable and consistent with the existing migration pattern in the codebase.

**How to apply:** Always add new DB columns as `IF NOT EXISTS` ALTER TABLE calls at the top of `artifacts/api-server/src/app.ts`, grouped near the existing chain_id migration block.

## Env vars
- `ARC_API_URL` — default `https://arc.taal.com`
- `ARC_API_KEY` — Bearer token; empty = no auth header
