/**
 * BSV HTLC (Hash Time Lock Contract) script builder.
 *
 * ── Redeem script (locking logic) ────────────────────────────────────────────
 *
 *   OP_IF
 *     OP_SHA256 <secretHash32> OP_EQUAL     ← Path A: relayer reveals preimage
 *   OP_ELSE
 *     <locktimeBlocks> OP_CHECKLOCKTIMEVERIFY OP_2DROP OP_1
 *   OP_ENDIF                                ← Path B: user reclaims after CLTV
 *
 * ── Path A — Claim (relayer reveals secret) ──────────────────────────────────
 *
 *   scriptSig: <secret_32b> OP_1 <redeemScript>
 *
 *   Execution trace:
 *     Stack before redeemScript: [secret, OP_1]
 *     OP_IF     pops OP_1 (truthy)  → takes IF branch
 *     OP_SHA256 pops secret         → pushes SHA256(secret)
 *     push <secretHash32>           → stack: [SHA256(secret), secretHash]
 *     OP_EQUAL  pops both           → pushes 1 if hashes match ✓
 *
 *   Use buildClaimScriptSig(secret, redeemScript) to construct.
 *
 * ── Path B — Refund (user reclaims after CLTV) ───────────────────────────────
 *
 *   scriptSig: OP_0_dummy OP_0 <redeemScript>
 *   tx.nLockTime must be ≥ locktimeBlocks; input.nSequence must not be 0xffffffff.
 *
 *   Execution trace:
 *     Stack before redeemScript: [dummy, OP_0]
 *     OP_IF       pops OP_0 (falsy)  → takes ELSE branch; stack: [dummy]
 *     push <locktimeBlocks>           → stack: [dummy, locktimeBlocks]
 *     OP_CHECKLOCKTIMEVERIFY          → validates nLockTime (does not pop)
 *     OP_2DROP    pops 2 items        → stack: []
 *     OP_1                            → stack: [1] ✓
 *
 *   Use buildRefundScriptSig(redeemScript) to construct.
 *
 * ── Invariants ───────────────────────────────────────────────────────────────
 *
 *   • HTLC is only generated for cross-chain trades (buyerNetwork ≠ sellerNetwork).
 *   • locktimeBlocks must be ≥ currentBlockHeight + MIN_LOCKTIME_BLOCKS (144).
 *   • htlcSatoshis must be ≥ DUST_SAT (546) and ≤ utxo.satoshis - FEE_SAT.
 *   • The secret is held server-side; only secretHash is stored on-chain.
 *
 * ── Status lifecycle ─────────────────────────────────────────────────────────
 *
 *   LOCKED   — P2SH output exists, nLockTime not yet expired
 *   CLAIMED  — output spent before locktimeBlocks (relayer used secret)
 *   EXPIRED  — nLockTime passed but output not yet spent
 *   REFUNDED — output spent at or after locktimeBlocks (user reclaimed)
 *
 * ── P2SH address derivation ──────────────────────────────────────────────────
 *
 *   address = Base58Check( 0x05 || HASH160(redeemScript) )
 */

import { createHash, randomBytes } from "crypto";

// ── BSV script opcodes ────────────────────────────────────────────────────────
const OP = {
  _0:     0x00,
  _1:     0x51,
  IF:     0x63,
  ELSE:   0x67,
  ENDIF:  0x68,
  SHA256: 0xa8,
  EQUAL:  0x87,
  EQUALVERIFY: 0x88,
  DROP:   0x75,
  _2DROP: 0x6d,
  CHECKLOCKTIMEVERIFY: 0xb1,
  NOP:    0x61,
} as const;

// ── Base58 ────────────────────────────────────────────────────────────────────
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Uint8Array): string {
  const hex = Buffer.from(buf).toString("hex");
  let n = hex ? BigInt("0x" + hex) : 0n;
  let s = "";
  while (n > 0n) {
    const rem = Number(n % 58n);
    s = BASE58_ALPHABET[rem] + s;
    n /= 58n;
  }
  // Leading zero bytes → '1'
  for (const byte of buf) {
    if (byte !== 0) break;
    s = "1" + s;
  }
  return s;
}

