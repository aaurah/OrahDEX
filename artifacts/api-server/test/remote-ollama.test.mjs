import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporary = await mkdtemp(path.join(tmpdir(), "orah-remote-ollama-"));
const bundle = path.join(temporary, "client.cjs");
const remoteEnvKeys = [
  "NODE_ENV",
  "DEVAI_OLLAMA_ENABLED",
  "DEVAI_OLLAMA_REMOTE",
  "DEVAI_OLLAMA_BASE_URL",
  "DEVAI_MODEL",
  "ORA_AI_MODEL",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
];
const originalEnv = Object.fromEntries(remoteEnvKeys.map(key => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const originalSpawn = require("node:child_process").spawn;

process.env.NODE_ENV = "production";
process.env.DEVAI_OLLAMA_ENABLED = "true";
process.env.DEVAI_OLLAMA_REMOTE = "true";
process.env.DEVAI_OLLAMA_BASE_URL = "https://ollama.example.com/v1";
process.env.DEVAI_MODEL = "qwen2.5-coder:1.5b";
process.env.ORA_AI_MODEL = "llama3.2:3b";
process.env.CF_ACCESS_CLIENT_ID = "test-access-client";
process.env.CF_ACCESS_CLIENT_SECRET = "test-access-secret";

await build({
  stdin: {
    contents: 'export * from "./lib/integrations-openai-ai-server/src/client.ts";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: bundle,
  logLevel: "silent",
});
const client = require(bundle);

test.after(async () => {
  globalThis.fetch = originalFetch;
  require("node:child_process").spawn = originalSpawn;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(temporary, { recursive: true, force: true });
});

test("remote Ollama requires HTTPS, a hostname, /v1, and both Access credentials", () => {
  assert.equal(
    client.validateDevaiOllamaConfig(
      "https://ollama.example.com/v1",
      true,
      "client-id",
      "client-secret",
    ).hostname,
    "ollama.example.com",
  );
  for (const [url, id, secret] of [
    ["http://ollama.example.com/v1", "client-id", "client-secret"],
    ["https://127.0.0.1/v1", "client-id", "client-secret"],
    ["https://ollama.example.com/v1", "", "client-secret"],
    ["https://ollama.example.com/v1", "client-id", ""],
    ["https://user:pass@ollama.example.com/v1", "client-id", "client-secret"],
    ["https://ollama.example.com/api", "client-id", "client-secret"],
  ]) {
    assert.throws(
      () => client.validateDevaiOllamaConfig(url, true, id, secret),
      /Remote Ollama|credentials, a query, or a fragment/,
    );
  }
  assert.throws(
    () => client.validateDevaiOllamaConfig("http://192.168.1.5:11434/v1", false, undefined, undefined),
    /loopback Ollama/,
  );
});

test("remote status ignores Replit VM memory and sends Access headers to Ollama", async () => {
  const requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, headers: new Headers(init.headers) });
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [
          { name: "qwen2.5-coder:1.5b", size: 986_048_576 },
          { name: "llama3.2:3b", size: 2_019_373_189 },
        ],
      }));
    }
    if (url.endsWith("/api/chat")) {
      return new Response('{"message":{"content":"Hello"},"done":false}\n{"done":true}');
    }
    if (url.endsWith("/v1/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: 1,
        model: "qwen2.5-coder:1.5b",
        choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
      }), { headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected request ${url}`);
  };

  const status = await client.getDevaiOllamaStatus("llama3.2:3b");
  assert.equal(status.ready, true, JSON.stringify(status));
  assert.equal(status.provider, "remote_ollama");
  assert.equal(status.remote, true);
  assert.equal(status.memory, null);
  assert.equal(status.requiredInferenceHeadroomBytes, null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.get("CF-Access-Client-Id"), "test-access-client");
  assert.equal(requests[0].headers.get("CF-Access-Client-Secret"), "test-access-secret");

  const stream = await client.createDevaiOllamaStream(
    [{ role: "user", content: "Hi" }],
    256,
    "llama3.2:3b",
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk.choices[0].delta.content);
  assert.equal(chunks.join(""), "Hello");
  const nativeChat = requests.find(request => request.url.endsWith("/api/chat"));
  assert.equal(nativeChat.headers.get("CF-Access-Client-Id"), "test-access-client");
  assert.equal(nativeChat.headers.get("CF-Access-Client-Secret"), "test-access-secret");

  const originalClientFetch = client.devaiOpenAI.fetch;
  client.devaiOpenAI.fetch = globalThis.fetch;
  try {
    const sdkReply = await client.devaiOpenAI.chat.completions.create({
      model: "qwen2.5-coder:1.5b",
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.equal(sdkReply.choices[0].message.content, "Hello");
    const sdkRequest = requests.find(request => request.url.endsWith("/v1/chat/completions"));
    assert.equal(sdkRequest.headers.get("CF-Access-Client-Id"), "test-access-client");
    assert.equal(sdkRequest.headers.get("CF-Access-Client-Secret"), "test-access-secret");
  } finally {
    client.devaiOpenAI.fetch = originalClientFetch;
  }

  globalThis.fetch = async () => new Response("Access denied", { status: 403 });
  const denied = await client.getDevaiOllamaStatus("llama3.2:3b");
  assert.equal(denied.code, "OLLAMA_REMOTE_AUTH_FAILED");
  assert.match(denied.error, /Cloudflare Access rejected/);
  assert.doesNotMatch(denied.error, /test-access-secret/);
});

test("remote runtime never starts or pulls models on the Replit VM", async () => {
  const childProcess = require("node:child_process");
  let spawnCount = 0;
  const fetches = [];
  childProcess.spawn = () => { spawnCount++; throw new Error("remote mode must not spawn Ollama"); };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    fetches.push({ url, headers: new Headers(init.headers) });
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [{ name: "qwen2.5-coder:1.5b", size: 986_048_576 }],
      }));
    }
    throw new Error(`Unexpected remote request ${url}`);
  };

  process.env.DEVAI_OLLAMA_ENABLED = "false";
  const runtimeBundle = path.join(temporary, "runtime.cjs");
  await build({
    entryPoints: [path.join(root, "artifacts/api-server/src/lib/ollamaRuntime.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: runtimeBundle,
    logLevel: "silent",
    plugins: [{
      name: "quiet-test-logger",
      setup(builder) {
        builder.onLoad({ filter: /api-server\/src\/lib\/logger\.ts$/ }, () => ({
          contents: "export const logger = { info() {}, warn() {} };",
          loader: "js",
        }));
      },
    }],
  });
  const runtime = require(runtimeBundle);
  process.env.DEVAI_OLLAMA_ENABLED = "true";
  const status = await runtime.getApiOllamaStatus();
  assert.equal(status.ready, true, JSON.stringify(status));
  assert.equal(spawnCount, 0);
  assert.equal(fetches.some(request => request.url.endsWith("/api/pull")), false);
  assert.equal(fetches[0].headers.get("CF-Access-Client-Id"), "test-access-client");
});
