#!/bin/bash
# Removes the .agents/ folder from git tracking and pushes to GitHub.
# The files stay on disk locally — they just won't appear in the repo.
set -e

echo "Untracking .agents/ files..."
git rm --cached -r .agents/

echo "Committing..."
git commit -m "chore: remove agent memory files from repo tracking"

echo "Pushing to GitHub..."
git push

echo "Done. .agents/ is now git-ignored and removed from GitHub."
