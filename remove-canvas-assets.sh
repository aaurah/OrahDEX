#!/bin/bash
set -e

echo "Removing .canvas/assets from git tracking..."
git rm -r --cached .canvas/assets/ 2>/dev/null || echo "(already untracked — nothing to remove)"

echo "Committing..."
git add .gitignore
git commit -m "chore: remove .canvas/assets from git tracking"

echo "Pushing..."
git push

echo "Done. .canvas/assets is now ignored and removed from GitHub."
