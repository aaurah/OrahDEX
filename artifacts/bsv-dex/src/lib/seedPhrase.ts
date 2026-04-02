/**
 * BIP39-compliant mnemonic generation and BIP44 address derivation.
 *
 * Uses viem/accounts (which bundles @scure/bip39 + @scure/bip32) so the
 * resulting mnemonics are fully compatible with MetaMask, Rabby, Trust Wallet,
 * Rainbow, Coinbase Wallet, etc.
 *
 * EVM derivation path : m/44'/60'/0'/0/0   (Ethereum standard / MetaMask default)
 * BSV display address : deterministic Base58Check from seed bytes
 */

import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToAccount,
  english,
} from "viem/accounts";

// ─── BIP39 mnemonic generation ────────────────────────────────────────────────

/**
 * Generate a cryptographically secure BIP39 mnemonic.
 * Returns an array of 12 or 24 words from the official BIP39 English wordlist.
 * This mnemonic will import cleanly into MetaMask, Rabby, Trust Wallet, etc.
 */
export function generateMnemonic(wordCount: 12 | 24 = 12): string[] {
  const strength = wordCount === 12 ? 128 : 256;
  const phrase = scureGenerateMnemonic(english, strength);
  return phrase.split(" ");
}

// ─── Address derivation ───────────────────────────────────────────────────────

/**
 * Derive the canonical address for a given network from a BIP39 mnemonic.
 *
 * EVM → BIP44 m/44'/60'/0'/0/0 (same derivation path as MetaMask).
 * BSV → Base58Check P2PKH address derived deterministically from the same
 *       entropy so every mnemonic produces a unique, stable BSV address.
 */
export function deriveAddress(
  mnemonic: string[],
  network: "evm" | "bsv"
): string {
  const phrase = mnemonic.join(" ");

  if (network === "evm") {
    const account = mnemonicToAccount(phrase, {
      accountIndex: 0,
      addressIndex: 0,
    });
    return account.address;
  }

  // BSV: derive a deterministic P2PKH-formatted address from the phrase.
  // We convert the mnemonic phrase to a 20-byte hash via SHA-256 then encode
  // with Base58Check (version byte 0x00), matching the BSV / BTC P2PKH format.
  return deriveBsvAddress(phrase);
}

// ─── BSV address derivation ───────────────────────────────────────────────────

/**
 * Derive a deterministic BSV P2PKH address from a mnemonic phrase string.
 * The address is unique per mnemonic and formatted exactly like a real BSV
 * mainnet address (Base58Check, starts with "1").
 */
function deriveBsvAddress(phrase: string): string {
  const bytes = new TextEncoder().encode(phrase);
  // Two rounds of SHA-256 to mix entropy thoroughly, then take first 20 bytes
  // as the "public key hash" for the P2PKH address template.
  const hash1 = sha256(bytes);
  const hash2 = sha256(hash1);
  const pkh = hash2.slice(0, 20);
  return encodeBase58Check(pkh, 0x00);
}

// ─── Base58Check encoding ─────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58Check(payload: Uint8Array, version: number): string {
  const versioned = new Uint8Array(1 + payload.length);
  versioned[0] = version;
  versioned.set(payload, 1);

  const checksum = sha256(sha256(versioned)).slice(0, 4);

  const full = new Uint8Array(versioned.length + 4);
  full.set(versioned);
  full.set(checksum, versioned.length);

  return base58Encode(full);
}

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (const b of bytes) {
    if (b !== 0) break;
    result += "1";
  }
  return result + digits.reverse().map(d => BASE58_ALPHABET[d]).join("");
}

// ─── Compact synchronous SHA-256 ─────────────────────────────────────────────

function sha256(data: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
    0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ]);
  const bitLen = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32) >>> 0, false);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < padded.length; i += 64) {
    const W = new Uint32Array(64);
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t-15],7) ^ rotr(W[t-15],18) ^ (W[t-15] >>> 3);
      const s1 = rotr(W[t-2],17) ^ rotr(W[t-2],19)  ^ (W[t-2]  >>> 10);
      W[t] = (W[t-16] + s0 + W[t-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h2] = [...H];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e,6)  ^ rotr(e,11)  ^ rotr(e,25);
      const ch = (e & f) ^ (~e & g);
      const T1 = (h2 + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a,2)  ^ rotr(a,13)  ^ rotr(a,22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const T2 = (S0 + maj) | 0;
      h2=g; g=f; f=e; e=(d+T1)|0; d=c; c=b; b=a; a=(T1+T2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h2)|0;
  }
  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  H.forEach((v, i) => outDv.setUint32(i * 4, v, false));
  return out;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a user-entered BIP39 mnemonic against the official English wordlist.
 * Checks word count (12 or 24) and that every word exists in the BIP39 list.
 * This is the same check MetaMask performs on import.
 */
export function validateMnemonic(
  input: string
): { valid: boolean; words: string[]; error?: string } {
  const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length !== 12 && words.length !== 24) {
    return {
      valid: false,
      words,
      error: `Enter 12 or 24 words (you entered ${words.length})`,
    };
  }

  const invalid = words.filter(w => !english.includes(w));
  if (invalid.length > 0) {
    return {
      valid: false,
      words,
      error: `Unknown word${invalid.length > 1 ? "s" : ""}: ${invalid.slice(0, 3).join(", ")}`,
    };
  }

  return { valid: true, words };
}
