import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveStaticPath } from "../static-path.mjs";

const root = path.resolve("/srv/orahdex/static");

test("resolves ordinary static paths under the configured root", () => {
  assert.equal(resolveStaticPath(root, "/index.html"), path.join(root, "index.html"));
  assert.equal(resolveStaticPath(root, "/assets/app.js"), path.join(root, "assets", "app.js"));
});

test("rejects decoded and plain traversal paths", () => {
  assert.equal(resolveStaticPath(root, "/../../package.json"), null);
  assert.equal(resolveStaticPath(root, "/..%2f..%2fpackage.json"), null);
  assert.equal(resolveStaticPath(root, "/..%5c..%5cpackage.json"), null);
});

test("rejects malformed escapes and normalizes internal dot segments", () => {
  assert.equal(resolveStaticPath(root, "/bad%2"), null);
  assert.equal(resolveStaticPath(root, "/assets/../index.html"), path.join(root, "index.html"));
});
