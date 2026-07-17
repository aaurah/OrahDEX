/**
 * Unified signing-time account loader and on-chain send dispatcher.
 *
 * For any address connected as "orah-wallet", we resolve the unlock path:
 *   1. PIN-encrypted import  → PIN modal
 *   2. Passkey-encrypted import (WebAuthn-PRF) → WebAuthn assertion
 *   3. Native passkey wallet (registerPasskeyWallet) → WebAuthn biometric
 *
 * All on-chain send functions route through getSecretForAddress so that
 * PIN-imported wallets receive a PIN prompt instead of a passkey ceremony.
 */

import type { Account } from "viem";
import {
  getImportedWallet,
  unlockWithPin,
  unlockWithPasskey,
} from "@/lib/walletPin";
import {
  getViemAccountForOrahWallet,
  getNativePasskeySecret,
  deriveChainPrivKeyFromSecret,
  deriveBsvPrivKeyFromSecret,
  signBsvChallengeFromSecret,
} from "@/lib/passkeyWallet";
import { usePinPromptStore } from "@/store/usePinPromptStore";

// ─── Internal: EVM account from secret ───────────────────────────────────────

async function secretToAccount(secret: string): Promise<Account> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const trimmed = secret.trim();

  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    return privateKeyToAccount(trimmed as `0x${string}`);
  }

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

// ─── Public: obtain secret for any orah-wallet address ───────────────────────

/**
 * Unlock and return the raw secret (mnemonic or 0x private key) for an address.
 * Handles all three protection types automatically:
 *   • PIN-imported wallet  → shows PIN modal
 *   • Passkey-imported wallet → WebAuthn-PRF assertion
 *   • Native passkey wallet → WebAuthn biometric ceremony
 */
export async function getSecretForAddress(
  address: string,
  intent: { title?: string; subtitle?: string } = {},
): Promise<string> {
  const rec = getImportedWallet(address);

  if (rec) {
    if (rec.protectedBy === "pin") {
      return usePinPromptStore.getState().prompt<string>({
        address:  rec.address,
        title:    intent.title    ?? "Enter PIN to sign",
        subtitle: intent.subtitle ?? "Unlock your imported OrahDEX wallet to sign this transaction.",
        verify:   (pin) => unlockWithPin(rec.address, pin),
      });
    }
    // Passkey-encrypted import (WebAuthn-PRF)
    return unlockWithPasskey(rec.address);
  }

  // Guard: if there are OrahDEX passkey wallets on this device but none matches
  // `address`, do NOT fall through to getNativePasskeySecret — that function
  // would show all credentials in the iOS picker, letting the user accidentally
  // pick the wrong passkey, which decrypts a different mnemonic, derives the
  // wrong BSV key, and produces an OP_EQUALVERIFY on broadcast.
  const { listPasskeyWallets } = await import('./passkeyWallet');
  const nativeWallets = listPasskeyWallets();
  if (
    nativeWallets.length > 0 &&
    !nativeWallets.some(w => w.address.toLowerCase() === address.toLowerCase())
  ) {
    throw new Error(
      'No OrahDEX signing key found for this wallet address. ' +
      'BSV/BTC transactions must be signed by the OrahDEX passkey wallet that owns the coins — ' +
      'connect your OrahDEX passkey wallet to continue.'
    );
  }

  // Native passkey wallet (created via registerPasskeyWallet / importPasskeyWallet)
  return getNativePasskeySecret(address);
}

// ─── Public: EVM viem Account ─────────────────────────────────────────────────

export async function getViemAccountForAddress(
  address: string,
  intent: { title?: string; subtitle?: string } = {},
): Promise<Account> {
  const rec = getImportedWallet(address);

  if (rec) {
    let secret: string;
    if (rec.protectedBy === "pin") {
      secret = await usePinPromptStore.getState().prompt<string>({
        address: rec.address,
        title:    intent.title    ?? "Enter PIN to sign",
        subtitle: intent.subtitle ?? "Unlock your imported OrahDEX wallet to sign this transaction.",
        verify:   (pin) => unlockWithPin(rec.address, pin),
      });
    } else {
      secret = await unlockWithPasskey(rec.address);
    }
    return secretToAccountFor(rec.address, secret);
  }

  return getViemAccountForOrahWallet(address);
}

// ─── Unified on-chain send wrappers ───────────────────────────────────────────
// These replace the direct send*WithPasskey calls in WithdrawSheet so that
// PIN-imported wallets get a PIN prompt instead of a broken passkey ceremony.

export async function sendBsvFromAddress(
  evmAddress:       string,
  senderBsvAddress: string,
  recipientAddress: string,
  amountBsv:        number,
): Promise<{ txid: string; feeSat: number }> {
  const { buildSignBroadcastBsvTx } = await import("./bsvTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm BSV Send", subtitle: "Enter your PIN to sign and broadcast this BSV transaction." });
  const bsvPrivKey = await deriveBsvPrivKeyFromSecret(secret);
  const amountSat  = Math.round(amountBsv * 1e8);
  return buildSignBroadcastBsvTx(senderBsvAddress, recipientAddress, amountSat, bsvPrivKey);
}

