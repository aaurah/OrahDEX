import test from "node:test";
import assert from "node:assert/strict";
import { parseUnits, formatUnits, mulPriceQty } from "../money.ts";

test("parseUnits converts 1 satoshi exactly", () => {
  assert.equal(parseUnits("0.00000001", 8), 1n);
});

test("parseUnits rejects sub-satoshi BSV precision", () => {
  assert.throws(() => parseUnits("0.000000001", 8));
});

test("formatUnits round-trips smallest units", () => {
  assert.equal(formatUnits(1n, 8), "0.00000001");
  assert.equal(formatUnits(0n, 8), "0");
});

test("mulPriceQty computes exact notional", () => {
  const priceRaw = parseUnits("1.5", 8);
  const qtyRaw = parseUnits("2", 8);
  const notional = mulPriceQty({
    priceRaw,
    priceDecimals: 8,
    quantityRaw: qtyRaw,
    quantityDecimals: 8,
    outputDecimals: 8,
    rounding: "ceil",
  });
  assert.equal(notional, parseUnits("3", 8));
});

test("parseUnits rejects negative monetary values by default", () => {
  assert.throws(() => parseUnits("-1", 8));
});
