import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const walletAddress = `0x${"1".repeat(40)}`;
const txHash = `0x${"2".repeat(64)}`;
const fundingRef = `evm-order:1:0x${"3".repeat(40)}:0x${"4".repeat(64)}`;
const source = await readFile(new URL("../../bsv-dex/src/lib/orderbookCancellation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace("import.meta.env.BASE_URL", '"/"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ responses = [], saved = [], cancelError } = {}) {
  const storage = new Map([
    ["orahdex:pending-evm-orderbook-cancellations:v1", JSON.stringify(saved)],
  ]);
  const requests = [];
  let walletTransactions = 0;
  const exports = {};
  const context = vm.createContext({
    exports,
    require: () => ({
      cancelOrderbookOrder: async (params) => {
        walletTransactions += 1;
        params.onSubmitted?.(txHash);
        if (cancelError) throw cancelError;
        return { txHash, explorerUrl: `https://etherscan.io/tx/${txHash}` };
      },
    }),
    window: { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
    AbortSignal,
    setTimeout: (callback) => { callback(); return 0; },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      if (!response) throw new Error("No response configured");
      return { ok: response.status < 400, status: response.status, json: async () => response.body };
    },
  });
  vm.runInContext(compiled, context);
  return { api: exports, requests, walletTransactions: () => walletTransactions, pending: () => JSON.parse(storage.values().next().value) };
}

const orderResponse = { status: 200, body: { walletAddress, status: "open" } };
const successResponse = { status: 200, body: { status: "cancelled" } };
const params = { orderId: "test-order", walletAddress, fundingRef, isOrahWallet: false };

test("confirmed cancel retries a failed API update using the same hash", async () => {
  const h = harness({ responses: [orderResponse, new Error("network unavailable"), { status: 503, body: {} }, successResponse] });
  const result = await h.api.cancelEvmOrderbookOrder(params);
  assert.equal(result.status, "cancelled");
  assert.equal(h.walletTransactions(), 1);
  assert.equal(h.requests.filter((request) => request.method === "DELETE").length, 3);
  for (const request of h.requests.filter((request) => request.method === "DELETE")) {
    assert.equal(JSON.parse(request.body).orderbookCancelTxHash, txHash);
    assert.ok(request.signal);
  }
  assert.equal(h.pending().length, 0);
});

test("a saved submitted hash retries only the API after reload", async () => {
  const h = harness({
    saved: [{ orderId: params.orderId, walletAddress, txHash, createdAt: Date.now() }],
    responses: [successResponse],
  });
  await h.api.cancelEvmOrderbookOrder(params);
  assert.equal(h.walletTransactions(), 0);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].method, "DELETE");
});

test("wallet handoff confirmation failure retains the submitted hash", async () => {
  const h = harness({ responses: [orderResponse], cancelError: new Error("receipt timeout") });
  await assert.rejects(h.api.cancelEvmOrderbookOrder(params), /receipt timeout/);
  assert.equal(h.pending()[0].txHash, txHash);
  assert.equal(h.walletTransactions(), 1);
});

test("manual reconciliation verifies the proof without contacting the wallet", async () => {
  const h = harness({ responses: [successResponse] });
  await h.api.reconcileEvmOrderbookCancellation({ orderId: params.orderId, walletAddress, txHash });
  assert.equal(h.walletTransactions(), 0);
  assert.equal(h.pending().length, 0);
});

test("background recovery retains proof on a lagging provider failure", async () => {
  const h = harness({
    saved: [{ orderId: params.orderId, walletAddress, txHash, createdAt: Date.now() }],
    responses: [{ status: 400, body: { error: "Receipt not found", code: "ORDERBOOK_CANCEL_INVALID" } }],
  });
  await h.api.retryPendingEvmOrderbookCancellations(walletAddress);
  assert.equal(h.walletTransactions(), 0);
  assert.equal(h.pending().length, 1);
});

test("a rejected manual proof cannot remove the order or submit a transaction", async () => {
  const h = harness({ responses: [{ status: 400, body: { error: "Wrong maker", code: "ORDERBOOK_CANCEL_INVALID" } }] });
  await assert.rejects(h.api.reconcileEvmOrderbookCancellation({ orderId: params.orderId, walletAddress, txHash }), /Wrong maker/);
  assert.equal(h.walletTransactions(), 0);
  assert.equal(h.pending().length, 0);
});
