---
name: express-rate-limit ipKeyGenerator
description: Custom keyGenerator that falls back to IP address must use the ipKeyGenerator helper from express-rate-limit, not req.ip directly.
---

## Rule

Any `rateLimit({ keyGenerator })` that falls back to the client IP **must** call `ipKeyGenerator(req)` (imported from `express-rate-limit`) rather than `req.ip ?? "unknown"`.

```typescript
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const limiter = rateLimit({
  keyGenerator: (req) => {
    const wallet = (req.body as any)?.walletAddress;
    if (wallet) return `wallet:${wallet.toLowerCase()}`;
    return ipKeyGenerator(req); // normalises IPv6, required by express-rate-limit
  },
});
```

**Why:** express-rate-limit v8+ validates that any keyGenerator which uses IP calls `ipKeyGenerator` for proper IPv6 normalisation. Using `req.ip` directly throws `ERR_ERL_KEY_GEN_IPV6` ValidationError at startup and causes the process to exit.

**How to apply:** Any time a custom `keyGenerator` has an IP fallback branch, replace `req.ip` with `ipKeyGenerator(req)` and import it alongside `rateLimit`.
