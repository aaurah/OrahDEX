/**
 * browserify-sign/algos stub — empty algorithm map.
 * crypto-browserify uses this to extend getHashes(); returning an empty
 * object is safe because no EC/RSA signing algorithms are ever called in
 * this browser DEX bundle.
 */
"use strict";
module.exports = {};
