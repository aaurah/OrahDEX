---
name: HandCash SDK integration
description: Key design rules for the HandCash server-side SDK, OAuth flow, and $handle detection in WithdrawSheet.
---

## Rules

**SDK is server-side ESM only — never import on the frontend.**
Use `await import("@handcash/sdk")` inside an async function with a lazy singleton (`sdkInstance`). The SDK needs `HANDCASH_APP_ID` + `HANDCASH_APP_SECRET` from env; returns 503 gracefully when unset.

**OAuth flow:**
1. Frontend calls `GET /api/handcash/auth-url` → gets redirect URL from `sdk.getRedirectionUrl()`
2. `window.location.href = url` (full-page redirect — simpler than popup)
3. HandCash redirects back with `?authToken=<token>`
4. App.tsx `useEffect` on mount reads `params.get("authToken")`, calls `/api/handcash/profile`, stores in `useHandCashStore`, then `window.history.replaceState` to clean the URL

**HandCash Connect API shape (SDK v1.0.3):**
```typescript
const { Connect } = await import("@handcash/sdk");
const client = sdk.getAccountClient(authToken);
const profile = await Connect.getCurrentUserProfile({ client }); // profile.data.publicProfile
const balance = await Connect.getSpendableBalances({ client });  // balance.data.items[{currencyCode,amount}]
await Connect.pay({ client, body: { instrumentCurrencyCode:"BSV", denominationCurrencyCode:"BSV", receivers:[{sendAmount, destination}] } });
```

**$handle detection must come BEFORE the `isBitcoinForkChain && !chainAddress` guard in `handleNonEvmWalletSend`.**
HandCash API sends don't need a chainAddress (it's a custodial send). The guard `if (!canSignNonEvm …)` in the send-button disabled check also needs a HandCash bypass: `isBsvHandCashSend || canSignNonEvm || !isBitcoinForkChain`.

**`isHandCashHandle(s)`** — matches strings starting with a letter, 3-25 alphanumeric/underscore chars OR ending in `@handcash.io`. BSV addresses start with '1' (digit) so they're safe from false-positives.

**Public resolve API (no auth needed):** `GET https://api.handcash.io/api/users/public-data?alias=<handle>` → `data.publicProfile.receivingAddress`, `paymail`, `displayName`, `avatarUrl`.

**Why:**
HandCash is a custodial BSV wallet. The SDK cannot run in the browser (it holds the app secret). The OAuth flow must redirect the full page (not a popup) so HandCash can reliably return to the app URL.
