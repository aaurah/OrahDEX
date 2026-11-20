import test from "node:test";
import assert from "node:assert/strict";
import { withWalletRequestTimeout } from "../src/lib/walletRequestTimeout.mjs";

test("wallet signature result passes through before the deadline", async () => {
  const result = await withWalletRequestTimeout(Promise.resolve("signature"), 100);
  assert.equal(result, "signature");
});

test("a stalled wallet request times out without returning a signature", async () => {
  await assert.rejects(
    withWalletRequestTimeout(new Promise(() => {}), 5),
    /No order was submitted/,
  );
});

test("timing out aborts the signer to prevent a late provider retry", async () => {
  const controller = new AbortController();
  await assert.rejects(
    withWalletRequestTimeout(
      new Promise(() => {}),
      5,
      controller.signal,
      () => controller.abort(),
    ),
    /Wallet did not respond/,
  );
  assert.equal(controller.signal.aborted, true);
});

test("stopping a wallet wait ignores a signature that resolves later", async () => {
  const controller = new AbortController();
  let resolveWalletRequest;
  const walletRequest = new Promise((resolve) => {
    resolveWalletRequest = resolve;
  });
  const waiting = withWalletRequestTimeout(walletRequest, 1_000, controller.signal);

  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  resolveWalletRequest("late signature");
  await Promise.resolve();
});
