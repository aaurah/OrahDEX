/**
 * bsvPeerSync.ts — OrahDEX
 *
 * Downloads BSV block headers directly from BSV P2P network seeds using the
 * Bitcoin SV P2P protocol (port 8333, message framing identical to Bitcoin).
 *
 * BSV mainnet magic: 0xe3, 0xe1, 0xf3, 0xe8  (from bitcoin-sv/chainparams.cpp)
 *
 * Handshake:
 *   us → version
 *   peer → version + verack
 *   us → verack
 *   us → getheaders  (with our chain tip as locator)
 *   peer → headers   (up to 2000 raw 80-byte headers)
 *
 * On failure (DNS error, connection refused, timeout) returns null so
 * callers can fall back to the WhatsOnChain REST API.
 */

import net        from "node:net";
import dns        from "node:dns/promises";
import { randomBytes, createHash } from "node:crypto";
import { logger } from "./logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAGIC          = Buffer.from([0xe3, 0xe1, 0xf3, 0xe8]);
const PORT           = 8333;
const CONNECT_MS     = 6_000;
const RESPONSE_MS    = 14_000;
const PROTOCOL_VER   = 70015;

const SEEDS = [
  "seed.bitcoinsv.io",
  "seed.cascharia.com",
  "seed.bsvb.tech",
  "seed.satoshisvision.network",
];

// ── Protocol helpers ──────────────────────────────────────────────────────────

function sha256d(data: Buffer): Buffer {
  const h1 = createHash("sha256").update(data).digest();
  return createHash("sha256").update(h1).digest();
}

function writeVarint(n: number): Buffer {
  if (n < 0xfd) { const b = Buffer.alloc(1); b[0] = n; return b; }
  if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b;
}

function readVarint(buf: Buffer, off: number): { value: number; size: number } {
  const v = buf[off];
  if (v === undefined) return { value: 0, size: 1 };
  if (v < 0xfd) return { value: v, size: 1 };
  if (v === 0xfd) return { value: buf.readUInt16LE(off + 1), size: 3 };
  if (v === 0xfe) return { value: buf.readUInt32LE(off + 1), size: 5 };
  return { value: Number(buf.readBigUInt64LE(off + 1)), size: 9 };
}

function buildMsg(command: string, payload: Buffer): Buffer {
  const cmdBuf = Buffer.alloc(12, 0);
  cmdBuf.write(command, 0, "ascii");
  const chk = sha256d(payload).subarray(0, 4);
  const hdr = Buffer.alloc(24);
  MAGIC.copy(hdr, 0);
  cmdBuf.copy(hdr, 4);
  hdr.writeUInt32LE(payload.length, 16);
  chk.copy(hdr, 20);
  return Buffer.concat([hdr, payload]);
}

function makeVersionPayload(): Buffer {
  const ua    = "/OrahDEX:1.0/";
  const uaBuf = Buffer.from(ua, "ascii");
  const uaVi  = writeVarint(uaBuf.length);
  const size  = 4 + 8 + 8 + 26 + 26 + 8 + uaVi.length + uaBuf.length + 4;
  const buf   = Buffer.alloc(size, 0);
  let   off   = 0;
  buf.writeInt32LE(PROTOCOL_VER, off);                                off += 4;
  // services = 0 (no specific services)
  off += 8;
  // timestamp
  buf.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), off);    off += 8;
  // addr_recv (26 bytes): services(8) + ipv6mapped(16) + port(2)
  off += 26;
  // addr_from (26 bytes)
  off += 26;
  // nonce (8 random bytes)
  randomBytes(8).copy(buf, off);                                      off += 8;
  // user-agent
  uaVi.copy(buf, off);  off += uaVi.length;
  uaBuf.copy(buf, off); off += uaBuf.length;
  // start_height
  buf.writeInt32LE(0, off);
  return buf;
}

function makeGetHeadersPayload(locatorHash: string | null): Buffer {
  // If we have a known tip, ask for headers AFTER it; otherwise send 0 hashes
  // (peers will respond from their chain tip when locator is empty).
  const hashCount = locatorHash ? 1 : 0;
  const vi   = writeVarint(hashCount);
  const size = 4 + vi.length + hashCount * 32 + 32;
  const buf  = Buffer.alloc(size, 0);
  let   off  = 0;
  buf.writeUInt32LE(PROTOCOL_VER, off); off += 4;
  vi.copy(buf, off);                    off += vi.length;
  if (locatorHash) {
    // locatorHash is in display order; convert to internal (little-endian)
    const h: Buffer = Buffer.from(locatorHash, "hex");
    h.reverse();
    h.copy(buf, off);
    off += 32;
  }
  // stop_hash = 32 zero bytes (get as many as possible)
  // buf is already zero-initialized
  return buf;
}

