#!/bin/bash
set -e
git add README.md
git commit -m "docs: rebrand README — OrahDEX only, no third-party names"
git push
echo "README pushed to GitHub."
