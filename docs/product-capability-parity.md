# OrahDEX product capability parity

Reviewed: 25 November 2026

## Source of truth

`artifacts/bsv-dex/src/lib/capabilityStatus.ts` is the shared, user-facing capability table. Both the landing page and white paper render it. Update the table only after checking the relevant app route, API behavior, contract, provider behavior, and tests.

## Current evidence map

| Area | User-facing status | Evidence to review before changing the status |
| --- | --- | --- |
| Wallet-funded orderbook | Ethereum mainnet only | `artifacts/api-server/src/lib/evmOrderbookEscrow.ts`, `artifacts/api-server/src/routes/orders.ts`, registered token decimals, deployed escrow configuration, and confirmed order/fill/cancel transactions |
| Order-book liquidity | Pair-dependent | Active orderbook reads and matching behavior; external quotes or chart prices do not count as orderbook depth |
| Swaps and bridges | Provider-dependent | Provider quote and exchange-creation paths, destination transaction, and final provider settlement |
| Markets and charts | Data-source dependent | Market API and chart data-provider behavior, including empty and unavailable responses |
| BSV settlement | Route-specific | BSV transaction path and settlement evidence for the exact feature; do not infer universal OP_RETURN settlement |
| Futures, prediction, copy, and NFTs | Feature-specific | The specific UI route, API handlers, deployed contracts, and settlement evidence |
| Ora AI | Service-dependent | Configured inference service and current error/empty states |
| Fees and providers | Quote-specific | Current route quote, fee calculation, minimums, and provider terms |

## Release check

Run `pnpm test:capability-parity` and `pnpm typecheck` before publishing. The parity check confirms that both public pages use the shared status table, required areas remain represented, unsupported universal claims do not return, and unfilled market orders cannot be recorded as provider fills by the orderbook fallback.

After any product capability changes, repeat the evidence review above, update the shared status table and this evidence map, then verify the published build separately. This check does not publish or certify a deployment.
