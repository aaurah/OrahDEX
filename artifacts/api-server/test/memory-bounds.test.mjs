import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

test("public market-data caches have explicit hard limits", async () => {
  const sources = await Promise.all([
    read("artifacts/api-server/src/routes/dex.ts"),
    read("artifacts/api-server/src/routes/markets.ts"),
    read("artifacts/api-server/src/routes/dexscreener.ts"),
    read("artifacts/api-server/src/routes/geckoTerminal.ts"),
    read("artifacts/api-server/src/services/quoteAggregator.ts"),
    read("artifacts/api-server/src/routes/leEstimateShim.ts"),
  ]);
  for (const source of sources) assert.match(source, /BoundedTtlCache/);
  assert.doesNotMatch(sources[0], /new Map<string, Cache<any>>/);
  assert.doesNotMatch(sources[4], /const CACHE\s*=\s*new Map/);
});

test("unknown prediction symbols cannot allocate persistent empty round entries", async () => {
  const source = await read("artifacts/api-server/src/routes/prediction.ts");
  const route = source.slice(
    source.indexOf('router.get("/prediction/rounds/:symbol"'),
    source.indexOf('router.post("/prediction/bet"'),
  );
  assert.match(source, /SUPPORTED_PREDICTION_SYMBOLS/);
  assert.match(route, /if \(!SUPPORTED_PREDICTION_SYMBOLS\.has\(requestedSymbol\)\)/);
  assert.ok(route.indexOf("SUPPORTED_PREDICTION_SYMBOLS.has") < route.indexOf("tickRounds(symbol)"));
  assert.match(route, /if \(price == null\)/);
});

test("chat message reads do not create arbitrary channel stores", async () => {
  const source = await read("artifacts/api-server/src/routes/chat.ts");
  const route = source.slice(
    source.indexOf('router.get("/channels/:channel/messages"'),
    source.indexOf('router.get("/channels/:channel/stream"'),
  );
  assert.match(source, /MAX_STORED_CHANNELS = 512/);
  assert.match(source, /MAX_ACTIVE_CHANNELS = 512/);
  assert.match(route, /getChannel\(channel\)\.slice/);
  assert.doesNotMatch(route, /store\.set/);
  assert.match(source, /if \(clients\?\.size === 0\) sseClients\.delete\(channel\)/);
});
