#!/bin/bash
set -e
cd /home/runner/workspace
rm -f .git/index.lock
git add artifacts/api-server/src/lib/evmHtlc.ts artifacts/bsv-dex/src/components/trading/HTLCSettlementCard.tsx
git commit --no-edit
git push origin HEAD:Main
echo "Done — merge committed and pushed to Main"
