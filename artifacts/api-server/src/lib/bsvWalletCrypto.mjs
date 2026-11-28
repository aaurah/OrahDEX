import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import * as secp from "@noble/secp256k1";

const BSV_SCRYPT_SALT = "orahdex-bsv-salt-v1";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function deriveKey(secret) {
  const normalized = typeof secret === "string" ? secret.trim() : "";
  if (!normalized) {
    throw new Error("BSV wallet encryption secret is not configured.");
  }
  return scryptSync(normalized, BSV_SCRYPT_SALT, 32);
}

function encryptWithDerivedKey(plaintext, key) {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decryptWithDerivedKey(stored, key) {
  if (typeof stored !== "string") {
    throw new Error("Invalid stored BSV wallet ciphertext.");
  }
  const parts = stored.split(":");
  if (parts.length !== 3 || parts.some((part) => !/^(?:[0-9a-fA-F]{2})+$/.test(part))) {
    throw new Error("Invalid stored BSV wallet ciphertext.");
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  if (iv.length !== 16 || tag.length !== 16 || encrypted.length === 0) {
    throw new Error("Invalid stored BSV wallet ciphertext.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function encryptBsvWalletKey(plaintext, secret) {
  return encryptWithDerivedKey(plaintext, deriveKey(secret));
}

export function decryptBsvWalletKey(stored, secret) {
  return decryptWithDerivedKey(stored, deriveKey(secret));
}

function hash256(bytes) {
  const first = createHash("sha256").update(bytes).digest();
  return createHash("sha256").update(first).digest();
}

function hash160(bytes) {
  const sha = createHash("sha256").update(bytes).digest();
  return createHash("ripemd160").update(sha).digest();
}

function base58Encode(bytes) {
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let result = "";
  while (value > 0n) {
    result = BASE58_ALPHABET[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = `1${result}`;
  }
  return result;
}

export function privateKeyMatchesBsvAddress(privateKeyHex, address) {
  if (typeof privateKeyHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
    return false;
  }
  try {
    return bsvAddressFromPrivateKey(privateKeyHex) === address;
  } catch {
    return false;
  }
}

export function bsvAddressFromPrivateKey(privateKeyHex) {
  if (typeof privateKeyHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
    throw new Error("Invalid BSV private key encoding.");
  }
  const publicKey = secp.getPublicKey(Buffer.from(privateKeyHex, "hex"), true);
  const versioned = Buffer.concat([Buffer.from([0x00]), hash160(Buffer.from(publicKey))]);
  const checksum = hash256(versioned).subarray(0, 4);
  return base58Encode(Buffer.concat([versioned, checksum]));
}

export function verifyBsvWalletRecords(rows, secrets) {
  const candidates = [...new Set((secrets ?? []).filter((value) => typeof value === "string" && value.trim()))];
  const candidateKeys = candidates.map((secret) => deriveKey(secret));
  let verified = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    let matches = false;
    for (const key of candidateKeys) {
      try {
        const privateKeyHex = decryptWithDerivedKey(row.encrypted_key, key);
        if (privateKeyMatchesBsvAddress(privateKeyHex, row.bsv_address)) {
          matches = true;
          break;
        }
      } catch {
        // Try the next configured key without exposing decryption details.
      }
    }
    if (matches) verified++;
    else failed++;
  }

  return {
    status: rows?.length === 0 ? "empty" : failed === 0 ? "verified" : "failed",
    checked: rows?.length ?? 0,
    verified,
    failed,
  };
}

export function prepareBsvWalletReencryption(rows, currentSecret, nextSecret) {
  const current = typeof currentSecret === "string" ? currentSecret.trim() : "";
  const next = typeof nextSecret === "string" ? nextSecret.trim() : "";
  if (!current || !next) {
    throw new Error("Both current and staged BSV wallet secrets are required.");
  }
  if (current === next) {
    throw new Error("The staged BSV wallet secret must differ from the current secret.");
  }
  const currentKey = deriveKey(current);
  const nextKey = deriveKey(next);

  const updates = [];
  for (const row of rows ?? []) {
    let privateKeyHex = null;
    for (const key of [currentKey, nextKey]) {
      try {
        const candidate = decryptWithDerivedKey(row.encrypted_key, key);
        if (privateKeyMatchesBsvAddress(candidate, row.bsv_address)) {
          privateKeyHex = candidate;
          break;
        }
      } catch {
        // A row may already use the staged key; continue only to that key.
      }
    }
    if (!privateKeyHex) {
      throw new Error("At least one stored BSV wallet could not be verified.");
    }

    const encryptedKey = encryptWithDerivedKey(privateKeyHex, nextKey);
    const roundTrip = decryptWithDerivedKey(encryptedKey, nextKey);
    if (!privateKeyMatchesBsvAddress(roundTrip, row.bsv_address)) {
      throw new Error("A staged BSV wallet ciphertext failed verification.");
    }
    updates.push({
      evm_address: row.evm_address,
      expected_ciphertext: row.encrypted_key,
      encrypted_key: encryptedKey,
    });
  }
  return updates;
}
