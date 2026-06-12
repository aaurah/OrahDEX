/**
 * browserify-sign stub — replaces the upstream package to remove the
 * transitive elliptic dependency (CVE GHSA-848j-6mx2-7j84, no upstream fix).
 *
 * Context: @trezor/blockchain-link pulls in crypto-browserify which pulls in
 * browserify-sign. The Trezor SDK only uses crypto-browserify for HMAC/SHA
 * hashing (via createHash/createHmac), never for EC or RSA signing in the
 * browser bundle. The Sign/Verify constructors here throw if reached so that
 * any accidental usage is immediately visible during development.
 */

"use strict";

function notSupported(method) {
  throw new Error(
    "browserify-sign: " + method + " is not supported in this browser build. " +
    "Use the Web Crypto API (globalThis.crypto.subtle) instead."
  );
}

function Sign(algorithm) {
  if (!(this instanceof Sign)) return new Sign(algorithm);
  notSupported("Sign(" + algorithm + ")");
}
Sign.prototype.update  = function() { notSupported("Sign.update");  };
Sign.prototype.sign    = function() { notSupported("Sign.sign");    };

function Verify(algorithm) {
  if (!(this instanceof Verify)) return new Verify(algorithm);
  notSupported("Verify(" + algorithm + ")");
}
Verify.prototype.update = function() { notSupported("Verify.update");  };
Verify.prototype.verify = function() { notSupported("Verify.verify");  };

exports.Sign   = Sign;
exports.Verify = Verify;

exports.createSign = function createSign(algorithm) {
  return new Sign(algorithm);
};

exports.createVerify = function createVerify(algorithm) {
  return new Verify(algorithm);
};
