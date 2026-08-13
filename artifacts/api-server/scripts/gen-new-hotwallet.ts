/**
 * gen-new-hotwallet.ts — Generates a new EVM hot-wallet key pair.
 *
 * Security notes:
 *  - The private key is written to STDERR only (not STDOUT).
 *    This prevents it from being captured by log aggregators, CI pipelines,
 *    or any tool that collects stdout.
 *  - NEVER commit the key to source control.
 *  - NEVER log or re-display it after storing it.
 *  - Store it immediately in Replit Secrets and close the terminal session.
 */
import crypto from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
const pk = "0x" + crypto.randomBytes(32).toString("hex");
const acct = privateKeyToAccount(pk as `0x${string}`);

// Public info — safe to log to stdout
console.log("════════════════════════════════════════════════════════════════════");
console.log("NEW EXCHANGE HOT WALLET GENERATED");
console.log("════════════════════════════════════════════════════════════════════");
console.log("Address (public — fund this):", acct.address);
console.log("");
console.log("⚠  The private key is printed to STDERR (below) — NOT to this log.");
console.log("   Copy it immediately to Replit Secrets → EXCHANGE_HOT_WALLET_KEY.");
console.log("   Also set EVM_WALLET_SECRET to a strong random string.");
console.log("   NEVER delete EVM_WALLET_SECRET once set — encrypted DB keys");
console.log("   become unrecoverable without it.");
console.log("════════════════════════════════════════════════════════════════════");

// Private key written to STDERR only so it does not appear in stdout logs
process.stderr.write(`\n[SECRET] Private key: ${pk}\n`);
process.stderr.write("[SECRET] Store this immediately in Replit Secrets — do NOT share or commit it.\n\n");
