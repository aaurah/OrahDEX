/**
 * BSV HTLC (Hash Time Lock Contract) script builder.
 *
 * Builds a P2SH HTLC that can be spent two ways:
 *
 *   Path A — Secret reveal (bridge relayer claims):
 *     unlockScript: <secret>  OP_1
 *
 *   Path B — Refund after locktime (user reclaims):
 *     unlockScript: OP_0
 *     (only valid after <locktimeBlocks> block height)
 *
 * Redeem script:
 *   OP_IF
 *     OP_SHA256 <secretHash32> OP_EQUAL
 *   OP_ELSE
 *     <locktimeBlocks> OP_CHECKLOCKTIMEVERIFY OP_2DROP OP_1
 *   OP_ENDIF
 *
 * The P2SH address is derived:
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
 * Generate a P2SH locking script (scriptPubKey) for the HTLC address.
 * Used when constructing the funding transaction output.
 *
 *   OP_HASH160 <20-byte script hash> OP_EQUAL
 */
export function buildP2SHLockingScript(redeemScriptHex: string): string {
  const scriptHash = hash160(Buffer.from(redeemScriptHex, "hex"));
  const script = Buffer.concat([
    Buffer.from([0xa9]),          // OP_HASH160
    Buffer.from([0x14]),          // push 20 bytes
    scriptHash,
    Buffer.from([0x87]),          // OP_EQUAL
  ]);
  return script.toString("hex");
}
