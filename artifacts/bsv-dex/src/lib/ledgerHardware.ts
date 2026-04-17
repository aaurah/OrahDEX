/**
 * Ledger hardware wallet integration via WebHID.
 * Supports Chrome / Edge 89+. Falls back to Ledger Live (WalletConnect) on unsupported browsers.
 */
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Eth from "@ledgerhq/hw-app-eth";
import { TransportError } from "@ledgerhq/errors";

// ── standard derivation paths ─────────────────────────────────────────────────
export const LEDGER_PATHS: { label: string; path: string }[] = [
  { label: "Ethereum — Account 1",  path: "m/44'/60'/0'/0/0" },
  { label: "Ethereum — Account 2",  path: "m/44'/60'/0'/0/1" },
  { label: "Ethereum — Account 3",  path: "m/44'/60'/0'/0/2" },
  { label: "Ethereum — Account 4",  path: "m/44'/60'/0'/0/3" },
  { label: "Ethereum — Account 5",  path: "m/44'/60'/0'/0/4" },
  { label: "Legacy (MEW / MyCrypto) 1", path: "m/44'/60'/0'/0" },
  { label: "Legacy (MEW / MyCrypto) 2", path: "m/44'/60'/0'/1" },
  { label: "BNB Smart Chain — Acc 1",   path: "m/44'/60'/0'/0/0" },
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

// ── open a transport + Ethereum app session ───────────────────────────────────
export async function openLedgerSession(): Promise<LedgerSession> {
  const transport = await TransportWebHID.request();
  const eth       = new Eth(transport);
  return { transport, eth };
}

// ── derive one address ────────────────────────────────────────────────────────
export async function deriveAddress(eth: Eth, path: string): Promise<string> {
  const { address } = await eth.getAddress(path.replace(/^m\//, ""), false, false);
  return address;
}

// ── derive the first N accounts ──────────────────────────────────────────────
export async function deriveAccounts(
  eth: Eth,
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

// ── sign a personal_sign message ─────────────────────────────────────────────
export async function ledgerSignMessage(
  eth:     Eth,
  path:    string,
  message: string,
): Promise<string> {
  const hex = Buffer.from(message).toString("hex");
  const sig = await eth.signPersonalMessage(path.replace(/^m\//, ""), hex);
  return `0x${sig.r}${sig.s}${(sig.v + 27).toString(16).padStart(2, "0")}`;
}

// ── normalise error messages into readable strings ────────────────────────────
export function ledgerErrMsg(err: unknown): string {
  if (!err) return "Unknown error";
  const e = err as any;
  const msg: string = e?.message ?? String(e);

  if (msg.includes("0x6700") || msg.includes("0x6511") || msg.includes("0x6d00"))
    return "Ethereum app not open — unlock your Ledger and open the Ethereum app.";
  if (msg.includes("0x5515") || msg.includes("locked"))
    return "Device is locked — enter your PIN on the Ledger.";
  if (msg.includes("denied") || msg.includes("cancelled") || msg.includes("0x6985"))
    return "Action denied on device — press the right button to approve.";
  if (msg.includes("No device selected") || msg.includes("Unable to claim"))
    return "No device selected or another app is using it. Close Ledger Live and retry.";
  if (msg.includes("SecurityError"))
    return "Browser security error — ensure you're on a secure (HTTPS) page.";
  if (e instanceof TransportError)
    return `Transport error: ${e.message}`;

  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
