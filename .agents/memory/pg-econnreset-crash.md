---
name: pg ECONNRESET crash pattern
description: Why Neon connection drops were killing the entire API server, and the three-layer fix applied.
---

## The bug

Neon Postgres terminates idle TCP connections server-side. When this happens while a pg client is checked out of the pool (mid-query), pg emits an `error` event on the underlying socket (`Connection2`). This event is NOT caught by `pool.on("error", ...)` — that only fires for idle clients. With no listener on the client itself, Node.js treats it as an uncaughtException.

The API server had TWO `uncaughtException` handlers registered (both stayed active):

1. `index.ts` (registered first): logs "process stays alive" and returns.
2. `app.ts` (registered second, loaded via dynamic import): calls `process.exit(1)`.

Node.js calls **all** listeners in registration order. So the "stays alive" log appeared, but `process.exit(1)` always ran after it. Every pg network blip killed the server.

## The three-part fix

**Fix 1 — `lib/db/src/index.ts`**: `pool.on("connect")` now attaches `client.on("error", ...)` to every client at creation time. This catches socket errors on checked-out clients before they can escape to uncaughtException. Eliminates the escape path entirely.

**Fix 2 — `artifacts/api-server/src/app.ts`**: Added `isTransientNetworkError()` guard to the app.ts `uncaughtException` handler. ECONNRESET / "Connection terminated" / socket hang up → log warn and return (don't exit). Truly fatal errors (programming bugs) still exit and trigger watchdog restart.

**Why:** Belt-and-suspenders — even if a future pg version changes error propagation, the handler itself won't kill the process for network blips.

**Fix 3 — `artifacts/bsv-dex/serve-static.mjs`**: The proxy error handler returned 200 for `/v1` when the API was unreachable, but NOT for `/api` or `/api/`. Deployment healthchecks probe `/api` — if the API just restarted and the proxy can't connect, the healthcheck saw a 502 and terminated the artifact. Added `/api` and `/api/` to the health-safe list.

## How to apply

- Any new pg pool created in this codebase must add `pool.on("connect", client => client.on("error", ...))`.
- Any `uncaughtException` handler that calls `process.exit` must filter transient network errors first.
- Any reverse proxy / static server that health-checks on behalf of the API must return 200 for all deployment-probed paths when the upstream is temporarily unavailable.
