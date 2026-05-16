/**
 * Ledger hardware wallet integration — LEGACY (hw-app-eth + hw-transport-webhid).
 *
 * This module uses the old ledgerjs packages which are maintained but no longer
 * the recommended path for new wallet integrations.
 *
 * PREFERRED: Use ledgerDMK.ts which wraps the official Device Management Kit:
 *   @ledgerhq/device-management-kit
 *   @ledgerhq/device-transport-kit-web-hid
 *   @ledgerhq/device-signer-kit-ethereum
 *
 * SDK:  https://github.com/LedgerHQ/device-sdk-ts
 * Docs: https://developers.ledger.com/docs/device-interaction/getting-started
 *
 * This file is retained for backward-compatibility with any code paths that
 * have not yet been migrated to the DMK. New features should be added to
 * ledgerDMK.ts instead.
 */
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Eth from "@ledgerhq/hw-app-eth";
import { TransportError } from "@ledgerhq/errors";
import type { EvmTxParams, TypedDataPayload } from "./orahSigner";

// ── Standard derivation paths ─────────────────────────────────────────────────
export const LEDGER_PATHS: { label: string; path: string }[] = [
  { label: "Ethereum — Account 1",       path: "m/44'/60'/0'/0/0" },
  { label: "Ethereum — Account 2",       path: "m/44'/60'/0'/0/1" },
  { label: "Ethereum — Account 3",       path: "m/44'/60'/0'/0/2" },
  { label: "Ethereum — Account 4",       path: "m/44'/60'/0'/0/3" },
  { label: "Ethereum — Account 5",       path: "m/44'/60'/0'/0/4" },
  { label: "Legacy (MEW / MyCrypto) 1",  path: "m/44'/60'/0'/0"   },
  { label: "Legacy (MEW / MyCrypto) 2",  path: "m/44'/60'/0'/1"   },
  { label: "BNB Smart Chain — Acc 1",    path: "m/44'/60'/0'/0/0" },
];

export type LedgerStatus =
  | "idle"
  | "connecting"
  | "awaiting_app"
  | "deriving"
  | "ready"
  | "error";

export interface LedgerAccount {
  path:    string;
  address: string;
  label:   string;
}

export interface LedgerSession {
  transport: TransportWebHID;
  eth:       Eth;
}

// ── WebHID support check ──────────────────────────────────────────────────────
export function isWebHIDSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

// ── Open a transport + Ethereum app session ───────────────────────────────────
export async function openLedgerSession(): Promise<LedgerSession> {
  const transport = await TransportWebHID.request();
  const eth       = new Eth(transport);
  return { transport, eth };
}

