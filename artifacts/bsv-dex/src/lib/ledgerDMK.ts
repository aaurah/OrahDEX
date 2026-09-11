/**
 * ledgerDMK.ts — Ledger Device Management Kit integration
 *
 * This is the current official Ledger SDK for wallet integrations (2025+).
 * Replaces the legacy hw-app-eth / hw-transport-webhid approach.
 *
 * SDK:   https://github.com/LedgerHQ/device-sdk-ts
 * Docs:  https://developers.ledger.com/docs/device-interaction/getting-started
 *
 * Key packages:
 *   @ledgerhq/device-management-kit        — core kit (device discovery, session)
 *   @ledgerhq/device-transport-kit-web-hid — WebHID transport
 *   @ledgerhq/device-signer-kit-ethereum   — Ethereum signing with Clear Signing support
 *
 * Architecture:
 *   1. One DMK singleton per app — built once, reused for all devices
 *   2. dmkConnect() → { sessionId, device } — user must call from a click handler
 *   3. SignerEthBuilder({ dmk, sessionId }) — built per-session
 *   4. Signing methods return { observable, cancel } — we wrap them in Promises
 *   5. Clear Signing: device shows human-readable tx fields (with originToken from Ledger partner program)
 */

import {
  DeviceManagementKitBuilder,
  DeviceActionStatus,
  type DeviceSessionId,
  type DiscoveredDevice,
  type DeviceActionState,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";
import {
  SignerEthBuilder,
  type Signature,
  type TypedData,
  type TypedDataDomain,
} from "@ledgerhq/device-signer-kit-ethereum";
import type { Observable } from "rxjs";
import type { EvmTxParams, TypedDataPayload } from "./orahSigner";

// ── DMK singleton ─────────────────────────────────────────────────────────────
// The DMK must be instantiated once per app lifetime.
// Lazy-init on first use — keeps startup cost zero.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _dmk: ReturnType<typeof _buildDMK> | null = null;

function _buildDMK() {
  return new DeviceManagementKitBuilder()
    .addTransport(webHidTransportFactory)
    .build();
}

export function getDMK() {
  if (!_dmk) _dmk = _buildDMK();
  return _dmk;
}

// ── Session type ──────────────────────────────────────────────────────────────

export interface DMKSession {
  sessionId: DeviceSessionId;
  device:    DiscoveredDevice;
}

// ── Connect — must be called from a user gesture (click handler) ──────────────
/**
 * Opens the browser WebHID device picker, discovers the first Ledger device,
 * and establishes a DMK session. Returns a DMKSession you can pass to the
 * signing functions below.
 *
 * Must be called in response to a user interaction (button click etc.).
 */
export async function dmkConnect(): Promise<DMKSession> {
  const dmk = getDMK();

  const device = await new Promise<DiscoveredDevice>((resolve, reject) => {
    const sub = dmk.startDiscovering({}).subscribe({
      next: (d) => {
        dmk.stopDiscovering();
        sub.unsubscribe();
        resolve(d);
      },
      error: reject,
    });
  });

  const sessionId = await dmk.connect({ device });
  return { sessionId, device };
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function dmkDisconnect(sessionId: DeviceSessionId): Promise<void> {
  try {
    await getDMK().disconnect({ sessionId });
  } catch {
    // silently ignore disconnect errors (device may already be gone)
  }
}

// ── Derive Ethereum address ───────────────────────────────────────────────────

export async function dmkGetAddress(
  sessionId: DeviceSessionId,
  path:      string,
  verify    = false,
): Promise<string> {
  const dmk      = getDMK();
  const signer   = new SignerEthBuilder({ dmk, sessionId }).build();
  const hdPath   = path.replace(/^m\//, "");
  const { observable } = signer.getAddress(hdPath, { checkOnDevice: verify });
  const result   = await _resolveAction(observable);
  return result.address;
}

// ── Derive multiple accounts ──────────────────────────────────────────────────

export interface DMKAccount {
  path:    string;
  address: string;
  label:   string;
}

export const DMK_DEFAULT_PATHS: { label: string; path: string }[] = [
  { label: "Ethereum — Account 1",      path: "m/44'/60'/0'/0/0" },
  { label: "Ethereum — Account 2",      path: "m/44'/60'/0'/0/1" },
  { label: "Ethereum — Account 3",      path: "m/44'/60'/0'/0/2" },
  { label: "Ethereum — Account 4",      path: "m/44'/60'/0'/0/3" },
  { label: "Ethereum — Account 5",      path: "m/44'/60'/0'/0/4" },
  { label: "Legacy (MEW/MyCrypto) 1",   path: "m/44'/60'/0'/0"   },
  { label: "BNB Smart Chain — Acc 1",   path: "m/44'/60'/0'/0/0" },
];

export async function dmkDeriveAccounts(
  sessionId: DeviceSessionId,
  paths: typeof DMK_DEFAULT_PATHS = DMK_DEFAULT_PATHS.slice(0, 5),
): Promise<DMKAccount[]> {
  const accounts: DMKAccount[] = [];
  for (const p of paths) {
    try {
      const address = await dmkGetAddress(sessionId, p.path);
      accounts.push({ path: p.path, address, label: p.label });
    } catch {
      // skip paths that fail (app not open, firmware too old, etc.)
    }
  }
  return accounts;
}

// ── Sign EIP-712 typed data — with native Clear Signing ──────────────────────
/**
 * Signs EIP-712 typed data using the DMK signer-eth.
 * If the device has the Ethereum app ≥ v1.10 and the types are registered in
 * Ledger's Clear Signing Registry, the device shows human-readable fields.
 * Otherwise it falls back to hashed (blind) signing automatically.
 *
 * For full Clear Signing support, register with the Ledger partner program
 * to receive an originToken, and pass it as the third argument.
 */
export async function dmkSignTypedData(
  sessionId:   DeviceSessionId,
  path:        string,
  payload:     TypedDataPayload,
  originToken?: string,
): Promise<`0x${string}`> {
  const dmk    = getDMK();
  const signer = new SignerEthBuilder({ dmk, sessionId, originToken }).build();
  const hdPath = path.replace(/^m\//, "");

  // Build domain fields array from the domain object
  const domainFields: TypedData["types"][string] = [];
  if (payload.domain.name)              domainFields.push({ name: "name",              type: "string"  });
  if (payload.domain.version)           domainFields.push({ name: "version",           type: "string"  });
  if (payload.domain.chainId !== undefined) domainFields.push({ name: "chainId",       type: "uint256" });
  if (payload.domain.verifyingContract) domainFields.push({ name: "verifyingContract", type: "address" });
  if (payload.domain.salt)              domainFields.push({ name: "salt",              type: "bytes32" });

  // Normalise domain — DMK TypedDataDomain expects chainId as a number
  const domain: TypedDataDomain = {
    ...(payload.domain.name              ? { name:              String(payload.domain.name)              } : {}),
    ...(payload.domain.version           ? { version:           String(payload.domain.version)           } : {}),
    ...(payload.domain.chainId !== undefined
      ? { chainId: typeof payload.domain.chainId === "bigint"
            ? Number(payload.domain.chainId) : Number(payload.domain.chainId) }
      : {}),
    ...(payload.domain.verifyingContract ? { verifyingContract: String(payload.domain.verifyingContract) } : {}),
  };

  const typedData: TypedData = {
    domain,
    types: {
      EIP712Domain: domainFields,
      ...Object.fromEntries(
        Object.entries(payload.types).map(([k, v]) => [k, v]),
      ),
    },
    primaryType: payload.primaryType,
    message:     payload.message,
  };

  const { observable } = signer.signTypedData(hdPath, typedData);
  const sig = await _resolveAction(observable);
  return _assembleSig(sig);
}

// ── Sign an EVM transaction ───────────────────────────────────────────────────
/**
 * Serializes the unsigned EVM transaction, sends to the Ledger device for
 * signing (with Clear Signing metadata when available), and returns the signed
 * raw transaction hex ready to broadcast.
 */
export async function dmkSignTransaction(
  sessionId:   DeviceSessionId,
  path:        string,
  tx:          EvmTxParams,
  originToken?: string,
): Promise<string> {
  const dmk    = getDMK();
  const signer = new SignerEthBuilder({ dmk, sessionId, originToken }).build();
  const hdPath = path.replace(/^m\//, "");

  const { serializeTransaction } = await import("viem");

  // Serialize the unsigned transaction to get the RLP payload
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

  // DMK signTransaction takes Uint8Array (raw RLP bytes)
  const rawHex  = unsignedHex.replace(/^0x/, "");
  const txBytes = Uint8Array.from(
    (rawHex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  );

  const { observable } = signer.signTransaction(hdPath, txBytes);
  const sig = await _resolveAction(observable);

  // Re-serialize with the r/s/v signature attached
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
        r:       sig.r as `0x${string}`,
        s:       sig.s as `0x${string}`,
        yParity: sig.v % 2 === 0 ? 0 : 1,
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
        r: sig.r as `0x${string}`,
        s: sig.s as `0x${string}`,
        v: BigInt(sig.v),
      },
    );
  }
}

// ── Sign a personal message ───────────────────────────────────────────────────

export async function dmkSignMessage(
  sessionId: DeviceSessionId,
  path:      string,
  message:   string,
): Promise<`0x${string}`> {
  const dmk    = getDMK();
  const signer = new SignerEthBuilder({ dmk, sessionId }).build();
  const hdPath = path.replace(/^m\//, "");
  const { observable } = signer.signMessage(hdPath, message);
  const sig = await _resolveAction(observable);
  return _assembleSig(sig);
}

// ── Observable → Promise adapter ──────────────────────────────────────────────
/**
 * Subscribes to a DMK DeviceAction Observable and resolves when the action
 * reaches DeviceActionStatus.Completed, or rejects on Error.
 *
 * Intermediate Pending states (user confirmation prompts etc.) are ignored
 * here — the device UI drives that interaction directly.
 */
function _resolveAction<Output, Err, IV>(
  observable: Observable<DeviceActionState<Output, Err, IV>>,
): Promise<Output> {
  return new Promise<Output>((resolve, reject) => {
    const sub = observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          resolve(state.output);
          sub.unsubscribe();
        } else if (state.status === DeviceActionStatus.Error) {
          reject(state.error);
          sub.unsubscribe();
        }
      },
      error: (err) => reject(err),
    });
  });
}

