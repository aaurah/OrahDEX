# OrahDEX API audit

**Date:** 2026-11-25  
**Scope:** Static inventory and targeted reliability/security review. No published deployment, production database writes, wallet signatures, or chain actions were performed.

**Current-state note (2026-11-27):** This is a historical snapshot. Ora AI and DevAI chat, analysis, provider, and Ollama runtime features have since been removed from the app; AI image generation is separate. The production Node.js heap issue still needs independent monitoring.

## Route inventory

The API has 73 TypeScript route modules and 669 `router.get`, `router.post`, `router.put`, `router.patch`, `router.delete`, and `router.use` declarations. The inventory is:

`adminDiagnostics.ts`, `admin.ts`, `advancedOrders.ts`, `aiImage.ts`, `ai.ts`, `anthropic/index.ts`, `aws.ts`, `bridgeAgg.ts`, `bridge.ts`, `bsvIntent.ts`, `buy.ts`, `catalog.ts`, `cex.ts`, `chat.ts`, `coinbase.ts`, `coinVotes.ts`, `copyTrading.ts`, `creatorCoins.ts`, `deposit.ts`, `devai.ts`, `dexscreener.ts`, `dex.ts`, `diagnostics.ts`, `docs.ts`, `erc8004.ts`, `evmSettlement.ts`, `evmToBsvIntent.ts`, `evmWebhookRouter.ts`, `explorer.ts`, `externalDepth.ts`, `externalSwap.ts`, `feeRevenue.ts`, `futures.ts`, `geckoTerminal.ts`, `globalMarkets.ts`, `handcash.ts`, `health.ts`, `hyperliquid.ts`, `index.ts`, `keeper.ts`, `kyc.ts`, `leEstimateShim.ts`, `letsexchange.ts`, `lifi.ts`, `lightning.ts`, `liquidity.ts`, `lpStaking.ts`, `markets.ts`, `nft.ts`, `options.ts`, `orders.ts`, `overlay.ts`, `p2pIntents.ts`, `portfolio.ts`, `prediction.ts`, `quantumAuth.ts`, `quicknode.ts`, `socialNft.ts`, `sor.ts`, `staking.ts`, `stripeCheckout.ts`, `support.ts`, `swaps.ts`, `swap.ts`, `tokens.ts`, `trades.ts`, `trade.ts`, `tradingview.ts`, `treasury.ts`, `v1.ts`, `virtualAmm.ts`, `wallet.ts`, and `withdrawals.ts`.

The deepest code review and smoke checks focused on public health reporting, AI provider and fallback behavior, AI trade submission, public chat/authentication, withdrawal and swap rate-limit caches, and candle/LI.FI caches. This was not an end-to-end exercise of all 669 route declarations; the remaining route behaviors still need dedicated integration coverage.

## Findings, ordered by impact

### High — Published API repeatedly exhausted its Node.js heap

Read-only deployment telemetry confirms recurring heap-exhaustion failures and crash loops beginning 2026-11-17. The telemetry showed 13 heap-OOM log entries through 2026-11-24 and a rise in proxy 5xx rates after the 2026-11-24 build. The published VM remained on the same 2 GB / 0.5-vCPU size. Telemetry does **not** identify the retaining allocation, so this audit does not claim the production crash is fixed.

This code change bounds several long-lived, user-keyed caches in AI, chat, swap quoting, candle history, LI.FI token lookup, and withdrawal rate limiting. These are concrete growth risks, not a verified explanation for the production heap crashes. Production profiling and any VM-size change remain separate work.

### High — System announcements accepted a hardcoded admin fallback

The public chat announcement endpoint used a built-in fallback key rather than the project's admin-session middleware. It now requires `requireAdminToken`, limits announcement size, and the admin screen sends the existing signed-in session instead of prompting for a separate key. A no-session smoke request now receives HTTP 401.

### High — AI conversation ownership still needs a safe migration

Conversation listing, reading, and deletion are not consistently scoped to the conversation owner. Fixing this safely needs an owner identity, an additive database migration, and coordinated client changes; no production schema write was made during this audit. Treat conversation contents as potentially accessible by ID until that work is completed.

### Medium — Status page showed fabricated uptime

The page generated historical uptime bars and percentages without stored uptime measurements, and its health endpoint reported little more than process uptime. It now displays current monitored service states, startup/unknown/degraded/outage states, BSV network checks, and AI-provider state. It explicitly says historical uptime is not tracked rather than inventing a history. Health probes stay HTTP 200 to avoid deployment restart loops; the JSON body carries the service status.

### Medium — AI provider failures could look successful

Production telemetry reported an unconfigured AI integration, and this workspace preview's Ollama process reported zero model blobs (`ollama list` was empty). AI insights, analysis, and news endpoints now return explicit unavailable responses instead of generic content presented as live AI. Computed portfolio fallback responses are marked as non-AI, and the UI labels cached or rule-based results. This code does not install a model or configure a published provider.

## Verification

- API tests: 36 passed.
- API TypeScript check and build: passed.
- Web TypeScript check and Vite build: passed.
- Preview smoke checks: `/api/health` returned HTTP 200; unauthenticated system announcement returned 401; unsupported chat channel and malformed chat payload returned 400.
- During the smoke run, the health JSON reported `unknown` while scheduled services were still awaiting their first checks. Provider failures are now visible as degradation instead of being presented as all-operational.
- The signed-in admin screen was not visually exercised; the browser used for screenshots is not authenticated. Its build/typecheck passed, and the endpoint's unauthenticated rejection was verified.

## Not changed

No production deployment, VM sizing, production environment variables, production database writes, orders, wallet signatures, funds, or chain state were changed. The production heap cause, private conversation ownership, remaining route-by-route behavior checks, and published AI model/provider setup remain open.
