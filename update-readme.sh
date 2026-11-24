#!/bin/bash
set -e
if [[ "${ORAHDEX_CONFIRM_GIT_PUSH:-}" != "1" || ! -t 0 ]]; then
  echo "Refusing to commit or push without an explicit interactive confirmation."
  echo "Review the README diff, set ORAHDEX_CONFIRM_GIT_PUSH=1, and rerun from a terminal."
  exit 1
fi
read -r -p "Type PUSH TO ORIGIN MAIN to publish README.md: " confirmation
if [[ "$confirmation" != "PUSH TO ORIGIN MAIN" ]]; then
  echo "Cancelled."
  exit 1
fi
git add README.md
git commit -m "docs: rebrand README — OrahDEX only, no third-party names"
git push origin Main
echo "README pushed to GitHub."
