#!/bin/bash
# Removes the .agents/ folder from git tracking and pushes to GitHub.
# The files stay on disk locally — they just won't appear in the repo.
set -e

if [[ "${ORAHDEX_CONFIRM_GIT_PUSH:-}" != "1" || ! -t 0 ]]; then
  echo "Refusing to untrack, commit, or push without an explicit interactive confirmation."
  echo "Review the affected paths, set ORAHDEX_CONFIRM_GIT_PUSH=1, and rerun from a terminal."
  exit 1
fi
read -r -p "Type PUSH TO ORIGIN MAIN to remove .agents from GitHub: " confirmation
if [[ "$confirmation" != "PUSH TO ORIGIN MAIN" ]]; then
  echo "Cancelled."
  exit 1
fi

echo "Untracking .agents/ files..."
git rm --cached -r .agents/

echo "Committing..."
git commit -m "chore: remove agent memory files from repo tracking"

echo "Pushing to GitHub..."
git push origin Main

echo "Done. .agents/ is now git-ignored and removed from GitHub."
