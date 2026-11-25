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
  read: fs.readFile, fetch: globalThis.fetch, spawn: childProcess.spawn,
  environment: process.env.NODE_ENV, enabled: process.env.DEVAI_OLLAMA_ENABLED,
};
process.env.NODE_ENV = "test"; // No module-level boot timer in this test process.
const { getApiOllamaStatus } = require(path.join(temporary, "runtime.cjs"));
let freeGiB = 7, running = false, starts = 0, spawned, child;
fs.readFile = async (file, ...args) => {
  if (file === "/sys/fs/cgroup/memory.max") return String(8 * 1024 ** 3);
  if (file === "/sys/fs/cgroup/memory.current") return String((8 - freeGiB) * 1024 ** 3);
  if (file === "/proc/meminfo") return `MemTotal: 8388608 kB\nMemAvailable: ${freeGiB * 1024 ** 2} kB\n`;
  return original.read(file, ...args);
};
globalThis.fetch = async () => {
  if (!running) throw new Error("connection refused");
  return new Response(JSON.stringify({ models: [{ name: "qwen2.5-coder:1.5b" }] }));
};
childProcess.spawn = (command, args, options) => {
  starts++; running = true; spawned = { command, args, options };
  child = new EventEmitter(); child.kill = () => true;
  return child;
};
test.after(async () => {
  child?.emit("exit", 0, null);
  fs.readFile = original.read;
  globalThis.fetch = original.fetch;
  childProcess.spawn = original.spawn;
  for (const [key, value] of [["NODE_ENV", original.environment], ["DEVAI_OLLAMA_ENABLED", original.enabled]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(temporary, { recursive: true, force: true });
});

test("readiness never starts a model service in production, when disabled, or below the existing memory limit", async () => {
  process.env.NODE_ENV = "production"; process.env.DEVAI_OLLAMA_ENABLED = "true";
  await getApiOllamaStatus();
  process.env.NODE_ENV = "development"; process.env.DEVAI_OLLAMA_ENABLED = "false";
  await getApiOllamaStatus();
  process.env.DEVAI_OLLAMA_ENABLED = "true"; freeGiB = 2;
  assert.equal((await getApiOllamaStatus()).code, "OLLAMA_INSUFFICIENT_MEMORY");
  assert.equal(starts, 0);
});

test("requests recover after memory returns, sharing one bounded loopback-only startup", async () => {
  freeGiB = 7;
  const statuses = await Promise.all([getApiOllamaStatus(), getApiOllamaStatus()]);
  assert.ok(statuses.every(status => status.ready));
  assert.equal(starts, 1);
  assert.equal(spawned.command, "ollama");
  assert.deepEqual(spawned.args, ["serve"]);
  assert.equal(spawned.options.env.OLLAMA_HOST, "127.0.0.1:11434");
  assert.equal(spawned.options.env.OLLAMA_MAX_LOADED_MODELS, "1");
  assert.equal(spawned.options.env.OLLAMA_NUM_PARALLEL, "1");
  assert.equal(spawned.options.env.OLLAMA_KEEP_ALIVE, "30s");
});

test("a stopped service cannot be respawned repeatedly within the recovery cooldown", async () => {
  child.emit("exit", 1, null); running = false;
  await getApiOllamaStatus();
  await getApiOllamaStatus();
  assert.equal(starts, 1);
});
