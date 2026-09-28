/**
 * BSV On-Chain Broadcaster — OrahDEX
 *
 * Builds, signs, and broadcasts a real BSV transaction to the network
 * via the WhatsOnChain raw-tx API.
 *
 * Transaction structure:
 *   Input 0  : P2PKH UTXO from settlement wallet (pays fee)
 *   Output 0 : OP_RETURN with trade payload (0 satoshis)
 *   Output 1 : P2PKH change back to settlement wallet (if remainder > dust)
 *
 * Signing: BIP143 (SIGHASH_ALL | SIGHASH_FORKID = 0x41)
 * — required by both BCH and BSV after the 2017/2018 forks.
 */

import * as secp from "@noble/secp256k1";
import crypto from "node:crypto";
import { hash160, type Utxo, toSatoshiBigInt } from "./bsvWallet.js";
import { logger } from "./logger.js";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { arcBroadcast } from "./arcBroadcaster.js";

const FEE_SAT  = BSV_NET.feeSat;
const DUST_SAT = BSV_NET.dustSat;
const HTLC_MIN_SAT = Math.max(1000, DUST_SAT + 1);

/* ── Buffer / encoding helpers ──────────────────────────────────────────── */

function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b;
}
function uint64LE(n: number | bigint | string): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(toSatoshiBigInt(n), 0);
  return b;
}
function varint(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b;
}
function dsha256(buf: Buffer): Buffer {
  const h1 = crypto.createHash("sha256").update(buf).digest();
  return crypto.createHash("sha256").update(h1).digest();
}

/** Reverse a txid hex string to little-endian bytes */
function txidToLE(hex: string): Buffer {
  return Buffer.from(hex, "hex").reverse();
}

/* ── P2PKH script builders ──────────────────────────────────────────────── */

function p2pkhScript(h160bytes: Buffer): Buffer {
  // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  return Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    h160bytes,
    Buffer.from([0x88, 0xac]),
  ]);
}

function opReturnScript(payload: Buffer): Buffer {
  // OP_RETURN <pushdata>
  const pushLen = payload.length < 0x4c
    ? Buffer.from([payload.length])
    : Buffer.concat([Buffer.from([0x4c]), Buffer.from([payload.length])]);
  return Buffer.concat([Buffer.from([0x6a]), pushLen, payload]);
}

/* ── BIP143 sighash ─────────────────────────────────────────────────────── */

const SIGHASH_ALL_FORKID = 0x41;

function bip143Sighash(params: {
  version:     number;
  utxo:        Utxo;
  inputIndex:  number;
  lockScript:  Buffer;   // scriptCode of the input being signed
  sequence:    number;
  outputs:     Array<{ satoshis: bigint; script: Buffer }>;
  locktime:    number;
  sigHashType: number;
}): Buffer {
  const { version, utxo, inputIndex, lockScript, sequence, outputs, locktime, sigHashType } = params;

  // hashPrevouts = dSHA256 of all outpoints
  const prevouts = Buffer.concat([txidToLE(utxo.txid), uint32LE(utxo.vout)]);
  const hashPrevouts = dsha256(prevouts);

  // hashSequence = dSHA256 of all sequences
  const hashSequence = dsha256(uint32LE(sequence));

  // This input's outpoint
  const outpoint = Buffer.concat([txidToLE(utxo.txid), uint32LE(utxo.vout)]);

  // scriptCode = varint(len) + lockScript
  const scriptCode = Buffer.concat([varint(lockScript.length), lockScript]);

  // hashOutputs = dSHA256 of all outputs serialised
  const outBufs = outputs.map(o =>
    Buffer.concat([uint64LE(o.satoshis), varint(o.script.length), o.script]),
  );
  const hashOutputs = dsha256(Buffer.concat(outBufs));

  const preimage = Buffer.concat([
    uint32LE(version),
    hashPrevouts,
    hashSequence,
    outpoint,
    scriptCode,
    uint64LE(utxo.satoshis),
    uint32LE(sequence),
    hashOutputs,
    uint32LE(locktime),
    uint32LE(sigHashType),
  ]);

  return dsha256(preimage);
}

