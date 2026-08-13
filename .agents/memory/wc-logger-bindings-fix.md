---
name: WalletConnect logger bindings crash
description: Root cause and fix for "e.bindings is not a function" in AppKit/WalletConnect init
---

## The bug
`AppKit:getUniversalProvider - Cannot create provider TypeError: e.bindings is not a function`
Stack: `getLoggerContext → formatChildLoggerContext → generateChildLogger → new <WalletConnectClass>`

## Root cause chain
1. `@reown/appkit@1.8.19` and its `@reown/appkit-utils` use `@walletconnect/logger@3.0.2`
2. Logger@3's dist has **pino@10 code inlined** (CJS-style `var b={exports:{}}` wrapper) — not a separate import that aliases can intercept
3. Pino v10 browser `child()` sets `this.bindings = bindingsObj` (plain object, not a function)
4. AppKit creates a root logger via logger@3 (pino-v10 logger), then passes it to our symlinked `@walletconnect/universal-provider@2.21.1`
5. Universal-provider → sign-client → core all use `@walletconnect/logger@2.1.2`
6. Logger@2's `getLoggerContext` does `typeof e.bindings > 'u' ? fallback : e.bindings().context` — `'object' > 'u'` is FALSE, so it tries to call the plain-object as a function → crash

## Why pino alias and load-hook don't help
- `resolve.alias: { pino: stub }` intercepts bare-specifier `"pino"` imports, but rolldown may pre-resolve to absolute pnpm-store path before alias matching
- `load` hook on `id.includes('/node_modules/pino/')` can't intercept pino code already **inlined** inside `@walletconnect/logger@3.0.2/dist/index.es.js`

## The fix (in vite.config.ts)
A `transform` plugin (`walletconnect-logger-compat`, `enforce: "pre"`) that patches `@walletconnect/logger@2.1.2`'s dist when loaded:

```
OLD: typeof r.bindings>"u"?t=v(r,e):t=r.bindings().context||""
NEW: typeof r.bindings>"u"?t=v(r,e):t=(typeof r.bindings==="function"?r.bindings().context:(r.bindings&&r.bindings.context))||""
```

Match condition: `id.includes('@walletconnect/logger') && id.includes('2.1.2')`

This makes logger@2's `getLoggerContext` handle both pino-v7 (function) and pino-v10 (plain object) `bindings` values without crashing.

**Why:** Logger@3 is permanently tied to pino@10 (inlined), and logger@2 cannot be updated (symlinked from pnpm store). The transform is the only non-destructive way to bridge them.
