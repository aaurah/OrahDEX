import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporary = await mkdtemp(path.join(tmpdir(), "orah-ai-test-"));
const bundle = path.join(temporary, "client.cjs");
await build({
  stdin: {
    contents: 'export * from "./lib/integrations-openai-ai-server/src/client.ts"; export * from "./artifacts/api-server/src/lib/localAiTools.ts"; export * from "./artifacts/api-server/src/lib/oraPrompt.ts";',
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", outfile: bundle, logLevel: "silent",
});
const client = require(bundle);
const originalFetch = globalThis.fetch;
const originalRead = fs.readFile;
const originalEnabled = process.env.DEVAI_OLLAMA_ENABLED;
const originalEnvironment = process.env.NODE_ENV;
test.after(async () => {
  globalThis.fetch = originalFetch;
  fs.readFile = originalRead;
  if (originalEnabled === undefined) delete process.env.DEVAI_OLLAMA_ENABLED;
  else process.env.DEVAI_OLLAMA_ENABLED = originalEnabled;
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
  await rm(temporary, { recursive: true, force: true });
});
function setup(models = ["qwen2.5-coder:1.5b"], freeGiB = 7) {
  process.env.NODE_ENV = "development";
  process.env.DEVAI_OLLAMA_ENABLED = "true";
  fs.readFile = async (file, ...args) => {
    if (file === "/sys/fs/cgroup/memory.max") return String(8 * 1024 ** 3);
    if (file === "/sys/fs/cgroup/memory.current") return String((8 - freeGiB) * 1024 ** 3);
    if (file === "/proc/meminfo") return `MemTotal: 8388608 kB\nMemAvailable: ${freeGiB * 1024 ** 2} kB\n`;
    return originalRead(file, ...args);
  };
  globalThis.fetch = async url => new Response(JSON.stringify({
    models: String(url).endsWith("/api/ps") ? [] : models.map(name => ({ name })),
  }));
}

test("model tags match exactly, with only the documented :latest expansion", async () => {
  setup(["qwen2.5-coder:latest"]);
  assert.equal((await client.getDevaiOllamaStatus("qwen2.5-coder")).ready, true);
  assert.equal((await client.getDevaiOllamaStatus("qwen2.5-coder:1.5b")).code, "OLLAMA_MODEL_MISSING");
  setup(["qwen2.5-coder:1.5b-custom"]);
  assert.equal((await client.getDevaiOllamaStatus("qwen2.5-coder:1.5b")).modelAvailable, false);
});

test("missing weights identify the selected tag and available models", async () => {
  setup([]);
  const status = await client.getDevaiOllamaStatus("qwen2.5-coder:1.5b");
  assert.equal(status.code, "OLLAMA_MODEL_MISSING");
  assert.match(status.error, /qwen2\.5-coder:1\.5b/);
  assert.deepEqual(status.availableModels, []);
  assert.equal(status.ready, false);
});

test("disabled and unreachable models are not reported as ready", async () => {
  setup();
  process.env.DEVAI_OLLAMA_ENABLED = "false";
  assert.equal((await client.getDevaiOllamaStatus()).code, "OLLAMA_DISABLED");
  process.env.DEVAI_OLLAMA_ENABLED = "true";
  globalThis.fetch = async () => { throw new Error("connection refused"); };
  assert.equal((await client.getDevaiOllamaStatus()).code, "OLLAMA_UNREACHABLE");
});

test("inference is rejected before calling the model when memory is insufficient", async () => {
  setup(undefined, 1);
  assert.equal((await client.getDevaiOllamaStatus()).code, "OLLAMA_INSUFFICIENT_MEMORY");
  await assert.rejects(client.createDevaiOllamaStream([{ role: "user", content: "Hi" }]), /free memory is required/);
});

test("host available memory cannot be overridden by a more generous cgroup", async () => {
  setup(undefined, 7);
  const read = fs.readFile;
  fs.readFile = async (file, ...args) => file === "/proc/meminfo"
    ? "MemTotal: 8388608 kB\nMemAvailable: 1048576 kB\n" : read(file, ...args);
  assert.equal((await client.getDevaiOllamaStatus()).code, "OLLAMA_INSUFFICIENT_MEMORY");
});

test("production preserves the larger six GiB headroom threshold", async () => {
  setup(undefined, 4);
  process.env.NODE_ENV = "production";
  assert.equal((await client.getDevaiOllamaStatus()).code, "OLLAMA_INSUFFICIENT_MEMORY");
});

test("ready Ora streaming uses its exact selected model and finite output budget", async () => {
  setup(["chat-model:3b"]);
  const tags = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    if (/\/api\/(tags|ps)$/.test(String(url))) return tags(url, options);
    assert.match(String(url), /\/api\/chat$/);
    request = JSON.parse(options.body);
    return new Response('{"message":{"content":"Hello"},"done":false}\n{"done":true}');
  };
  try {
    const stream = await client.createDevaiOllamaStream([{ role: "user", content: "Hi" }], 5000, "chat-model:3b");
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk.choices[0].delta.content);
    assert.equal(chunks.join(""), "Hello");
    assert.equal(request.model, "chat-model:3b");
    assert.equal(request.options.num_predict, 1024);
    assert.equal(request.options.num_ctx, 2048);
    assert.equal(request.keep_alive, "30s");
  } finally { globalThis.fetch = tags; }
});

