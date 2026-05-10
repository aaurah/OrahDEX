// TOTP implementation using Web Crypto API (RFC 6238)
// Secrets are never stored in source code — they are loaded from the server.
export const TOTP_ISSUER = 'Orah';

function base32Decode(input: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/=+$/, '');
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output).buffer as ArrayBuffer;
}

/**
 * Generate a TOTP code from a base32 secret.
 * The secret must be provided — it is never stored in this module.
 */
export async function generateTOTP(secret: string, time = Date.now()): Promise<string> {
  const counter = Math.floor(time / 1000 / 30);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, counter, false);

  const key = await crypto.subtle.importKey(
    'raw', base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const code = (
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)
  ) % 1_000_000;

  return code.toString().padStart(6, '0');
}

/**
 * Verify a TOTP code against a base32 secret (±1 window).
 * The secret must be provided — it is never stored in this module.
 */
export async function verifyTOTP(code: string, secret: string): Promise<boolean> {
  const now = Date.now();
  for (const delta of [-1, 0, 1]) {
    const expected = await generateTOTP(secret, now + delta * 30_000);
    if (code === expected) return true;
  }
  return false;
}
