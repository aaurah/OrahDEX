import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../../bsv-dex/functions/api/[[path]].ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Pages proxy forwards signed-order POST bodies to the Worker", async () => {
  let capturedMethod = "";
  let capturedBody = "";
  globalThis.fetch = async (input, init) => {
    capturedMethod = String(init?.method);
    capturedBody = await new Response(init?.body).text();
    return new Response('{"id":"staging-order"}', {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  const response = await onRequest({
    request: new Request("https://orahdex.example/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ symbol: "A8/ETH", side: "sell" }),
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(capturedMethod, "POST");
  assert.deepEqual(JSON.parse(capturedBody), { symbol: "A8/ETH", side: "sell" });
});

test("Pages proxy forwards on-chain recovery requests to the Worker", async () => {
  let capturedPath = "";
  let capturedBody = "";
  globalThis.fetch = async (input, init) => {
    capturedPath = new URL(String(input)).pathname;
    capturedBody = await new Response(init?.body).text();
    return Response.json({ count: 0 });
  };
  const response = await onRequest({
    request: new Request("https://orahdex.example/api/orders/recover-evm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ walletAddress: "0x1111111111111111111111111111111111111111" }),
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(capturedPath, "/api/orders/recover-evm");
  assert.equal(
    JSON.parse(capturedBody).walletAddress,
    "0x1111111111111111111111111111111111111111",
  );
});

test("Pages proxy rejects writes to the read-only market API", async () => {
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response("unexpected");
  };
  const response = await onRequest({
    request: new Request("https://orahdex.example/api/markets", { method: "POST" }),
  });
  assert.equal(response.status, 405);
  assert.equal(upstreamCalled, false);
});

test("Pages proxy rejects unlisted API routes", async () => {
  const response = await onRequest({
    request: new Request("https://orahdex.example/api/admin/users"),
  });
  assert.equal(response.status, 403);
});

test("Pages proxy enforces the request-body size limit", async () => {
  let upstreamCalled = false;
  globalThis.fetch = async () => {
    upstreamCalled = true;
    return new Response("unexpected");
  };
  const response = await onRequest({
    request: new Request("https://orahdex.example/api/orders", {
      method: "POST",
      body: "x".repeat(64 * 1024 + 1),
    }),
  });
  assert.equal(response.status, 413);
  assert.equal(upstreamCalled, false);
});
