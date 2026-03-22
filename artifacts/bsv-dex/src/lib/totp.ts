// TOTP implementation using Web Crypto API (RFC 6238)
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXP'; // base32 secret
export const TOTP_ISSUER = 'OrahDEX';
export const TOTP_ACCOUNT = 'aaurah@protonmail.com';

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

export async function generateTOTP(secret = TOTP_SECRET, time = Date.now()): Promise<string> {
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

export async function verifyTOTP(code: string, secret = TOTP_SECRET): Promise<boolean> {
  const now = Date.now();
  // Allow ±1 window (30s each side)
  for (const delta of [-1, 0, 1]) {
    const expected = await generateTOTP(secret, now + delta * 30_000);
    if (code === expected) return true;
  }
  return false;
}

export function getTOTPUri(): string {
  const params = new URLSearchParams({
    secret: TOTP_SECRET,
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(TOTP_ISSUER + ':' + TOTP_ACCOUNT)}?${params}`;
}

export function getQRCodeUrl(): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(getTOTPUri())}`;
}
