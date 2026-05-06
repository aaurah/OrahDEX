/**
 * OrahDEX Imported-Wallet Security
 *
 * Gates the "Import Seed Phrase / Private Key" flow behind a PIN or device
 * passkey. The user's secret (mnemonic or 0x private key) is encrypted with
 * AES-GCM using a key derived from either:
 *   • a user-chosen PIN (6–10 digits) via PBKDF2-SHA256 (600k iterations,
 *     per-record random salt — no static salt / no rainbow tables), or
 *   • a 32-byte secret produced by the WebAuthn PRF extension (HMAC-secret),
 *     which is bound to the authenticator and only released after a verified
 *     biometric / userVerification ceremony — credential-IDs alone cannot
 *     decrypt anything.
 *
 * The plaintext secret never leaves the browser. The encrypted blob lives in
 * localStorage so the user can later re-unlock the wallet for signing without
 * re-typing the seed phrase.
 *
 * A "verifier" blob (a known constant encrypted under the same PIN-derived
 * key — but with its own random salt) lets us reject bad PINs without
 * touching wallet ciphertext. Verifier salt ≠ wallet salt, so attackers must
 * pay the full PBKDF2 cost per guess against each blob separately.
 */

const VERIFIER_KEY  = "orahdex_pin_verifier_v1";
const WALLETS_KEY   = "orahdex_imported_wallets_v1";
const DERIVED_KEY   = "orahdex_derived_addresses_v1";
const VERIFIER_PLAINTEXT = "orahdex-pin-ok";
const PBKDF2_ITER   = 600_000;
const PRF_SALT      = new TextEncoder().encode("orahdex-import-prf-v1");

export type ProtectionType = "pin" | "passkey";
export type SecretType     = "mnemonic" | "privatekey";

export interface ImportedWalletRecord {
  address:         string;        // EIP-55 EVM address (primary key)
  encryptedSecret: string;        // base64 AES-GCM ciphertext
  iv:              string;        // base64 12-byte nonce
  salt:            string;        // base64 16-byte per-record KDF salt
  secretType:      SecretType;
  protectedBy:     ProtectionType;
  passkeyId?:      string;        // base64url credentialId, when protectedBy=passkey
  label?:          string;
  createdAt:       number;
}

interface VerifierBlob {
  encrypted: string;              // base64 AES-GCM(VERIFIER_PLAINTEXT)
  iv:        string;              // base64
  salt:      string;              // base64 16-byte per-device KDF salt
}

// ─── Base64 helpers ──────────────────────────────────────────────────────────

function buf2b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b642buf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const ab  = new ArrayBuffer(bin.length);
  const u   = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u as Uint8Array<ArrayBuffer>;
}

function b642url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function url2b64(url: string): string {
  const s = url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  return pad === 0 ? s : s + "=".repeat(4 - pad);
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(n);
  const u  = new Uint8Array(ab);
  crypto.getRandomValues(u);
  return u as Uint8Array<ArrayBuffer>;
}

// ─── Key derivation ──────────────────────────────────────────────────────────

async function deriveKeyFromPin(
  pin:   string,
  salt:  Uint8Array<ArrayBuffer>,
  usage: "encrypt" | "decrypt",
): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

/** Convert a 32-byte authenticator PRF secret into an AES-GCM key via HKDF. */
async function deriveKeyFromPrf(
  prfSecret: ArrayBuffer,
  salt:      Uint8Array<ArrayBuffer>,
  usage:     "encrypt" | "decrypt",
): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey(
    "raw", prfSecret, { name: "HKDF" }, false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("orahdex-passkey-aes-v1") },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

// ─── PIN strength ────────────────────────────────────────────────────────────

export const PIN_MIN_LEN = 6;
export const PIN_MAX_LEN = 10;

export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(pin)) return { valid: false, error: "PIN must be digits only" };
  if (pin.length < PIN_MIN_LEN) return { valid: false, error: `PIN must be at least ${PIN_MIN_LEN} digits` };
  if (pin.length > PIN_MAX_LEN) return { valid: false, error: `PIN must be at most ${PIN_MAX_LEN} digits` };
  if (/^(\d)\1+$/.test(pin)) return { valid: false, error: "PIN cannot be all the same digit" };
  const isAsc  = pin.split("").every((d, i) => i === 0 || +d === (+pin[i - 1] + 1) % 10);
  const isDesc = pin.split("").every((d, i) => i === 0 || +d === (+pin[i - 1] - 1 + 10) % 10);
  if (isAsc || isDesc) return { valid: false, error: "PIN cannot be a sequence (e.g. 123456)" };
  return { valid: true };
}

// ─── PIN verifier (one per device) ───────────────────────────────────────────

export function hasPin(): boolean {
  return !!localStorage.getItem(VERIFIER_KEY);
}

