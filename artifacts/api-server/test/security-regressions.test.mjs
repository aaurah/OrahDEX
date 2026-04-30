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
