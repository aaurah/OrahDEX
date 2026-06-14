---
name: OrahDEX Replit migration
description: Key lessons from migrating OrahDEX (multi-chain BSV/EVM DEX) to standard Replit environment.
---

## pnpm install timeout workaround
Full `pnpm install` times out during the symlinking phase. Use `pnpm --filter <package> install` per workspace package. For bsv-dex specifically, install timed out too — use Python script to bulk-symlink all deps from the pnpm virtual store (`node_modules/.pnpm/`) into `artifacts/bsv-dex/node_modules/`.

**Why:** Replit containers have I/O limits that make creating thousands of symlinks slow in one shot.

**How to apply:** Run `python3` script that reads package.json, globs the pnpm store for each dep, and `os.symlink`s into `<package>/node_modules/`.

## bsv-dex vite build setup
Vite config compiles in `node_modules/.vite-temp` at workspace root, so vite plugins must be symlinked into workspace-root `node_modules/`:
- `node_modules/vite` → mockup-sandbox's vite
- `node_modules/@vitejs/plugin-react` → pnpm store entry
- `node_modules/@tailwindcss/vite` → pnpm store entry
- `node_modules/tailwindcss` → pnpm store entry
- `node_modules/vite-plugin-node-polyfills` → pnpm store entry
- `node_modules/react` + `node_modules/react-dom` → pnpm store entries

Workspace packages (`@workspace/api-client-react`, `@workspace/integrations-openai-ai-react`) symlinked from `lib/` into `artifacts/bsv-dex/node_modules/@workspace/`.

## DB migration approach
`drizzle-kit push` requires TTY — use `executeSql` directly with raw SQL. Three migration files exist; additional tables from newer schema files (`advancedOrders.ts`, `bsvIntentSessions.ts`, `wallets.ts`, `options.ts`, `fundingRates.ts`) must be applied manually. `internal_bsv_wallets` is defined inline in `artifacts/api-server/src/lib/internalBsvWallet.ts` via raw pool.query, not in drizzle schema.

## Port mapping
- API server: port 8080 → external 3000
- bsv-dex frontend: port 20180 → external 80 (preview pane shows this)
- API proxy: serve-static.mjs proxies `/api/*` to localhost:8080
