# Dependency security remediation

## Outcome

The initial dependency scan reported 193 findings (3 critical, 79 high,
93 moderate, 18 low). Following the dependency updates, the same scanner
reports **one moderate finding**, `GHSA-848j-6mx2-7j84` for `elliptic@6.6.1`.
That remaining version-based finding is addressed by a committed pnpm patch,
not an advisory suppression. There is no upstream fixed elliptic release.
The previous audit ignore for this advisory was removed.

### Dependencies without an upstream fix

- **elliptic:** `patches/elliptic@6.6.1.patch` preserves the generated nonce's
  original octet length during RFC 6979 `bits2int`. Computing that length
  from a BN loses leading zero octets and can incorrectly truncate P-521
  nonces. The patch leaves explicitly supplied numeric `options.k` callbacks
  unchanged. A regression test forces a leading-zero nonce and compares the
  signature against an independently calculated nonce, then verifies it.
  Ledger/Ethers secp256k1 signing and public-key recovery are also tested.
  The published Noble-based elliptic shim was not used: it lacks the low-level
  curve APIs required by existing wallet dependencies and changes digest
  signing semantics.
- **bigint-buffer:** replaced with `bigint-buffer-browser@1.0.0`, its
  API-compatible JavaScript-only implementation. The vulnerable native
  conversion module is no longer installed. Tests cover both endiannesses,
  empty inputs, integer round trips, and buffers larger than 32 bytes.
- **deepmerge:** replaced with `@shivammathur/deepmerge@4.3.2`, a compatible
  fork that rejects `__proto__` in both source and target copying paths.
  Tests cover null-prototype targets, malicious targets, nested merges,
  array concatenation and `merge.all`.
- **request / hawk / hoek / old ajv / tough-cookie:** removed by removing the
  unused, deprecated `coinbase` dependency. Application Coinbase routes still
  use `@coinbase/cdp-sdk`; that integration was not removed.

### Upgrades

The root pnpm overrides and workspace catalog select patched releases for
the remaining affected packages. These include BitcoinJS, DOMPurify, Express
middleware, Axios, Undici, Nodemailer, Forge, Vite, Zod, Valibot, YAML/TOML
parsers, archive/image tooling, and the vulnerable matching/utility packages.
Version-selective overrides retain older unaffected major versions where
possible.

`jayson` was upgraded to 5.0.0 to remove its vulnerable `stream-json`
dependency. Forcing stream-json 3 into jayson 4 breaks its legacy CommonJS
subpath imports; the parent upgrade avoids that incompatibility.
The regression suite exercises the JSON-RPC stream parser and Solana
transaction signing/serialization.

## Verification

- `pnpm install --frozen-lockfile`
- `pnpm test:security-dependencies` — seven focused regression tests.
- Wallet authentication tests — four passed; the existing live-API test was
  skipped by its own configuration.
- Web and API production builds.
- Component preview production build with its required `PORT` and `BASE_PATH`.
- Wallet SDK import smoke checks for Ledger, Keystone, GridPlus, Trezor and
  the Reown Solana/Bitcoin adapters.
- Running app screenshot and API startup/health checks.

No on-chain transactions were broadcast and no hardware-wallet signing was
performed against a physical device.

### Unrelated checks that are not green

`pnpm run typecheck` is blocked by duplicate explorer-type exports in
`lib/api-zod`. Separate application typechecks also report errors in existing
application source, including missing migration/thirdweb modules, duplicate
object properties, and existing type mismatches. These files were not changed
as part of dependency remediation.

The existing `artifacts/api-server/test/security-regressions.test.mjs` suite
passes seven tests and fails three source assertions:

- `funding verifier fails closed for unverifiable external EVM funding`
- `wallet encryption code no longer falls back to a hard-coded secret`
- `futures and NFT routes are behind explicit feature flags`

Those tests and their application source files are unchanged by this work.
These failures should not be interpreted as successful security checks.

## Maintenance

Run the dependency regression suite after changing these overrides. Retain
the elliptic patch until the dependency can be removed or a verified upstream
fix is released. Do not suppress its scanner advisory merely to obtain a
zero-count report. The scanner identifies versions and does not recognize
this local source patch.
