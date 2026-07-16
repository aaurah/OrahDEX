---
name: Express async double-response guard
description: ERR_HTTP_HEADERS_SENT caused by client abort racing with a slow async handler's outer catch block.
---

## The Rule
Every outer `catch (err)` block in an Express async route handler **must** guard its `res.status(500)` call with `if (!res.headersSent)` before writing:

```typescript
} catch (err) {
  req.log.error({ err }, "Failed to get foo");
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
}
```

**Why:** When a client aborts a slow request (navigation, timeout, closed tab), the TCP socket closes. The async handler continues running, eventually either (a) succeeds and calls `res.json(result)`, or (b) hits the outer catch. In either case, `res.json()` or `res.status(500)` may be called on a response whose headers have already been sent — crashing Express with `ERR_HTTP_HEADERS_SENT` and logging a spurious "Unhandled route error".

**How to apply:** Add `if (!res.headersSent)` before every `res.status(5xx)` call in a `catch` block. This applies to **all** routes in `markets.ts`, `orders.ts`, `withdrawals.ts`, and any other route file with long async DB or external-API calls.

## Files fixed
`artifacts/api-server/src/routes/markets.ts` — 7 catch blocks updated (markets list, search, market detail, ticker, candles, orderbook, trades).
