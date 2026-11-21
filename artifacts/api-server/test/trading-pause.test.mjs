import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Replit development blocks new orderbook orders before validation or wallet flow", async () => {
  const [orders, mobile, desktop, mode] = await Promise.all([
    read("artifacts/api-server/src/routes/orders.ts"),
    read("artifacts/bsv-dex/src/pages/mobile/MobileTrade.tsx"),
    read("artifacts/bsv-dex/src/components/trading/OrderForm.tsx"),
    read("artifacts/bsv-dex/src/lib/tradingMode.ts"),
  ]);

  const createOrder = orders.slice(orders.indexOf('router.post("/orders",'), orders.indexOf('router.delete("/orders/:orderId"'));
  assert.match(createOrder, /process\.env\.NODE_ENV === "development"/);
  assert.match(createOrder, /status\(423\)/);
  assert.match(createOrder, /REPLIT_PREVIEW_TRADING_PAUSED/);
  assert.match(mobile, /if \(workspaceTradingPaused\) \{\s*toast\(/);
  assert.match(mobile, /disabled=\{workspaceTradingPaused \|\|/);
  assert.match(desktop, /if \(workspaceTradingPaused\) \{\s*toast\(/);
  assert.match(desktop, /disabled=\{workspaceTradingPaused \|\|/);
  assert.match(mode, /host\.endsWith\("\.replit\.dev"\)/);
});

test("preview trading pause leaves existing-order recovery and cancellation routes available", async () => {
  const source = await read("artifacts/api-server/src/routes/orders.ts");
  const cancellation = source.slice(source.indexOf('router.delete("/orders/:orderId"'), source.indexOf('router.post("/orders/recover-locked"'));
  const recovery = source.slice(source.indexOf('router.post("/orders/recover-locked"'), source.indexOf('router.post("/orders/precheck"'));

  assert.doesNotMatch(cancellation, /REPLIT_PREVIEW_TRADING_PAUSED/);
  assert.doesNotMatch(recovery, /REPLIT_PREVIEW_TRADING_PAUSED/);
});

test("Ethereum escrow rescan restores only confirmed active orders without moving funds", async () => {
  const [orders, escrow, tokens] = await Promise.all([
    read("artifacts/api-server/src/routes/orders.ts"),
    read("artifacts/api-server/src/lib/evmOrderbookEscrow.ts"),
    read("artifacts/api-server/src/lib/tokenRegistry.ts"),
  ]);
  const recovery = orders.slice(
    orders.indexOf('router.post("/orders/recover-evm"'),
    orders.indexOf('router.get("/orders/challenge"'),
  );

  assert.match(recovery, /valid Ethereum wallet address is required/);
  assert.match(recovery, /findActiveEvmOrderbookOrders\(walletAddress, knownLockTxHashes\)/);
  assert.match(recovery, /supportsEthereumOrderbookPair\(base, quote\)/);
  assert.match(recovery, /remainingBaseRaw > originalBaseRaw/);
  assert.match(recovery, /onConflictDoNothing\(\)/);
  assert.match(recovery, /fundingRef/);
  assert.doesNotMatch(recovery, /settleEvmOrderFill|verifyEvmOrderbookCancelTx|unlockFunds/);
  assert.match(escrow, /const MIN_CONFIRMATIONS = 3n/);
  assert.match(escrow, /if \(\s*!order\[9\]/);
  assert.match(tokens, /getTokenSymbolByAddress/);
});
