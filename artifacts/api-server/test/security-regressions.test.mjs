import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ordersPath = path.join(__dirname, "..", "src", "routes", "orders.ts");
const ordersSchemaPath = path.join(__dirname, "..", "..", "..", "lib", "db", "src", "schema", "orders.ts");
const tradePath = path.join(__dirname, "..", "src", "routes", "trade.ts");
const fundingVerifierPath = path.join(__dirname, "..", "src", "lib", "fundingVerifier.ts");
const routesIndexPath = path.join(__dirname, "..", "src", "routes", "index.ts");
const adminAuthPath = path.join(__dirname, "..", "src", "middleware", "adminAuth.ts");
const evmWebhookRouterPath = path.join(__dirname, "..", "src", "routes", "evmWebhookRouter.ts");
const depositAddressesPath = path.join(__dirname, "..", "src", "lib", "depositAddresses.ts");
const internalEvmWalletPath = path.join(__dirname, "..", "src", "lib", "internalEvmWallet.ts");
const exchangeHotWalletPath = path.join(__dirname, "..", "src", "lib", "exchangeHotWallet.ts");
const futuresPath = path.join(__dirname, "..", "src", "routes", "futures.ts");
const nftPath = path.join(__dirname, "..", "src", "routes", "nft.ts");

async function read(filePath) {
  return readFile(filePath, "utf8");
}

test("orders route enforces external auth for recognized wallet formats", async () => {
  const src = await read(ordersPath);

  assert.match(src, /\(isEvmAddress \|\| isBsvAddress \|\| isSolAddress\) \? "external"/);
  assert.match(src, /priorNonceUse/);
  assert.match(src, /lower\(\$\{ordersTable\.walletAddress\}\) = lower\(\$\{body\.walletAddress\}\)/);
  assert.match(src, /eq\(ordersTable\.nonce, orderNonce\)/);
  assert.match(src, /verifyBsvWithdrawSignature\(body\.walletAddress, sig\)/);
  assert.match(src, /verifySolWithdrawSignature\(body\.walletAddress, sig\)/);
  assert.match(src, /isNonceUniqueViolation/);
  assert.match(src, /orders_wallet_nonce_uidx/);
});

test("orders schema enforces wallet+nonce uniqueness", async () => {
  const src = await read(ordersSchemaPath);

  assert.match(src, /uniqueIndex\("orders_wallet_nonce_uidx"\)\.on\(sql`lower\(\$\{t\.walletAddress\}\)`, t\.nonce\)/);
});

test("trade wallet settle is EVM-only and requires EVM wallet signature", async () => {
  const src = await read(tradePath);

  assert.match(src, /const \{[^}]*walletSignature[^}]*\} = req\.body/);
  assert.match(src, /walletAddress must be an EVM address \(0x\.\.\.\) for \/trade\/wallet\/settle\./);
  assert.match(src, /if \(!walletSignature\)/);
  assert.match(src, /verifyEvmSignature\(walletAddress, authMsg, walletSignature\)/);
  assert.doesNotMatch(src, /verifyBsvWithdrawSignature\(walletAddress, walletSignature\)/);
  assert.doesNotMatch(src, /verifySolWithdrawSignature\(walletAddress, walletSignature\)/);
});

test("trade router does not expose withdraw endpoints", async () => {
  const src = await read(tradePath);

  assert.doesNotMatch(src, /router\.post\("\/withdraw\/challenge"/);
  assert.doesNotMatch(src, /router\.post\("\/withdraw"/);
});

test("funding verifier fails closed for unverifiable external EVM funding", async () => {
  const src = await read(fundingVerifierPath);

  assert.match(src, /code:\s+"FUNDING_PROOF_REQUIRED"/);
  assert.match(src, /code:\s+"CHAIN_ID_REQUIRED"/);
  assert.match(src, /code:\s+"TOKEN_UNSUPPORTED"/);
  assert.match(src, /code:\s+"BALANCE_VERIFICATION_UNAVAILABLE"/);
  assert.doesNotMatch(src, /on-chain RPC balance check failed — falling through/);
});

test("withdrawals router is mounted before trade router", async () => {
  const src = await read(routesIndexPath);

  const withdrawalsPos = src.indexOf("router.use(withdrawalsRouter);");
  const tradePos = src.indexOf("router.use(tradeRouter);");

  assert.notEqual(withdrawalsPos, -1, "withdrawals router mount not found");
  assert.notEqual(tradePos, -1, "trade router mount not found");
  assert.ok(withdrawalsPos < tradePos, "withdrawals router should be mounted before trade router");
});

test("admin auth uses timing-safe token checks", async () => {
  const src = await read(adminAuthPath);

  assert.match(src, /timingSafeEqual/);
  assert.match(src, /function hasMatchingAdminToken/);
});

test("EVM webhook rejects requests when HMAC secret is missing", async () => {
  const src = await read(evmWebhookRouterPath);

  assert.match(src, /EVM_WEBHOOK_SECRET not set — rejecting webhook request/);
  assert.doesNotMatch(src, /EVM_WEBHOOK_SECRET not set — skipping HMAC verification/);
  assert.match(src, /if \(!secret\) \{[\s\S]*return false;\n  \}/);
});

test("wallet encryption code no longer falls back to a hard-coded secret", async () => {
  const [depositSrc, internalSrc, hotWalletSrc] = await Promise.all([
    read(depositAddressesPath),
    read(internalEvmWalletPath),
    read(exchangeHotWalletPath),
  ]);

  for (const src of [depositSrc, internalSrc, hotWalletSrc]) {
    assert.doesNotMatch(src, /orahdex-internal-evm-fallback-key-32bytes!/);
    assert.match(src, /getRequiredEnv\("EVM_WALLET_SECRET"/);
  }
});

test("futures and NFT routes are behind explicit feature flags", async () => {
  const [futuresSrc, nftSrc] = await Promise.all([read(futuresPath), read(nftPath)]);

  assert.match(futuresSrc, /process\.env\.FUTURES_ENABLED !== "true"/);
  assert.match(nftSrc, /process\.env\.NFT_ENABLED !== "true"/);
});
