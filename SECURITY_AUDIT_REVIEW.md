# OrahDEX security audit review

Review date: 2026-11-25  
Source: attached static review of `aaurah/OrahDEX` at the reported Main revision. This review is against the current workspace checkout, not a penetration test or production deployment.

## Critical findings

| Finding | Status | Result |
| --- | --- | --- |
| C1 — Production database backup in public Git history | **External action required** | The backup is excluded from future commits and removed from the index, while the local file is preserved. Existing public history was not rewritten and no credentials were rotated. Treat exposed credentials and user records as compromised until the owner completes history cleanup, rotation, and any required notices. |
| C2 — Personal API-key CRUD without wallet proof | **Mitigated by disabling** | Personal key list/create/delete endpoints return `410`; legacy plaintext-key authentication fails closed. The feature must not be re-enabled without signed ownership proof, hashed storage, and durable storage. |
| C3 — Withdrawal history authorized by spoofable wallet header | **Fixed** | Withdrawal history and notification reads/deletes require a single-use signed wallet proof bound to the request. Caller-supplied wallet headers are not accepted as authorization. |

## High findings

| Finding | Status | Result |
| --- | --- | --- |
| H1 — Custody claims conflict with server-managed keys and payouts | **Documentation corrected; architecture remains** | README, wallet/trading copy, and the white paper now describe route-specific custody and server-managed settlement. The service still has internal-ledger and hot-wallet paths; key-management redesign and compliance work were not performed. |
| H2 — Stripe webhook verification fails open | **Fixed** | Stripe webhook requests fail closed when the verification secret is missing, regardless of environment. |
| H3 — Admin brute-force protection trusts forwarded IP input | **Fixed** | Admin limits use the trusted request IP and also limit attempts per account. |
| H4 — Admin wallet whitelist can persist access | **Partially fixed** | Whitelist edits require password/TOTP re-authentication and the list is capped. An append-only audit log, notifications, and a global wallet-admin revocation flow remain outstanding. |
| H5 — Public BSV transaction broadcast relay | **Mitigated by disabling** | The public BSV broadcast endpoint returns `410`; the legacy v1 relay also returns `410`. |
| H6 — Divergent HTLC source copies | **Partially fixed** | Deployment from the legacy Keccak-hash source is blocked. The duplicate source remains in the repository and deployed contracts were not changed; a single canonical implementation and ABI/source parity test are still needed. |
| H7 — HTLC pair/timelock safety | **Partially fixed** | Relayer reveal paths now enforce a safety margin before revealing either leg. Pairing and atomic two-leg settlement are still not enforced on-chain, and no contract was deployed. |
| H8 — Relayer can release escrow to an arbitrary recipient | **Open; contract change required** | The current deployed escrow still trusts the relayer-selected recipient. A new contract and signed/recipient-bound settlement flow are required; no deployed contract or funds were changed. |

## Medium findings

| Finding | Status | Result |
| --- | --- | --- |
| M1 — Passkey transfer code in logged GET path | **Fixed** | Transfer codes are hashed at rest, expire after two minutes, and are redeemed once through POST. The legacy GET endpoint is disabled. |
| M2 — Paymail SSRF | **Partially fixed** | Paymail fetches use HTTPS, public-DNS validation and IP pinning, block private/loopback/link-local addresses, reject redirects, and enforce response/time limits. This protection is not yet shared by every user-influenced outbound request. |
| M3 — Unauthenticated inbound-email HTML | **Fixed** | The webhook requires a configured verification secret, bounds/rate-limits requests, and converts HTML to text before storage. |
| M4 — AI portfolio DOM XSS | **Fixed** | Model output is sanitized; the admin email viewer is sandboxed without same-origin privileges. |
| M5 — Balances not scoped to chain | **Open** | No per-chain ledger migration or reconciliation was made. Do not treat symbol-only balances as safe for cross-chain payouts. |
| M6 — Client-controlled withdrawal fee | **Mitigated** | The server no longer trusts the submitted fee. Fees remain zero until a server-side schedule is configured. |
| M7 — Unbounded process-local security state | **Partially fixed** | Security-related maps now have caps/eviction or fail-closed behavior in key paths. Some rate limits and state remain process-local and need a shared store. |
| M8 — Rate limits keyed by caller-supplied wallet | **Fixed** | Financial write limits use the trusted request IP rather than a body/header wallet value. |
| M9 — Health endpoint leaks detail and always succeeds | **Partially fixed** | Public service details and alert text were removed. Health still returns HTTP 200 for degraded/starting states to preserve current liveness behavior. |
| M10 — Settlement wallet regeneration can abandon funds | **Mitigated** | Regeneration is blocked until funds have been migrated; no wallet key or balance was changed. |

