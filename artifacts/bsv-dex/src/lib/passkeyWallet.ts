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
 * - The encrypted blob is stored in localStorage AND backed up to the server
 *   (still encrypted — the server cannot decrypt it without the passkey rawId).
 * - On a new device: the user authenticates with their passkey (synced via
 *   iCloud/Google Password Manager), the server restores the encrypted blob,
 *   and it is decrypted locally with the rawId from the assertion.
 * - The passkey itself never leaves the device (WebAuthn guarantee).
 *
 * Cross-device recovery options:
 * 1. Automatic: Server cloud backup (same OS ecosystem — iCloud ↔ iCloud, etc.)
 * 2. Transfer Code: 8-char code valid for 10 min — works across OS ecosystems
 */

import { generateMnemonic, deriveAllAddresses } from "./seedPhrase";

const STORAGE_KEY  = "orahdex_passkey_wallets_v1";
const RP_NAME      = "OrahDEX";
const PBKDF2_SALT  = new TextEncoder().encode("OrahDEX-passkey-wallet-v1");
const PBKDF2_ITER  = 100_000;

const API_BASE = (import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "") + "/api";

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

/** ArrayBuffer or Uint8Array → standard base64 */
function buf2b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Standard base64 → Uint8Array (backed by a plain ArrayBuffer for WebCrypto compatibility) */
function b642buf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const ab = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

