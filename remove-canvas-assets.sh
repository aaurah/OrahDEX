#!/bin/bash
set -e

if [[ "${ORAHDEX_CONFIRM_GIT_PUSH:-}" != "1" || ! -t 0 ]]; then
  echo "Refusing to untrack, commit, or push without an explicit interactive confirmation."
  echo "Review the affected paths, set ORAHDEX_CONFIRM_GIT_PUSH=1, and rerun from a terminal."
  exit 1
fi
read -r -p "Type PUSH TO ORIGIN MAIN to remove .canvas/assets from GitHub: " confirmation
if [[ "$confirmation" != "PUSH TO ORIGIN MAIN" ]]; then
  echo "Cancelled."
  exit 1
fi

echo "Removing .canvas/assets from git tracking..."
git rm -r --cached .canvas/assets/ 2>/dev/null || echo "(already untracked — nothing to remove)"

echo "Committing..."
git add .gitignore
git commit -m "chore: remove .canvas/assets from git tracking"

echo "Pushing..."
git push origin Main

echo "Done. .canvas/assets is now ignored and removed from GitHub."
