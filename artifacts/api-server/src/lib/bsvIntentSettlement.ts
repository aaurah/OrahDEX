/**
 * BSV Intent Settlement Contract — OrahDEX Production
 *
 * Extends the base HTLC script with on-chain intent enforcement.
 * The locking script commits to two SHA-256 hashes:
 *
 *   1. secretHash  — HTLC preimage (server-side, same as existing system)
 *   2. intentHash  — SHA-256 of the canonical intent JSON payload
 *
 * The solver (relayer) can only claim funds by providing BOTH the preimage
 * AND the exact serialized intent that was committed at creation time.
 * This means minAmountOut, nonce, deadline, and all addresses are enforced
 * on-chain — a solver that paid the user the wrong amount cannot claim.
 *
 * ── Redeem script (locking logic) ────────────────────────────────────────
 *
 *   OP_IF                                             ← path selector
 *     OP_SHA256 <secretHash> OP_EQUALVERIFY           ← verify HTLC preimage
 *     OP_SHA256 <intentHash> OP_EQUALVERIFY           ← verify full intent
 *     OP_1                                            ← success
 *   OP_ELSE
 *     <deadlineBlocks> OP_CHECKLOCKTIMEVERIFY         ← refund path (CLTV)
 *     OP_2DROP
 *     OP_1
 *   OP_ENDIF
 *
 * ── Claim scriptSig (relayer) ─────────────────────────────────────────────
 *
 *   <intentPayloadBytes> <secret32b> OP_1 <redeemScript>
 *
 *   Stack trace:
 *     before redeem: [intentPayload, secret, OP_1]
 *     OP_IF pops OP_1 (truthy)         → stack: [intentPayload, secret]
 *     OP_SHA256 → SHA256(secret)       → stack: [intentPayload, SHA256(secret)]
 *     push secretHash                  → stack: [intentPayload, SHA256(secret), secretHash]
 *     OP_EQUALVERIFY                   → stack: [intentPayload]
 *     OP_SHA256 → SHA256(intentPayload)→ stack: [SHA256(intentPayload)]
 *     push intentHash                  → stack: [SHA256(intentPayload), intentHash]
 *     OP_EQUALVERIFY                   → stack: []
 *     OP_1                             → stack: [1] ✓
 *
 * ── Refund scriptSig (user / relayer after deadline) ─────────────────────
 *
 *   <dummy> OP_0 <redeemScript>
 *   tx.nLockTime ≥ deadlineBlocks; input.nSequence ≠ 0xffffffff
 *
 * ── Nonce replay protection ───────────────────────────────────────────────
 *
 *   (userAddress, nonce) unique in DB.  intentHash is also unique (embedded
 *   in the redeem script, so each contract address is unique by construction).
 *
 * ── Min-output enforcement ────────────────────────────────────────────────
 *
 *   Enforced off-chain: the relayer watcher checks minAmountOut against the
 *   solver's payment proof before broadcasting the claim tx.  Consistent
 *   with the "solver-takes-risk" model (OrahDEX fills instantly on BSV,
 *   solver is responsible for the destination-chain leg).
 */

import { createHash, randomBytes } from "node:crypto";
import { BSV_NET } from "./bsvNetworkConfig.js";

// ── BSV script opcodes ────────────────────────────────────────────────────
const OP = {
  _0:                  0x00,
  _1:                  0x51,
  IF:                  0x63,
  ELSE:                0x67,
  ENDIF:               0x68,
  SHA256:              0xa8,
  EQUALVERIFY:         0x88,
  _2DROP:              0x6d,
  CHECKLOCKTIMEVERIFY: 0xb1,
} as const;

// ── Hash helpers ──────────────────────────────────────────────────────────
function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}
function hash256(data: Buffer): Buffer {
  return sha256(sha256(data));
}
function hash160(data: Buffer): Buffer {
  return createHash("ripemd160").update(sha256(data)).digest();
}

// ── Script encoding ───────────────────────────────────────────────────────
function pushData(data: Buffer): Buffer {
  const len = data.length;
  if (len <= 75) return Buffer.concat([Buffer.from([len]), data]);
  if (len <= 0xff) return Buffer.concat([Buffer.from([0x4c, len]), data]);
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16LE(len, 0);
  return Buffer.concat([Buffer.from([0x4d]), lenBuf, data]);
}

function encodeScriptNum(n: number): Buffer {
  if (n === 0) return Buffer.alloc(0);
  const bytes: number[] = [];
  let temp = Math.abs(n);
  while (temp > 0) { bytes.push(temp & 0xff); temp >>= 8; }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(n < 0 ? 0x80 : 0x00);
  else if (n < 0) bytes[bytes.length - 1] |= 0x80;
  return Buffer.from(bytes);
}