/* ── DER encode a secp256k1 signature ──────────────────────────────────── */

function derEncode(sig: { r: bigint; s: bigint }): Buffer {
  function encodeInt(n: bigint): Buffer {
    let hex = n.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let buf = Buffer.from(hex, "hex");
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
    return buf;
  }
  const r = encodeInt(sig.r);
  const s = encodeInt(sig.s);
  const inner = Buffer.concat([
    Buffer.from([0x02]), Buffer.from([r.length]), r,
    Buffer.from([0x02]), Buffer.from([s.length]), s,
  ]);
  return Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
}

/* ── Base58Check decode (for converting BSV addresses to hash160) ──────── */

function base58CheckDecode(addr: string): Buffer {
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of addr) {
    const idx = B58.indexOf(c);
    if (idx < 0) throw new Error(`Invalid Base58 char: ${c}`);
    n = n * 58n + BigInt(idx);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const leadingOnes = [...addr].filter(c => c === "1").length;
  const payload = Buffer.concat([Buffer.alloc(leadingOnes), Buffer.from(hex, "hex")]);
  const withoutCheck = payload.subarray(0, payload.length - 4);
  const expectedCheck = payload.subarray(payload.length - 4);
  if (!dsha256(withoutCheck).subarray(0, 4).equals(expectedCheck)) {
    throw new Error("Base58Check checksum mismatch");
  }
  return withoutCheck.subarray(1); // strip version byte → 20-byte hash160
}

function p2pkhFromAddress(addr: string): Buffer {
  return p2pkhScript(base58CheckDecode(addr));
}

/* ── P2SH spend (HTLC claim / refund) ──────────────────────────────────── */

export interface P2SHSpendParams {
  fundingTxid:   string;   // HTLC UTXO txid
  fundingVout:   number;   // HTLC UTXO output index
  fundingSat:    number | bigint | string; // satoshis locked in the HTLC
  scriptSigHex:  string;   // pre-built scriptSig (no ECDSA signing needed)
  outputAddress: string;   // recipient BSV P2PKH address
  feeSat?:       number;   // defaults to BSV_NET.feeSat
  locktime?:     number;   // 0 for claim; deadlineBlocks for CLTV refund
  sequence?:     number;   // 0xffffffff for claim; 0 for CLTV refund
}

export interface P2SHSpendResult {
  success:   boolean;
  txid:      string;
  rawTxHex:  string;
  broadcast: boolean;
  arcTxid:   string | null;
  arcStatus: string | null;
  error?:    string;
}

/**
 * Build and broadcast a P2SH-spend transaction with a pre-built scriptSig.
 * Used for HTLC intent claim (IF path, secret reveal) and refund (ELSE CLTV path).
 * No ECDSA signing is required because the redeem scripts use OP_SHA256 / CLTV only.
 */
