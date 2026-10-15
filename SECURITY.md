# Security Notes

## Critical Open Items (from audit)

- **Financial arithmetic**: Prefer `money.ts` (BigInt / `parseUnits` / `formatUnits`) over `Number`/`parseFloat`/`toFixed` for all balances, prices, fees, and fills. Residual uses remain in some paths.
- **Settlement atomicity**: HTLC lock + session + order visibility must be atomic or fail closed. BSV HTLC amounts must be bound to the full trade value.
- **Demo seeds**: Gated by `DEMO_MODE`. Verify unreachable from production settlement/withdrawal.
- **Concurrency**: Matching and advanced orders need hard expiry + lease/version columns.
- **RPC trust**: Multi-RPC agreement or `UNKNOWN` for critical chain reads.
- **BSV types**: UTXO and balance fields should be `bigint` end-to-end.

See GitHub issues #12, #13, #14, #17, #18, #19, #20, #21, #22.

Do not enable real-fund volume until the P0 items are closed with tests.

## Applied in this change

- `artifacts/api-server/src/lib/ledger.ts`:
  - `getBalances` filter now uses `parseUnits` instead of `parseFloat`.
  - `ensureSeedForAsset` amount comparisons and credit calculation now use `parseUnits` / `formatUnits`.