// ── Message stream (handles fragmented TCP delivery) ─────────────────────────

class MsgStream {
  private buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
  }

  next(): { command: string; payload: Buffer } | null {
    // Resync if magic is not at the start
    if (this.buf.length >= 4 && !this.buf.subarray(0, 4).equals(MAGIC)) {
      const idx = this.buf.indexOf(MAGIC, 1);
      if (idx === -1) { this.buf = Buffer.alloc(0); return null; }
      this.buf = this.buf.subarray(idx);
    }
    if (this.buf.length < 24) return null;

    const len = this.buf.readUInt32LE(16);
    if (len > 8_000_000) { this.buf = Buffer.alloc(0); return null; } // sanity cap

    if (this.buf.length < 24 + len) return null;

    const cmd     = this.buf.subarray(4, 16).toString("ascii").replace(/\0+$/, "");
    const payload = Buffer.from(this.buf.subarray(24, 24 + len));
    this.buf      = this.buf.subarray(24 + len);
    return { command: cmd, payload };
  }
}

// ── Parse a headers payload ───────────────────────────────────────────────────

function parseHeadersPayload(payload: Buffer): Buffer[] {
  if (payload.length < 1) return [];
  const { value: count, size } = readVarint(payload, 0);
  const hdrs: Buffer[] = [];
  let   off            = size;
  for (let i = 0; i < count && off + 81 <= payload.length; i++) {
    hdrs.push(Buffer.from(payload.subarray(off, off + 80)));
    off += 81; // 80-byte header + 1-byte tx_count varint (always 0x00)
  }
  return hdrs;
}

// ── Single-peer attempt ───────────────────────────────────────────────────────

async function tryPeer(ip: string, locator: string | null): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const stream       = new MsgStream();
    let sentGetheaders = false;

    const socket = net.createConnection({ host: ip, port: PORT });
    socket.setTimeout(CONNECT_MS);

    const fail = (reason: string) => { socket.destroy(); reject(new Error(reason)); };
    const connectTimer = setTimeout(() => fail("connect timeout"), CONNECT_MS);

    socket.once("connect", () => {
      clearTimeout(connectTimer);
      socket.setTimeout(RESPONSE_MS);
      socket.write(buildMsg("version", makeVersionPayload()));
    });

    socket.on("timeout", () => fail("response timeout"));
    socket.on("error",   err => reject(err));
    socket.on("close",   () => reject(new Error("connection closed")));

    socket.on("data", (chunk: Buffer) => {
      stream.push(chunk);
      let msg: ReturnType<MsgStream["next"]>;
      while ((msg = stream.next()) !== null) {
        switch (msg.command) {
          case "version":
            socket.write(buildMsg("verack", Buffer.alloc(0)));
            break;
          case "verack":
            if (!sentGetheaders) {
              sentGetheaders = true;
              socket.write(buildMsg("getheaders", makeGetHeadersPayload(locator)));
            }
            break;
          case "headers": {
            const hdrs = parseHeadersPayload(msg.payload);
            socket.destroy();
            resolve(hdrs);
            return;
          }
          case "ping":
            socket.write(buildMsg("pong", msg.payload));
            break;
          default:
            break; // ignore sendheaders, addr, feefilter, etc.
        }
      }
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt to download block headers from BSV P2P network seeds.
 *
 * @param locatorHash  Display-order block hash of our chain tip; null to start
 *                     from the peer's latest tip without a locator.
 * @returns  Array of raw 80-byte header buffers in ascending order,
 *           or null if all seeds are unreachable.
 */
export async function fetchHeadersFromPeers(
  locatorHash: string | null,
): Promise<Buffer[] | null> {
  for (const seed of SEEDS) {
    let ips: string[];
    try {
      const addrs = await dns.lookup(seed, { family: 4, all: true });
      ips = (addrs as { address: string }[]).map(a => a.address).slice(0, 2);
    } catch {
      logger.debug({ seed }, "BSV P2P: DNS lookup failed");
      continue;
    }

    for (const ip of ips) {
      try {
        const hdrs = await tryPeer(ip, locatorHash);
        if (hdrs.length > 0) {
          logger.info({ seed, ip, count: hdrs.length }, "BSV P2P: headers received");
          return hdrs;
        }
        logger.debug({ seed, ip }, "BSV P2P: peer returned 0 headers (already at tip)");
        return [];
      } catch (err) {
        logger.debug({ seed, ip, err: (err as Error).message }, "BSV P2P: peer failed");
      }
    }
  }

  logger.info("BSV P2P: all seeds unreachable — WoC fallback will be used");
  return null;
}
