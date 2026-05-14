/**
 * Keystone hardware wallet integration — QR / UR-based (air-gapped).
 *
 * Flow:
 *  1. User navigates to Connect Software Wallet on their Keystone device.
 *  2. Keystone displays an animated QR code (UR-encoded crypto-hdkey or crypto-account).
 *  3. This module opens the device camera, reads frames via jsQR, accumulates
 *     UR fountain-code fragments, and resolves when the complete payload is decoded.
 *  4. The EVM address is derived from the xpub at m/44'/60'/0'/0/0.
 *
 * The module also accepts a plain xpub/ypub/zpub string pasted directly by
 * the user (fallback for static single-frame QR codes).
 */

export interface KeystoneResult {
  address: string;
  xpub?: string;
}

/* ── UR multi-part fragment accumulator ──────────────────────────────────── */

interface URFragment {
  index: number;    // 0-based
  total: number;
  payload: string;  // hex / base32 payload of the fragment
}

function parseURFragment(raw: string): URFragment | null {
  if (!raw.toLowerCase().startsWith("ur:")) return null;
  const lower = raw.toLowerCase();
  // multi-part: ur:<type>/<seqNum>-<seqLen>/<payload>
  const multiMatch = lower.match(/^ur:[^/]+\/(\d+)-(\d+)\/(.+)$/);
  if (multiMatch) {
    return {
      index: parseInt(multiMatch[1], 10) - 1,
      total: parseInt(multiMatch[2], 10),
      payload: raw.split("/").pop() ?? "",
    };
  }
  // single-part: ur:<type>/<payload>
  const singleMatch = lower.match(/^ur:[^/]+\/(.+)$/);
  if (singleMatch) {
    return { index: 0, total: 1, payload: raw.split("/").pop() ?? "" };
  }
  return null;
}

export class URAccumulator {
  private fragments: Map<number, string> = new Map();
  private total = 0;

  add(raw: string): boolean {
    const fragment = parseURFragment(raw);
    if (!fragment) return false;
    this.total = fragment.total;
    this.fragments.set(fragment.index, fragment.payload);
    return this.fragments.size >= this.total;
  }

  isComplete(): boolean {
    return this.total > 0 && this.fragments.size >= this.total;
  }

  progress(): { received: number; total: number } {
    return { received: this.fragments.size, total: this.total || 0 };
  }

  assemble(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.total; i++) {
      const p = this.fragments.get(i);
      if (!p) throw new Error(`Missing fragment ${i + 1}/${this.total}`);
      parts.push(p);
    }
    return parts.join("");
  }

  reset() {
    this.fragments.clear();
    this.total = 0;
  }
}

/* ── xpub → EVM address derivation ─────────────────────────────────────── */

export async function xpubToEvmAddress(xpub: string): Promise<string> {
  const { HDKey } = await import("@scure/bip32");
  const { createPublicClient, http } = await import("viem");
  void createPublicClient; void http;

  // decode base58 xpub — @scure/bip32 fromExtendedKey handles xpub/ypub/zpub
  const root = HDKey.fromExtendedKey(xpub);
  const child = root.derive("m/0/0");
  if (!child.publicKey) throw new Error("No public key at m/0/0");

  // keccak256 of uncompressed public key → last 20 bytes → EIP-55
  const { keccak256, bytesToHex, getAddress } = await import("viem");
  const uncompressed = uncompressPublicKey(child.publicKey);
  const hash = keccak256(uncompressed.slice(1));   // drop 0x04 prefix
  const raw = "0x" + hash.slice(-40);
  return getAddress(raw);
}

function uncompressPublicKey(compressed: Uint8Array): Uint8Array {
  // Secp256k1 point decompression using noble/curves
  // We use a simple brute-force check since we only need the address hash
  const { secp256k1 } = require("@noble/curves/secp256k1");
  return secp256k1.ProjectivePoint.fromHex(compressed).toRawBytes(false);
}

/* ── UR payload → EVM address ───────────────────────────────────────────── */

export async function decodeURPayload(urString: string): Promise<KeystoneResult> {
  try {
    const { CryptoHDKey, CryptoAccount } = await import("@keystonehq/bc-ur-registry-eth");

    const lower = urString.toLowerCase();

    if (lower.includes("crypto-hdkey") || lower.includes("hdkey")) {
      const hdKey = CryptoHDKey.fromCBOR(Buffer.from(extractPayloadBytes(urString)));
      const xpub = hdKey.getBip32Key();
      const address = await xpubToEvmAddress(xpub);
      return { address, xpub };
    }

    if (lower.includes("crypto-account") || lower.includes("account")) {
      const account = CryptoAccount.fromCBOR(Buffer.from(extractPayloadBytes(urString)));
      const outputDescriptors = account.getOutputDescriptors();
      for (const descriptor of outputDescriptors) {
        try {
          const hdKey = descriptor.getCryptoKey();
          const xpub = (hdKey as any).getBip32Key?.();
          if (xpub) {
            const address = await xpubToEvmAddress(xpub);
            return { address, xpub };
          }
        } catch { continue; }
      }
    }
  } catch { /* fall through to xpub parse */ }

  // If the raw string looks like an xpub, try direct derivation
  if (/^[xyz]pub[a-zA-Z0-9]{100,}$/.test(urString.trim())) {
    const address = await xpubToEvmAddress(urString.trim());
    return { address, xpub: urString.trim() };
  }

  throw new Error("Could not decode QR data. Ensure your Keystone shows a crypto-hdkey or crypto-account QR.");
}

function extractPayloadBytes(urString: string): Uint8Array {
  // The payload after the last "/" in the UR string is CBOR encoded as Base32
  const payload = urString.split("/").pop() ?? "";
  return base32Decode(payload.toUpperCase());
}

/* ── Minimal Base32 decoder (RFC 4648, no padding) ─────────────────────── */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "").toUpperCase();
  const bits: number[] = [];
  for (const c of clean) {
    const idx = B32_ALPHABET.indexOf(c);
    if (idx < 0) continue;
    for (let i = 4; i >= 0; i--) bits.push((idx >> i) & 1);
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j];
    bytes[i] = byte;
  }
  return bytes;
}

/* ── Camera QR scanning ─────────────────────────────────────────────────── */

export async function startCameraScanner(
  videoEl: HTMLVideoElement,
  onFrame: (data: string) => void,
  signal: AbortSignal,
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const jsQR = (await import("jsqr")).default;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const scan = () => {
    if (signal.aborted || videoEl.readyState < 2) {
      requestAnimationFrame(scan);
      return;
    }
    canvas.width  = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });
    if (code?.data) onFrame(code.data);
    if (!signal.aborted) requestAnimationFrame(scan);
  };
  requestAnimationFrame(scan);

  signal.addEventListener("abort", () => {
    stream.getTracks().forEach(t => t.stop());
  });

  return stream;
}
