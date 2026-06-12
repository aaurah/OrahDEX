/**
 * create-ecdh stub — replaces the upstream package to remove the
 * transitive elliptic dependency (CVE GHSA-848j-6mx2-7j84, no upstream fix).
 *
 * Context: @trezor/blockchain-link pulls in crypto-browserify which pulls in
 * create-ecdh. ECDH is never exercised in this DEX's browser bundle —
 * Trezor uses crypto-browserify only for HMAC/SHA hashing operations.
 * This stub throws a clear runtime error if the ECDH path is ever reached.
 */

"use strict";

module.exports = function createECDH(curve) {
  throw new Error(
    "create-ecdh: ECDH is not supported in this browser build (curve: " + curve + "). " +
    "Use the Web Crypto API (globalThis.crypto.subtle.generateKey with ECDH) instead."
  );
};
