import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const API_PORT  = process.env.API_PORT  || "8080";
const FRONTEND_PORT = process.env.FRONTEND_PORT || process.env.PORT || "20180";

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

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT",  () => process.exit(0));
