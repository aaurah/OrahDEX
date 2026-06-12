/**
 * elliptic-stub — EC compatibility shim backed by @noble/secp256k1
 *
 * Replaces elliptic@<=6.6.1 across the entire dependency tree via a pnpm
 * workspace override. This removes CVE GHSA-848j-6mx2-7j84 from the lockfile:
 * the advisory affects "<=6.6.1" and this package presents as "7.0.0".
 *
 * Implemented surface: the secp256k1 EC API used by @ethersproject/signing-key
 * (ethers v5 used by @walletconnect/auth-client). Other curves / EC-DH / EdDSA
 * are deliberately unsupported and throw on use — none of them are reachable
 * in this browser DEX bundle.
 *
 * Security note: all cryptographic operations delegate to @noble/secp256k1
 * (paulmillr/noble-secp256k1), which has no known CVEs and passes a formal
 * security audit (https://cure53.de/pentest-report_noble-lib.pdf).
 */

"use strict";

const nobleSecp = require("@noble/secp256k1");

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function hexToBytes(hex) {
  if (typeof hex === "string") {
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
    if (hex.length % 2) hex = "0" + hex;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  if (hex instanceof Uint8Array) return hex;
  if (Array.isArray(hex)) return Uint8Array.from(hex);
  throw new TypeError("hexToBytes: expected string, Uint8Array or Array");
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToArray(bytes) {
  return Array.from(bytes);
}

// BN-like wrapper (just enough for @ethersproject: .toString(16))
function BNLike(bigint) {
  this._v = bigint;
}
BNLike.prototype.toString = function(radix) {
  return this._v.toString(radix || 10);
};
BNLike.prototype.toArray = function() {
  const hex = this._v.toString(16).padStart(64, "0");
  const arr = [];
  for (let i = 0; i < hex.length; i += 2) arr.push(parseInt(hex.slice(i, i+2), 16));
  return arr;
};

// ── KeyPair ───────────────────────────────────────────────────────────────────

function KeyPair(privBytes, pubBytes) {
  this._priv = privBytes || null;   // Uint8Array | null
  this._pub  = pubBytes  || null;   // Uint8Array | null (uncompressed 65 or compressed 33)
}

KeyPair.fromPrivate = function(privBytes) {
  const pub = nobleSecp.getPublicKey(privBytes, false); // uncompressed
  return new KeyPair(privBytes, pub);
};

KeyPair.fromPublic = function(pubBytes) {
  return new KeyPair(null, pubBytes);
};

KeyPair.prototype.getPublic = function(compact, encoding) {
  // normalise compact: may be called as getPublic('hex'), getPublic(true), etc.
  if (typeof compact === "string") { encoding = compact; compact = false; }
  const compressed = compact === true;

  if (!this._pub) throw new Error("elliptic-stub: no public key on this KeyPair");

  let pub;
  if (this._pub.length === 65 && compressed) {
    // convert uncompressed → compressed
    pub = nobleSecp.getPublicKey(this._priv, true);
  } else if (this._pub.length === 33 && !compressed) {
    // convert compressed → uncompressed: re-derive if we have private key
    if (this._priv) {
      pub = nobleSecp.getPublicKey(this._priv, false);
    } else {
      // No private key — use @noble to decompress
      pub = nobleSecp.ProjectivePoint.fromHex(bytesToHex(this._pub)).toRawBytes(false);
    }
  } else {
    pub = this._pub;
  }

  if (!encoding || encoding === "array") return bytesToArray(pub);
  if (encoding === "hex") return bytesToHex(pub);
  return Array.from(pub);
};

KeyPair.prototype.getPrivate = function(encoding) {
  if (!this._priv) throw new Error("elliptic-stub: no private key on this KeyPair");
  if (!encoding || encoding === "hex") return bytesToHex(this._priv);
  if (encoding === "array") return bytesToArray(this._priv);
  return this._priv;
};

/**
 * sign(hash, options) — signs a 32-byte digest.
 * Returns a Signature-like object compatible with @ethersproject/signing-key.
 */
KeyPair.prototype.sign = function(hash, options) {
  if (!this._priv) throw new Error("elliptic-stub: cannot sign without private key");
  const msgHash = hexToBytes(hash);
  // canonical: true (low-S) is the default in @noble/secp256k1
  const sig = nobleSecp.sign(msgHash, this._priv, { lowS: true, format: "recovered" });
  return {
    r:             new BNLike(sig.r),
    s:             new BNLike(sig.s),
    recoveryParam: sig.recovery,
    toDER:         function() { throw new Error("elliptic-stub: DER not supported"); },
  };
};

// ── EC class ──────────────────────────────────────────────────────────────────

function EC(curveName) {
  if (!(this instanceof EC)) return new EC(curveName);
  if (curveName !== "secp256k1") {
    throw new Error(
      "elliptic-stub: only secp256k1 is implemented. " +
      'Requested curve: "' + curveName + '"'
    );
  }
}

EC.prototype.keyFromPrivate = function(key, encoding) {
  const bytes = encoding === "hex" ? hexToBytes(key) : hexToBytes(key);
  return KeyPair.fromPrivate(bytes);
};

EC.prototype.keyFromPublic = function(key, encoding) {
  let bytes;
  if (typeof key === "string") {
    const hex = (encoding === "hex" || !encoding) ? key : bytesToHex(key);
    bytes = hexToBytes(hex);
  } else if (key instanceof Uint8Array || Array.isArray(key)) {
    bytes = Uint8Array.from(key);
  } else if (key && (key.x !== undefined || key.pub !== undefined)) {
    // Object form {x, y} — encode to uncompressed
    if (key.x !== undefined && key.y !== undefined) {
      const xHex = BigInt(key.x).toString(16).padStart(64, "0");
      const yHex = BigInt(key.y).toString(16).padStart(64, "0");
      bytes = hexToBytes("04" + xHex + yHex);
    } else {
      throw new Error("elliptic-stub: unsupported public key object form");
    }
  } else {
    throw new TypeError("elliptic-stub: unsupported public key format");
  }
  return KeyPair.fromPublic(bytes);
};

EC.prototype.sign = function(hash, key, options) {
  const kp = (key instanceof KeyPair) ? key : this.keyFromPrivate(key);
  return kp.sign(hash, options);
};

EC.prototype.verify = function(hash, sig, key) {
  try {
    const msgHash = hexToBytes(hash);
    const pubBytes = (key instanceof KeyPair) ? key._pub : hexToBytes(key);
    const r = typeof sig.r === "bigint" ? sig.r : BigInt("0x" + sig.r.toString(16));
    const s = typeof sig.s === "bigint" ? sig.s : BigInt("0x" + sig.s.toString(16));
    return nobleSecp.verify({ r, s }, msgHash, pubBytes);
  } catch {
    return false;
  }
};

EC.prototype.recoverPubKey = function(hash, sig, recovery) {
  const msgHash = hexToBytes(hash);
  const r = typeof sig.r === "bigint" ? sig.r : BigInt("0x" + sig.r.toString(16));
  const s = typeof sig.s === "bigint" ? sig.s : BigInt("0x" + sig.s.toString(16));
  const nobleSig = new nobleSecp.Signature(r, s, recovery);
  const pub = nobleSig.recoverPublicKey(msgHash).toRawBytes(false); // uncompressed

  // Return a point-like object with .encode() used by @ethersproject
  return {
    encode: function(encoding, compact) {
      const bytes = compact
        ? nobleSecp.ProjectivePoint.fromHex(bytesToHex(pub)).toRawBytes(true)
        : pub;
      if (encoding === "hex") return bytesToHex(bytes);
      return bytesToArray(bytes);
    },
    getX: function() { return new BNLike(BigInt("0x" + bytesToHex(pub.slice(1, 33)))); },
    getY: function() { return new BNLike(BigInt("0x" + bytesToHex(pub.slice(33, 65)))); },
  };
};

// ── eddsa stub (not used in this codebase — throws on instantiation) ───────────
function EdDSA(curveName) {
  if (!(this instanceof EdDSA)) return new EdDSA(curveName);
  throw new Error(
    "elliptic-stub: EdDSA is not supported. Requested curve: " + curveName
  );
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports = {
  ec:    EC,
  EC:    EC,
  eddsa: EdDSA,
  EdDSA: EdDSA,
  curve: {},   // unused accessor present in original
  curves: {},  // unused accessor present in original
};
