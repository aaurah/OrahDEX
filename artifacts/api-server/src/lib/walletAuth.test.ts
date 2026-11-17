import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildOrderAuthMessage, buildOrderActionAuthMessage, issueExchangeChallenge,
  issueLiquidityChallenge, verifyExchangeSignature, verifyEvmSignature,
  verifyLiquiditySignature,
} from "./walletAuth.js";

test("order signatures bind all execution terms", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const intent = {
    walletAddress: account.address, symbol: "APE/ETH", side: "buy",
    quantity: "10", type: "limit", price: "0.01", stopPrice: "",
    chainId: "1", timeInForce: "GTC", nonce: "test-nonce", expiry: "2000000000",
  };
  const message = buildOrderAuthMessage(intent);
  const signature = await account.signMessage({ message });
  assert.doesNotThrow(() => verifyEvmSignature(account.address, message, signature));
  for (const [field, value] of Object.entries({
    type: "market", price: "1", stopPrice: "0.02", chainId: "56", timeInForce: "IOC",
    symbol: "A8/ETH", side: "sell", quantity: "100",
  })) {
    assert.throws(() => verifyEvmSignature(account.address,
      buildOrderAuthMessage({ ...intent, [field]: value }), signature), field);
  }
});

test("exchange challenges reject changed amounts and are single-use", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const intent = { assetIn: "ETH", assetOut: "APE", amountIn: "0.1" };
  const challenge = issueExchangeChallenge({ walletAddress: account.address, ...intent });
  const signature = await account.signMessage({ message: challenge.message });
  assert.throws(() => verifyExchangeSignature(account.address, challenge.nonce, signature,
    { ...intent, amountIn: "10" }), /does not match/);
  assert.doesNotThrow(() => verifyExchangeSignature(account.address, challenge.nonce, signature, intent));
  assert.throws(() => verifyExchangeSignature(account.address, challenge.nonce, signature, intent), /expired or not found/);
});

test("cancellation signature cannot target another order", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const intent = { walletAddress: account.address, action: "cancel", orderId: "order-a", nonce: "n", expiry: "2000000000" };
  const signature = await account.signMessage({ message: buildOrderActionAuthMessage(intent) });
  assert.throws(() => verifyEvmSignature(account.address,
    buildOrderActionAuthMessage({ ...intent, orderId: "order-b" }), signature));
});

test("liquidity challenges bind add amounts and the exact removal position", async () => {
  const addAccount = privateKeyToAccount(generatePrivateKey());
  const add = { walletAddress: addAccount.address, action: "add" as const, poolId: "ETH-USDT", amountA: "2", amountB: "5000" };
  const addChallenge = issueLiquidityChallenge(add);
  const addSignature = await addAccount.signMessage({ message: addChallenge.message });
  assert.throws(() => verifyLiquiditySignature({
    walletAddress: add.walletAddress, nonce: addChallenge.nonce, signature: addSignature,
    action: "add", poolId: add.poolId, amountA: "20", amountB: add.amountB,
  }), /amounts do not match/);
  assert.doesNotThrow(() => verifyLiquiditySignature({
    walletAddress: add.walletAddress, nonce: addChallenge.nonce, signature: addSignature,
    action: "add", poolId: add.poolId, amountA: add.amountA, amountB: add.amountB,
  }));

  const removeAccount = privateKeyToAccount(generatePrivateKey());
  const remove = { walletAddress: removeAccount.address, action: "remove" as const, poolId: "ETH-USDT", positionId: 42 };
  const removeChallenge = issueLiquidityChallenge(remove);
  const removeSignature = await removeAccount.signMessage({ message: removeChallenge.message });
  assert.throws(() => verifyLiquiditySignature({
    walletAddress: remove.walletAddress, nonce: removeChallenge.nonce, signature: removeSignature,
    action: "remove", poolId: remove.poolId, positionId: 43,
  }), /position does not match/);
  assert.doesNotThrow(() => verifyLiquiditySignature({
    walletAddress: remove.walletAddress, nonce: removeChallenge.nonce, signature: removeSignature,
    action: "remove", poolId: remove.poolId, positionId: remove.positionId,
  }));
});

test("API rejects altered intents and unfunded orders without recording a fill",
  { skip: !process.env.TRADE_TEST_BASE_URL }, async () => {
    // Disposable account: no secrets, deposits, or blockchain transactions.
    const account = privateKeyToAccount(generatePrivateKey());
    const root = process.env.TRADE_TEST_BASE_URL!;
    const intent = {
      walletAddress: account.address, symbol: "BSV/USDT", side: "buy",
      quantity: "0.01", type: "limit", price: "1", stopPrice: "",
      chainId: "1", timeInForce: "GTC", nonce: randomUUID(),
      expiry: String(Math.floor(Date.now() / 1000) + 300),
    };
    const signature = await account.signMessage({ message: buildOrderAuthMessage(intent) });
    const body = { ...intent, stopPrice: undefined, evmSignature: signature };
    const altered = await fetch(`${root}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, price: "2" }),
    });
    assert.equal(altered.status, 401);
    const unfunded = await fetch(`${root}/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(unfunded.status, 400);
    assert.equal((await unfunded.json() as {code:string}).code, "INSUFFICIENT_FUNDS");
    const history = await fetch(`${root}/orders?walletAddress=${account.address}`);
    assert.equal(history.status, 200);
    assert.deepEqual(await history.json(), []);
});
