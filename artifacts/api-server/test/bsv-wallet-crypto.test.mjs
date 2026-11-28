import assert from "node:assert/strict";
import test from "node:test";
import {
  bsvAddressFromPrivateKey,
  decryptBsvWalletKey,
  encryptBsvWalletKey,
  prepareBsvWalletReencryption,
  verifyBsvWalletRecords,
} from "../src/lib/bsvWalletCrypto.mjs";

test("staged BSV re-encryption preserves wallet keys and verifies addresses", () => {
  const currentSecret = "test-current-wallet-secret-7c1f";
  const nextSecret = "test-staged-wallet-secret-4e82";
  const privateKeyHex = "11".repeat(32);
  const original = {
    evm_address: "0x0000000000000000000000000000000000000001",
    bsv_address: bsvAddressFromPrivateKey(privateKeyHex),
    encrypted_key: encryptBsvWalletKey(privateKeyHex, currentSecret),
  };
  const originalCiphertext = original.encrypted_key;

  const preflightUpdates = prepareBsvWalletReencryption([original], currentSecret, nextSecret);
  assert.equal(preflightUpdates.length, 1);
  assert.equal(preflightUpdates[0].evm_address, original.evm_address);
  assert.equal(preflightUpdates[0].expected_ciphertext, original.encrypted_key);
  assert.notEqual(preflightUpdates[0].encrypted_key, original.encrypted_key);
  assert.equal(original.encrypted_key.includes(privateKeyHex), false);
  assert.equal(decryptBsvWalletKey(preflightUpdates[0].encrypted_key, nextSecret), privateKeyHex);
  assert.deepEqual(verifyBsvWalletRecords(
    [{ ...original, encrypted_key: preflightUpdates[0].encrypted_key }],
    [nextSecret],
  ), { status: "verified", checked: 1, verified: 1, failed: 0 });
  assert.equal(original.encrypted_key, originalCiphertext, "preflight must not mutate source rows");
});

test("staged BSV re-encryption rejects a wrong current secret without mutating input", () => {
  const privateKeyHex = "22".repeat(32);
  const row = {
    evm_address: "0x0000000000000000000000000000000000000002",
    bsv_address: bsvAddressFromPrivateKey(privateKeyHex),
    encrypted_key: encryptBsvWalletKey(privateKeyHex, "correct-current-secret"),
  };
  const originalCiphertext = row.encrypted_key;

  assert.throws(
    () => prepareBsvWalletReencryption([row], "wrong-current-secret", "new-staged-secret"),
    /could not be verified/,
  );
  assert.equal(row.encrypted_key, originalCiphertext);
});

test("BSV wallet verification rejects address mismatches", () => {
  const privateKeyHex = "33".repeat(32);
  const row = {
    evm_address: "0x0000000000000000000000000000000000000003",
    bsv_address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    encrypted_key: encryptBsvWalletKey(privateKeyHex, "test-address-secret"),
  };

  assert.deepEqual(verifyBsvWalletRecords([row], ["test-address-secret"]), {
    status: "failed",
    checked: 1,
    verified: 0,
    failed: 1,
  });
});
