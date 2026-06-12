#!/bin/bash
cd /home/runner/workspace

echo "=== Removing locks ==="
rm -f .git/packed-refs.lock .git/index.lock

echo "=== Force-pruning all stale remote branches ==="
git fetch --prune origin

echo "=== Remaining remote branches ==="
git branch -r | grep -v "HEAD\|gitsafe"

echo "=== Local branches ==="
git branch
