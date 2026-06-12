#!/bin/bash
set -e
cd /home/runner/workspace

BRANCHES=(
  "copilot/add-new-feature"
  "copilot/add-one-page-sovereign-overview"
  "copilot/audit-smart-contract-vulnerabilities"
  "copilot/clean-up-local-and-remote-branches"
  "copilot/diagnose-trade-spot-limit-issue"
  "copilot/diagnostic-swap-page-errors"
  "copilot/fix-codeql-job-for-pr-9"
  "copilot/fix-devai-functionality"
  "copilot/fix-postcss-xss-vulnerability"
  "copilot/fix-replit-agent-issues"
  "copilot/improve-seo-score"
  "copilot/remove-quicknode-from-system"
  "copilot/task-239342488-1216613683-87f7054d-56ef-4866-8c36-7770b7530964"
  "copilot/task-239342488-1216613683-d142bf24-4b0b-4fea-93cf-41ce195df4ed"
  "dependabot/npm_and_yarn/npm_and_yarn-f3ab4791df"
  "github-advanced-security/add-new-user-profile-feature"
  "main"
  "OrahDEX"
  "replit-agent"
  "revert-40-copilot/audit-trade-on-exchange"
  "vercel/install-vercel-web-analytics-ze2w0n"
)

for branch in "${BRANCHES[@]}"; do
  echo "Deleting $branch..."
  git push origin --delete "$branch" 2>&1 && echo "  ✓ deleted" || echo "  ✗ skipped (may not exist)"
done

echo ""
echo "Done. Kept: claude/audit-fix-problems-FcU9i, dependabot/npm_and_yarn-91b74eecbb, master"
