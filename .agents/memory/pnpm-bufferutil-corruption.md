---
name: pnpm bufferutil peer-dep corruption
description: All pnpm store entries whose hash includes bufferutil@4.1.0_utf-8-validate@5.0.10 can lose their JS files. Fix: download tarball from npm registry via Python + symlink.
---

## Rule
When the API server (or any esbuild build) fails with "Could not resolve" for packages like `viem`, `openai`, `stripe-replit-sync`, first check whether the pnpm store entry for that package contains `bufferutil@4.1.0` or `utf-8-validate@5.0.10` in its hash. Those entries can silently lose their `_cjs/index.js` and `_esm/index.js` files after a store purge.

## Diagnosis
```bash
python3 -c "
import os
p='/home/runner/workspace/node_modules/.pnpm'
for e in os.listdir(p):
    if e.startswith('PKGNAME@'):
        idx = f'{p}/{e}/node_modules/PKGNAME/index.js'
        print(e, '->', os.path.exists(idx))
"
```
If only entries with `bufferutil` in the hash return `False`, it's this bug.

## Fix
1. **viem** — find a pnpm store entry WITHOUT `bufferutil` in the hash (e.g. `viem@2.47.6_typescript@6.0.2_zod@4.3.6`). Update the broken symlink in `artifacts/api-server/node_modules/viem` to point at it.
2. **openai** — download directly from npm then repoint broken symlinks:
   ```python
   import urllib.request, tarfile, os, shutil, tempfile
   def install_pkg(url, dest):
       tmp = tempfile.mktemp(suffix=".tgz")
       urllib.request.urlretrieve(url, tmp)
       if os.path.islink(dest): os.unlink(dest)
       elif os.path.exists(dest): shutil.rmtree(dest)
       os.makedirs(dest, exist_ok=True)
       with tarfile.open(tmp, "r:gz") as tf:
           for m in tf.getmembers():
               if m.name.startswith("package/"):
                   m.name = m.name[8:]; tf.extract(m, dest)
       os.remove(tmp)
   install_pkg("https://registry.npmjs.org/openai/-/openai-6.33.0.tgz",
               "lib/integrations-openai-ai-server/node_modules/openai")
   ```
   Then symlink `artifacts/api-server/node_modules/openai` → the lib copy.
3. **stripe-replit-sync** — add to esbuild `external` list in `build.mjs` (it has unbundleable transitive deps: `pg`, `yesql`, `pg-node-migrations`, and is already used via lazy `await import()`). Also download it: `https://registry.npmjs.org/stripe-replit-sync/-/stripe-replit-sync-1.0.0.tgz`.

**Why:** The bufferutil+utf-8-validate optional deps are installed once but can be purged from the CAS during workspace cleanup, leaving the symlinked packages with no actual JS. Packages without those optional peers in their hash are unaffected.

**How to apply:** Any time esbuild "Could not resolve" errors appear for packages that were previously working, inspect the pnpm store entry hash before assuming the package is missing entirely.
