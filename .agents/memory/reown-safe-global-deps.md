---
name: Reown AppKit safe-global transitive deps
description: @reown/appkit-utils has a static SafeProvider.js that imports @safe-global packages; these must be installed for builds to succeed.
---

## Rule
`@reown/appkit-utils/dist/esm/src/ethers/SafeProvider.js` has a **static** import:
```js
import { SafeAppProvider } from '@safe-global/safe-apps-provider';
```
And `@safe-global/safe-apps-provider` statically imports `@safe-global/safe-apps-sdk`.

This means even if the app doesn't use Safe wallet, both packages must be resolvable at build time.

**Why:** Rolldown resolves ALL static imports at build time, even in optional code paths. The try/catch pattern in @wagmi/connectors/safe.js is for dynamic imports (OK to be missing), but the static imports in SafeProvider.js are not optional.

**How to apply:**
- If build fails with `failed to resolve import "@safe-global/safe-apps-sdk" from ".../safe-apps-provider/..."`, download safe-apps-sdk tarball:
  ```
  mkdir -p bsv-dex/node_modules/@safe-global/safe-apps-sdk
  curl -sL "https://registry.npmjs.org/@safe-global/safe-apps-sdk/-/safe-apps-sdk-9.1.0.tgz" | tar xz -C ... --strip-components=1
  ```
- Also symlink `@safe-global/safe-gateway-typescript-sdk` (real in pnpm store `@safe-global+safe-gateway-typescript-sdk@3.23.1`)
- `@phosphor-icons/webcomponents@2.1.5` is used by `@reown/appkit-ui` and is REAL in pnpm store under `@phosphor-icons+webcomponents@2.1.5`

## Installed packages (tarballs, NOT in pnpm store):
- `@safe-global/safe-apps-provider@0.18.6` — static import target
- `@safe-global/safe-apps-sdk@9.1.0` — static import inside safe-apps-provider

## Installed packages (pnpm store symlinks, in REQUIRED list):
- `@phosphor-icons/webcomponents@2.1.5` — icons for appkit-ui
- `@safe-global/safe-gateway-typescript-sdk@3.23.1` — dep of safe-apps-sdk
