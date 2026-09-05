import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir } from "node:fs/promises";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(dir, "dist");
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.resolve(dir, "entry.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "import", "default"],
  outfile: path.join(outdir, "index.js"),
  external: ['assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream', 'stream/promises', 'string_decoder', 'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib', "cloudflare:node", "cloudflare:sockets", "cloudflare:workers", "node:*", "*.node"],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
  minify: true,
});
console.log("worker bundle built");