// ── Hash helpers ──────────────────────────────────────────────────────────────
function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}
function hash256(data: Buffer): Buffer {
  return sha256(sha256(data));
}
function hash160(data: Buffer): Buffer {
  return createHash("ripemd160").update(sha256(data)).digest();
}

// ── Script push-data encoding ─────────────────────────────────────────────────
/**
 * Encode a data push: if len ≤ 75 push <len> <data>,
 * else use OP_PUSHDATA1/2 as needed.
 */
function pushData(data: Buffer): Buffer {
  const len = data.length;
  if (len <= 75) {
    return Buffer.concat([Buffer.from([len]), data]);
  }
  if (len <= 0xff) {
    return Buffer.concat([Buffer.from([0x4c, len]), data]);
  }
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16LE(len, 0);
  return Buffer.concat([Buffer.from([0x4d]), lenBuf, data]);
}

/**
 * Encode a script number (CScriptNum) for CLTV.
 * BSV uses little-endian minimal encoding.
 */
function encodeScriptNum(n: number): Buffer {
  if (n === 0) return Buffer.alloc(0);
  const abs = Math.abs(n);
  const bytes: number[] = [];
  let temp = abs;
  while (temp > 0) {
    bytes.push(temp & 0xff);
    temp >>= 8;
  }
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(n < 0 ? 0x80 : 0x00);
  } else if (n < 0) {
    bytes[bytes.length - 1] |= 0x80;
  }
  return Buffer.from(bytes);
}

// ── HTLC builder ─────────────────────────────────────────────────────────────
export interface HtlcParams {
  /** Absolute BSV block height after which the user can reclaim */
  locktimeBlocks: number;
}

export interface HtlcResult {
  /** 32-byte random secret (hex) — kept server-side, used by relayer to claim */
  secret: string;
  /** SHA-256(secret) (hex) — embedded in the script; confirmed on reveal */
  secretHash: string;
  /** Redeem script (hex) */
  redeemScript: string;
  /** P2SH address on BSV mainnet */
  htlcAddress: string;
  locktimeBlocks: number;
}

/**
 * Generate a new HTLC.
 *
 * @param locktimeBlocks — absolute block height for refund path.
 *   Typically: currentBlockHeight + 144 (≈24 hours on BSV).
 */
export function buildHtlc(params: HtlcParams): HtlcResult {
  const { locktimeBlocks } = params;

  // 1. Generate random secret and compute SHA-256 hash
  const secretBuf  = randomBytes(32);
  const secretHash = sha256(secretBuf);

  // 2. Build redeem script:
  //   OP_IF
  //     OP_SHA256 <secretHash32> OP_EQUAL
  //   OP_ELSE
  //     <locktimeBlocks> OP_CHECKLOCKTIMEVERIFY OP_2DROP OP_1
  //   OP_ENDIF
  const locktimeBuf = encodeScriptNum(locktimeBlocks);

  const redeemScript = Buffer.concat([
    Buffer.from([OP.IF]),
      Buffer.from([OP.SHA256]),
      pushData(secretHash),
      Buffer.from([OP.EQUAL]),
    Buffer.from([OP.ELSE]),
      pushData(locktimeBuf),
      Buffer.from([OP.CHECKLOCKTIMEVERIFY]),
      Buffer.from([OP._2DROP]),
      Buffer.from([OP._1]),
    Buffer.from([OP.ENDIF]),
  ]);

  // 3. Derive P2SH address
  //   P2SH = Base58Check( 0x05 || HASH160(redeemScript) )
  const scriptHash = hash160(redeemScript);            // 20 bytes
  const versionedHash = Buffer.concat([
    Buffer.from([0x05]),  // BSV P2SH version byte (same as BTC mainnet)
    scriptHash,
  ]);
  const checksum = hash256(versionedHash).slice(0, 4);
  const addressBytes = Buffer.concat([versionedHash, checksum]);
  const htlcAddress = base58Encode(new Uint8Array(addressBytes));

  return {
    secret:       secretBuf.toString("hex"),
    secretHash:   secretHash.toString("hex"),
    redeemScript: redeemScript.toString("hex"),
    htlcAddress,
    locktimeBlocks,
  };
}