// ── Assemble r/s/v into a compact hex signature ───────────────────────────────

function _assembleSig(sig: Signature): `0x${string}` {
  const r = String(sig.r).replace(/^0x/, "").padStart(64, "0");
  const s = String(sig.s).replace(/^0x/, "").padStart(64, "0");
  const v = sig.v.toString(16).padStart(2, "0");
  return `0x${r}${s}${v}`;
}

// ── isWebHIDSupported (re-export for convenience) ─────────────────────────────
export function isDMKSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

// ── Human-readable error messages ────────────────────────────────────────────
export function dmkErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const e   = err as Record<string, unknown>;
  const msg = String((e?.message as string) ?? e);

  if (msg.includes("0x6700") || msg.includes("0x6511") || msg.includes("0x6d00"))
    return "Ethereum app not open — unlock your Ledger and open the Ethereum app.";
  if (msg.includes("0x5515") || msg.includes("locked"))
    return "Device is locked — enter your PIN on the Ledger.";
  if (msg.includes("denied") || msg.includes("cancelled") || msg.includes("0x6985"))
    return "Action denied on device.";
  if (msg.includes("No device selected") || msg.includes("Unable to claim"))
    return "No device selected or another app is using it. Close Ledger Live and retry.";
  if (msg.includes("SecurityError"))
    return "Browser security error — ensure you are on a secure (HTTPS) page.";

  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}
