/**
 * Solana (SOL) native transfer builder + broadcaster (browser-safe).
 *
 * Implements a SystemProgram::Transfer instruction with ed25519 signing using
 * SLIP-0010 key derivation — fully compatible with Phantom wallet keys.
 *
 * Flow:
 *   1. Derive ed25519 private key at m/44'/501'/0'/0' via SLIP-0010
 *   2. Fetch latest blockhash from Solana mainnet RPC
 *   3. Build binary transaction message (header + accounts + blockhash + instruction)
 *   4. Sign with ed25519 (no prehash — ed25519 signs the raw message)
 *   5. Encode as base64 and submit to mainnet RPC
 *
 * Dependencies already in the project:
 *   @noble/curves/ed25519   — signing
 *   @noble/hashes/hmac      — SLIP-0010 HMAC-SHA512
 *   @noble/hashes/sha2      — sha512
 *   @scure/bip39            — mnemonicToSeed
 */

// ── Base58 (Bitcoin alphabet — same as Solana) ───────────────────────────────

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  let n = BigInt(0);
  for (const c of s) {
    const i = BASE58.indexOf(c);
    if (i < 0) throw new Error(`Invalid base58 char: '${c}'`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

function base58Encode(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = BASE58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}

/** Decode a Solana address (base58) → 32-byte ed25519 public key. */
function decodeSolAddress(address: string): Uint8Array {
  const bytes = base58Decode(address);
  if (bytes.length !== 32)
    throw new Error(`Invalid Solana address length ${bytes.length} for '${address}'`);
  return bytes;
}

// ── Concat helper ─────────────────────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ── SLIP-0010 ed25519 key derivation ─────────────────────────────────────────

/**
 * Derive an ed25519 private key using SLIP-0010 at the given index path.
 * All components MUST be hardened (bit 31 set) — ed25519 only supports hardened.
 * Path: m/44'/501'/0'/0'  →  indexes = [44', 501', 0', 0']
 *
 * This is the same derivation as Phantom wallet (Phantom-compatible).
 */
async function slip10Derive(seed: Uint8Array, indexes: number[]): Promise<Uint8Array> {
  const { hmac }   = await import("@noble/hashes/hmac.js");
  const { sha512 } = await import("@noble/hashes/sha2.js");

  const SEED_KEY = new TextEncoder().encode("ed25519 seed");
  let I     = hmac(sha512, SEED_KEY, seed);
  let key   = I.slice(0, 32);
  let chain = I.slice(32);

  for (const index of indexes) {
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index >>> 0, false); // big-endian index
    I     = hmac(sha512, chain, data);
    key   = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

/** Derive the Solana ed25519 private key from a BIP39 seed. */
export async function deriveSolPrivKey(seed: Uint8Array): Promise<Uint8Array> {
  return slip10Derive(seed, [
    0x80000000 + 44,   // 44'
    0x80000000 + 501,  // 501'
    0x80000000 + 0,    // 0'
    0x80000000 + 0,    // 0'
  ]);
}

// ── Solana transaction binary format ─────────────────────────────────────────

/** Compact-u16 encoding used by Solana wire format. */
function compactU16(n: number): Uint8Array {
  if (n <= 0x7f) return new Uint8Array([n]);
  if (n <= 0x3fff) return new Uint8Array([(n & 0x7f) | 0x80, n >> 7]);
  throw new Error("compactU16 too large");
}

/** u64 little-endian */
function u64LE(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

// Solana SystemProgram address (all zeros = "11111111111111111111111111111111")
const SYSTEM_PROGRAM = new Uint8Array(32);

/**
 * Build the binary message (to be signed) for a SOL native transfer.
 *
 * Message layout (no versioned tx complexity — legacy format):
 *   [header: 3 bytes]
 *   [compact_u16: num_accounts]  [accounts: 3 × 32 bytes]
 *   [recent_blockhash: 32 bytes]
 *   [compact_u16: num_instructions]
 *   [instruction bytes]
 */
function buildTransferMessage(params: {
  senderPubkey:    Uint8Array; // 32 bytes
  recipientPubkey: Uint8Array; // 32 bytes
  lamports:        bigint;
  recentBlockhash: Uint8Array; // 32 bytes
}): Uint8Array {
  const { senderPubkey, recipientPubkey, lamports, recentBlockhash } = params;

  // Header: [numRequiredSignatures=1, numReadonlySignedAccounts=0, numReadonlyUnsignedAccounts=1]
  const header = new Uint8Array([1, 0, 1]);

  // Accounts: sender, recipient, SystemProgram
  const accountsSection = concat(
    compactU16(3),
    senderPubkey,
    recipientPubkey,
    SYSTEM_PROGRAM,
  );

  // Instruction: SystemProgram::Transfer
  // discriminator = [2, 0, 0, 0] (u32 LE = 2) + lamports as u64 LE = 12 bytes total
  const instrData = concat(new Uint8Array([2, 0, 0, 0]), u64LE(lamports));

  const instruction = concat(
    new Uint8Array([2]),          // program_id_index = 2 (SystemProgram is 3rd account)
    compactU16(2),                // 2 account indices
    new Uint8Array([0, 1]),       // sender=0, recipient=1
    compactU16(instrData.length), // data length
    instrData,
  );

  const instructionsSection = concat(compactU16(1), instruction);

  return concat(header, accountsSection, recentBlockhash, instructionsSection);
}

// ── Solana RPC ────────────────────────────────────────────────────────────────

const SOL_RPC = "https://api.mainnet-beta.solana.com";

async function solRpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(SOL_RPC, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`Solana RPC failed: ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(`Solana RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json.result;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface SolSendResult {
  txid:     string;
  feeSol:   number;
}

/**
 * Sign and broadcast a native SOL transfer.
 *
 * @param senderAddress    Solana address (base58) of the sender
 * @param recipientAddress Solana address (base58) of the recipient
 * @param amountSol        Amount in SOL (NOT lamports; 1 SOL = 1e9 lamports)
 * @param privateKey       32-byte ed25519 private key (from SLIP-0010 m/44'/501'/0'/0')
 */
export async function buildSignBroadcastSolTx(
  senderAddress:    string,
  recipientAddress: string,
  amountSol:        number,
  privateKey:       Uint8Array,
): Promise<SolSendResult> {
  const { ed25519 } = await import("@noble/curves/ed25519.js");

  const senderPubkey    = ed25519.getPublicKey(privateKey);
  const recipientPubkey = decodeSolAddress(recipientAddress);

  const lamports = BigInt(Math.round(amountSol * 1_000_000_000));
  if (lamports <= 0n) throw new Error("Amount must be positive");

  // Fetch recent blockhash
  const blockhashResult = await solRpc("getLatestBlockhash", [{ commitment: "finalized" }]);
  const blockhashStr: string = blockhashResult?.value?.blockhash;
  if (!blockhashStr) throw new Error("Failed to fetch Solana blockhash");
  const recentBlockhash = base58Decode(blockhashStr);
  if (recentBlockhash.length !== 32)
    throw new Error(`Unexpected blockhash length: ${recentBlockhash.length}`);

  // Build the message (bytes to sign)
  const message = buildTransferMessage({ senderPubkey, recipientPubkey, lamports, recentBlockhash });

  // Sign with ed25519 (no prehash — ed25519 signs the raw message bytes)
  const signature = ed25519.sign(message, privateKey);
  if (signature.length !== 64)
    throw new Error(`Unexpected ed25519 signature length: ${signature.length}`);

  // Assemble signed transaction
  //   [compact_u16: num_signatures = 1] [signature: 64 bytes] [message]
  const signedTx = concat(compactU16(1), signature, message);

  // Encode as base64 for sendTransaction
  const base64Tx = btoa(String.fromCharCode(...signedTx));

  // Submit
  const txid = await solRpc("sendTransaction", [
    base64Tx,
    { encoding: "base64", preflightCommitment: "confirmed" },
  ]);

  if (typeof txid !== "string")
    throw new Error(`Unexpected sendTransaction response: ${JSON.stringify(txid)}`);

  const FEE_SOL = 0.000005; // 5000 lamports base fee per signature
  return { txid, feeSol: FEE_SOL };
}
