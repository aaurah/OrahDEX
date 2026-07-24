#!/bin/bash
set -e
git add README.md
git commit -m "docs: rewrite README with LI.FI, Hyperliquid WS, full feature list"
git push
echo "README updated on GitHub."
