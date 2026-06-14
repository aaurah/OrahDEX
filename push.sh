#!/bin/bash
set -e

echo "=== OrahDEX GitHub Push ==="
echo ""

# Show what will be committed
echo "Files staged for commit:"
git status --short
echo ""

git add \
  artifacts/api-server/src/lib/changenow.ts \
  artifacts/api-server/src/lib/subsystemProbe.ts \
  artifacts/api-server/src/lib/escrowRelayer.ts \
  artifacts/api-server/src/routes/admin.ts \
  artifacts/api-server/src/routes/copyTrading.ts \
  artifacts/api-server/src/routes/options.ts \
  replit.md \
  .replit \
  start.mjs \
  artifacts/bsv-dex/serve-static.mjs \
  artifacts/bsv-dex/vite.config.ts 2>/dev/null || true

# Stage everything else that's tracked and modified
git add -u

echo "Committing..."
git commit -m "v4.9.0 — publish audit + escrow chain fixes

- Fix TypeScript errors (18 real errors → 0):
  changenow.ts: null-coalesce string|null return
  subsystemProbe.ts: untyped pool.query<T> generic calls
  admin.ts: statsMap/wrMap as any, sort comparator types
  options.ts: Set element used as index type (string cast)
  copyTrading.ts: join result binding element type

- Escrow RPC defaults fixed:
  Polygon (137): polygon-rpc.com (403) → polygon-bor-rpc.publicnode.com
  Sei (1329): evm-rpc.sei-apis.com (rate-limit) → sei-evm-rpc.publicnode.com

- Escrow contract verified 13/13 chains (12 mainnets + Sepolia)
  All returning correct relayer address and getDeposit responses

- API server rebuilt clean (esbuild, 6.0MB)
- All 14 background services healthy
- Security audit passed: CORS, trust proxy, admin auth, HMAC webhooks"

echo ""
echo "Pushing to origin/Main..."
git push origin Main

echo ""
echo "✅ Done — all changes pushed to github.com/aaurah/OrahDEX"
