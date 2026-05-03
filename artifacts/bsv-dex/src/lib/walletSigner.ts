/**
 * Unified signing-time account loader.
 *
 * For the address that's currently connected as an "orah-wallet" provider:
 *   1. Look it up in the new walletPin store (PIN- or passkey-encrypted import).
 *      • PIN-protected   → open the global PIN prompt, decrypt, return account.
 *      • Passkey-protected → trigger WebAuthn-PRF assertion, decrypt, return.
 *   2. Fallback: legacy passkey wallet (registerPasskeyWallet path).
 *
 * This is the ONLY entrypoint Swap / Withdraw / Trade should call to obtain
 * a viem account for signing. Direct calls to `getViemAccountForOrahWallet`
 * skip the imported-wallet store and break PIN-imported users.
 */

import type { Account } from "viem";
import {
  getImportedWallet,
  unlockWithPin,
  unlockWithPasskey,
} from "@/lib/walletPin";
import { getViemAccountForOrahWallet } from "@/lib/passkeyWallet";
import { usePinPromptStore } from "@/store/usePinPromptStore";

async function secretToAccount(secret: string): Promise<Account> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const trimmed = secret.trim();

  // Raw 0x private key
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return privateKeyToAccount(trimmed as `0x${string}`);
  }

  // BIP-39 mnemonic (12/15/18/21/24 words) → derive m/44'/60'/0'/0/0
  const words = trimmed.split(/\s+/);
  if (words.length < 12) throw new Error("Stored secret is not a recognised key format");
  const { HDKey }              = await import("@scure/bip32");
  const { mnemonicToSeedSync } = await import("@scure/bip39");
  const seed    = mnemonicToSeedSync(trimmed);
  const root    = HDKey.fromMasterSeed(seed);
  const derived = root.derive("m/44'/60'/0'/0/0");
  if (!derived.privateKey) throw new Error("Key derivation failed");
  const hex = Array.from(derived.privateKey).map(b => b.toString(16).padStart(2, "0")).join("");
  return privateKeyToAccount(`0x${hex}` as `0x${string}`);
}

async function secretToAccountFor(address: string, secret: string): Promise<Account> {
  const account = await secretToAccount(secret);
  if (account.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Decrypted key does not match the connected wallet address");
  }
  return account;
}

export async function getViemAccountForAddress(
  address: string,
  intent: { title?: string; subtitle?: string } = {},
): Promise<Account> {
  const rec = getImportedWallet(address);

  if (rec) {
    let secret: string;
    if (rec.protectedBy === "pin") {
      // Promise-based modal: stays open until the PIN verifies, or user cancels
      secret = await usePinPromptStore.getState().prompt<string>({
        address: rec.address,
        title:    intent.title    ?? "Enter PIN to sign",
        subtitle: intent.subtitle ?? "Unlock your imported OrahDEX wallet to sign this transaction.",
        verify:   (pin) => unlockWithPin(rec.address, pin),
      });
    } else {
      // Passkey-protected: WebAuthn-PRF assertion (browser shows native biometric)
      secret = await unlockWithPasskey(rec.address);
    }
    return secretToAccountFor(rec.address, secret);
  }

  // Legacy native passkey wallet (created via registerPasskeyWallet)
  return getViemAccountForOrahWallet(address);
}
