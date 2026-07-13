---
name: Reown AppKit re-integration into bsv-dex
description: Full install process for @reown/appkit + all transitive deps when pnpm is unavailable (SIGKILL); which packages needed tarballs vs. pnpm-store symlinks.
---

## Rule
When pnpm install is killed (SIGKILL in Replit sandbox), install @reown/* packages and their transitive deps **manually** via tarball or pnpm-store symlinks.

**Why:** pnpm install exceeds Replit's memory/CPU budget for large packages. All installs must be done with `curl -sL <tarball> | tar xz -C <dest> --strip-components=1`.

**How to apply:**
1. Download @reown/* tarballs (appkit, appkit-adapter-wagmi, appkit-ui, appkit-scaffold-ui, appkit-wallet, appkit-controllers, appkit-common, appkit-polyfills, appkit-pay, appkit-utils)
2. For each dep not in pnpm store, download tarball. For deps in pnpm store (real, not hollow), use `ln -sfn`.
3. The `bsv-dex-symlinks` plugin in vite.config.ts runs `buildStart` and symlinks everything in REQUIRED from the pnpm store — add new store-backed packages there.
4. Tarball-installed packages (no pnpm store entry) stay as real dirs and do NOT go in REQUIRED.

## Key transitive deps that needed tarballs (not in pnpm store):
- `@walletconnect/web3wallet` + its sub-packages (auth-client, heartbeat, jsonrpc-*)
- `@safe-global/safe-apps-provider@0.18.6`
- `@safe-global/safe-apps-sdk@9.1.0`
- gridplus-sdk, @emotion/is-prop-valid, @emotion/memoize, crc-32, cbor

## Key transitive deps found in pnpm store (symlinked + added to REQUIRED):
- `@phosphor-icons/webcomponents@2.1.5` (used by appkit-ui for icons)
- `@safe-global/safe-gateway-typescript-sdk@3.23.1`
- wagmi, @wagmi/core, @wagmi/connectors, viem, framer-motion, mipd, @lit/react

## Stubs created:
- `src/stubs/trezor-websocket-client/` — desktop-only dep of @trezor/connect-web
- `src/stubs/pino.js`, `src/stubs/emotion-react.js`, `src/stubs/emotion-styled.js` — pre-existing

## vite.config.ts alias list (resolve.alias):
- All @reown/appkit/* subpaths needed explicit alias entries due to Rolldown symlink resolution bug.
- See [Reown appkit subpath alias](reown-appkit-subpath.md) for details.

## Final build result: ✓ 5922 modules transformed (11.82s)
