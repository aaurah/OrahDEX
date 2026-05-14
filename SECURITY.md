# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## Known Vulnerability Risk Acceptances

### GHSA-848j-6mx2-7j84 — elliptic: Cryptographic Primitive with Risky Implementation

| Field         | Detail |
| ------------- | ------ |
| Advisory      | [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) |
| Package       | `elliptic` (all versions <=6.6.1) |
| Severity      | Low |
| Date accepted | 2026-05-11 |
| Review date   | 2026-08-11 |
| Status        | Risk accepted — no patched version available upstream (`Patched versions: <0.0.0`) |

**Affected path:** `artifacts/bsv-dex > @ledgerhq/hw-app-eth > @ethersproject/transactions > @ethersproject/signing-key > elliptic`

**Rationale:** The `elliptic` package has no published fix as of the acceptance date. The explicit version pin (`6.6.1`) was removed from `pnpm-workspace.yaml` overrides so the workspace will automatically adopt a patched release when one becomes available. Monitor [the advisory](https://github.com/advisories/GHSA-848j-6mx2-7j84) and the [elliptic releases](https://github.com/indutny/elliptic/releases) for a fix.

**Mitigation options to consider:**
- Replace `@ledgerhq/hw-app-eth` with an alternative that does not depend on `elliptic`, or wait for a patched upstream release.
- Periodically run `pnpm audit` to detect when a patched version is published.
