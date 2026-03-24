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
import { hash160, type Utxo } from "./bsvWallet.js";
import { logger } from "./logger.js";

const WOC_BROADCAST = "https://api.whatsonchain.com/v1/bsv/main/tx/raw";
const FEE_SAT       = 1500;   // 1500 satoshis ≈ generous for a 2-output OP_RETURN tx
const DUST_SAT      = 546;    // minimum change output

/* ── Buffer / encoding helpers ──────────────────────────────────────────── */

function uint32LE(n: number): Buffer {
  const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b;
}
function uint64LE(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
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
  outputs:     Array<{ satoshis: number; script: Buffer }>;
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

/* ── Main build & broadcast function ───────────────────────────────────── */

export interface BroadcastParams {
  privKeyHex:      string;    // 32-byte private key as hex
  changeAddress:   string;    // settlement wallet address (change recipient)
  utxo:            Utxo;      // UTXO to spend
  opReturnPayload: string;    // UTF-8 trade payload
}

export interface BroadcastResult {
  success:   boolean;
  txid:      string;
  rawTxHex:  string;
  broadcast: boolean;          // true if actually sent to BSV network
  error?:    string;
}

export async function broadcastSettlement(params: BroadcastParams): Promise<BroadcastResult> {
  const { privKeyHex, utxo, opReturnPayload } = params;

  const privKey = Buffer.from(privKeyHex, "hex");
  const pubKey  = Buffer.from(secp.getPublicKey(privKey, true));         // 33 bytes compressed
  const h160    = hash160(pubKey);
  const lockScript = p2pkhScript(h160);   // P2PKH locking script for the input

  // ── Build outputs ────────────────────────────────────────────────────────
  const payload = Buffer.from(opReturnPayload, "utf8");
  const opRetScript = opReturnScript(payload);

  const outputs: Array<{ satoshis: number; script: Buffer }> = [
    { satoshis: 0, script: opRetScript },  // OP_RETURN (data carrier)
  ];

  const changeSat = utxo.satoshis - FEE_SAT;
  if (changeSat > DUST_SAT) {
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

  const rawSig = await secp.signAsync(sighash, privKey, { lowS: true });
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

  // ── Broadcast to WhatsOnChain ─────────────────────────────────────────────
  try {
    const res = await fetch(WOC_BROADCAST, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "OrahDEX/1.0" },
      body:    JSON.stringify({ txhex: rawTxHex }),
      signal:  AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const body = await res.text();
      const broadcastedTxid = body.replace(/"/g, "").trim();
      logger.info({ txid: broadcastedTxid || txid, utxo: utxo.txid }, "BSV settlement broadcast SUCCESS");
      return { success: true, txid: broadcastedTxid || txid, rawTxHex, broadcast: true };
    }

    const errText = await res.text().catch(() => "unknown");
    logger.warn({ status: res.status, errText }, "BSV broadcast rejected by WoC — falling back to deterministic txid");
    return { success: false, txid, rawTxHex, broadcast: false, error: `WoC HTTP ${res.status}: ${errText}` };
  } catch (err) {
    logger.warn({ err }, "BSV broadcast network error — falling back to deterministic txid");
    return {
      success: false, txid, rawTxHex, broadcast: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
