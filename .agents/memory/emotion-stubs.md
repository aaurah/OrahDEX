---
name: Emotion stubs for ThirdWeb in Rolldown (Vite 8)
description: How to stub @emotion/react and @emotion/styled to fix Rolldown namespace collisions that crash OrahDEX preview.
---

## The problem
Rolldown (Vite 8) derives namespace identifiers from the **last path segment** of package names. Both `react` and `@emotion/react` end in `"react"`, so both get `import_react`. ThirdWeb's bundled animations use `@emotion/react` keyframes, causing `import_react.keyframes is not a function`.

Same pattern for `@emotion/styled` — `StyledButton$1 is not a function` because the Proxy target was a `forwardRef()` result (a React object, not a plain function), so `apply` trap never fired.

## The fix
Add resolve.alias entries in `artifacts/bsv-dex/vite.config.ts`:
```ts
"@emotion/react": path.resolve(__dirname, "src/stubs/emotion-react.js"),
"@emotion/styled": path.resolve(__dirname, "src/stubs/emotion-styled.js"),
```

## emotion-react.js stub rules
- Use ONLY named imports from `react` (`{ createElement }`), NEVER `import React from 'react'` — that would re-introduce the `import_react` collision.
- Export `keyframes`, `Global`, `css`, `ThemeProvider`, etc. as no-ops.

## emotion-styled.js stub rules — critical
- The Proxy target for `makeStyledProxy()` MUST be a **plain function** (not `forwardRef(fn)`).
- `forwardRef()` returns a React object (not callable), so `new Proxy(forwardRef(fn), {apply: ...})` is not callable. Callers get "X is not a function" even though `X instanceof ProxyObject`.
- Use a plain `function StyledComponent(props) { return createElement(...) }` as the target so the Proxy's `apply` trap fires correctly when the styled factory is invoked.
- Use only named imports (`{ createElement }` from `react`), not default import.

**Why:** Rolldown 1.x (unlike Webpack/Rollup) does not deduplicate namespace identifiers across packages — any two packages with the same final path segment share a namespace, causing catastrophic collisions in ThirdWeb's bundled code.

**How to apply:** Any time a new ThirdWeb build breaks with "X is not a function" and the bundle shows the variable is a Proxy, check for Rolldown namespace collisions by looking at the import namespace identifier (e.g. `import_react`, `import_styled`). Add a stub alias for the colliding package.