export async function sendBtcFromAddress(
  evmAddress:       string,
  senderBtcAddress: string,
  recipientAddress: string,
  amountBtc:        number,
): Promise<{ txid: string; feeSat: number }> {
  const { buildSignBroadcastBtcTx } = await import("./btcUtxoTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm BTC Send", subtitle: "Enter your PIN to sign and broadcast this BTC transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/84'/0'/0'/0/0");
  const amountSat  = Math.round(amountBtc * 1e8);
  const result     = await buildSignBroadcastBtcTx(senderBtcAddress, recipientAddress, amountSat, privateKey);
  return { txid: result.txid, feeSat: result.feeSat };
}

export async function sendLtcFromAddress(
  evmAddress:       string,
  senderLtcAddress: string,
  recipientAddress: string,
  amountLtc:        number,
): Promise<{ txid: string; feeSat: number }> {
  const { buildSignBroadcastLegacyUtxoTx } = await import("./btcUtxoTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm LTC Send", subtitle: "Enter your PIN to sign and broadcast this LTC transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/44'/2'/0'/0/0");
  const amountSat  = Math.round(amountLtc * 1e8);
  const result     = await buildSignBroadcastLegacyUtxoTx("ltc", senderLtcAddress, recipientAddress, amountSat, privateKey);
  return { txid: result.txid, feeSat: result.feeSat };
}

export async function sendDogeFromAddress(
  evmAddress:        string,
  senderDogeAddress: string,
  recipientAddress:  string,
  amountDoge:        number,
): Promise<{ txid: string; feeSat: number }> {
  const { buildSignBroadcastLegacyUtxoTx } = await import("./btcUtxoTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm DOGE Send", subtitle: "Enter your PIN to sign and broadcast this DOGE transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/44'/3'/0'/0/0");
  const amountSat  = Math.round(amountDoge * 1e8);
  const result     = await buildSignBroadcastLegacyUtxoTx("doge", senderDogeAddress, recipientAddress, amountSat, privateKey);
  return { txid: result.txid, feeSat: result.feeSat };
}

export async function sendXrpFromAddress(
  evmAddress:       string,
  senderXrpAddress: string,
  recipientAddress: string,
  amountXrp:        number,
): Promise<{ txid: string }> {
  const { buildSignBroadcastXrpTx } = await import("./xrpTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm XRP Send", subtitle: "Enter your PIN to sign and broadcast this XRP transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/44'/144'/0'/0/0");
  const result     = await buildSignBroadcastXrpTx(senderXrpAddress, recipientAddress, amountXrp, privateKey);
  return { txid: result.txid };
}

export async function sendTrxFromAddress(
  evmAddress:       string,
  senderTrxAddress: string,
  recipientAddress: string,
  amountTrx:        number,
): Promise<{ txid: string }> {
  const { buildSignBroadcastTrxTx } = await import("./tronTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm TRX Send", subtitle: "Enter your PIN to sign and broadcast this TRX transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/44'/60'/0'/0/0");
  const result     = await buildSignBroadcastTrxTx(senderTrxAddress, recipientAddress, amountTrx, privateKey);
  return { txid: result.txid };
}

export async function sendBchFromAddress(
  evmAddress:       string,
  senderBchAddress: string,
  recipientAddress: string,
  amountBch:        number,
): Promise<{ txid: string; feeSat: number }> {
  const { buildSignBroadcastBchTx } = await import("./bchTx.js");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm BCH Send", subtitle: "Enter your PIN to sign and broadcast this BCH transaction." });
  const privateKey = await deriveChainPrivKeyFromSecret(secret, "m/44'/145'/0'/0/0");
  const amountSat  = Math.round(amountBch * 1e8);
  const result     = await buildSignBroadcastBchTx(senderBchAddress, recipientAddress, amountSat, privateKey);
  return { txid: result.txid, feeSat: result.feeSat };
}

export async function sendSolFromAddress(
  evmAddress:       string,
  senderSolAddress: string,
  recipientAddress: string,
  amountSol:        number,
): Promise<{ txid: string; feeSol: number }> {
  const { deriveSolPrivKey, buildSignBroadcastSolTx } = await import("./solanaTx.js");
  const { mnemonicToSeed } = await import("@scure/bip39");
  const secret     = await getSecretForAddress(evmAddress, { title: "Confirm SOL Send", subtitle: "Enter your PIN to sign and broadcast this SOL transaction." });
  const isMnemonic = secret.trim().split(/\s+/).length >= 12 && !secret.startsWith("0x");
  if (!isMnemonic) throw new Error("Legacy wallet format does not support Solana signing. Please re-import your seed phrase.");
  const seed       = await mnemonicToSeed(secret.trim());
  const privateKey = await deriveSolPrivKey(seed);
  const result     = await buildSignBroadcastSolTx(senderSolAddress, recipientAddress, amountSol, privateKey);
  return { txid: result.txid, feeSol: result.feeSol };
}

export async function signBsvChallengeFromAddress(
  evmAddress: string,
  message:    string,
): Promise<string> {
  const secret = await getSecretForAddress(evmAddress, {
    title:    "Confirm BSV Withdrawal",
    subtitle: "Enter your PIN to sign the BSV withdrawal challenge.",
  });
  return signBsvChallengeFromSecret(message, secret);
}