export async function broadcastP2SHSpend(params: P2SHSpendParams): Promise<P2SHSpendResult> {
  const { fundingTxid, fundingVout, fundingSat, scriptSigHex, outputAddress } = params;
  const fee      = params.feeSat   ?? FEE_SAT;
  const locktime = params.locktime ?? 0;
  const sequence = params.sequence ?? 0xffffffff;
  const outSatRaw = toSatoshiBigInt(fundingSat) - BigInt(fee);

  if (outSatRaw <= BigInt(DUST_SAT)) {
    const msg = `P2SH spend: output ${outSatRaw} sat is at or below dust — skipping`;
    logger.warn({ fundingSat, fee }, msg);
    return { success: false, txid: "", rawTxHex: "", broadcast: false, arcTxid: null, arcStatus: null, error: msg };
  }

  let outputScript: Buffer;
  try {
    outputScript = p2pkhFromAddress(outputAddress);
  } catch (decErr) {
    const msg = `P2SH spend: cannot decode output address ${outputAddress}: ${decErr}`;
    logger.warn(msg);
    return { success: false, txid: "", rawTxHex: "", broadcast: false, arcTxid: null, arcStatus: null, error: msg };
  }

  const scriptSig = Buffer.from(scriptSigHex, "hex");

  const inputBuf = Buffer.concat([
    txidToLE(fundingTxid),
    uint32LE(fundingVout),
    varint(scriptSig.length), scriptSig,
    uint32LE(sequence),
  ]);

  const outputBuf = Buffer.concat([
    uint64LE(outSatRaw),
    varint(outputScript.length),
    outputScript,
  ]);

  const rawTx = Buffer.concat([
    uint32LE(1),    // version
    varint(1), inputBuf,
    varint(1), outputBuf,
    uint32LE(locktime),
  ]);

  const rawTxHex = rawTx.toString("hex");
  const txid     = dsha256(rawTx).reverse().toString("hex");

  try {
    const arcResult = await arcBroadcast(rawTxHex);
    logger.info({ txid: arcResult.txid, arcStatus: arcResult.arcStatus, fundingTxid }, "BSV P2SH spend broadcast SUCCESS");
    return {
      success:   true,
      txid:      arcResult.txid,
      rawTxHex,
      broadcast: true,
      arcTxid:   arcResult.arcTxid,
      arcStatus: arcResult.arcStatus,
    };
  } catch (err) {
    logger.warn({ err }, "BSV P2SH spend broadcast error");
    return {
      success:   false,
      txid,
      rawTxHex,
      broadcast: false,
      arcTxid:   null,
      arcStatus: null,
      error:     err instanceof Error ? err.message : String(err),
    };
  }
}

/* ── Main build & broadcast function ───────────────────────────────────── */

export interface BroadcastParams {
  privKeyHex:      string;    // 32-byte private key as hex
  changeAddress:   string;    // settlement wallet address (change recipient)
  utxo:            Utxo;      // UTXO to spend
  opReturnPayload: string;    // UTF-8 v2 trade payload (includes HTLC fields)
  // Cross-chain HTLC output — when present, a P2SH output is added to lock the
  // trade commitment on-chain (in addition to the OP_RETURN audit record).
  htlcP2SHScriptHex?: string; // 23-byte P2SH locking script (OP_HASH160 <20b> OP_EQUAL)
  htlcSatoshis?:    string | number; // EXACT BSV trade value in satoshis locked by the HTLC (required when htlcP2SHScriptHex is set)
}

export interface BroadcastResult {
  success:   boolean;
  txid:      string;
  rawTxHex:  string;
  broadcast: boolean;          // true if actually sent to BSV network
  arcTxid:   string | null;
  arcStatus: string | null;
  error?:    string;
}

