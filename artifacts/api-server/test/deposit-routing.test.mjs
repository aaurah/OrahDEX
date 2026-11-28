import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import express from "express";
import { createServer } from "node:http";

// Execute the actual policy registration from deposit.ts without importing its
// database and wallet dependencies. Mount it at /api, just like routes/index.ts.
const source = await readFile(new URL("../src/routes/deposit.ts", import.meta.url), "utf8");
const start = source.indexOf("const LEGACY_DEPOSIT_READ_PATHS");
const end = source.indexOf("// ── GET /deposit/address", start);
assert.ok(start > 0 && end > start, "deposit policy registration must be found");
let policy;
vm.runInNewContext(source.slice(start, end), {
  router: { use: (handler) => { policy = handler; } },
});
assert.equal(typeof policy, "function");

test("deposit policy blocks top-ups without swallowing later API routers", async (t) => {
  const app = express();
  const api = express.Router();
  api.use(policy);
  api.use((req, res) => res.json({ downstream: true }));
  app.use("/api", api);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  for (const path of [
    "/letsexchange/currencies", "/simpleswap/currencies", "/letsexchange/estimate",
    "/letsexchange/exchange", "/letsexchange/status/test", "/staking/providers",
    "/nft/test", "/rpc", "/deposit-extra", "/",
  ]) {
    for (const method of ["GET", "POST"]) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 200, `${method} ${path} must reach its own router`);
      assert.deepEqual(await response.json(), { downstream: true });
    }
  }

  for (const path of [
    "/deposit", "/deposit/", "/deposit/address", "/deposit/bitcoin-address",
    "/deposit/altchain-address", "/deposit/solana-address", "/deposit/verify",
    "/deposit/bsv-challenge", "/deposit/bsv-verify", "/deposit/solana-verify",
    "/deposit/sweep-wallet", "/DEPOSIT/address/",
  ]) {
    for (const method of ["GET", "POST", "HEAD", "PUT", "DELETE"]) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 410, `${method} ${path} must not enable deposits`);
      if (method !== "HEAD") assert.equal((await response.json()).code, "EXCHANGE_DEPOSITS_DISABLED");
    }
  }

  for (const path of [
    "/deposit/history", "/deposit/history/?limit=5", "/deposit/bsv-pending",
    "/DEPOSIT/BSV-PENDING/",
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, `legacy read ${path} must remain reachable`);
    assert.deepEqual(await response.json(), { downstream: true });
    const write = await fetch(`${base}${path}`, { method: "POST" });
    assert.equal(write.status, 410, "legacy reads must not allow writes");
  }
});
