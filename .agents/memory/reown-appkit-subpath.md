---
name: Reown AppKit Subpath Resolution
description: Rolldown (Vite 8) fails to resolve @reown/appkit/* subpath exports through symlinks; fix via explicit resolve.alias.
---

## The Rule
Add explicit `resolve.alias` entries for every `@reown/appkit/*` subpath import used in user code. Do NOT rely on rolldown's automatic subpath export resolution through symlinks.

**Why:** Rolldown (rolldown@1.0.0-rc.13 / vite@8) cannot follow pnpm symlinks for package.json `"exports"` subpath resolution. The error is `"Rolldown failed to resolve import '@reown/appkit/react'"`. This happens even when the symlink and the package.json exports map are both intact.

**How to apply:** In `artifacts/bsv-dex/vite.config.ts` `resolve.alias`:
```js
"@reown/appkit/react":    path.resolve(import.meta.dirname, "node_modules/@reown/appkit/dist/esm/exports/react.js"),
"@reown/appkit/networks": path.resolve(import.meta.dirname, "node_modules/@reown/appkit/dist/esm/exports/networks.js"),
```
If new `@reown/appkit/*` subpaths are added to source code, add corresponding aliases here. The symlink at `artifacts/bsv-dex/node_modules/@reown/appkit` is maintained by pnpm (it's a declared dependency) so the path is stable.

## Additional context
- The `bsv-dex-redirect` plugin only fixes subpath resolution for node_modules importers, not user code.
- Manual `vite build` (from artifacts/bsv-dex/) works fine; the failure is specific to the Frontend workflow's `pnpm --filter @workspace/bsv-dex run dev` which may have subtle resolver differences.
- The logger compat fix (typeof e.bindings === 'function') IS in the bundle even when the variable name is minified from `r` to `e`.
