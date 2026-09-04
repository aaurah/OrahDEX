/**
 * watchOnlyWallet.ts — Read-only address tracking (no key material).
 *
 * Watch-only wallets let users monitor balances and transaction history
 * for any address without importing private keys. Signing is explicitly
 * blocked — users see a clear "read-only" error with a path to upgrade.
 *
 * Stored in localStorage as a JSON array; zero server round-trips.
 */

const STORAGE_KEY = "orahdex_watch_only_v1";

export interface WatchOnlyEntry {
  address:  string;               // EIP-55 checksummed EVM address (primary key)
  label:    string;               // user-provided display name
  chains?:  Record<string, string>; // optional { bsv, btc, ... } public addresses
  addedAt:  number;               // unix ms
}

// ── Storage ───────────────────────────────────────────────────────────────────

function readAll(): WatchOnlyEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeAll(entries: WatchOnlyEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listWatchOnly(): WatchOnlyEntry[] {
  return readAll();
}

export function getWatchOnly(address: string): WatchOnlyEntry | null {
  return readAll().find(e => e.address.toLowerCase() === address.toLowerCase()) ?? null;
}

/**
 * Add or update a watch-only entry.
 * Passing the same address again updates label and chains.
 */
export function addWatchOnly(
  entry: { address: string; label: string; chains?: Record<string, string> },
): WatchOnlyEntry {
  const all = readAll();
  const idx = all.findIndex(e => e.address.toLowerCase() === entry.address.toLowerCase());
  const rec: WatchOnlyEntry = {
    address: entry.address,
    label:   entry.label,
    chains:  entry.chains,
    addedAt: idx >= 0 ? all[idx].addedAt : Date.now(),
  };
  if (idx >= 0) all[idx] = rec; else all.push(rec);
  writeAll(all);
  return rec;
}

export function removeWatchOnly(address: string): void {
  writeAll(readAll().filter(e => e.address.toLowerCase() !== address.toLowerCase()));
}

export function isWatchOnly(address: string): boolean {
  return readAll().some(e => e.address.toLowerCase() === address.toLowerCase());
}

// ── OrahSigner integration ────────────────────────────────────────────────────

/**
 * Register all watch-only addresses into the OrahSigner registry.
 * Call once on app startup so getSignerForAddress() can resolve them.
 */
export async function registerWatchOnlySigners(): Promise<void> {
  const { createWatchOnlySigner, registerSigner } = await import("./orahSigner");
  for (const entry of readAll()) {
    registerSigner(createWatchOnlySigner(entry.address, entry.label));
  }
}
