---
name: Bridge aggregator code patterns
description: Gotchas and patterns from building the bridge quote aggregator
---

**Express async routes must have try/catch**
Express (v4) does not auto-catch async errors. Every `async (req, res) =>` route handler must have a wrapping try/catch that calls `res.status(500).json({ error: msg })`. Without it, unhandled rejections hang the response forever.

**toWei leading-dot edge case**
When splitting `amount` on `"."`, `parts[0]` is `""` for amounts like `".5"`. `BigInt("")` throws. Use `parts[0] || "0"` (not `?? "0"`) because `"" ?? "0"` stays `""`.

**React dropdown click-outside pattern**
Use `useRef<HTMLDivElement>` on the wrapper + `useEffect` that adds a `mousedown` listener only while `open === true`. Clean up on every close to avoid stacking listeners. FiatBuySellPanel already uses this correctly; replicate for any new dropdown.

**swapChains with async token loading**
Don't call `setFromToken/setToToken` in a swapChains function if `useEffect([fromChain])` / `useEffect([toChain])` already reload tokens on chain change — those effects will immediately overwrite the manually set tokens. Instead set tokens to `null` so the loading state is correct until the effect resolves.

**Artifact port must match a .replit [[ports]] entry — CRITICAL**
`restart_workflow` (and Replit's runtime health checker) requires the artifact's `localPort` in `artifact.toml` to have a matching `[[ports]]` entry in `.replit`. If the port is absent from `.replit [[ports]]`, the checker always fails with `DIDNT_OPEN_A_PORT` — even when the server IS binding to that port (confirmed by logs and direct curl).

Fix: change `artifact.toml` `localPort` to a port that already has a `.replit [[ports]]` entry (e.g. 20180 mapped to externalPort 80), and update `[services.env] PORT` and `[services.production.run.env] PORT` to match. Apply via `verifyAndReplaceArtifactToml` — never edit artifact.toml directly. Kill any process holding that port first so the workflow can bind cleanly.