export async function broadcastSettlement(params: BroadcastParams): Promise<BroadcastResult> {
  const { privKeyHex, utxo, opReturnPayload, htlcP2SHScriptHex, htlcSatoshis } = params;
  const utxoSat = toSatoshiBigInt((utxo as any).satoshis);
  if (utxoSat <= 0n) throw new Error("Invalid UTXO satoshis");

  const privKey = Buffer.from(privKeyHex, "hex");
  const pubKey  = Buffer.from(secp.getPublicKey(privKey, true));  // 33-byte compressed
  const h160    = hash160(pubKey);
  const lockScript = p2pkhScript(h160);  // P2PKH locking script for the input UTXO

  // ── Build outputs ────────────────────────────────────────────────────────
  const payload     = Buffer.from(opReturnPayload, "utf8");
  const opRetScript = opReturnScript(payload);

  const outputs: Array<{ satoshis: bigint; script: Buffer }> = [
    { satoshis: 0n, script: opRetScript },  // Output 0: OP_RETURN audit record (data carrier)
  ];

  // Output 1 (optional): P2SH HTLC locking script for cross-chain trade commitment.
  // P0 fix: the HTLC must lock the EXACT BSV trade value, never a nominal dust amount.
  let htlcLockSat = 0n;
  if (htlcP2SHScriptHex) {
    if (htlcSatoshis == null) {
      throw new Error("BSV HTLC amount not bound to trade value: htlcSatoshis is required");
    }
    htlcLockSat = toSatoshiBigInt(htlcSatoshis);
    if (htlcLockSat < BigInt(HTLC_MIN_SAT)) {
      throw new Error(`BSV HTLC amount below minimum: ${htlcLockSat} < ${HTLC_MIN_SAT}`);
    }
    const maxHtlcSat = utxoSat - BigInt(FEE_SAT) - BigInt(DUST_SAT);
    if (htlcLockSat > maxHtlcSat) {
      throw new Error(`UTXO cannot fund BSV HTLC amount ${htlcLockSat}; max fundable is ${maxHtlcSat}. Coin selection required.`);
    }
    const htlcScript = Buffer.from(htlcP2SHScriptHex, "hex");
    outputs.push({ satoshis: htlcLockSat, script: htlcScript });
  }

  // Output N (change): remainder back to settlement wallet (if above dust)
  const htlcDeduct = htlcLockSat;
  const changeSat = utxoSat - BigInt(FEE_SAT) - htlcDeduct;
  if (changeSat > BigInt(DUST_SAT)) {
    outputs.push({ satoshis: changeSat, script: p2pkhScript(h160) });
  }

  // ── Sign input ───────────────────────────────────────────────────────────
  const VERSION  = 1;
  const SEQUENCE = 0xffffffff;
  const LOCKTIME = 0;

  const sighash = bip143Sighash({
    version:    VERSION,
    utxo,
    inputIndex: 0,
    lockScript,
    sequence:   SEQUENCE,
    outputs,
    locktime:   LOCKTIME,
    sigHashType: SIGHASH_ALL_FORKID,
  });

  const rawSig = await secp.signAsync(sighash, privKey, { lowS: true }) as unknown as { r: bigint; s: bigint };
  const der    = derEncode({ r: rawSig.r, s: rawSig.s });
  const scriptSig = Buffer.concat([
    varint(der.length + 1), der, Buffer.from([SIGHASH_ALL_FORKID]),
    varint(pubKey.length), pubKey,
  ]);

  // ── Serialise full transaction ────────────────────────────────────────────
  const inputBuf = Buffer.concat([
    txidToLE(utxo.txid),
    uint32LE(utxo.vout),
    varint(scriptSig.length), scriptSig,
    uint32LE(SEQUENCE),
  ]);

  const outputBufs = outputs.map(o =>
    Buffer.concat([uint64LE(o.satoshis), varint(o.script.length), o.script]),
  );

  const rawTx = Buffer.concat([
    uint32LE(VERSION),
    varint(1),           // input count
    inputBuf,
    varint(outputs.length),
    ...outputBufs,
    uint32LE(LOCKTIME),
  ]);

  const rawTxHex = rawTx.toString("hex");

  // ── Compute txid (double-SHA256, reversed) ────────────────────────────────
  const txid = dsha256(rawTx).reverse().toString("hex");

  // ── Broadcast via ARC (with automatic WoC fallback) ──────────────────────
  try {
    const arcResult = await arcBroadcast(rawTxHex);
    logger.info({ txid: arcResult.txid, arcStatus: arcResult.arcStatus, utxo: utxo.txid }, "BSV settlement broadcast SUCCESS");
    return {
      success:   true,
      txid:      arcResult.txid,
      rawTxHex,
      broadcast: true,
      arcTxid:   arcResult.arcTxid,
      arcStatus: arcResult.arcStatus,
    };
  } catch (err) {
    logger.warn({ err }, "BSV broadcast error — falling back to deterministic txid");
    return {
      success: false, txid, rawTxHex, broadcast: false, arcTxid: null, arcStatus: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