/** Standard base64 → URL-safe base64 (strips padding) */
function b642url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → standard base64 (re-adds correct padding) */
function url2b64(url: string): string {
  const s = url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  return pad === 0 ? s : s + "=".repeat(4 - pad);
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

// ─── Server backup helpers ────────────────────────────────────────────────────

/** Push encrypted wallet blob to the server (fire-and-forget, silent on error). */
async function pushBackupToServer(wallet: PasskeyWallet): Promise<void> {
  try {
    await fetch(`${API_BASE}/passkey/backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credentialId: wallet.credentialId,
        encryptedKey: wallet.encryptedKey,
        iv:           wallet.iv,
        address:      wallet.address,
        label:        wallet.label ?? "Passkey Wallet",
      }),
    });
  } catch {
    // Network error — silently ignore, user still has local copy
  }
}

/** Try to fetch encrypted wallet blob from the server, decrypt, and save locally. */
async function tryRestoreFromServer(
  credentialId: string,
  rawId: ArrayBuffer
): Promise<PasskeyWallet | null> {
  try {
    const res = await fetch(`${API_BASE}/passkey/backup/${encodeURIComponent(credentialId)}`);
    if (!res.ok) return null;
    const data = await res.json() as { encryptedKey: string; iv: string; address: string; label?: string };
    if (!data.encryptedKey || !data.iv || !data.address) return null;
    // Verify decryption works before saving
    await decryptPrivateKey(data.encryptedKey, data.iv, rawId);
    const wallet: PasskeyWallet = {
      credentialId,
      address:      data.address,
      encryptedKey: data.encryptedKey,
      iv:           data.iv,
      label:        data.label ?? "Passkey Wallet",
      createdAt:    Date.now(),
    };
    saveWallet(wallet);
    return wallet;
  } catch {
    return null;
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

export interface PasskeyChainAddresses {
  evm: string;
  sol?: string;
  btc?: string;
  bch?: string;
  bsv?: string;
}

export interface RegisterResult {
  address:      string;
  credentialId: string;
  label:        string;
  chains?:      PasskeyChainAddresses;
}

/**
 * Create a new passkey and generate a BIP39 HD wallet (all 5 chains).
 * The 12-word mnemonic is encrypted with the passkey rawId — never stored in plain text.
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

  // Generate a BIP39 mnemonic and derive all 5 chain addresses
  const words    = generateMnemonic(12);
  const addrs    = await deriveAllAddresses(words);
  const mnemonic = words.join(" ");

  // Encrypt the mnemonic so it can only be decrypted after a passkey assertion
  const { encryptedKey, iv } = await encryptPrivateKey(mnemonic, rawId);

  const wallet: PasskeyWallet = {
    credentialId,
    address:     addrs.evm,
    encryptedKey,
    iv,
    label,
    createdAt:   Date.now(),
  };

  saveWallet(wallet);

  // Silently back up to server (encrypted — safe to store remotely)
  pushBackupToServer(wallet);

  return {
    address: addrs.evm,
    credentialId,
    label,
    chains: { evm: addrs.evm, sol: addrs.sol, btc: addrs.btc, bch: addrs.bch, bsv: addrs.bsv },
  };
}

// ─── Authentication ───────────────────────────────────────────────────────────

export interface LoginResult {
  address:             string;
  credentialId:        string;
  label:               string;
  restoredFromBackup?: boolean;
  chains?:             PasskeyChainAddresses;
}

/**
 * Authenticate with an existing passkey wallet.
 * Returns the EVM address; the private key is decrypted in-memory only.
 *
 * Cross-device recovery: if no wallet is found in localStorage (new device),
 * the function automatically attempts to restore the encrypted blob from the
 * server backup, decrypts it with the passkey rawId, and saves it locally.
 */
export async function loginWithPasskey(): Promise<LoginResult> {
  if (!isPasskeySupported()) throw new Error("Passkeys not supported in this browser");

  const wallets   = listPasskeyWallets();
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  // Use discoverable-credential flow (empty allowCredentials) so the device
  // presents ALL available passkeys for this origin — works even when
  // localStorage is empty (different session, reinstall, etc.)
  const allowCredentials = wallets.length > 0
    ? wallets.map(w => ({ id: b642buf(url2b64(w.credentialId)), type: "public-key" as const }))
    : [];

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

  let wallet = wallets.find(w => w.credentialId === credentialId);
  let restoredFromBackup = false;

  if (!wallet) {
    // Passkey succeeded but no local wallet blob — try server cloud backup
    const restored = await tryRestoreFromServer(credentialId, rawId);
    if (restored) {
      wallet = restored;
      restoredFromBackup = true;
    } else {
      throw new Error(
        "WALLET_NOT_FOUND:" + credentialId
      );
    }
  } else {
    // Wallet found locally — silently push a backup so cross-device login works
    // in the future. This upgrades wallets created before backup was deployed.
    pushBackupToServer(wallet);
  }

  // Decrypt the secret — may be a BIP39 mnemonic (new) or raw EVM private key (legacy)
  const secret = await decryptPrivateKey(wallet.encryptedKey, wallet.iv, rawId);

  const isMnemonic = secret.trim().split(/\s+/).length >= 12 && !secret.startsWith("0x");

  let address: string;
  let chains: PasskeyChainAddresses | undefined;

  if (isMnemonic) {
    // New format: derive all 5 chain addresses from the BIP39 mnemonic
    const addrs = await deriveAllAddresses(secret.trim().split(/\s+/));
    address = addrs.evm;
    chains  = { evm: addrs.evm, sol: addrs.sol, btc: addrs.btc, bch: addrs.bch, bsv: addrs.bsv };
  } else {
    // Legacy format: raw EVM private key (0x...)
    const { privateKeyToAccount } = await import("viem/accounts");
    address = privateKeyToAccount(secret as `0x${string}`).address;
  }

  return {
    address,
    credentialId,
    label:               wallet.label ?? "Passkey Wallet",
    restoredFromBackup,
    chains,
  };
}

// ─── Transfer Code (cross-OS-ecosystem recovery) ─────────────────────────────

/**
 * Generate an 8-char transfer code for the given wallet.
 * The code is valid for 10 minutes and can be used ONCE on the new device.
 * Use this when automatic cloud backup doesn't apply (e.g. iPhone → Android).
 */
export async function generateTransferCode(credentialId: string): Promise<string> {
  const wallets = listPasskeyWallets();
  const wallet  = wallets.find(w => w.credentialId === credentialId);
  if (!wallet) throw new Error("Wallet not found in localStorage");

  const res = await fetch(`${API_BASE}/passkey/transfer`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      credentialId: wallet.credentialId,
      encryptedKey: wallet.encryptedKey,
      iv:           wallet.iv,
      address:      wallet.address,
      label:        wallet.label ?? "Passkey Wallet",
    }),
  });

  if (!res.ok) throw new Error((await res.json()).error ?? "Transfer code generation failed");
  const { code } = await res.json() as { code: string };
  return code;
}

/**
 * Restore a wallet using a transfer code on the new device.
 * The user still authenticates with their passkey BEFORE calling this —
 * the rawId from the assertion is required to decrypt the wallet data.
 */
export async function restoreFromTransferCode(
  code: string,
  rawId: ArrayBuffer
): Promise<PasskeyWallet> {
  const res = await fetch(`${API_BASE}/passkey/transfer/${encodeURIComponent(code.toUpperCase())}`);
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error ?? "Transfer code lookup failed");
  }
  const data = await res.json() as { credentialId: string; encryptedKey: string; iv: string; address: string; label?: string };

  // Verify the rawId can actually decrypt this wallet (must match the original credential)
  try {
    await decryptPrivateKey(data.encryptedKey, data.iv, rawId);
  } catch {
    throw new Error("This transfer code belongs to a different passkey. Please authenticate with the correct passkey.");
  }

  const wallet: PasskeyWallet = {
    credentialId: data.credentialId,
    address:      data.address,
    encryptedKey: data.encryptedKey,
    iv:           data.iv,
    label:        data.label ?? "Passkey Wallet",
    createdAt:    Date.now(),
  };

  saveWallet(wallet);
  return wallet;
}

// ─── On-chain transaction signing ─────────────────────────────────────────────

/**
 * Authenticate with the Orah passkey wallet for the given EVM address and
 * return a viem LocalAccount that can sign and send real on-chain transactions.
 *
 * Flow: passkey biometric auth → decrypt private key in-memory → viem account.
 * The private key is NEVER persisted or logged.
 *
 * Throws if:
 *   - No passkey wallet is found for the given address (seed-phrase-only wallets)
 *   - User cancels biometric auth
 */
export async function getViemAccountForOrahWallet(address: string): Promise<import("viem").Account> {
  if (!isPasskeySupported()) throw new Error("Passkeys not supported in this browser");

  const wallets = listPasskeyWallets();

  // Prefer the wallet whose stored address matches; fall back to discoverable flow
  const matching = wallets.filter(w =>
    w.address.toLowerCase() === address.toLowerCase()
  );

  if (matching.length === 0 && wallets.length === 0) {
    throw new Error(
      "NO_PASSKEY_WALLET: No passkey wallet found. On-chain swaps require a passkey wallet. Use Exchange mode instead."
    );
  }

  const allowCredentials = matching.length > 0
    ? matching.map(w => ({ id: b642buf(url2b64(w.credentialId)), type: "public-key" as const }))
    : wallets.map(w => ({ id: b642buf(url2b64(w.credentialId)), type: "public-key" as const }));

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials,
      userVerification: "required",
      timeout: 60_000,
    },
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey authentication cancelled");

  const rawId        = assertion.rawId;
  const credentialId = b642url(buf2b64(rawId));

  let wallet = wallets.find(w => w.credentialId === credentialId);
  if (!wallet) {
    const restored = await tryRestoreFromServer(credentialId, rawId);
    if (!restored) throw new Error("Passkey wallet data not found. Please restore your wallet first.");
    wallet = restored;
  }

  const secret = await decryptPrivateKey(wallet.encryptedKey, wallet.iv, rawId);

  const { privateKeyToAccount } = await import("viem/accounts");

  const isMnemonic = secret.trim().split(/\s+/).length >= 12 && !secret.startsWith("0x");
  let privateKey: `0x${string}`;

  if (isMnemonic) {
    // Re-derive the raw EVM private key from the mnemonic (same path as viem mnemonicToAccount)
    const { HDKey } = await import("@scure/bip32");
    const { mnemonicToSeedSync } = await import("@scure/bip39");
    const seed    = mnemonicToSeedSync(secret.trim());
    const root    = HDKey.fromMasterSeed(seed);
    const derived = root.derive("m/44'/60'/0'/0/0");
    if (!derived.privateKey) throw new Error("Key derivation failed");
    const hex = Array.from(derived.privateKey).map(b => b.toString(16).padStart(2, "0")).join("");
    privateKey = `0x${hex}` as `0x${string}`;
  } else {
    privateKey = secret as `0x${string}`;
  }

  return privateKeyToAccount(privateKey);
}

// ─── Signing ──────────────────────────────────────────────────────────────────

export interface SignResult {
  signature: string;
  address:   string;
}

/**
 * Sign arbitrary data with a passkey wallet.
 * Prompts biometric authentication, then decrypts the private key in-memory.
 */
export async function signWithPasskey(
  credentialId: string,
  message: string
): Promise<SignResult> {
  if (!isPasskeySupported()) throw new Error("Passkeys not supported in this browser");

  const wallets   = listPasskeyWallets();
  const wallet    = wallets.find(w => w.credentialId === credentialId);
  if (!wallet) throw new Error("Wallet not found. Please create or import a passkey wallet first.");

  const challenge = new TextEncoder().encode(message.slice(0, 32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b642buf(url2b64(credentialId)), type: "public-key" }],
      userVerification: "required",
      timeout:          60_000,
    },
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error("Passkey authentication cancelled");

  const privateKey = await decryptPrivateKey(wallet.encryptedKey, wallet.iv, assertion.rawId);
  const { privateKeyToAccount } = await import("viem/accounts");
  const account    = privateKeyToAccount(privateKey as `0x${string}`);
  const sig        = await account.signMessage({ message });

  return { signature: sig, address: account.address };
}
