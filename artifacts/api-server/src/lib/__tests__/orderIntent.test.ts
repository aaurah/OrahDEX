import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalIntentPayload,
  evmSigFundingRef,
  isFundingRefForFutures,
  isFundingRefForSpot,
  ledgerFundingRef,
  marginFundingRef,
  parseFundingRef,
  utxoFundingRef,
  validateOrderIntent,
} from "../orderIntent.ts";

function validIntent() {
  return {
    pair: "BSV/USDT",
    kind: "SPOT" as const,
    side: "buy" as const,
    type: "MARKET" as const,
    amount: "1.25",
    expiry: Math.floor(Date.now() / 1000) + 600,
    nonce: "8b767cf6-f4d2-4ab9-b9ea-ff85bc2e8257",
    walletAddress: "0xabc123",
    fundingRef: "ledger:0xabc123:USDT:10",
  };
}

test("canonicalIntentPayload is deterministic and excludes undefined fields", () => {
  const payload = canonicalIntentPayload({
    walletAddress: "0xabc123",
    amount: "1.25",
    pair: "BSV/USDT",
    kind: "SPOT",
    side: "buy",
    type: "MARKET",
    nonce: "n-1",
    expiry: 1_900_000_000,
    price: undefined,
  });

  assert.equal(
    payload,
    JSON.stringify({
      amount: "1.25",
      expiry: 1_900_000_000,
      kind: "SPOT",
      nonce: "n-1",
      pair: "BSV/USDT",
      side: "buy",
      type: "MARKET",
      walletAddress: "0xabc123",
    }),
  );
});

test("validateOrderIntent accepts valid market and limit intents", () => {
  const market = validIntent();
  assert.deepEqual(validateOrderIntent(market), { valid: true });

  const limit = { ...market, type: "LIMIT" as const, price: "100.5" };
  assert.deepEqual(validateOrderIntent(limit), { valid: true });
});

test("validateOrderIntent rejects malformed intents with expected error code", () => {
  const base = validIntent();
  const scenarios: Array<{ name: string; intent: Partial<typeof base>; code: string }> = [
    { name: "invalid pair", intent: { ...base, pair: "BSVUSDT" }, code: "INVALID_PAIR" },
    { name: "invalid kind", intent: { ...base, kind: "MARGIN" as "SPOT" }, code: "INVALID_KIND" },
    { name: "invalid side", intent: { ...base, side: "hold" as "buy" }, code: "INVALID_SIDE" },
    { name: "invalid type", intent: { ...base, type: "STOP" as "MARKET" }, code: "INVALID_TYPE" },
    { name: "invalid amount", intent: { ...base, amount: "0" }, code: "INVALID_AMOUNT" },
    { name: "limit requires price", intent: { ...base, type: "LIMIT", price: undefined }, code: "PRICE_REQUIRED" },
    { name: "invalid price", intent: { ...base, type: "LIMIT", price: "-1" }, code: "INVALID_PRICE" },
    { name: "missing wallet", intent: { ...base, walletAddress: "" }, code: "MISSING_WALLET" },
    { name: "missing nonce", intent: { ...base, nonce: "" }, code: "MISSING_NONCE" },
    { name: "expired", intent: { ...base, expiry: Math.floor(Date.now() / 1000) - 1 }, code: "INTENT_EXPIRED" },
    { name: "missing funding ref", intent: { ...base, fundingRef: "" }, code: "MISSING_FUNDING_REF" },
  ];

  for (const scenario of scenarios) {
    const result = validateOrderIntent(scenario.intent);
    assert.equal(result.valid, false, scenario.name);
    assert.equal(result.code, scenario.code, scenario.name);
  }
});

test("funding ref helpers generate and classify refs correctly", () => {
  const ledger = ledgerFundingRef("0xABCD", "USDT", "10");
  const margin = marginFundingRef("0xABCD", "USDT", "10");
  const utxo = utxoFundingRef("tx123", 2);
  const evmSig = evmSigFundingRef("0xdeadbeef");

  assert.equal(ledger, "ledger:0xabcd:USDT:10");
  assert.equal(margin, "margin:0xabcd:USDT:10");
  assert.equal(utxo, "utxo:tx123:2");
  assert.match(evmSig, /^evm-sig:[0-9a-f]{16}$/);

  assert.deepEqual(parseFundingRef(ledger), { kind: "ledger", raw: ledger });
  assert.deepEqual(parseFundingRef(margin), { kind: "margin", raw: margin });
  assert.deepEqual(parseFundingRef(utxo), { kind: "utxo", raw: utxo });
  assert.deepEqual(parseFundingRef(evmSig), { kind: "evm-sig", raw: evmSig });
  assert.deepEqual(parseFundingRef("foo"), { kind: "unknown", raw: "foo" });

  assert.equal(isFundingRefForFutures(margin), true);
  assert.equal(isFundingRefForFutures(ledger), false);
  assert.equal(isFundingRefForSpot(ledger), true);
  assert.equal(isFundingRefForSpot(evmSig), true);
  assert.equal(isFundingRefForSpot(utxo), true);
  assert.equal(isFundingRefForSpot(margin), false);
});
