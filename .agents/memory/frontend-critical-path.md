---
name: Frontend critical-path / loading spinner fix
description: How to eliminate the "Loading OrahDEX..." infinite spinner — entry chunk must have 0 static imports.
---

# Root cause
The browser cannot execute the entry chunk until ALL of its static `import {...} from "..."` dependencies are downloaded AND parsed. With vendor-misc (5.5 MB) statically imported, React never mounted before the 12-second splash-screen timeout fired.

# The fix (two-part)

## 1. vite.config.ts — manualChunks strategy
- Add `buffer` → `vendor-polyfills` BEFORE the vendor-misc catch-all. The `buffer` package is the only package that `polyfills.ts` (imported by `main.tsx`) statically needs from node_modules. Isolating it keeps this chunk tiny (~50 KB raw) and breaks vendor-misc's static dependency chain.
- Keep `zustand`/`immer` → `vendor-query` (App.tsx stores statically import them; they must NOT be in vendor-misc).
- Let everything else (ethers, @ledgerhq, @trezor, gridplus, recharts, rxjs, @vercel/*, etc.) stay in vendor-misc catch-all.
- Do NOT create `vendor-hardware-wallets` or `vendor-ethers` named chunks — splitting heavy packages OUT of vendor-misc does nothing if vendor-misc is still statically imported, and if vendor-misc becomes dynamic those packages are lazy anyway.

## 2. App.tsx — lazy overlay components
Make these heavy components lazy so their transitive deps don't pull vendor-misc into the static chain:
- `WalletChooserDialog` (→ HardwareWalletPanels → ledgerDMK → @ledgerhq)
- `PinPromptModal`
- `OraAIWidget`
- `SpeedInsights` (@vercel/speed-insights)
- `Analytics` (@vercel/analytics)

Wrap each with `<Suspense fallback={null}>` inside AppContent.

## Result
Entry chunk: 41 KB raw / 10 KB gzip, **0 static import statements**. Rolldown-runtime (1.2 KB) + entry execute immediately; all vendor chunks are modulepreloaded (parallel background download) but NOT blocking. React mounts in <1 s.

**Why:**
Without the 0-static-import result, React waits for the slowest vendor chunk. Getting to 0 static imports requires BOTH steps above — either alone is insufficient.

**How to apply:**
Verify after any vite.config change by running `python3 -c "import re; data=open('artifacts/bsv-dex/dist/public/assets/index-*.js').read(); print('static imports:', len(re.findall(r'^import ', data, re.MULTILINE)))"` (must be 0).
