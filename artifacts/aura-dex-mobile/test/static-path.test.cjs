const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveWithinRoot } = require("../server/static-path");

const root = path.resolve("/srv/orahdex/mobile-static");

test("keeps ordinary mobile assets within the static root", () => {
  assert.equal(resolveWithinRoot(root, "/ios/manifest.json"), path.join(root, "ios", "manifest.json"));
  assert.equal(resolveWithinRoot(root, "/assets/index.js"), path.join(root, "assets", "index.js"));
});

test("rejects plain and encoded traversal", () => {
  assert.equal(resolveWithinRoot(root, "/../../package.json"), null);
  assert.equal(resolveWithinRoot(root, "/..%2f..%2fpackage.json"), null);
  assert.equal(resolveWithinRoot(root, "/..%5c..%5cpackage.json"), null);
});

test("rejects malformed URL escapes", () => {
  assert.equal(resolveWithinRoot(root, "/bad%2"), null);
});