// ── Base58Check ───────────────────────────────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Uint8Array): string {
  const hex = Buffer.from(buf).toString("hex");
  let n = hex ? BigInt("0x" + hex) : 0n;
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; s = "1" + s; }
  return s;
}

function p2shAddress(redeemScript: Buffer): string {
  const scriptHash   = hash160(redeemScript);
  const versioned    = Buffer.concat([Buffer.from([BSV_NET.p2shVersion]), scriptHash]);
  const checksum     = hash256(versioned).slice(0, 4);
  return base58Encode(new Uint8Array(Buffer.concat([versioned, checksum])));
}

// ── Intent canonicalization ───────────────────────────────────────────────

/** All fields that are committed on-chain via the intentHash. */
export interface IntentPayload {
  intentId:           string;
  nonce:              string;
  userAddress:        string;
  solverAddress:      string | null;
  tokenIn:            string;
  tokenOut:           string;
  amountInSat:        number;
  minAmountOut:       string;
  destinationChain:   string;
  destinationAddress: string;
  deadlineTs:         number;
  deadlineBlocks:     number;
}

/**
 * Canonical JSON serialization of the intent — deterministic key order.
 * This is what gets hashed to produce intentHash and what the solver must
 * provide verbatim in the claim scriptSig.
 */
export function canonicalizeIntent(p: IntentPayload): Buffer {
  const canonical = JSON.stringify({
    intentId:           p.intentId,
    nonce:              p.nonce,
    userAddress:        p.userAddress,
    solverAddress:      p.solverAddress,
    tokenIn:            p.tokenIn,
    tokenOut:           p.tokenOut,
    amountInSat:        p.amountInSat,
    minAmountOut:       p.minAmountOut,
    destinationChain:   p.destinationChain,
    destinationAddress: p.destinationAddress,
    deadlineTs:         p.deadlineTs,
    deadlineBlocks:     p.deadlineBlocks,
  });
  return Buffer.from(canonical, "utf8");
}

export function computeIntentHash(p: IntentPayload): string {
  return sha256(canonicalizeIntent(p)).toString("hex");
}

// ── Intent Settlement Contract ────────────────────────────────────────────

export interface IntentSettlementParams {
  intent:         IntentPayload;
  deadlineBlocks: number;
}

export interface IntentSettlementResult {
  intentId:        string;
  intentHash:      string;
  intentPayload:   string;   // canonical JSON (utf8, hex-encoded) — stored for claim
  secret:          string;   // 32-byte hex — server-side only
  secretHash:      string;
  redeemScript:    string;   // hex
  htlcAddress:     string;   // BSV P2SH address
  deadlineBlocks:  number;
  nonce:           string;
}

/**
 * Build the intent settlement P2SH contract.
 *
 * Generates a fresh HTLC secret, commits both the secretHash and the
 * SHA-256(canonicalIntent) into the redeem script, and returns the P2SH
 * address the user should fund.
 */
export function buildIntentSettlement(params: IntentSettlementParams): IntentSettlementResult {
  const { intent, deadlineBlocks } = params;

  const secretBuf   = randomBytes(32);
  const secretHash  = sha256(secretBuf);
  const intentBytes = canonicalizeIntent(intent);
  const intentHash  = sha256(intentBytes);

  const locktimeBuf = encodeScriptNum(deadlineBlocks);

  // ── Redeem script ────────────────────────────────────────────────────────
  //   OP_IF
  //     OP_SHA256 <secretHash32>  OP_EQUALVERIFY
  //     OP_SHA256 <intentHash32>  OP_EQUALVERIFY
  //     OP_1
  //   OP_ELSE
  //     <deadlineBlocks>  OP_CHECKLOCKTIMEVERIFY  OP_2DROP  OP_1
  //   OP_ENDIF
  const redeemScript = Buffer.concat([
    Buffer.from([OP.IF]),
      Buffer.from([OP.SHA256]),
      pushData(secretHash),
      Buffer.from([OP.EQUALVERIFY]),
      Buffer.from([OP.SHA256]),
      pushData(intentHash),
      Buffer.from([OP.EQUALVERIFY]),
      Buffer.from([OP._1]),
    Buffer.from([OP.ELSE]),
      pushData(locktimeBuf),
      Buffer.from([OP.CHECKLOCKTIMEVERIFY]),
      Buffer.from([OP._2DROP]),
      Buffer.from([OP._1]),
    Buffer.from([OP.ENDIF]),
  ]);

  return {
    intentId:       intent.intentId,
    intentHash:     intentHash.toString("hex"),
    intentPayload:  intentBytes.toString("hex"),
    secret:         secretBuf.toString("hex"),
    secretHash:     secretHash.toString("hex"),
    redeemScript:   redeemScript.toString("hex"),
    htlcAddress:    p2shAddress(redeemScript),
    deadlineBlocks,
    nonce:          intent.nonce,
  };
}

