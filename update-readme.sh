#!/bin/bash
set -e
git add README.md
git commit -m "docs: update README with accurate trading pair stats (2.15M pairs, 3396 coins, 931 futures)"
git push
echo "README pushed to GitHub."