export async function setPin(pin: string): Promise<void> {
  const v = validatePin(pin);
  if (!v.valid) throw new Error(v.error);
  const salt = randomBytes(16);
  const key  = await deriveKeyFromPin(pin, salt, "encrypt");
  const iv   = randomBytes(12);
  const ct   = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(VERIFIER_PLAINTEXT),
  );
  const blob: VerifierBlob = { encrypted: buf2b64(ct), iv: buf2b64(iv), salt: buf2b64(salt) };
  localStorage.setItem(VERIFIER_KEY, JSON.stringify(blob));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(VERIFIER_KEY);
  if (!raw) return false;
  try {
    const blob: VerifierBlob = JSON.parse(raw);
    const salt = b642buf(blob.salt);
    const key  = await deriveKeyFromPin(pin, salt, "decrypt");
    const pt   = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b642buf(blob.iv) },
      key,
      b642buf(blob.encrypted),
    );
    return new TextDecoder().decode(pt) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

// ─── Imported wallet store ───────────────────────────────────────────────────

export function listImportedWallets(): ImportedWalletRecord[] {
  try {
    return JSON.parse(localStorage.getItem(WALLETS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function getImportedWallet(address: string): ImportedWalletRecord | null {
  return listImportedWallets().find(
    w => w.address.toLowerCase() === address.toLowerCase(),
  ) ?? null;
}

function saveImportedWallet(rec: ImportedWalletRecord): void {
  const all = listImportedWallets();
  const idx = all.findIndex(w => w.address.toLowerCase() === rec.address.toLowerCase());
  if (idx >= 0) all[idx] = rec; else all.push(rec);
  localStorage.setItem(WALLETS_KEY, JSON.stringify(all));
}

export function deleteImportedWallet(address: string): void {
  const all = listImportedWallets().filter(
    w => w.address.toLowerCase() !== address.toLowerCase(),
  );
  localStorage.setItem(WALLETS_KEY, JSON.stringify(all));
  // Also drop any cached derived addresses for this wallet
  try {
    const map = readDerivedMap();
    delete map[address.toLowerCase()];
    localStorage.setItem(DERIVED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// ─── Derived public addresses cache (BTC / BCH / BSV / SOL …) ────────────────
//
// These are PUBLIC addresses derived from the seed during create/import/login.
// Persisting them in plain JSON lets the wallet UI show per-chain QR codes
// without re-prompting the user for PIN/passkey on every visit.

export interface DerivedAddresses {
  evm?: string;
  btc?: string;
  bch?: string;
  bsv?: string;
  sol?: string;
  tron?: string;
  xrp?: string;
  ltc?: string;
  doge?: string;
}

function readDerivedMap(): Record<string, DerivedAddresses> {
  try {
    const raw = localStorage.getItem(DERIVED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveDerivedAddresses(address: string, addrs: DerivedAddresses): void {
  if (!address) return;
  const map = readDerivedMap();
  const k = address.toLowerCase();
  map[k] = { ...(map[k] ?? {}), ...addrs };
  localStorage.setItem(DERIVED_KEY, JSON.stringify(map));
}

export function getDerivedAddresses(address: string | null | undefined): DerivedAddresses | null {
  if (!address) return null;
  const map = readDerivedMap();
  return map[address.toLowerCase()] ?? null;
}

/**
 * One-time migration: clears stale BSV/BCH addresses that were incorrectly
 * derived from the BTC key (old code set `bsv = btc` and `bch` shared the
 * BTC derivation path). After clearing, the wallet UI shows "Sign in to
 * derive your address" for those chains until the user next authenticates,
 * at which point the correct BIP44 addresses (coin type 236 / 145) are saved.
 *
 * A migration-version flag in localStorage prevents this from running twice.
 */
const DERIVED_MIGRATION_KEY = "orahdex_derived_migration_v2";
export function migrateStaleDerivedAddresses(): void {
  try {
    if (localStorage.getItem(DERIVED_MIGRATION_KEY)) return;
    const map = readDerivedMap();
    let changed = false;
    for (const k of Object.keys(map)) {
      const entry = map[k];
      if (entry.btc && entry.bsv && entry.btc === entry.bsv) {
        // BSV was wrongly set to the BTC address — clear it
        delete entry.bsv;
        changed = true;
      }
      // BCH was also derived from the BTC key; clear it so it re-derives correctly
      if (entry.btc && entry.bch) {
        delete entry.bch;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(DERIVED_KEY, JSON.stringify(map));
    localStorage.setItem(DERIVED_MIGRATION_KEY, "1");
  } catch { /* ignore */ }
}

// ─── Encrypt + store (PIN flow) ──────────────────────────────────────────────

export async function storeWithPin(args: {
  address:    string;
  secret:     string;
  secretType: SecretType;
  pin:        string;
  label?:     string;
}): Promise<ImportedWalletRecord> {
  if (!(await verifyPin(args.pin))) throw new Error("Invalid PIN");
  const salt = randomBytes(16);
  const key  = await deriveKeyFromPin(args.pin, salt, "encrypt");
  const iv   = randomBytes(12);
  const ct   = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(args.secret),
  );
  const rec: ImportedWalletRecord = {
    address:         args.address,
    encryptedSecret: buf2b64(ct),
    iv:              buf2b64(iv),
    salt:            buf2b64(salt),
    secretType:      args.secretType,
    protectedBy:     "pin",
    label:           args.label,
    createdAt:       Date.now(),
  };
  saveImportedWallet(rec);
  return rec;
}

// ─── Encrypt + store (Passkey / WebAuthn-PRF flow) ───────────────────────────

export async function storeWithPasskey(args: {
  address:    string;
  secret:     string;
  secretType: SecretType;
  prfSecret:  ArrayBuffer;
  passkeyId:  string;
  label?:     string;
}): Promise<ImportedWalletRecord> {
  if (args.prfSecret.byteLength < 16) {
    throw new Error("Authenticator did not return a usable PRF secret");
  }
  const salt = randomBytes(16);
  const key  = await deriveKeyFromPrf(args.prfSecret, salt, "encrypt");
  const iv   = randomBytes(12);
  const ct   = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(args.secret),
  );
  const rec: ImportedWalletRecord = {
    address:         args.address,
    encryptedSecret: buf2b64(ct),
    iv:              buf2b64(iv),
    salt:            buf2b64(salt),
    secretType:      args.secretType,
    protectedBy:     "passkey",
    passkeyId:       args.passkeyId,
    label:           args.label,
    createdAt:       Date.now(),
  };
  saveImportedWallet(rec);
  return rec;
}

// ─── Decrypt (unlock for signing) ────────────────────────────────────────────

export async function unlockWithPin(address: string, pin: string): Promise<string> {
  const rec = getImportedWallet(address);
  if (!rec) throw new Error("Wallet not found");
  if (rec.protectedBy !== "pin") throw new Error("Wallet is not PIN-protected");
  const key = await deriveKeyFromPin(pin, b642buf(rec.salt), "decrypt");
  const pt  = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b642buf(rec.iv) },
    key,
    b642buf(rec.encryptedSecret),
  );
  return new TextDecoder().decode(pt);
}

export async function unlockWithPasskey(address: string): Promise<string> {
  const rec = getImportedWallet(address);
  if (!rec) throw new Error("Wallet not found");
  if (rec.protectedBy !== "passkey" || !rec.passkeyId) {
    throw new Error("Wallet is not passkey-protected");
  }
  const prfSecret = await getPasskeyPrfSecret(rec.passkeyId);
  const key = await deriveKeyFromPrf(prfSecret, b642buf(rec.salt), "decrypt");
  const pt  = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b642buf(rec.iv) },
    key,
    b642buf(rec.encryptedSecret),
  );
  return new TextDecoder().decode(pt);
}

// ─── Passkey ceremony helpers (WebAuthn PRF / hmac-secret) ───────────────────

const RP_NAME = "OrahDEX";

interface PrfExtensionResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

/**
 * Quick capability probe — does the runtime expose the PRF/hmac-secret
 * extension API? (Final per-authenticator support is only known after
 * `create()`; we still need a fallback in the UI.)
 */
export async function passkeyPrfLikelySupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Create a fresh passkey credential AND retrieve the PRF secret used to
 * encrypt the imported wallet. Throws if the authenticator does not support
 * the PRF / hmac-secret extension (caller should fall back to PIN).
 */
export async function createImportPasskey(label: string): Promise<{
  credentialId: string;
  prfSecret:    ArrayBuffer;
}> {
  if (!window.PublicKeyCredential) throw new Error("Passkeys not supported on this device");

  // 1) Register a new platform credential, requesting PRF support.
  const regChallenge = randomBytes(32);
  const userId       = randomBytes(16);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: regChallenge,
      rp:        { name: RP_NAME, id: window.location.hostname },
      user:      { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { alg: -7,   type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey:             "preferred",
        requireResidentKey:      false,
        userVerification:        "required",
      },
      timeout:     60_000,
      attestation: "none",
      extensions:  { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error("Passkey creation cancelled");

  const ext = cred.getClientExtensionResults() as PrfExtensionResults;
  if (!ext?.prf?.enabled) {
    throw new Error("Your device's passkey doesn't support the required encryption (PRF). Please use PIN instead.");
  }

  const credentialId = b642url(buf2b64(cred.rawId));

  // 2) Most authenticators only release the PRF secret on assert(), not on
  //    create(). If create() returned `results`, use it; otherwise immediately
  //    perform a get() to obtain the secret.
  let prfSecret = ext.prf.results?.first;
  if (!prfSecret) {
    prfSecret = await getPasskeyPrfSecret(credentialId);
  }

  return { credentialId, prfSecret };
}

/** Internal — perform a get() ceremony and pull out the PRF first secret. */
async function getPasskeyPrfSecret(credentialId: string): Promise<ArrayBuffer> {
  if (!window.PublicKeyCredential) throw new Error("Passkeys not supported on this device");
  const challenge = randomBytes(32);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b642buf(url2b64(credentialId)), type: "public-key" }],
      userVerification: "required",
      timeout:          60_000,
      extensions:       { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!assertion) throw new Error("Passkey authentication cancelled");

  const ext = assertion.getClientExtensionResults() as PrfExtensionResults;
  const secret = ext?.prf?.results?.first;
  if (!secret) throw new Error("Authenticator did not release a PRF secret");
  return secret;
}