// ── Derive one address ────────────────────────────────────────────────────────
export async function deriveAddress(eth: Eth, path: string): Promise<string> {
  const { address } = await eth.getAddress(path.replace(/^m\//, ""), false, false);
  return address;
}

// ── Derive the first N accounts ──────────────────────────────────────────────
export async function deriveAccounts(
  eth:   Eth,
  paths: typeof LEDGER_PATHS = LEDGER_PATHS.slice(0, 5),
): Promise<LedgerAccount[]> {
  const accounts: LedgerAccount[] = [];
  for (const p of paths) {
    try {
      const address = await deriveAddress(eth, p.path);
      accounts.push({ path: p.path, address, label: p.label });
    } catch {
      // skip paths that fail (e.g. app not open)
    }
  }
  return accounts;
}

// ── Sign a personal_sign message ─────────────────────────────────────────────
export async function ledgerSignMessage(eth: Eth, path: string, message: string): Promise<string> {
  const hex = Buffer.from(message).toString("hex");
  const sig = await eth.signPersonalMessage(path.replace(/^m\//, ""), hex);
  const v   = sig.v.toString(16).padStart(2, "0");
  return `0x${sig.r}${sig.s}${v}`;
}

// ── Sign EIP-712 typed data ───────────────────────────────────────────────────
/**
 * Tries clear signing first (human-readable on device, Ethereum app v1.10+).
 * Falls back to hashed signing (blind — shows hash on device) on older firmware.
 */
export async function ledgerSignTypedData(
  eth:       Eth,
  path:      string,
  payload:   TypedDataPayload,
): Promise<`0x${string}`> {
  const hdPath = path.replace(/^m\//, "");

  // Build EIP712Domain type entries from the domain object
  const domainFields: { name: string; type: string }[] = [];
  if (payload.domain.name)              domainFields.push({ name: "name",              type: "string"  });
  if (payload.domain.version)           domainFields.push({ name: "version",           type: "string"  });
  if (payload.domain.chainId)           domainFields.push({ name: "chainId",           type: "uint256" });
  if (payload.domain.verifyingContract) domainFields.push({ name: "verifyingContract", type: "address" });

  const jsonMessage = {
    types: { EIP712Domain: domainFields, ...payload.types },
    primaryType: payload.primaryType,
    domain:      payload.domain,
    message:     payload.message,
  };

  // Attempt 1: clear signing — device shows human-readable fields
  try {
    const sig = await (eth as any).signEIP712Message(hdPath, jsonMessage);
    return _assembleSig(sig);
  } catch {
    // Clear signing not supported on this device/firmware — fall through
  }

  // Attempt 2: hashed signing — device shows domain + struct hash (blind sign)
  try {
    const { hashTypedData } = await import("viem");

    // Compute domain separator: hash with just EIP712Domain fields
    const domainSeparator = hashTypedData({
      domain:      payload.domain as any,
      types:       { EIP712Domain: domainFields },
      primaryType: "EIP712Domain" as any,
      message:     payload.domain as any,
    });

    // Compute struct hash: hash the full typed data
    const structuredDataHash = hashTypedData({
      domain:      payload.domain as any,
      types:       payload.types as any,
      primaryType: payload.primaryType as any,
      message:     payload.message as any,
    });

    const sig = await eth.signEIP712HashedMessage(
      hdPath,
      domainSeparator.slice(2),      // strip 0x
      structuredDataHash.slice(2),
    );
    return _assembleSig(sig);
  } catch (err) {
    throw new Error(`Ledger EIP-712 signing failed: ${ledgerErrMsg(err)}`);
  }
}

// ── Sign an EVM transaction ───────────────────────────────────────────────────
/**
 * Serializes the unsigned transaction, sends to Ledger for signing,
 * and returns the signed raw transaction hex (ready to broadcast).
 */
export async function ledgerSignTransaction(
  eth:  Eth,
  path: string,
  tx:   EvmTxParams,
): Promise<string> {
  const hdPath = path.replace(/^m\//, "");
  const { serializeTransaction } = await import("viem");

  // Serialize unsigned tx to get the RLP payload Ledger needs
  let unsignedHex: string;
  if (tx.maxFeePerGas !== undefined) {
    unsignedHex = serializeTransaction({
      type:                 "eip1559",
      chainId:              tx.chainId,
      to:                   tx.to,
      value:                tx.value ?? 0n,
      data:                 tx.data ?? "0x",
      nonce:                tx.nonce ?? 0,
      gas:                  tx.gasLimit ?? 200_000n,
      maxFeePerGas:         tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 1_000_000_000n,
    });
  } else {
    unsignedHex = serializeTransaction({
      type:     "legacy",
      chainId:  tx.chainId,
      to:       tx.to,
      value:    tx.value ?? 0n,
      data:     tx.data ?? "0x",
      nonce:    tx.nonce ?? 0,
      gas:      tx.gasLimit ?? 200_000n,
      gasPrice: tx.gasPrice ?? 50_000_000_000n,
    });
  }

  // Ledger expects hex without 0x prefix
  const rawHex = unsignedHex.replace(/^0x/, "");
  const sig    = await eth.signTransaction(hdPath, rawHex, null);

  // Re-serialize with the signature attached
  if (tx.maxFeePerGas !== undefined) {
    return serializeTransaction(
      {
        type:                 "eip1559",
        chainId:              tx.chainId,
        to:                   tx.to,
        value:                tx.value ?? 0n,
        data:                 tx.data ?? "0x",
        nonce:                tx.nonce ?? 0,
        gas:                  tx.gasLimit ?? 200_000n,
        maxFeePerGas:         tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 1_000_000_000n,
      },
      {
        r:        `0x${sig.r}` as `0x${string}`,
        s:        `0x${sig.s}` as `0x${string}`,
        yParity:  sig.v % 2 === 0 ? 0 : 1,
      },
    );
  } else {
    return serializeTransaction(
      {
        type:     "legacy",
        chainId:  tx.chainId,
        to:       tx.to,
        value:    tx.value ?? 0n,
        data:     tx.data ?? "0x",
        nonce:    tx.nonce ?? 0,
        gas:      tx.gasLimit ?? 200_000n,
        gasPrice: tx.gasPrice ?? 50_000_000_000n,
      },
      {
        r: `0x${sig.r}` as `0x${string}`,
        s: `0x${sig.s}` as `0x${string}`,
        v: BigInt(sig.v),
      },
    );
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _assembleSig(sig: { v: number; r: string; s: string }): `0x${string}` {
  const v = sig.v.toString(16).padStart(2, "0");
  const r = sig.r.replace(/^0x/, "").padStart(64, "0");
  const s = sig.s.replace(/^0x/, "").padStart(64, "0");
  return `0x${r}${s}${v}`;
}

// ── Normalise error messages into readable strings ────────────────────────────
export function ledgerErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const e   = err as any;
  const msg = String(e?.message ?? e);

  if (msg.includes("0x6700") || msg.includes("0x6511") || msg.includes("0x6d00"))
    return "Ethereum app not open — unlock your Ledger and open the Ethereum app.";
  if (msg.includes("0x5515") || msg.includes("locked"))
    return "Device is locked — enter your PIN on the Ledger.";
  if (msg.includes("denied") || msg.includes("cancelled") || msg.includes("0x6985"))
    return "Action denied on device — press the right button to approve.";
  if (msg.includes("No device selected") || msg.includes("Unable to claim"))
    return "No device selected or another app is using it. Close Ledger Live and retry.";
  if (msg.includes("SecurityError"))
    return "Browser security error — ensure you are on a secure (HTTPS) page.";
  if (e instanceof TransportError)
    return `Transport error: ${e.message}`;

  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
