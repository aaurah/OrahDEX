import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync("artifacts/bsv-dex/src/pages/Landing.tsx", "utf8");
const whitepaper = readFileSync("artifacts/bsv-dex/src/pages/WhitePaper.tsx", "utf8");
const status = readFileSync("artifacts/bsv-dex/src/lib/capabilityStatus.ts", "utf8");
const orderRoute = readFileSync("artifacts/api-server/src/routes/orders.ts", "utf8");

test("landing page and white paper both consume the shared capability status", () => {
  assert.match(landing, /from ["']@\/lib\/capabilityStatus["']/);
  assert.match(whitepaper, /from ["']@\/lib\/capabilityStatus["']/);
  assert.match(landing, /CAPABILITY_STATUS\.map|CAPABILITY_STATUS\.slice/);
  assert.match(whitepaper, /CAPABILITY_STATUS\.map/);
});

test("shared status keeps all reviewed product areas visible", () => {
  const ids = [...status.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const expected of [
    "ethereum-orderbook",
    "orderbook-liquidity",
    "swaps-bridges",
    "markets-charts",
    "bsv-settlement",
    "other-features",
    "ora-ai",
    "fees-providers",
  ]) {
    assert.ok(ids.includes(expected), `missing capability status: ${expected}`);
  }
});

test("public pages do not restore known unsupported universal claims", () => {
  const obsoleteClaims = [
    "every trade anchored to BSV",
    "Every Coin. Always Tradeable.",
    "CEX-Backed + VAMM Liquidity",
    "56+ assets",
    "12 EVM chains",
    "100x leverage",
    "Sovereign Decentralized Exchange",
  ];
  const publicCopy = `${landing}\n${whitepaper}`.toLowerCase();
  for (const claim of obsoleteClaims) {
    assert.ok(!publicCopy.includes(claim.toLowerCase()), `obsolete claim remains: ${claim}`);
  }
  assert.doesNotMatch(landing, /letsexchange\/pairs\/count|marketCountLabel/);
});

test("unfilled market orders do not convert provider quotes into fills", () => {
  assert.doesNotMatch(orderRoute, /import\s*\{\s*attemptLeAutoRoute\s*\}/);
  assert.match(orderRoute, /no executable orderbook liquidity/);
  assert.match(orderRoute, /await unlockFunds\(\{/);
  assert.match(orderRoute, /ORDER_UNLOCK_PENDING/);
  assert.match(orderRoute, /code:\s*"NO_LIQUIDITY"/);
});
