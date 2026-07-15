---
name: Admin Cookie Auth Migration
description: Admin auth migrated from X-Admin-Token header to HttpOnly cookie; token hashing, 8h TTL, all callers updated.
---

## Rule
Admin sessions use HttpOnly `admin_session` cookies only. No raw tokens in JS memory, localStorage, or HTTP headers.

## What changed
- `adminAuth.ts` stores SHA-256 hash of raw token; raw token goes only in the HttpOnly cookie
- 8-hour TTL (was 30 days)
- `isValidAdminToken(rawToken)` hashes internally before comparing
- `requireAdminToken` middleware checks only `req.cookies.admin_session`
- `withdrawals.ts`, `options.ts`, `copyTrading.ts` updated to use cookie check
- `useAdminAuthStore.ts`: `token` field removed; all fetches use `credentials: "include"`
- `adminFetch.ts`: always uses `credentials: "include"`; import this instead of raw fetch for admin API calls
- `getAdminHeaders()` now returns `{}` — deprecated, use `adminFetch`

**Why:** Headers are accessible to XSS; HttpOnly cookies are not. Financial platform requires lowest possible XSS blast radius for admin sessions.

## How to apply
- Any new admin API call in the frontend: use `adminFetch()` from `@/lib/adminFetch`, never raw `fetch` with token headers
- Any new server-side admin check: use `requireAdminToken` middleware or `isValidAdminToken(req.cookies.admin_session ?? "")`
- Never pass the raw token in a response body or add it to JS state