## Low findings

| Finding | Status | Result |
| --- | --- | --- |
| L1 — Unauthenticated wallet registry writes | **Open** | Public wallet-ping registration was not changed. |
| L2 — Notifications readable/deletable by another wallet | **Fixed** | Notification reads/deletes require a signed, one-use wallet proof. |
| L3 — Public BSV balance/UTXO read proxies | **Open** | Public chain-read proxy endpoints remain; they do not authorize spending but still need abuse/resource limits. |
| L4 — Content Security Policy disabled | **Open** | A server-wide CSP was not introduced. |
| L5 — Admin route allowlist test is fragile | **Partially fixed** | Regression coverage asserts admin APIs are private by default, with only login/challenge routes public. A broader route-complement check remains useful. |
| L6 — Admin token returned in JSON as well as cookie | **Partially fixed** | Tokens are hashed in storage, session counts are capped, and the browser no longer persists tokens in local storage. The login response still includes a JSON token. |
| L7 — Insufficient-funds errors reported as server failures | **Open** | Trade error mapping was not changed. |
| L8 — Git automation can push without deliberate confirmation | **Partially fixed** | The main push/documentation/cleanup scripts now require a typed interactive confirmation. Other Git automation still needs review. |
| L9 — API-key HMAC secret omitted and legacy plaintext auth accepted | **Fixed** | The secret is documented in `.env.example`; key lookup fails closed and plaintext legacy matching is disabled. |
| L10 — Withdrawal history uses a separate header-only auth path | **Fixed** | The signed wallet-proof flow replaces the caller-controlled header check. |
| L11 — Third-party iframe has same-origin privileges | **Fixed** | The external iframe was removed and the admin email iframe no longer has same-origin privileges. |
| L12 — Social endpoints accept oversized JSON bodies | **Open** | Request/body limits were not reduced in this change. |
| L13 — Stray Python evaluation harness | **Open** | The unused harness was not removed. |

## Security scan and verification results

- API regression suite: **30 passed**; API typecheck and build passed.
- Frontend typecheck and production build passed.
- Static path tests in the separate mobile artifact: **3 passed**.
- Preview checks: personal API-key endpoint `410`, unauthenticated withdrawal history `401`, public BSV relay `410`, legacy v1 relay `410`.
- The SAST path-traversal alert in the mobile artifact is a false positive: platform input is restricted to `ios`/`android`, paths are resolved inside the static root, and traversal tests pass. The SAST redirect alert is constrained to HTTPS URLs from a fixed logo-host allowlist.
- HoundDog's three “encryption key sent to output” alerts point to logs of the public deployer address, not a private key.
- Dependency scanning still reports the `elliptic@6.6.1` advisory, but the workspace applies `patches/elliptic@6.6.1.patch` to preserve RFC 6979 nonce byte length and includes a P-521 leading-zero regression test. The registry still has no fixed upstream release, so scanners report the vulnerable version despite the local code fix. Treat this as locally mitigated, not scanner-cleared; retain the patch and test until an upstream fix or independent crypto review is available.

## Not performed

No Git-history rewrite, push, secret rotation, user notification, contract deployment, mainnet configuration change, fund movement, or published-app change was performed. The signed-in admin UI was not visually tested; its API authorization paths were covered by regression tests.
