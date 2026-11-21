import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candleFetcherPath = path.join(__dirname, "..", "src", "lib", "candleFetcher.ts");

test("empty candle-provider results retry quickly instead of using the positive cache TTL", async () => {
  const source = await readFile(candleFetcherPath, "utf8");

  assert.match(source, /const EMPTY_CANDLE_RETRY_MS = 5 \* 1000/);
  assert.match(source, /cacheEmptyCandleRetry\(cacheKey\)/);
  assert.doesNotMatch(source, /setCached\(cacheKey,\s*\[\],\s*"none"\)/);
  assert.match(source, /Older server instances cached empty results/);
});
