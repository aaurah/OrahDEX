#!/bin/bash
cd /home/runner/workspace

echo "=== Removing claude branch ref files ==="
rm -rf .git/refs/heads/claude
rm -rf .git/refs/remotes/origin/claude
echo "done"

echo "=== Remaining branches ==="
git --no-optional-locks branch -a | grep -v "gitsafe"
