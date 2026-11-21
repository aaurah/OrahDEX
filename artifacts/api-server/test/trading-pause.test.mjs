import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Replit development permits only configured, supported Sepolia limit orders", async () => {
  const [orders, mobile, desktop, mode] = await Promise.all([
    read("artifacts/api-server/src/routes/orders.ts"),
    read("artifacts/bsv-dex/src/pages/mobile/MobileTrade.tsx"),
    read("artifacts/bsv-dex/src/components/trading/OrderForm.tsx"),
    read("artifacts/bsv-dex/src/lib/tradingMode.ts"),
  ]);

  const createOrder = orders.slice(orders.indexOf('router.post("/orders",'), orders.indexOf('router.delete("/orders/:orderId"'));
  assert.match(createOrder, /process\.env\.NODE_ENV === "development"/);
  assert.match(createOrder, /isSepoliaLimitOrder/);
  assert.match(createOrder, /supportsEvmOrderbookPair\(11155111/);
  assert.match(createOrder, /getEvmOrderbookEscrowConfig\(11155111\)/);
  assert.match(createOrder, /if \(!testnetEscrowAvailable\)/);
  assert.match(createOrder, /status\(423\)/);
  assert.match(createOrder, /REPLIT_PREVIEW_TRADING_PAUSED/);
  assert.match(mobile, /if \(workspaceTradingPaused\) \{\s*toast\(/);
  assert.match(mobile, /disabled=\{workspaceTradingPaused \|\|/);
  assert.match(desktop, /if \(workspaceTradingPaused\) \{\s*toast\(/);
  assert.match(desktop, /disabled=\{workspaceTradingPaused \|\|/);
  assert.match(mode, /host\.endsWith\("\.replit\.dev"\)/);
  assert.match(mode, /chainId === 11155111 && verifiedTestnetEscrowAvailable/);
});

test("preview trading pause leaves existing-order recovery and cancellation routes available", async () => {
  const source = await read("artifacts/api-server/src/routes/orders.ts");
  const cancellation = source.slice(source.indexOf('router.delete("/orders/:orderId"'), source.indexOf('router.post("/orders/recover-locked"'));
  const recovery = source.slice(source.indexOf('router.post("/orders/recover-locked"'), source.indexOf('router.post("/orders/precheck"'));

  assert.doesNotMatch(cancellation, /REPLIT_PREVIEW_TRADING_PAUSED/);
  assert.doesNotMatch(recovery, /REPLIT_PREVIEW_TRADING_PAUSED/);
});
