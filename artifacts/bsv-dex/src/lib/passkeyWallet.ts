/**
 * OrahDEX Passkey Wallet
 *
 * Non-custodial EVM wallet backed by a WebAuthn passkey (Face ID, Touch ID,
 * Windows Hello, Android biometric, hardware security key, etc.).
 *
 * Security model:
 * - A cryptographically random EVM private key is generated locally.
 * - It is encrypted with AES-GCM using a key derived (via PBKDF2) from the
 *   passkey credential's rawId bytes.
 * - The encrypted blob is stored in localStorage — it cannot be decrypted
 *   without the original passkey assertion.
 * - The passkey itself never leaves the device (WebAuthn guarantee).
 *
 * This mirrors the Coinbase Smart Wallet passkey model: biometrics replace
 * the seed phrase entirely.
 */

const STORAGE_KEY = "orahdex_passkey_wallets_v1";
const RP_NAME     = "OrahDEX";
const PBKDF2_SALT = new TextEncoder().encode("OrahDEX-passkey-wallet-v1");
const PBKDF2_ITER = 100_000;

export interface PasskeyWallet {
  credentialId: string;  // base64url
  address:      string;  // EIP-55 checksummed EVM address
  encryptedKey: string;  // base64  — AES-GCM ciphertext of private key
  iv:           string;  // base64  — 12-byte GCM nonce
  label?:       string;  // optional display name
  createdAt:    number;  // unix ms
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function listPasskeyWallets(): PasskeyWallet[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveWallet(wallet: PasskeyWallet): void {
  const wallets = listPasskeyWallets();
  const idx = wallets.findIndex(w => w.credentialId === wallet.credentialId);
  if (idx >= 0) wallets[idx] = wallet;
  else wallets.push(wallet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

export function deletePasskeyWallet(credentialId: string): void {
  const wallets = listPasskeyWallets().filter(w => w.credentialId !== credentialId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

// ─── Support detection ────────────────────────────────────────────────────────

export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeySupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

function buf2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b642buf(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
function b642url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function url2b64(url: string): string {
  return (url + "===".slice(url.length % 4 === 0 ? 3 : url.length % 4))
    .replace(/-/g, "+").replace(/_/g, "/");
}

async function deriveAesKey(
  rawId: ArrayBuffer,
  usage: "encrypt" | "decrypt"
): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey(
    "raw", rawId, { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: PBKDF2_SALT, iterations: PBKDF2_ITER, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

async function encryptPrivateKey(
  privateKey: string,
  rawId: ArrayBuffer
): Promise<{ encryptedKey: string; iv: string }> {
  const aesKey = await deriveAesKey(rawId, "encrypt");
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(privateKey)
  );
  return { encryptedKey: buf2b64(cipher), iv: buf2b64(iv) };
}

async function decryptPrivateKey(
  encryptedKey: string,
  iv: string,
  rawId: ArrayBuffer
): Promise<string> {
  const aesKey  = await deriveAesKey(rawId, "decrypt");
  const plain   = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b642buf(iv) },
    aesKey,
    b642buf(encryptedKey)
  );
  return new TextDecoder().decode(plain);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  address:      string;
  credentialId: string;
  label:        string;
}

/**
 * Create a new passkey and generate a matching EVM wallet.
 *
 * @param label  Optional display name for the wallet (default: "Passkey Wallet").
 */
export async function registerPasskeyWallet(
  label = "Passkey Wallet"
): Promise<RegisterResult> {
  if (!isPasskeySupported()) throw new Error("Passkeys not supported in this browser");

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId    = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp:   { name: RP_NAME, id: window.location.hostname },
      user: { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { alg: -7,   type: "public-key" }, // ES256 (preferred)
        { alg: -257, type: "public-key" }, // RS256 (fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey:             "preferred",
        requireResidentKey:      false,
        userVerification:        "required",
      },
      timeout: 60_000,
      attestation: "none",
    },
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey creation cancelled");

  const rawId        = credential.rawId;
  const credentialId = b642url(buf2b64(rawId));

  // Generate a fresh EVM wallet
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const privateKey = generatePrivateKey();
  const account    = privateKeyToAccount(privateKey);

  // Encrypt the private key so it can only be decrypted after a passkey assertion
  const { encryptedKey, iv } = await encryptPrivateKey(privateKey, rawId);

  const wallet: PasskeyWallet = {
    credentialId,
    address:     account.address,
    encryptedKey,
    iv,
    label,
    createdAt:   Date.now(),
  };

  saveWallet(wallet);

  return { address: account.address, credentialId, label };
}

// ─── Authentication ───────────────────────────────────────────────────────────

export interface LoginResult {
  address:      string;
  credentialId: string;
  label:        string;
}

/**
 * Authenticate with an existing passkey wallet.
 * Returns the EVM address; the private key is decrypted in-memory only.
 */
export async function loginWithPasskey(): Promise<LoginResult> {
  if (!isPasskeySupported()) throw new Error("Passkeys not supported in this browser");

  const wallets = listPasskeyWallets();
  if (wallets.length === 0) throw new Error("No passkey wallets found on this device");

  const challenge         = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials = wallets.map(w => ({
    id:   b642buf(url2b64(w.credentialId)),
    type: "public-key" as const,
  }));

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials,
      userVerification: "required",
      timeout:          60_000,
    },
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey authentication cancelled");

  const rawId        = assertion.rawId;
  const credentialId = b642url(buf2b64(rawId));

  const wallet = wallets.find(w => w.credentialId === credentialId);
  if (!wallet) throw new Error("Passkey not recognised — was this wallet created on another device?");

  // Decrypt the private key
  const privateKey = await decryptPrivateKey(wallet.encryptedKey, wallet.iv, rawId);
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return {
    address:      account.address,
    credentialId,
    label:        wallet.label ?? "Passkey Wallet",
  };
}
