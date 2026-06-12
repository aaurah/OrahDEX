#!/bin/bash
cd /home/runner/workspace

echo "=== Wiping stale local remote-tracking refs ==="
# Remove all origin/* ref files except Main
find .git/refs/remotes/origin/ -type f ! -name "Main" -delete 2>/dev/null && echo "ref files cleared" || echo "no ref files found"

# Rewrite packed-refs keeping only Main and non-origin lines
if [ -f .git/packed-refs ]; then
  grep -v "refs/remotes/origin/" .git/packed-refs > .git/packed-refs.tmp || true
  grep "refs/remotes/origin/Main" .git/packed-refs >> .git/packed-refs.tmp 2>/dev/null || true
  mv .git/packed-refs.tmp .git/packed-refs
  echo "packed-refs cleaned"
fi

echo ""
echo "=== Remote branches now visible locally ==="
git --no-optional-locks branch -r | grep -v "HEAD\|gitsafe"
