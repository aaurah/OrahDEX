/**
 * bsvSpvVerifier.ts — OrahDEX
 *
 * SPV (Simplified Payment Verification) utilities for BSV deposits.
 *
 * Uses WhatsOnChain as the data source for:
 *   - Block headers / merkle proofs (GET /tx/{txid}/merkleproof)
 *   - Address transaction history  (GET /address/{addr}/history)
 *   - Full transaction data         (GET /tx/hash/{txid})
 *
 * merkle proof verification follows the TSC (BRC-10) standard:
 *   https://tsc.bsvblockchain.org/standards/transaction-merkle-proof/
 *
 * Proof nodes are in display byte order (reversed vs. internal hashing order).
 * Special node value "*" means the sibling is a duplicate of the current hash
 * (used when a tree level has an odd number of entries).
 */

import { createHash } from "node:crypto";
import { BSV_NET } from "./bsvNetworkConfig.js";
import { logger } from "./logger.js";

const TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WocMerkleProof {
  blockHash:  string;
  merkleRoot: string;
  index:      number;
  txOrId:     string;
  nodes:      string[];
  proofType?: string;
}

export interface WocAddressHistoryEntry {
  tx_hash: string;
  height:  number;  // 0 = mempool
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sha256d(data: Buffer): Buffer {
  const h1 = createHash("sha256").update(data).digest();
  return createHash("sha256").update(h1).digest();
}

async function wocFetch(path: string): Promise<unknown | null> {
  try {
    const ctl   = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res   = await fetch(`${BSV_NET.wocBase}${path}`, {
      signal:  ctl.signal,
      headers: { "User-Agent": "OrahDEX/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a TSC merkle branch proof.
 *
 * All string parameters are in display byte order (big-endian hex) as returned
 * by the WhatsOnChain API. Internally we convert to little-endian for hashing.
 *
 * @returns true if the proof is valid and the txid is included in the block
 *          with the given merkleRoot.
 */
export function verifyMerkleProof(
  txid:       string,    // transaction id, display order
  index:      number,    // leaf position in the block (0-based)
  nodes:      string[],  // sibling hashes in display order; "*" = duplicate
  merkleRoot: string,    // merkle root from the block header, display order
): boolean {
  try {
    // Convert from display (big-endian) to internal (little-endian) byte order.
    // We call .reverse() for its in-place side-effect and ignore the typed return
    // to avoid Buffer<ArrayBufferLike> vs Buffer<ArrayBuffer> TS strict errors.
    let current: Buffer = Buffer.from(txid, "hex");
    current.reverse();

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const bit  = (index >> i) & 1;

      if (node === "*") {
        // Odd-length level: sibling is a duplicate of current
        current = sha256d(Buffer.concat([current, current]));
      } else {
        const sibling: Buffer = Buffer.from(node, "hex");
        sibling.reverse();
        if (bit === 0) {
          current = sha256d(Buffer.concat([current, sibling]));
        } else {
          current = sha256d(Buffer.concat([sibling, current]));
        }
      }
    }

    // Convert back to display order for comparison
    const resultBuf: Buffer = Buffer.from(current);
    resultBuf.reverse();
    const computed = resultBuf.toString("hex");
    return computed === merkleRoot;
  } catch (err) {
    logger.warn({ err, txid }, "bsvSpvVerifier: verifyMerkleProof threw");
    return false;
  }
}

/**
 * Fetch the TSC merkle proof for txid from WhatsOnChain.
 * Returns null if not yet confirmed or on network error.
 */
export async function fetchMerkleProof(txid: string): Promise<WocMerkleProof | null> {
  const data = await wocFetch(`/tx/${txid}/merkleproof`);
  if (!data || typeof data !== "object") return null;
  const p = data as Record<string, unknown>;
  if (
    typeof p.merkleRoot !== "string" ||
    typeof p.index      !== "number" ||
    !Array.isArray(p.nodes)
  ) return null;
  return {
    blockHash:  (p.blockHash  as string) ?? "",
    merkleRoot: p.merkleRoot  as string,
    index:      p.index       as number,
    txOrId:     (p.txOrId     as string) ?? txid,
    nodes:      p.nodes       as string[],
    proofType:  (p.proofType  as string) ?? "branch",
  };
}

/**
 * Fetch the block height for a given block hash.
 * Returns null on error.
 */
export async function fetchBlockHeight(blockHash: string): Promise<number | null> {
  const data = await wocFetch(`/block/${encodeURIComponent(blockHash)}/header`);
  if (!data || typeof data !== "object") return null;
  const h = (data as Record<string, unknown>).height;
  return typeof h === "number" ? h : null;
}

/**
 * Fetch the amount (in satoshis) that a transaction sends to depositAddress.
 * Returns 0 if the tx is not found, or the address receives nothing.
 */
export async function fetchTxAmountToAddress(
  txid:           string,
  depositAddress: string,
): Promise<number> {
  const data = await wocFetch(`/tx/hash/${txid}`);
  if (!data || typeof data !== "object") return 0;
  const tx = data as { vout?: Array<{ value: number; scriptPubKey?: { addresses?: string[] } }> };
  if (!Array.isArray(tx.vout)) return 0;
  let totalSat = 0;
  for (const out of tx.vout) {
    if (out?.scriptPubKey?.addresses?.includes(depositAddress)) {
      totalSat += Math.round((out.value ?? 0) * 1e8);
    }
  }
  return totalSat;
}

/**
 * Fetch address transaction history from WhatsOnChain.
 * Returns an array of { tx_hash, height } — height 0 = mempool.
 */
export async function fetchAddressHistory(address: string): Promise<WocAddressHistoryEntry[]> {
  const data = await wocFetch(`/address/${encodeURIComponent(address)}/history`);
  if (!Array.isArray(data)) return [];
  return (data as WocAddressHistoryEntry[]).filter(e => e && typeof e.tx_hash === "string");
}
