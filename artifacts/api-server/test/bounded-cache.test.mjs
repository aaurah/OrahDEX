import test from "node:test";
import assert from "node:assert/strict";
import { BoundedTtlCache } from "../src/lib/boundedTtlCache.mjs";

test("bounded cache evicts the least recently used entry at capacity", () => {
  const cache = new BoundedTtlCache(2, 60_000);
  cache.set("a", 1).set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);

  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
});

test("bounded cache expires values and supports shorter per-entry TTLs", async () => {
  const cache = new BoundedTtlCache(4, 60_000);
  cache.set("short", "value", 5);
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(cache.get("short"), undefined);
  assert.equal(cache.size, 0);
});

test("bounded cache periodically prunes expired entries", () => {
  const cache = new BoundedTtlCache(100, 60_000);
  for (let i = 0; i < 64; i++) cache.set(i, i, 1);
  cache.pruneExpired(Date.now() + 10);

  assert.equal(cache.size, 0);
});
