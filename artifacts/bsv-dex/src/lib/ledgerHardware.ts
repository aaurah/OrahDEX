/**
 * ledgerHardware.ts — LEGACY stub (hw-app-eth path removed).
 *
 * The hw-app-eth / hw-transport-webhid packages have been removed to eliminate
 * the transitive elliptic dependency (GHSA-848j-6mx2-7j84 / critical chain via
 * @ethersproject/signing-key). All Ledger signing now goes through ledgerDMK.ts
 * which uses the official Device Management Kit (no elliptic dependency).
 *
 * This file is kept so that any dynamic import('./ledgerHardware') call in
 * orahSigner.ts compiles; functions throw at runtime with a clear migration
 * message rather than a cryptic "module not found" error.
 */

import type { EvmTxParams, TypedDataPayload } from "./orahSigner";

export type { LedgerStatus } from "./ledgerDMK";

// ── Standard derivation paths (still useful as constants) ─────────────────────
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

// ── Removed types (kept as stubs for backward-compat type references) ─────────
export interface LedgerAccount {
  path:    string;
  address: string;
  label:   string;
}

// LedgerSession previously held a TransportWebHID + Eth instance. Callers using
// createLedgerSigner should migrate to createLedgerDMKSigner in orahSigner.ts.
export interface LedgerSession {
  transport: unknown;
  eth:       unknown;
}

// ── Runtime guard ─────────────────────────────────────────────────────────────
function _removed(fn: string): never {
  throw new Error(
    `ledgerHardware.${fn}: the hw-app-eth legacy path has been removed. ` +
    `Use createLedgerDMKSigner (ledgerDMK.ts) instead.`,
  );
}

// ── Stubs ─────────────────────────────────────────────────────────────────────
export function isWebHIDSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

export async function openLedgerSession(): Promise<LedgerSession> {
  _removed("openLedgerSession");
}

export async function deriveAddress(_eth: unknown, _path: string): Promise<string> {
  _removed("deriveAddress");
}

export async function deriveAccounts(_eth: unknown): Promise<LedgerAccount[]> {
  _removed("deriveAccounts");
}

export async function ledgerSignMessage(
  _eth:  unknown,
  _path: string,
  _msg:  string,
): Promise<string> {
  _removed("ledgerSignMessage");
}

export async function ledgerSignTypedData(
  _eth:     unknown,
  _path:    string,
  _payload: TypedDataPayload,
): Promise<`0x${string}`> {
  _removed("ledgerSignTypedData");
}

export async function ledgerSignTransaction(
  _eth:  unknown,
  _path: string,
  _tx:   EvmTxParams,
): Promise<string> {
  _removed("ledgerSignTransaction");
}

export function ledgerErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const msg = String((err as any)?.message ?? err);
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