// ── HTLC invariant constants ─────────────────────────────────────────────────
/** Minimum blocks from current tip before locktime (≈24h on BSV). Never go lower. */
export const MIN_LOCKTIME_BLOCKS = 144;
/** Minimum satoshis for a P2SH HTLC output (well above BSV dust limit of ~546). */
export const HTLC_MIN_SAT        = 1000;
/** Standard dust threshold in satoshis. */
export const DUST_SAT            = 546;

/**
 * Verify that a provided secret matches the stored secretHash.
 * Called by the relayer before broadcasting the claim transaction.
 */
export function verifySecret(secret: string, secretHash: string): boolean {
  try {
    const hash = sha256(Buffer.from(secret, "hex")).toString("hex");
    return hash === secretHash;
  } catch {
    return false;
  }
}

/**
 * Generate a P2SH locking script (scriptPubKey) for the HTLC output.
 * Used when constructing the funding transaction output.
 *
 *   OP_HASH160 <20-byte script hash> OP_EQUAL
 */
export function buildP2SHLockingScript(redeemScriptHex: string): string {
  const scriptHash = hash160(Buffer.from(redeemScriptHex, "hex"));
  const script = Buffer.concat([
    Buffer.from([0xa9]),  // OP_HASH160
    Buffer.from([0x14]),  // push 20 bytes
    scriptHash,
    Buffer.from([0x87]),  // OP_EQUAL
  ]);
  return script.toString("hex");
}

/**
 * Build the scriptSig for Path A — relayer claim via secret reveal.
 *
 *   scriptSig: <secret_32b> <OP_1> <redeemScript>
 *
 * The node calling this must have the 32-byte secret that hashes to secretHash.
 * This is a P2SH spend: push elements, then push the serialized redeemScript.
 *
 * @param secret        32-byte secret as hex (stored server-side by the relayer)
 * @param redeemScriptHex  Hex-encoded redeem script from buildHtlc()
 */
export function buildClaimScriptSig(secret: string, redeemScriptHex: string): string {
  const secretBuf    = Buffer.from(secret, "hex");
  const redeemScript = Buffer.from(redeemScriptHex, "hex");
  return Buffer.concat([
    pushData(secretBuf),       // <secret>       — preimage that satisfies OP_SHA256 ... OP_EQUAL
    Buffer.from([0x51]),       // OP_1            — truthy: OP_IF takes the IF branch
    pushData(redeemScript),    // <redeemScript>  — P2SH serialization
  ]).toString("hex");
}

/**
 * Build the scriptSig for Path B — user refund after CLTV expiry.
 *
 *   scriptSig: OP_0_dummy OP_0 <redeemScript>
 *   tx.nLockTime must be ≥ locktimeBlocks.
 *   input.nSequence must NOT be 0xffffffff (CLTV requirement).
 *
 * Stack execution in ELSE branch:
 *   [dummy] [OP_0] → OP_IF pops OP_0 (false) → ELSE → [dummy] →
 *   push locktimeBlocks → CLTV validates → OP_2DROP consumes both → OP_1 ✓
 *
 * @param redeemScriptHex  Hex-encoded redeem script from buildHtlc()
 */
export function buildRefundScriptSig(redeemScriptHex: string): string {
  const redeemScript = Buffer.from(redeemScriptHex, "hex");
  return Buffer.concat([
    Buffer.from([0x00]),    // OP_0 dummy — consumed by OP_2DROP in the ELSE branch
    Buffer.from([0x00]),    // OP_0        — falsy: OP_IF takes the ELSE branch
    pushData(redeemScript), // <redeemScript> — P2SH serialization
  ]).toString("hex");
}

/** HTLC status lifecycle as observed on-chain. */
export type HtlcOnChainStatus = "LOCKED" | "CLAIMED" | "REFUNDED" | "EXPIRED" | "UNKNOWN";
