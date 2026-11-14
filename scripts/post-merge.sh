#!/usr/bin/env bash
set -euo pipefail

pnpm install --frozen-lockfile --prefer-offline

# Do not run `drizzle-kit push` here. The live database has data-bearing tables
# that are not represented in the Drizzle schema, so push proposes dropping
# them. Apply schema changes only through a separately reviewed migration.
echo "Post-merge dependency setup complete; automatic Drizzle push skipped to protect unmapped tables."
