# OrahDEX Cloud API

This Worker is separate from the existing PostgreSQL API. Its `DB` binding
points at the Cloudflare staging D1 database; it does not copy or synchronize
the existing exchange's PostgreSQL orders.

## Trading boundary

- The Worker orderbook currently supports wallet-funded `A8/ETH` GTC limit
  orders with expiries up to seven days only.
- Orders require an Ethereum wallet signature and a confirmed escrow-lock
  transaction. Cancellation requires a confirmed on-chain cancellation. The
  recovery endpoint scans recent confirmed escrow events and is rate-limited
  per wallet.
- Recovery requires the public `EVM_ORDERBOOK_ESCROW_ETH` contract address and
  `EVM_ORDERBOOK_ESCROW_ETH_DEPLOY_BLOCK` variables to be set in the Worker.
- Order matching uses the escrow relayer. A successful match is a real
  Ethereum settlement, not a preview or simulation.
- The Worker is fail-closed by default. Its health/config routes report trading
  unavailable unless the escrow, matching, and mainnet-settlement approval
  flags are explicitly enabled and the contract, RPC, and relayer checks pass.
- Despite the staging D1 database, this implementation is hard-coded to
  Ethereum mainnet (chain ID 1). Do not enable mainnet settlements until the
  contract and relayer have been separately reviewed and the user explicitly
  approves real settlement operations.
- If a transaction outcome is ambiguous, the affected orders remain locked and
  trading is disabled for operator review; the API does not reopen them for a
  possible duplicate fill.

The required Cloudflare bindings are named in `src/orders.ts`. Keep all
relayer keys and RPC credentials in Cloudflare Secrets, never in this file,
`wrangler.toml`, Git, or client-side variables. No production database,
Cloudflare remote D1 database, or blockchain state was changed while building
this Worker.

## Local checks

From the repository root:

```sh
pnpm --filter orahdex-cloud-api check
pnpm --filter orahdex-cloud-api test
pnpm --filter @workspace/bsv-dex typecheck
pnpm --filter @workspace/bsv-dex build
```

For local D1 schema validation, use Wrangler without `--remote` and a temporary
persist directory. Do not run remote migrations or deploy this Worker as part
of a code-only verification.