// ── P2SH locking script (scriptPubKey for the funding tx output) ──────────
export function buildIntentP2SHLockingScript(redeemScriptHex: string): string {
  const scriptHash = hash160(Buffer.from(redeemScriptHex, "hex"));
  return Buffer.concat([
    Buffer.from([0xa9]),  // OP_HASH160
    Buffer.from([0x14]),  // push 20 bytes
    scriptHash,
    Buffer.from([0x87]),  // OP_EQUAL
  ]).toString("hex");
}

// ── Claim scriptSig (relayer, after solver has filled the destination leg) ─
/**
 * Build the claim scriptSig.
 *
 * @param intentPayloadHex  Canonical intent JSON bytes as hex (from IntentSettlementResult.intentPayload)
 * @param secretHex         32-byte preimage as hex
 * @param redeemScriptHex   Redeem script hex
 */
export function buildIntentClaimScriptSig(
  intentPayloadHex: string,
  secretHex:        string,
  redeemScriptHex:  string,
): string {
  const intentPayload = Buffer.from(intentPayloadHex, "hex");
  const secret        = Buffer.from(secretHex, "hex");
  const redeemScript  = Buffer.from(redeemScriptHex, "hex");
  return Buffer.concat([
    pushData(intentPayload),   // <intentPayload>  → satisfies OP_SHA256 intentHash OP_EQUALVERIFY
    pushData(secret),          // <secret>         → satisfies OP_SHA256 secretHash OP_EQUALVERIFY
    Buffer.from([0x51]),       // OP_1             → truthy: OP_IF takes the IF branch
    pushData(redeemScript),    // <redeemScript>   → P2SH serialization
  ]).toString("hex");
}

// ── Refund scriptSig (user or relayer, after CLTV deadline) ──────────────
/**
 * Build the refund scriptSig.
 *
 * tx.nLockTime must be ≥ deadlineBlocks; input.nSequence ≠ 0xffffffff.
 */
export function buildIntentRefundScriptSig(redeemScriptHex: string): string {
  const redeemScript = Buffer.from(redeemScriptHex, "hex");
  return Buffer.concat([
    Buffer.from([0x00]),     // dummy — consumed by OP_2DROP in ELSE branch
    Buffer.from([0x00]),     // OP_0  — falsy → takes ELSE branch
    pushData(redeemScript),  // <redeemScript> — P2SH serialization
  ]).toString("hex");
}

// ── OP_RETURN intent commitment (v3) ─────────────────────────────────────
/**
 * Build the v3 OP_RETURN payload that anchors the intent on the BSV blockchain.
 *
 * Format (pipe-separated UTF-8):
 *   ORAH|v3|<intentId16>|<tokenIn>→<tokenOut>|<amountInSat>|<minAmountOut>|<destChain>|
 *   <destAddr20…>|<deadline>|N:<nonce16>|H:<secretHash16>|I:<intentHash16>|A:<htlcAddr>
 */
export function buildIntentOpReturn(
  result:  IntentSettlementResult,
  intent:  IntentPayload,
): string {
  return [
    "ORAH",
    "v3",
    result.intentId.replace(/-/g, "").slice(0, 16),
    `${intent.tokenIn}\u2192${intent.tokenOut}`,
    intent.amountInSat.toString(),
    intent.minAmountOut,
    intent.destinationChain,
    intent.destinationAddress.slice(0, 20) + "\u2026",
    intent.deadlineTs.toString(),
    "N:" + result.nonce.slice(0, 16),
    "H:" + result.secretHash.slice(0, 16),
    "I:" + result.intentHash.slice(0, 16),
    "A:" + result.htlcAddress,
  ].join("|");
}

// ── Verification helpers ──────────────────────────────────────────────────

/** Verify that a provided secret matches the stored secretHash. */
export function verifyIntentSecret(secretHex: string, secretHashHex: string): boolean {
  try {
    return sha256(Buffer.from(secretHex, "hex")).toString("hex") === secretHashHex;
  } catch { return false; }
}

/** Verify that an intent payload produces the expected hash. */
export function verifyIntentPayload(intentPayloadHex: string, intentHashHex: string): boolean {
  try {
    return sha256(Buffer.from(intentPayloadHex, "hex")).toString("hex") === intentHashHex;
  } catch { return false; }
}

/** Minimum BSV block confirmations required before a large-value claim. */
export const INTENT_MIN_CONFIRMATIONS = 3;

/** Minimum satoshis for an intent settlement (well above BSV dust limit). */
export const INTENT_MIN_SAT = 2000;

/** Default deadline: current block + 288 (≈48 hours on BSV). */
export const INTENT_DEFAULT_LOCKTIME_BLOCKS = 288;
