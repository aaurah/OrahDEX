/**
 * Wallet helper routes.
 *
 * POST /api/wallet/derive-from-key
 *   Body:    { family: string, privateKey: string }
 *   Returns: { address: string }
 *
 * Supported families: btc, bsv, bch, ltc, doge (WIF), tron (hex), solana (hex)
 * The key is used only to compute the public address — it is never stored or logged.
 */

import { Router } from "express";
import { createHash } from "crypto";
import * as secp from "@noble/secp256k1";
import { getPublicKeyAsync } from "@noble/ed25519";
import { keccak_256 } from "@noble/hashes/sha3.js";

const router = Router();

// ─── Base58 ──────────────────────────────────────────────────────────────────

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58Encode(data: Uint8Array): string {
  let n = 0n;
  for (const b of data) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of data) { if (b !== 0) break; s = "1" + s; }
  return s;
}

function b58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  let leading = 0;
  for (const c of str) { if (c !== "1") break; leading++; }
  const hex = n.toString(16);
  const raw = Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
  return new Uint8Array([...Buffer.alloc(leading), ...raw]);
}

function b58CheckEncode(version: number, payload: Uint8Array): string {
  const versioned = new Uint8Array([version, ...payload]);
  const checksum = sha256d(versioned).slice(0, 4);
  return b58Encode(new Uint8Array([...versioned, ...checksum]));
}

function b58CheckDecode(str: string): { version: number; payload: Uint8Array } {
  const bytes = b58Decode(str);
  const payload = bytes.slice(0, -4);
  const check   = bytes.slice(-4);
  const expected = sha256d(payload).slice(0, 4);
  if (!check.every((b, i) => b === expected[i])) throw new Error("Invalid WIF checksum");
  return { version: payload[0], payload: payload.slice(1) };
}

// ─── Hash helpers ────────────────────────────────────────────────────────────

function sha256(data: Uint8Array | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function sha256d(data: Uint8Array | Buffer): Buffer {
  return sha256(sha256(data));
}

function ripemd160(data: Buffer): Buffer {
  return createHash("ripemd160").update(data).digest();
}

function hash160(data: Uint8Array): Uint8Array {
  return new Uint8Array(ripemd160(sha256(data)));
}

// ─── Bech32 (BTC native segwit P2WPKH: bc1q…) ────────────────────────────────

const B32_CHARSET   = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const B32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function b32Polymod(v: number[]): number {
  let c = 1;
  for (const d of v) {
    const c0 = c >> 25;
    c = ((c & 0x1ffffff) << 5) ^ d;
    for (let i = 0; i < 5; i++) {
      if ((c0 >> i) & 1) c ^= B32_GENERATOR[i];
    }
  }
  return c;
}

function b32HrpExpand(hrp: string): number[] {
  return [...hrp].map(c => c.charCodeAt(0) >> 5).concat(0).concat([...hrp].map(c => c.charCodeAt(0) & 31));
}

function convertBits(input: number[], from: number, to: number, pad = true): number[] {
  let acc = 0, bits = 0;
  const result: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of input) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) result.push((acc << (to - bits)) & maxv);
  return result;
}

function bech32Encode(hrp: string, data: number[]): string {
  const values   = b32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod      = b32Polymod(values) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map(i => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + data.concat(checksum).map(d => B32_CHARSET[d]).join("");
}

function p2wpkhAddress(hrp: string, hash20: Uint8Array): string {
  return bech32Encode(hrp, [0, ...convertBits(Array.from(hash20), 8, 5, true)]);
}

// ─── CashAddr (BCH: bitcoincash:q…) ──────────────────────────────────────────

function cashPolymod(v: number[]): bigint {
  const G = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let c = 1n;
  for (const d of v) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i++) {
      if ((c0 >> BigInt(i)) & 1n) c ^= G[i];
    }
  }
  return c ^ 1n;
}

function cashAddrEncode(hash20: Uint8Array): string {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const prefix  = "bitcoincash";
  // version byte 0x00 = P2PKH, 20-byte hash
  const data5   = convertBits([0x00, ...Array.from(hash20)], 8, 5, true);
  const pfxExp  = [...prefix].map(c => c.charCodeAt(0) & 0x1f).concat([0]);
  const mod     = cashPolymod([...pfxExp, ...data5, 0, 0, 0, 0, 0, 0, 0, 0]);
  const chk: number[] = [];
  for (let i = 7; i >= 0; i--) chk.push(Number((mod >> BigInt(i * 5)) & 0x1fn));
  return prefix + ":" + [...data5, ...chk].map(d => CHARSET[d]).join("");
}

// ─── WIF decode ───────────────────────────────────────────────────────────────
// BTC/BSV/BCH version 0x80 | LTC 0xB0 | DOGE 0x9E

