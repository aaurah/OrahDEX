#!/bin/bash
cd /home/runner/workspace

echo "=== Removing stale locks ==="
rm -f .git/packed-refs.lock .git/index.lock

echo "=== Pruning stale remote-tracking refs ==="
git remote prune origin

echo "=== Deleting local replit-agent branch ==="
git branch -D replit-agent 2>&1 || echo "skipped"

echo "=== Remaining remote branches ==="
git branch -r | grep -v "HEAD\|gitsafe"
