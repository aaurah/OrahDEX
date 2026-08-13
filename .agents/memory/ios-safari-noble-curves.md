---
name: iOS Safari noble/curves init race
description: Static @noble/curves imports resolve to undefined on iOS Safari in dynamically-split chunks; lazy imports fix it.
---

## Rule

Never use **static top-level imports** of `@noble/curves` (secp256k1, ed25519, p256, etc.) inside any file that is itself part of a dynamically-imported chunk.

```typescript
// ❌ CRASHES on iOS Safari — secp256k1 is undefined when the split chunk first runs
import { secp256k1 } from "@noble/curves/secp256k1.js";
const pub = secp256k1.ProjectivePoint.fromHex(compressed); // TypeError: undefined is not an object
```

```typescript
// ✅ SAFE — lazy import guarantees the module is fully initialized before use
async function deriveTronAddress(key: HDKey): Promise<string> {
  const { secp256k1 } = await import("@noble/curves/secp256k1");
  const uncompressed = secp256k1.getPublicKey(key.privateKey!, false);
  // ...
}
```

**Why:** iOS Safari has a module-initialization race when a statically-imported module (`@noble/curves`) appears in the same Rolldown chunk as a dynamically-imported module (`passkeyWallet.ts`). The `secp256k1`/`ed25519` binding is hoisted but the module's side-effects (class construction, curve parameter setup) haven't run yet, leaving the export as `undefined`. The error surfaces as: `undefined is not an object (evaluating 'c.ProjectivePoint.fromHex')`.

**How to apply:**
- In `seedPhrase.ts`: `deriveTronAddressFromHdKey` and `deriveSolanaAddress` are both `async` and do `await import("@noble/curves/...")` inside the function body.
- Prefer `secp256k1.getPublicKey(privateKey, false)` over `ProjectivePoint.fromHex(publicKey).toRawBytes(false)` — same result for hardened HD paths, fewer code paths that can fail.
- `@noble/hashes` (sha256, sha512, ripemd160, hmac, keccak_256) does not exhibit this issue and can remain as static imports.
- This is specific to `@noble/curves` (stateful class initialization) running in split chunks on iOS Safari 16/17.
