import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("Sepolia orderbook uses separate opt-in configuration and relayer key", async () => {
  const source = await read("artifacts/api-server/src/lib/evmOrderbookEscrow.ts");
  assert.match(source, /const ETHEREUM_SEPOLIA = 11155111/);
  assert.match(source, /EVM_ORDERBOOK_ESCROW_SEPOLIA_ENABLED/);
  assert.match(source, /EVM_ORDERBOOK_MATCHING_SEPOLIA_ENABLED/);
  assert.match(source, /EVM_ORDERBOOK_ESCROW_SEPOLIA_DEPLOY_BLOCK/);
  assert.match(source, /EVM_ORDERBOOK_RELAYER_SEPOLIA_KEY/);
  assert.match(source, /SEPOLIA_SUPPORTED_PAIRS/);
  assert.match(source, /supportedPairs: SEPOLIA_SUPPORTED_PAIRS/);
});

test("order-lock references preserve chain identity for verification and cancellation", async () => {
  const orders = await read("artifacts/api-server/src/routes/orders.ts");
  const cancel = await read("artifacts/bsv-dex/src/lib/orderbookCancellation.ts");
  assert.match(orders, /\[1, 11155111\]\.includes\(chainId\)/);
  assert.match(orders, /incomingOrderbookFunding\.chainId === matchOrderbookFunding\.chainId/);
  assert.match(orders, /signedExpiry !== expiresAt/);
  assert.match(orders, /chainId: incomingOrderbookFunding\.chainId/);
  assert.match(orders, /chainId: escrowFunding\.chainId/);
  assert.match(orders, /COALESCE\(\$\{ordersTable\.fundingRef\}, ''\) NOT LIKE/);
  assert.match(orders, /evm-order:11155111:%/);
  assert.match(cancel, /!\[1, 11155111\]\.includes\(chainId\)/);
  assert.match(cancel, /chainId,\s*isOrahWallet/);
  const mobile = await read("artifacts/bsv-dex/src/pages/mobile/MobileTrade.tsx");
  assert.match(mobile, /chainId: orderbookChainId/);
  assert.match(mobile, /knownLockTxHashes: \[orderbookLockTxHash\]/);
  assert.match(mobile, /if \(orderStatusKnown && !serverHasOrder\)/);
  assert.doesNotMatch(mobile, /chainId: 1,/);
});

test("EVM order recovery is read-only and stores only active verified escrow orders", async () => {
  const orders = await read("artifacts/api-server/src/routes/orders.ts");
  assert.match(orders, /router\.post\("\/orders\/recover-evm"/);
  assert.match(orders, /findActiveEvmOrderbookOrders\(walletAddress, knownLockTxHashes, chainId\)/);
  assert.match(orders, /supportsEvmOrderbookPair\(chainId, base, quote\)/);
  assert.match(orders, /evm-order:\$\{chainId\}:/);
  assert.match(orders, /onConflictDoNothing\(\)\.returning/);
  assert.match(orders, /never sends/);
});

test("escrow-backed order expiry matches the on-chain order lifetime", async () => {
  const mobile = await read("artifacts/bsv-dex/src/pages/mobile/MobileTrade.tsx");
  const desktop = await read("artifacts/bsv-dex/src/components/trading/OrderForm.tsx");
  for (const source of [mobile, desktop]) {
    assert.match(source, /walletOrderbookAvailable \? 7 \* 24 \* 60 \* 60 : 5 \* 60/);
    assert.match(source, /orderbookExpiresAt = Number\(orderExpiry\)/);
  }
});

test("Sepolia deployment script cannot broadcast without an explicit opt-in", async () => {
  const script = await read("artifacts/orahdex-contracts/scripts/deploy-orderbook-escrow-sepolia.mjs");
  assert.match(script, /const CHAIN_ID = 11155111/);
  assert.match(script, /if \(chainId !== CHAIN_ID\)/);
  assert.match(script, /ALLOW_SEPOLIA_ORDERBOOK_DEPLOY !== "true"/);
  assert.match(script, /EVM_ORDERBOOK_DEPLOY_DRY_RUN === "true"/);
});
