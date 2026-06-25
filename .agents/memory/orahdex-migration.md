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

## ThirdWeb SDK v5 + Vite/Rolldown build strategy

### Root cause of build failures
ThirdWeb@5 lives in a pnpm CAS entry (`thirdweb_tmp_10452`). It has two classes of transitive deps that are missing from the pnpm store or from bsv-dex's node_modules resolution chain:

1. **Truly absent packages** (not in pnpm store at all): `@emotion/styled`, `@emotion/react`, `@reown/appkit-scaffold-ui`, `@reown/appkit-ui`, `@reown/appkit-wallet`, `@reown/appkit-utils` (1.7.8 versions), various AWS SDK modules, coinbase-wallet-sdk, react-native, etc. → **Stub with virtual no-op modules**.

2. **Packages only in bsv-dex/node_modules** (not in the root `.pnpm` chain that ThirdWeb or @reown@1.7.8 traverse): `@walletconnect/universal-provider`, `big.js`, `bs58`, `dayjs`, `eventemitter3`, `semver`, `use-sync-external-store`, `valtio`, and all `@reown/*` sub-packages. → **Symlink into `artifacts/bsv-dex/node_modules/`, then use plugin redirect**.

### Three-plugin architecture in vite.config.ts
1. **`thirdweb-ui-shim`** (`enforce: "pre"`): Explicit stub list for @emotion/*, @radix-ui/*, fuse.js, uqr, and importer-aware catch-all for ThirdWeb's internal dist (`thirdweb_tmp_10452` importer). Catch-all re-resolves from bsv-dex context via async `this.resolve()` (with try-catch), falls back to virtual stub.

2. **`thirdweb-opt-stub`** (`enforce: "pre"`): Explicit TW_OPTIONAL set for optional deps (AWS SDK, coinbase, WC sign-client, react-native, x402, etc.). Returns `"\0tw-opt-stub:<id>"` virtual modules with empty exports.

3. **`bsv-dex-redirect`** (`enforce: "pre"`, BEFORE thirdweb-ui-shim): Intercepts any import of `@reown/*` or `@walletconnect/universal-provider` where the **importer** is anywhere inside `/node_modules/` (covers @reown/appkit@1.7.8 in ThirdWeb's chain). Re-resolves from `src/main.tsx` context using async `this.resolve()` with try-catch.

**Why the three-plugin approach beats resolve.alias**: Vite `resolve.alias` does prefix string replacement — `@reown/appkit` → `/abs/path/` — which breaks subpath exports (`@reown/appkit/react` becomes `/abs/path/react`, a file path, not a package subpath). The plugin approach calls `this.resolve(id, fakeImporter)` with a proper package ID, preserving subpath export resolution.

### Symlinks required in artifacts/bsv-dex/node_modules/
For each missing package, find the pnpm store entry and symlink:
```bash
PNPM="/home/runner/workspace/node_modules/.pnpm"
BSV_NM="/home/runner/workspace/artifacts/bsv-dex/node_modules"
# Example:
entry=$(ls "$PNPM" | grep "^@walletconnect+universal-provider@2.21" | tail -1)
ln -sfn "$PNPM/$entry/node_modules/@walletconnect/universal-provider" "$BSV_NM/@walletconnect/universal-provider"
```

### Build command (do NOT use pnpm install — it times out)
```bash
cd /home/runner/workspace/artifacts/bsv-dex && node_modules/.bin/vite build --config vite.config.ts
```

### Resolved error taxonomy
- `"Rolldown failed to resolve X from thirdweb_tmp_10452/..."` → add to TW_OPTIONAL stub list or symlink + catch-all handles it
- `"Rolldown failed to resolve @reown/appkit-utils from @reown+appkit@1.7.8/..."` → `bsv-dex-redirect` plugin handles it  
- `"Errored while resolving X in this.resolve"` → rolldown throws for some subpath imports; wrap in try-catch and return null to let rolldown handle natively
- `"[UNLOADABLE_DEPENDENCY] Could not load node_modules/@reown/appkit/react"` → caused by using `resolve.alias` with directory paths; remove aliases, use plugin instead
