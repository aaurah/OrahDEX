/**
 * bsvHeaderChain.ts — OrahDEX
 *
 * Maintains a chain of PoW-validated BSV block headers in the database.
 *
 * Header acquisition priority:
 *   1. BSV P2P peers (via bsvPeerSync.ts) — peer-sourced, no third-party trust
 *   2. WhatsOnChain REST API — fallback when all peers are unreachable
 *
 * In both cases every header's PoW is validated locally (SHA256d(80-byte header)
 * must equal the claimed blockHash and be <= the target derived from nBits).
 * This ensures the merkleRoot we use for merkle proof verification is not
 * trusted blindly from any external source.
 *
 * DB table: bsv_block_headers
 *
 * Key functions for callers:
 *   getValidatedMerkleRoot(blockHash)  — returns locally-validated merkle root
 *   syncNewHeaders()                   — extends the chain from peers or WoC
 *   ensureHeaderTable()                — idempotent DDL (called at startup)
 */

import { createHash }           from "node:crypto";
import { pool }                 from "@workspace/db";
import { logger }               from "./logger.js";
import { BSV_NET }              from "./bsvNetworkConfig.js";
import { fetchHeadersFromPeers } from "./bsvPeerSync.js";

const TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidatedHeader {
  hash:       string;    // display order (reversed SHA256d of raw header)
  height:     number;
  prevHash:   string;    // display order
  merkleRoot: string;    // display order
  bits:       number;    // nBits
  nonce:      number;
  timestamp:  number;    // Unix seconds
  source:     "peer" | "woc";
}

// ── PoW helpers ───────────────────────────────────────────────────────────────

function sha256d(data: Buffer): Buffer {
  const h1 = createHash("sha256").update(data).digest();
  return createHash("sha256").update(h1).digest();
}

/** Expand nBits into a 32-byte target buffer (little-endian). */
function expandTarget(nBits: number): Buffer {
  const target = Buffer.alloc(32, 0);
  const exp    = nBits >> 24;
  const coeff  = nBits & 0x7fffff;
  // SHA256d returns bytes in little-endian (internal Bitcoin) order: byte 0 = LSB.
  // In this representation target = coeff * 256^(exp-3), so:
  //   byte[exp-3] = coeff LSB
  //   byte[exp-2] = coeff middle
  //   byte[exp-1] = coeff MSB
  // (NOT 32-exp, which is the big-endian slot — that would be wrong here.)
  if (exp >= 3 && exp <= 32) {
    const lsb = exp - 3;
    if (lsb + 2 < 32) {
      target[lsb]     = coeff & 0xff;
      target[lsb + 1] = (coeff >> 8)  & 0xff;
      target[lsb + 2] = (coeff >> 16) & 0xff;
    }
  }
  return target;
}

/** Returns true if 32-byte hash (LE) is strictly greater than target (LE). */
function hashGT(hash: Buffer, target: Buffer): boolean {
  for (let i = 31; i >= 0; i--) {
    if ((hash[i] ?? 0) > (target[i] ?? 0)) return true;
    if ((hash[i] ?? 0) < (target[i] ?? 0)) return false;
  }
  return false;
}

// ── Raw header parsing + PoW validation ──────────────────────────────────────

/**
 * Parse and PoW-validate a raw 80-byte header buffer.
 * Returns null if the buffer is not 80 bytes or fails the PoW check.
 */
export function parseAndValidateRawHeader(
  raw: Buffer,
): Omit<ValidatedHeader, "height" | "source"> | null {
  if (raw.length !== 80) return null;

  const hashBuf = sha256d(raw);
  const nBits   = raw.readUInt32LE(72);
  const target  = expandTarget(nBits);
  if (hashGT(hashBuf, target)) return null;  // PoW check failed

  const hash = Buffer.from(hashBuf).reverse().toString("hex");

  const prevBuf:  Buffer = Buffer.from(raw.subarray(4,  36)).reverse();
  const merkBuf:  Buffer = Buffer.from(raw.subarray(36, 68)).reverse();
  const prevHash  = prevBuf.toString("hex");
  const merkleRoot = merkBuf.toString("hex");
  const timestamp  = raw.readUInt32LE(68);
  const bits       = nBits;
  const nonce      = raw.readUInt32LE(76);

  return { hash, prevHash, merkleRoot, bits, nonce, timestamp };
}

// ── DB operations ─────────────────────────────────────────────────────────────

