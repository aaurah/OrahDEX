import { spawn } from "child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIN_OLLAMA_HEADROOM_BYTES = 6 * 1024 ** 3;
let ollamaProc = null;

function getAvailableMemoryBytes() {
  try {
    const limit = Number(readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim());
    const current = Number(readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim());
    if (Number.isFinite(limit) && limit > 0 && Number.isFinite(current)) {
      return Math.max(0, limit - current);
    }
  } catch { /* use host memory info below */ }
  return os.freemem();
}

function startOptionalOllama() {
  if (process.env.DEVAI_OLLAMA_ENABLED !== "true") {
    console.log("[ollama] Local model autostart is disabled.");
    return;
  }

  const availableBytes = getAvailableMemoryBytes();
  if (availableBytes < MIN_OLLAMA_HEADROOM_BYTES) {
    console.warn(
      `[ollama] Not starting: ${(availableBytes / 1024 ** 3).toFixed(1)} GiB free; ` +
      `${(MIN_OLLAMA_HEADROOM_BYTES / 1024 ** 3).toFixed(1)} GiB is required to protect API headroom.`
    );
    return;
  }

  const modelsDir = process.env.OLLAMA_MODELS || path.join(os.homedir(), ".ollama", "models");
  ollamaProc = spawn("ollama", ["serve"], {
    stdio: "inherit",
    env: {
      ...process.env,
      OLLAMA_HOST: "127.0.0.1:11434",
      OLLAMA_MODELS: modelsDir,
      OLLAMA_NUM_PARALLEL: "1",
      OLLAMA_MAX_LOADED_MODELS: "1",
      OLLAMA_KEEP_ALIVE: "30s",
      OLLAMA_CONTEXT_LENGTH: "2048",
    },
  });
  ollamaProc.on("error", (err) => console.error("[ollama] Local model service could not start:", err.message));
  ollamaProc.on("exit", (code, signal) => {
    ollamaProc = null;
    console.warn(`[ollama] Local model service exited (code=${code}, signal=${signal ?? "none"}); API remains available.`);
  });
}

function start(label, cmd, args, cwd, env = {}) {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  proc.on("error", (err) => {
    console.error(`[${label}] failed to start:`, err.message);
    process.exit(1);
  });
  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with code ${code}`);
      process.exit(code);
    }
    if (signal) {
      console.error(`[${label}] killed by signal ${signal}`);
      process.exit(1);
    }
  });
  return proc;
}

// API runs on an internal port; the frontend binds the external-facing port
// (8080 by default, or whatever PORT Replit assigns) so the deployment probe
// always gets an instant response even before the API has finished booting.
const API_PORT      = process.env.API_PORT      || "8081";
const FRONTEND_PORT = process.env.FRONTEND_PORT || process.env.PORT || "8080";

console.log(`Starting OrahDEX — API :${API_PORT}  Frontend :${FRONTEND_PORT}`);

start(
  "api",
  "node",
  ["--enable-source-maps", "--max-old-space-size=4096", "--expose-gc", "dist/index.mjs"],
  path.join(__dirname, "artifacts/api-server"),
  { PORT: API_PORT, NODE_ENV: "production" }
);

start(
  "frontend",
  "node",
  ["serve-static.mjs"],
  path.join(__dirname, "artifacts/bsv-dex"),
  { PORT: FRONTEND_PORT, API_PORT }
);

// Wait until the exchange services have had time to boot, then check the
// remaining cgroup headroom before starting any local model process.
setTimeout(startOptionalOllama, 30_000).unref();

process.on("SIGTERM", () => { ollamaProc?.kill("SIGTERM"); process.exit(0); });
process.on("SIGINT",  () => { ollamaProc?.kill("SIGTERM"); process.exit(0); });
