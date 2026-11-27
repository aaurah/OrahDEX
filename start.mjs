import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_HEAP_MB = Number(process.env.API_MAX_OLD_SPACE_MB ?? "1024");
if (!Number.isSafeInteger(API_HEAP_MB) || API_HEAP_MB < 512 || API_HEAP_MB > 16_384) {
  throw new Error("API_MAX_OLD_SPACE_MB must be an integer between 512 and 16384.");
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
  ["--enable-source-maps", `--max-old-space-size=${API_HEAP_MB}`, "--expose-gc", "dist/index.mjs"],
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