function decodeWIF(wif: string): Uint8Array {
  const { version, payload } = b58CheckDecode(wif);
  const allowed = [0x80, 0xb0, 0x9e];
  if (!allowed.includes(version)) throw new Error(`Unknown WIF version byte 0x${version.toString(16)}`);
  const privKey = payload.length === 33 ? payload.slice(0, 32) : payload;
  if (privKey.length !== 32) throw new Error("WIF private key must be 32 bytes");
  return privKey;
}

// ─── Per-chain address derivation ─────────────────────────────────────────────

function fromWIF(wif: string) {
  const priv   = decodeWIF(wif);
  const pubKey = secp.getPublicKey(priv, true); // compressed 33 bytes
  const h160   = hash160(pubKey);
  return { priv, pubKey, h160 };
}

function deriveBTC(wif: string)  { const { h160 } = fromWIF(wif); return p2wpkhAddress("bc",   h160); }
function deriveBSV(wif: string)  { const { h160 } = fromWIF(wif); return b58CheckEncode(0x00, h160); }
function deriveBCH(wif: string)  { const { h160 } = fromWIF(wif); return cashAddrEncode(h160); }
function deriveLTC(wif: string)  { const { h160 } = fromWIF(wif); return b58CheckEncode(0x30, h160); }
function deriveDOGE(wif: string) { const { h160 } = fromWIF(wif); return b58CheckEncode(0x1e, h160); }

function deriveTRON(hexKey: string): string {
  const raw = hexKey.replace(/^0x/, "");
  if (raw.length !== 64) throw new Error("Tron private key must be 32 bytes (64 hex chars)");
  const priv     = Buffer.from(raw, "hex");
  const pubKey   = secp.getPublicKey(priv, false); // uncompressed 65 bytes
  const pubData  = pubKey.slice(1);                     // drop 0x04 → 64 bytes
  const kHash    = keccak_256(pubData);                 // 32 bytes
  const addr20   = new Uint8Array(kHash.slice(-20));
  return b58CheckEncode(0x41, addr20);                  // T... address
}

async function deriveSOL(hexOrB58: string): Promise<string> {
  const raw = hexOrB58.replace(/^0x/, "");
  let seed: Uint8Array;
  if (/^[0-9a-fA-F]+$/.test(raw)) {
    // hex: 32 bytes (64 hex) or 64 bytes (128 hex) — take first 32
    const buf = Buffer.from(raw, "hex");
    if (buf.length !== 32 && buf.length !== 64) throw new Error("SOL hex key must be 32 or 64 bytes");
    seed = new Uint8Array(buf.slice(0, 32));
  } else {
    // base58-encoded 64-byte keypair (Phantom / Solflare export)
    const raw64 = b58Decode(hexOrB58);
    if (raw64.length !== 64) throw new Error("SOL base58 key must decode to 64 bytes");
    seed = raw64.slice(0, 32);
  }
  const pubKey = await getPublicKeyAsync(seed); // 32 bytes
  return b58Encode(pubKey);
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/derive-from-key", async (req, res) => {
  try {
    const { family, privateKey } = req.body as { family?: string; privateKey?: string };
    if (!family || !privateKey) {
      return res.status(400).json({ error: "family and privateKey are required" });
    }
    const pk = (privateKey as string).trim();
    let address: string;

    switch (family) {
      case "btc":    address = deriveBTC(pk);        break;
      case "bsv":    address = deriveBSV(pk);        break;
      case "bch":    address = deriveBCH(pk);        break;
      case "ltc":    address = deriveLTC(pk);        break;
      case "doge":   address = deriveDOGE(pk);       break;
      case "tron":   address = deriveTRON(pk);       break;
      case "solana": address = await deriveSOL(pk);  break;
      default:
        return res.status(400).json({ error: `Private key import is not yet supported for ${family}. Please paste the public address instead.` });
    }

    return res.json({ address });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Failed to derive address from key" });
  }
});

// ─── EVM on-chain tx history proxy ───────────────────────────────────────────
// Browser → our API → Etherscan-compatible explorers (avoids CORS/mobile block)

