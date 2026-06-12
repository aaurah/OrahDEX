#!/bin/bash
cd /home/runner/workspace

echo "=== Deleting local replit-agent branch ==="
rm -f .git/packed-refs.lock
git branch -D replit-agent 2>&1 || echo "skipped"

echo "=== Deleting remote claude/audit-fix-problems-FcU9i ==="
git push origin --delete "claude/audit-fix-problems-FcU9i" 2>&1 || echo "skipped"

echo "=== Done. Remaining branches ==="
git --no-optional-locks branch -a | grep -v "gitsafe"
