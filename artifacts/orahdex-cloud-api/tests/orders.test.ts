import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  handleOrderRequest,
  orderMessage,
  toUnits,
  verifySignature,
  type OrderbookEnv,
} from "../src/orders.ts";

function disabledEnv(): OrderbookEnv {
  return { DB: {} as D1Database };
}

test("decimal conversion preserves tiny prices and refuses silent truncation", () => {
  assert.equal(toUnits("1.23e-7"), 123_000_000_000n);
  assert.equal(toUnits("1.0000000000000000001", 18, true), 1_000_000_000_000_000_001n);
  assert.throws(() => toUnits("1.0000000000000000001"), /too many decimal places/);
});

test("order authorization message matches the API canonical format", () => {
  const message = orderMessage({
    walletAddress: "0x1111111111111111111111111111111111111111",
    symbol: "A8/ETH",
    side: "sell",
    quantity: 20,
    type: "limit",
    price: 0.000000157,
    chainId: 1,
    timeInForce: "GTC",
    nonce: "aabbccddeeff00112233445566778899",
    expiry: "1794932000",
  });
  assert.equal(message, [
    "Authorize OrahDEX order",
    "Wallet: 0x1111111111111111111111111111111111111111",
    "Symbol: A8/ETH",
    "Side: sell",
    "Quantity: 20",
    "Type: limit",
    "Price: 1.57e-7",
    "Stop price: ",
    "Chain ID: 1",
    "Time in force: GTC",
    "Nonce: aabbccddeeff00112233445566778899",
    "Expiry: 1794932000",
  ].join("\n"));
});

test("order signature verifies wallet ownership and rejects altered terms", async () => {
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const body = {
    walletAddress: account.address,
    symbol: "A8/ETH",
    side: "sell",
    quantity: "20",
    type: "limit",
    price: "0.000000157",
    stopPrice: "",
    chainId: 1,
    timeInForce: "GTC",
    nonce: "aabbccddeeff00112233445566778899",
    expiry: String(Math.floor(Date.now() / 1000) + 300),
  };
  const evmSignature = await account.signMessage({ message: orderMessage(body) });
  await verifySignature({ ...body, evmSignature });
  await assert.rejects(
    verifySignature({ ...body, quantity: "21", evmSignature }),
    /does not match the wallet/,
  );
});

test("Cloudflare trading config fails closed without explicit staging flags", async () => {
  const response = await handleOrderRequest(
    new Request("https://example.test/api/orders/evm-settlement/config"),
    disabledEnv(),
  );
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    chainId: 1,
    available: false,
    supportedPairs: [],
  });
});

test("mainnet settlement requires a separate explicit approval flag", async () => {
  const response = await handleOrderRequest(
    new Request("https://example.test/api/orders/evm-settlement/config"),
    {
      ...disabledEnv(),
      EVM_ORDERBOOK_ESCROW_ENABLED: "true",
      EVM_ORDERBOOK_MATCHING_ENABLED: "true",
    },
  );
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    chainId: 1,
    available: false,
    supportedPairs: [],
  });
});

test("order creation is unavailable while Cloudflare trading is disabled", async () => {
  const response = await handleOrderRequest(
    new Request("https://example.test/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    disabledEnv(),
  );
  assert.ok(response);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Cloudflare Ethereum trading is not enabled",
  });
});

test("on-chain order recovery reports unavailable until escrow scan is configured", async () => {
  const response = await handleOrderRequest(
    new Request("https://example.test/api/orders/recover-evm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: "0x1111111111111111111111111111111111111111" }),
    }),
    disabledEnv(),
  );
  assert.ok(response);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Ethereum order recovery is not configured",
  });
});

test("order listing validates wallet addresses before database access", async () => {
  const response = await handleOrderRequest(
    new Request("https://example.test/api/orders?walletAddress=bad"),
    disabledEnv(),
  );
  assert.ok(response);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Valid walletAddress is required",
  });
});

test("A8/ETH orderbook returns aggregated bid and ask levels", async () => {
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              { side: "buy", price: "0.00000017", remaining_quantity: "2" },
              { side: "buy", price: "0.00000017", remaining_quantity: "0.5" },
              { side: "buy", price: "0.00000016", remaining_quantity: "1" },
              { side: "sell", price: "0.00000018", remaining_quantity: "3" },
            ],
          }),
        }),
      }),
    },
  } as unknown as OrderbookEnv;
  const response = await handleOrderRequest(
    new Request("https://example.test/api/markets/A8%2FETH/orderbook"),
    env,
  );
  assert.ok(response);
  assert.equal(response.status, 200);
  const book = await response.json() as { bids: number[][]; asks: number[][] };
  assert.deepEqual(book.bids, [[0.00000017, 2.5], [0.00000016, 1]]);
  assert.deepEqual(book.asks, [[0.00000018, 3]]);
});
