import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const childProcess = require("node:child_process");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporary = await mkdtemp(path.join(tmpdir(), "orah-ollama-recovery-"));
await build({
  entryPoints: [path.join(root, "artifacts/api-server/src/lib/ollamaRuntime.ts")],
  bundle: true, platform: "node", format: "cjs",
  outfile: path.join(temporary, "runtime.cjs"), logLevel: "silent",
  plugins: [{
    name: "quiet-test-logger",
    setup(builder) {
      builder.onLoad({ filter: /api-server\/src\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger = { info() {}, warn() {} };", loader: "js",
      }));
    },
  }],
});
const original = {
  read: fs.readFile, statfs: fs.statfs, fetch: globalThis.fetch, spawn: childProcess.spawn,
  environment: process.env.NODE_ENV,
  enabled: process.env.DEVAI_OLLAMA_ENABLED,
  devaiModel: process.env.DEVAI_MODEL,
  oraModel: process.env.ORA_AI_MODEL,
  ollamaModels: process.env.OLLAMA_MODELS,
};
let diskFreeGiB = 16;
process.env.NODE_ENV = "test"; // No module-level boot timer in this test process.
process.env.DEVAI_OLLAMA_ENABLED = "false";
process.env.DEVAI_MODEL = "qwen2.5-coder:1.5b";
process.env.ORA_AI_MODEL = "llama3.2:3b";
process.env.OLLAMA_MODELS = path.join(temporary, "models");
const { getApiOllamaStatus, getLocalOllamaProviderHealth } = require(path.join(temporary, "runtime.cjs"));
let cgroupFreeGiB = 7, hostFreeGiB = 7, running = false, starts = 0, spawned, child;
const installedModels = new Map();
const pulls = [];
fs.readFile = async (file, ...args) => {
  if (file === "/sys/fs/cgroup/memory.max") return String(8 * 1024 ** 3);
  if (file === "/sys/fs/cgroup/memory.current") return String((8 - cgroupFreeGiB) * 1024 ** 3);
  if (file === "/proc/meminfo") return `MemTotal: 8388608 kB\nMemAvailable: ${hostFreeGiB * 1024 ** 2} kB\n`;
  return original.read(file, ...args);
};
fs.statfs = async () => ({ bavail: diskFreeGiB, bsize: 1024 ** 3 });
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!running) throw new Error("connection refused");
  if (url.endsWith("/api/tags")) {
    return new Response(JSON.stringify({
      models: [...installedModels].map(([name, size]) => ({ name, size })),
    }));
  }
  if (url.endsWith("/api/ps")) {
    return new Response(JSON.stringify({ models: [] }));
  }
  if (url.endsWith("/api/pull") && init.method === "POST") {
    const { name } = JSON.parse(String(init.body));
    pulls.push(name);
    installedModels.set(name, name === "llama3.2:3b" ? 2 * 1024 ** 3 : 1024 ** 3);
    return new Response(JSON.stringify({ status: "success" }));
  }
  throw new Error(`unexpected Ollama request: ${url}`);
};
childProcess.spawn = (command, args, options) => {
  starts++; running = true; spawned = { command, args, options };
  child = new EventEmitter(); child.kill = () => true;
  return child;
};
test.after(async () => {
  child?.emit("exit", 0, null);
  fs.readFile = original.read;
  fs.statfs = original.statfs;
  globalThis.fetch = original.fetch;
  childProcess.spawn = original.spawn;
  for (const [key, value] of [
    ["NODE_ENV", original.environment],
    ["DEVAI_OLLAMA_ENABLED", original.enabled],
    ["DEVAI_MODEL", original.devaiModel],
    ["ORA_AI_MODEL", original.oraModel],
    ["OLLAMA_MODELS", original.ollamaModels],
  ]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(temporary, { recursive: true, force: true });
});

test("the API uses the lower memory reading and never starts Ollama below the production guard", async () => {
  process.env.NODE_ENV = "production"; process.env.DEVAI_OLLAMA_ENABLED = "true";
  cgroupFreeGiB = 7; hostFreeGiB = 2;
  const hostLimited = await getApiOllamaStatus();
  assert.equal(hostLimited.memory.availableBytes, 2 * 1024 ** 3);
  assert.equal(hostLimited.code, "OLLAMA_INSUFFICIENT_MEMORY");
  process.env.NODE_ENV = "development"; process.env.DEVAI_OLLAMA_ENABLED = "false";
  await getApiOllamaStatus();
  process.env.NODE_ENV = "production"; process.env.DEVAI_OLLAMA_ENABLED = "true";
  cgroupFreeGiB = 2; hostFreeGiB = 7;
  assert.equal((await getApiOllamaStatus()).code, "OLLAMA_INSUFFICIENT_MEMORY");
  assert.equal(starts, 0);
  assert.equal(getLocalOllamaProviderHealth(), "degraded");
});

test("production startup pulls both configured models with one loopback-only Ollama process", async () => {
  process.env.NODE_ENV = "production"; process.env.DEVAI_OLLAMA_ENABLED = "true";
  cgroupFreeGiB = 7; hostFreeGiB = 7;
  installedModels.clear();
  const statuses = await Promise.all([getApiOllamaStatus(), getApiOllamaStatus()]);
  assert.ok(statuses.every(status => !status.ready));
  const deadline = Date.now() + 5_000;
  while (installedModels.size < 2 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const [devaiStatus, oraStatus] = await Promise.all([
    getApiOllamaStatus("qwen2.5-coder:1.5b"),
    getApiOllamaStatus("llama3.2:3b"),
  ]);
  assert.equal(devaiStatus.ready, true, JSON.stringify(devaiStatus));
  assert.equal(oraStatus.ready, true, JSON.stringify(oraStatus));
  assert.equal(getLocalOllamaProviderHealth(), "healthy");
  assert.equal(starts, 1);
  assert.deepEqual(pulls, ["qwen2.5-coder:1.5b", "llama3.2:3b"]);
  assert.equal(spawned.command, "ollama");
  assert.deepEqual(spawned.args, ["serve"]);
  assert.equal(spawned.options.env.OLLAMA_HOST, "127.0.0.1:11434");
  assert.equal(spawned.options.env.OLLAMA_MAX_LOADED_MODELS, "2");
  assert.equal(spawned.options.env.OLLAMA_NUM_PARALLEL, "1");
  assert.equal(spawned.options.env.OLLAMA_KEEP_ALIVE, "30m");
});

test("a stopped service cannot be respawned repeatedly within the recovery cooldown", async () => {
  child.emit("exit", 1, null); running = false;
  await getApiOllamaStatus();
  await getApiOllamaStatus();
  assert.equal(starts, 1);
});