export async function ensureHeaderTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bsv_block_headers (
      hash         TEXT    PRIMARY KEY,
      height       INT     NOT NULL,
      prev_hash    TEXT    NOT NULL,
      merkle_root  TEXT    NOT NULL,
      bits         BIGINT  NOT NULL,
      nonce        BIGINT  NOT NULL,
      block_time   INT     NOT NULL,
      source       TEXT    NOT NULL DEFAULT 'woc',
      indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS bsv_block_headers_height_idx ON bsv_block_headers (height)`,
  );
}

async function storeHeader(h: ValidatedHeader): Promise<void> {
  await pool.query(
    `INSERT INTO bsv_block_headers
       (hash, height, prev_hash, merkle_root, bits, nonce, block_time, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (hash) DO NOTHING`,
    [h.hash, h.height, h.prevHash, h.merkleRoot, h.bits, h.nonce, h.timestamp, h.source],
  );
}

export async function getHeaderByHash(blockHash: string): Promise<ValidatedHeader | null> {
  const { rows } = await pool.query<{
    hash: string; height: number; prev_hash: string; merkle_root: string;
    bits: string; nonce: string; block_time: number; source: string;
  }>(
    `SELECT hash, height, prev_hash, merkle_root, bits::text, nonce::text, block_time, source
     FROM bsv_block_headers WHERE hash = $1`,
    [blockHash],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    hash:       r.hash,
    height:     r.height,
    prevHash:   r.prev_hash,
    merkleRoot: r.merkle_root,
    bits:       Number(r.bits),
    nonce:      Number(r.nonce),
    timestamp:  r.block_time,
    source:     r.source as "peer" | "woc",
  };
}

export async function getChainTip(): Promise<ValidatedHeader | null> {
  const { rows } = await pool.query<{
    hash: string; height: number; prev_hash: string; merkle_root: string;
    bits: string; nonce: string; block_time: number; source: string;
  }>(
    `SELECT hash, height, prev_hash, merkle_root, bits::text, nonce::text, block_time, source
     FROM bsv_block_headers ORDER BY height DESC LIMIT 1`,
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    hash:       r.hash,
    height:     r.height,
    prevHash:   r.prev_hash,
    merkleRoot: r.merkle_root,
    bits:       Number(r.bits),
    nonce:      Number(r.nonce),
    timestamp:  r.block_time,
    source:     r.source as "peer" | "woc",
  };
}

// ── WoC fallback: fetch and PoW-validate a specific block ────────────────────

interface WocBlockInfo {
  hash:              string;
  height:            number;
  version:           number;
  previousblockhash: string;
  merkleroot:        string;
  time:              number;
  bits:              string;  // hex, e.g. "1a4b6b6b"
  nonce:             number;
}

async function fetchAndValidateFromWoc(blockHash: string): Promise<ValidatedHeader | null> {
  try {
    const ctl   = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res   = await fetch(
      `${BSV_NET.wocBase}/block/${encodeURIComponent(blockHash)}`,
      { signal: ctl.signal, headers: { "User-Agent": "OrahDEX/1.0" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;

    const blk = await res.json() as WocBlockInfo;
    if (!blk?.hash || typeof blk.height !== "number" || !blk.merkleroot) return null;

    const nBits = parseInt(blk.bits, 16);

    // Reconstruct the canonical 80-byte header
    const raw = Buffer.alloc(80, 0);
    let   off = 0;
    raw.writeInt32LE(blk.version, off);                      off += 4;
    // prev_hash: display order (from WoC) → internal (reversed) for the header
    const prevBuf: Buffer = Buffer.from(
      blk.previousblockhash ??
        "0000000000000000000000000000000000000000000000000000000000000000",
      "hex",
    );
    prevBuf.reverse().copy(raw, off);                        off += 32;
    // merkle_root: same conversion
    const merkBuf: Buffer = Buffer.from(blk.merkleroot, "hex");
    merkBuf.reverse().copy(raw, off);                        off += 32;
    raw.writeUInt32LE(blk.time, off);                        off += 4;
    raw.writeUInt32LE(nBits, off);                           off += 4;
    raw.writeUInt32LE(blk.nonce, off);

    // PoW check 1: SHA256d(raw) must equal the claimed blockHash
    const hashBuf  = sha256d(raw);
    const computed = Buffer.from(hashBuf).reverse().toString("hex");
    if (computed !== blk.hash) {
      logger.warn({ claimed: blk.hash, computed }, "bsvHeaderChain: WoC block hash mismatch");
      return null;
    }

    // PoW check 2: hash must be <= difficulty target derived from nBits
    const target = expandTarget(nBits);
    if (hashGT(hashBuf, target)) {
      logger.warn({ hash: blk.hash }, "bsvHeaderChain: WoC header fails nBits PoW check");
      return null;
    }

    return {
      hash:       blk.hash,
      height:     blk.height,
      prevHash:   blk.previousblockhash ?? "0".repeat(64),
      merkleRoot: blk.merkleroot,
      bits:       nBits,
      nonce:      blk.nonce,
      timestamp:  blk.time,
      source:     "woc",
    };
  } catch (err) {
    logger.debug({ err, blockHash }, "bsvHeaderChain: WoC fallback failed");
    return null;
  }
}

// ── Header chain sync (peer-first, WoC fallback) ─────────────────────────────

/**
 * Extend the local header chain with any new blocks from the P2P network.
 * Skips if the local tip is null (bootstraps via on-demand WoC fetches instead).
 *
 * Chain integrity guarantees applied to every batch from peers:
 *  1. PoW validation — SHA256d(80-byte header) ≤ expandTarget(nBits).
 *  2. prevHash linkage — each header's prevHash must equal the preceding
 *     accepted header's hash.  The first header in the batch must chain onto
 *     our stored tip.  The entire batch is discarded on first mismatch.
 *
 * @returns  Number of new headers stored.
 */
export async function syncNewHeaders(): Promise<number> {
  const tip = await getChainTip();
  if (!tip) {
    // No headers yet — let on-demand WoC fetches bootstrap the chain.
    return 0;
  }

  // Try P2P peers first
  const peerRaw = await fetchHeadersFromPeers(tip.hash);
  if (peerRaw === null) {
    // All peers unavailable — skip this tick; WoC bootstrap handles on-demand needs
    return 0;
  }
  if (peerRaw.length === 0) {
    return 0; // already at tip
  }

  let stored     = 0;
  let nextHeight = tip.height + 1;
  // Chain-linkage cursor: the first peer header's prevHash must equal this.
  let expectPrevHash = tip.hash;

  for (const raw of peerRaw) {
    const parsed = parseAndValidateRawHeader(raw);
    if (!parsed) {
      logger.warn(
        { at: nextHeight },
        "bsvHeaderChain: P2P header failed PoW — stopping batch",
      );
      break;
    }

    // ── Chain linkage check ────────────────────────────────────────────────
    // Each header must reference exactly the preceding accepted header.
    // If a peer feeds a non-contiguous or forked batch, we stop immediately.
    if (parsed.prevHash !== expectPrevHash) {
      logger.warn(
        { at: nextHeight, expected: expectPrevHash, got: parsed.prevHash },
        "bsvHeaderChain: P2P chain linkage broken — discarding rest of batch",
      );
      break;
    }

    await storeHeader({ ...parsed, height: nextHeight, source: "peer" });
    expectPrevHash = parsed.hash;   // next header must chain onto this one
    nextHeight++;
    stored++;
  }

  if (stored > 0) {
    logger.info({ count: stored, source: "peer", tipHeight: nextHeight - 1 },
      "bsvHeaderChain: synced headers from P2P");
  }
  return stored;
}

// ── Public: get validated merkle root for a block ────────────────────────────

/**
 * Returns the locally PoW-validated merkle root for the given block hash.
 *
 * Lookup order:
 *   1. Local header chain (peer-sourced or previously WoC-validated)
 *   2. WhatsOnChain REST API with local PoW validation
 *
 * Returns null if the block cannot be validated from any source.
 *
 * IMPORTANT: The returned merkleRoot is taken from our locally-validated header,
 * NOT from the WoC merkle proof response field — this is the core SPV trust model.
 */
export async function getValidatedMerkleRoot(blockHash: string): Promise<string | null> {
  // 1. Local chain first (peer-sourced preferred)
  const local = await getHeaderByHash(blockHash);
  if (local) return local.merkleRoot;

  // 2. WoC fallback — but we validate the PoW ourselves
  const header = await fetchAndValidateFromWoc(blockHash);
  if (!header) return null;

  await storeHeader(header);
  logger.info({ blockHash, height: header.height, source: "woc" },
    "bsvHeaderChain: PoW-validated header stored via WoC fallback");
  return header.merkleRoot;
}
