#!/bin/bash
cd /home/runner/workspace

echo "=== Deleting all remote branches except Main ==="
for branch in \
  "copilot/add-new-feature" \
  "copilot/add-one-page-sovereign-overview" \
  "copilot/audit-smart-contract-vulnerabilities" \
  "copilot/clean-up-local-and-remote-branches" \
  "copilot/diagnose-trade-spot-limit-issue" \
  "copilot/diagnostic-swap-page-errors" \
  "copilot/fix-codeql-job-for-pr-9" \
  "copilot/fix-devai-functionality" \
  "copilot/fix-postcss-xss-vulnerability" \
  "copilot/fix-replit-agent-issues" \
  "copilot/improve-seo-score" \
  "copilot/remove-quicknode-from-system" \
  "copilot/task-239342488-1216613683-87f7054d-56ef-4866-8c36-7770b7530964" \
  "copilot/task-239342488-1216613683-d142bf24-4b0b-4fea-93cf-41ce195df4ed" \
  "claude/audit-fix-problems-FcU9i" \
  "dependabot/npm_and_yarn/npm_and_yarn-91b74eecbb" \
  "dependabot/npm_and_yarn/npm_and_yarn-f3ab4791df" \
  "github-advanced-security/add-new-user-profile-feature" \
  "main" \
  "master" \
  "OrahDEX" \
  "replit-agent" \
  "revert-40-copilot/audit-trade-on-exchange" \
  "vercel/install-vercel-web-analytics-ze2w0n"
do
  git push origin --delete "$branch" 2>&1 && echo "deleted: $branch" || echo "skipped: $branch"
done

echo ""
echo "=== Deleting local replit-agent branch ==="
git branch -D replit-agent 2>&1 || echo "skipped"

echo ""
echo "=== Remaining branches ==="
git --no-optional-locks branch -r | grep -v "HEAD\|gitsafe"