// Blockscout — open-source, no API key needed, same Etherscan-compatible query format
const EVM_EXPLORERS: Record<number, { api: string; url: string; name: string; symbol: string; color: string }> = {
  1:     { api: "https://eth.blockscout.com/api",      url: "https://eth.blockscout.com/tx/",      name: "Ethereum",  symbol: "ETH",  color: "#8B5CF6" },
  56:    { api: "https://bsc.blockscout.com/api",      url: "https://bsc.blockscout.com/tx/",      name: "BNB Chain", symbol: "BNB",  color: "#F59E0B" },
  137:   { api: "https://polygon.blockscout.com/api",  url: "https://polygon.blockscout.com/tx/",  name: "Polygon",   symbol: "MATIC",color: "#8B5CF6" },
  42161: { api: "https://arbitrum.blockscout.com/api", url: "https://arbitrum.blockscout.com/tx/", name: "Arbitrum",  symbol: "ETH",  color: "#3B82F6" },
  10:    { api: "https://optimism.blockscout.com/api", url: "https://optimism.blockscout.com/tx/", name: "Optimism",  symbol: "ETH",  color: "#EF4444" },
  8453:  { api: "https://base.blockscout.com/api",     url: "https://base.blockscout.com/tx/",     name: "Base",      symbol: "ETH",  color: "#3B82F6" },
  43114: { api: "https://avalanche.blockscout.com/api",url: "https://avalanche.blockscout.com/tx/",name: "Avalanche", symbol: "AVAX", color: "#EF4444" },
  59144: { api: "https://explorer.linea.build/api",    url: "https://explorer.linea.build/tx/",    name: "Linea",     symbol: "ETH",  color: "#22C55E" },
};

async function fetchEvmChainTxs(address: string, chainId: number): Promise<any[]> {
  const explorer = EVM_EXPLORERS[chainId];
  if (!explorer) return [];
  const addrLower = address.toLowerCase();
  const txs: any[] = [];

  const [nativeRes, tokenRes] = await Promise.allSettled([
    fetch(`${explorer.api}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=25`, { signal: AbortSignal.timeout(10000) }),
    fetch(`${explorer.api}?module=account&action=tokentx&address=${address}&sort=desc&page=1&offset=15`, { signal: AbortSignal.timeout(10000) }),
  ]);

  if (nativeRes.status === "fulfilled" && nativeRes.value.ok) {
    try {
      const json = await nativeRes.value.json() as any;
      if (json.status === "1" && Array.isArray(json.result)) {
        for (const tx of json.result) {
          const valueEth = Number(BigInt(tx.value || "0")) / 1e18;
          txs.push({
            hash: tx.hash, chainId,
            chainName: explorer.name, chainColor: explorer.color,
            from: tx.from ?? "", to: tx.to ?? "",
            valueEth, nativeSymbol: explorer.symbol,
            timeStamp: parseInt(tx.timeStamp, 10),
            isError: tx.isError === "1",
            isIncoming: (tx.to ?? "").toLowerCase() === addrLower,
            functionName: tx.functionName ?? "",
            isTokenTransfer: false,
            explorerUrl: explorer.url + tx.hash,
          });
        }
      }
    } catch { /* skip */ }
  }

  if (tokenRes.status === "fulfilled" && tokenRes.value.ok) {
    try {
      const json = await tokenRes.value.json() as any;
      if (json.status === "1" && Array.isArray(json.result)) {
        for (const tx of json.result) {
          if (txs.some((t: any) => t.hash === tx.hash && !t.isTokenTransfer)) continue;
          const decimals = parseInt(tx.tokenDecimal ?? "18", 10);
          const tokenValue = Number(BigInt(tx.value || "0")) / Math.pow(10, decimals);
          txs.push({
            hash: tx.hash, chainId,
            chainName: explorer.name, chainColor: explorer.color,
            from: tx.from ?? "", to: tx.to ?? "",
            valueEth: 0, nativeSymbol: explorer.symbol,
            timeStamp: parseInt(tx.timeStamp, 10),
            isError: false,
            isIncoming: (tx.to ?? "").toLowerCase() === addrLower,
            functionName: "",
            isTokenTransfer: true,
            tokenSymbol: tx.tokenSymbol,
            tokenValue,
            explorerUrl: explorer.url + tx.hash,
          });
        }
      }
    } catch { /* skip */ }
  }
  return txs;
}

router.get("/evm-tx-history/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || !address.startsWith("0x")) return res.status(400).json({ error: "invalid address" });

  const results = await Promise.allSettled(
    Object.keys(EVM_EXPLORERS).map(id => fetchEvmChainTxs(address, parseInt(id, 10)))
  );
  const all: any[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  all.sort((a, b) => b.timeStamp - a.timeStamp);
  return res.json(all);
});

// ─── Solana balance proxy ─────────────────────────────────────────────────────
// Browser → our API (server-side) → Solana RPC
// Avoids CORS / outbound-POST restrictions in the Replit preview iframe.

const SOL_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
];

router.get("/sol-balance/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || address.length < 32) return res.status(400).json({ error: "invalid address" });

  for (const rpc of SOL_RPCS) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const json = await r.json() as any;
      const lamports = json?.result?.value;
      if (typeof lamports === "number") {
        return res.json({ lamports, sol: lamports / 1e9 });
      }
    } catch { /* try next */ }
  }
  return res.status(502).json({ error: "All Solana RPCs failed" });
});

export default router;
