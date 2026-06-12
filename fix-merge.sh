#!/bin/bash
set -e
cd /home/runner/workspace

echo "=== Setting Main as default branch on GitHub ==="
curl -s -X PATCH \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/aaurah/OrahDEX" \
  -d '{"default_branch":"Main"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('Default branch:', d.get('default_branch','ERROR'), '|', d.get('message','OK'))"

echo ""
echo "=== Local branch status ==="
git --no-optional-locks status
git --no-optional-locks branch -vv
