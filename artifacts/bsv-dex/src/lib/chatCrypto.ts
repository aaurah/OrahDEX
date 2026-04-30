/**
 * End-to-end encryption for OrahDEX chat channels.
 *
 * Key derivation: PBKDF2-SHA256, 200 000 iterations
 *   passphrase = "orahdex-<channel>-e2e-v1"
 *   salt       = fixed 16-byte constant (app-wide)
 *
 * Encryption: AES-GCM-256 with a random 12-byte IV per message.
 *
 * Wire format:  "enc:" + base64( iv[12] || ciphertext )
 *
 * Backward-compat: messages that do NOT start with "enc:" are returned
 * as-is (legacy plaintext) so old messages are still readable.
 */

const SALT = new Uint8Array([
  0x4f, 0x72, 0x61, 0x68, 0x44, 0x45, 0x58, 0x2d,
  0x63, 0x68, 0x61, 0x74, 0x2d, 0x73, 0x61, 0x6c,
]);

const KEY_CACHE = new Map<string, CryptoKey>();

export async function deriveChannelKey(channel: string): Promise<CryptoKey> {
  const cached = KEY_CACHE.get(channel);
  if (cached) return cached;

  const enc = new TextEncoder();
  const passphrase = enc.encode(`orahdex-${channel}-e2e-v1`);

  const importedKey = await crypto.subtle.importKey(
    "raw",
    passphrase,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const derived = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: SALT, iterations: 200_000 },
    importedKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  KEY_CACHE.set(channel, derived);
  return derived;
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return "enc:" + toBase64(combined.buffer);
}

export async function decryptMessage(key: CryptoKey, text: string): Promise<string> {
  if (!text.startsWith("enc:")) return text;
  try {
    const combined = fromBase64(text.slice(4));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return "🔒 [encrypted message — key mismatch]";
  }
}