test("inference budgets exact model size and credits only that runner's measured CPU allocation", async () => {
  setup(["qwen2.5-coder:1.5b"], 3.1);
  let resident = [];
  globalThis.fetch = async url => new Response(JSON.stringify({
    models: String(url).endsWith("/api/ps") ? resident : [{name:"qwen2.5-coder:1.5b", size:986062089}],
  }));
  let status = await client.getDevaiOllamaStatus();
  assert.equal(status.ready, true);
  assert.ok(status.requiredInferenceHeadroomBytes < status.minimumModelHeadroomBytes);
  setup(["qwen2.5-coder:1.5b"], 1.3);
  globalThis.fetch = async url => new Response(JSON.stringify({
    models: String(url).endsWith("/api/ps") ? resident : [{name:"qwen2.5-coder:1.5b", size:986062089}],
  }));
  assert.equal((await client.getDevaiOllamaStatus()).ready, false);
  resident = [{name:"another-model:1.5b", size:2 * 1024 ** 3, size_vram:0}];
  assert.equal((await client.getDevaiOllamaStatus()).ready, false);
  resident = [{name:"qwen2.5-coder:1.5b", size:2 * 1024 ** 3, size_vram:2 * 1024 ** 3}];
  assert.equal((await client.getDevaiOllamaStatus()).ready, false);
  resident = [{name:"qwen2.5-coder:1.5b", size:2 * 1024 ** 3, size_vram:0}];
  status = await client.getDevaiOllamaStatus();
  assert.equal(status.ready, true);
  assert.equal(status.requiredInferenceHeadroomBytes, 1024 ** 3);
});

test("DevAI accepts explicit allowlisted Qwen JSON tool calls and rejects shell calls", () => {
  const allow = new Set(["read_project_file", "get_orahdex_market"]);
  const calls = client.parseLocalToolCall('```json\n{"tool_call":{"name":"read_project_file","arguments":{"path":"package.json"}}}\n```', allow);
  assert.equal(calls[0].function.name, "read_project_file");
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { path: "package.json" });
  assert.deepEqual(client.parseLocalToolCall('{"name":"run_terminal","arguments":{"command":"whoami"}}', allow), []);
  assert.deepEqual(client.parseLocalToolCall('{"name":"read_project_file","arguments":[]}', allow), []);
  assert.deepEqual(client.parseLocalToolCall("Here is some prose about read_project_file.", allow), []);
  assert.deepEqual(client.parseLocalToolCall("null", allow), []);
});

test("DevAI retries only unsupported native tools through its same-model JSON flow", async () => {
  const requests = [];
  const response = await client.completeWithLocalTools(async (body) => {
    requests.push(body);
    if (body.tools) throw Object.assign(new Error("qwen2.5-coder does not support tools"), { status: 400 });
    return { choices: [{ message: { content: '{"tool_call":{"name":"read_project_file","arguments":{"path":"package.json"}}}' } }] };
  }, {
    model: "qwen2.5-coder:1.5b",
    messages: [{ role: "user", content: "Read package.json" }],
    tools: [{ type: "function", function: { name: "read_project_file" } }],
    tool_choice: "auto",
  }, {});
  assert.equal(requests.length, 2);
  assert.equal(requests[1].model, requests[0].model);
  assert.equal(requests[1].tools, undefined);
  const call = client.parseLocalToolCall(response.choices[0].message.content, new Set(["read_project_file"]));
  assert.equal(call[0].function.name, "read_project_file");
  await assert.rejects(client.completeWithLocalTools(async () => {
    throw Object.assign(new Error("model out of memory"), { status: 500 });
  }, { messages: [], tools: [] }, {}), /out of memory/);
});

test("DevAI narrows explicitly requested tools while preserving allowlisted defaults", () => {
  const tools = [
    { function: { name: "read_project_file" } },
    { function: { name: "query_database" } },
    { function: { name: "search_project_code" } },
  ];
  assert.deepEqual(
    client.selectExplicitlyRequestedTools("Use read_project_file to read package.json", tools),
    [tools[0]],
  );
  assert.deepEqual(
    client.selectExplicitlyRequestedTools("Inspect project implementation", tools),
    tools,
  );
});

test("an explicit one-tool request returns its verified result without another model call", () => {
  const output = 'File package.json: {"name":"workspace"}';
  assert.match(
    client.formatExplicitToolResult("Use read_project_file to read package.json", ["read_project_file"], "read_project_file", output),
    /"name":"workspace"/,
  );
  assert.equal(
    client.formatExplicitToolResult("Please explore the repo", ["read_project_file"], "read_project_file", output),
    null,
  );
  assert.equal(
    client.formatExplicitToolResult("Use read_project_file and fetch_url", ["read_project_file", "fetch_url"], "read_project_file", output),
    null,
  );
});

test("Ora's shared context distinguishes BSV settlement, EVM execution, and wallet versus trading balances", () => {
  const prompt = client.buildOraSystemPrompt("BSV/USDT: supplied quote");
  assert.match(prompt, /does not mean every OrahDEX trade/);
  assert.match(prompt, /Direct EVM swaps use the selected EVM network/);
  assert.match(prompt, /wallet balance is not automatically/);
  assert.match(prompt, /never invent prices or execution status/);
  assert.match(prompt, /BSV\/USDT: supplied quote/);
  assert.doesNotMatch(prompt, /every trade settles on BSV|every trade finalizes on-chain|March 2026/);
});
