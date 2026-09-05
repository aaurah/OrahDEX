import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";

const dir = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.resolve(dir, "dist");
const shimDir = path.resolve(dir, ".shims");
await rm(outdir, { recursive: true, force: true });
await rm(shimDir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await mkdir(shimDir, { recursive: true });

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
// Modules workerd provides natively under nodejs_compat. Anything else that a
// CJS dependency require()s gets a harmless stub so the worker still boots;
// only routes that actually use the stubbed capability would be affected.
const REAL = new Set([
  "assert", "async_hooks", "buffer", "console", "crypto",
  "diagnostics_channel", "dns", "events", "http", "https", "net", "os",
  "path", "path/posix", "path/win32", "perf_hooks", "process", "punycode",
  "querystring", "stream", "stream/promises", "string_decoder", "timers",
  "timers/promises", "tls", "url", "util", "zlib",
]);
// Named imports the codebase takes from stubbed modules. Stubs return false
// (never throw) so logging/tty probes and feature checks don't crash boot.
const STUB_EXPORTS = {
  fs: ["existsSync", "readFileSync", "writeFileSync", "readdirSync", "mkdirSync", "createReadStream", "createWriteStream", "promises"],
  "fs/promises": ["readFile", "writeFile", "mkdir", "readdir", "rm"],
  child_process: ["exec", "spawn", "execSync", "spawnSync"],
  tty: ["isatty", "ReadStream", "WriteStream"],
  vm: [],
};
// fs needs functional no-ops for pino/SonicBoom (writes to fd 1): pretend
// every write succeeds fully, and forward log lines to console.log so the
// app logs land in Workers logs instead of vanishing.
const FS_STUB_EXTRA = `
export function write(fd, buf, a, b, c) { const cb = [a, b, c].find((x) => typeof x === "function"); if (cb) cb(null, (buf && buf.length) || 0, buf); try { console.log(String(buf).replace(/\\n+$/, "")); } catch {} }
export function writeSync(fd, buf) { try { console.log(String(buf).replace(/\\n+$/, "")); } catch {} return (buf && buf.length) || 0; }
export function open(a, b, c, d) { const cb = [b, c, d].find((x) => typeof x === "function"); if (cb) cb(null, 1); }
export function openSync() { return 1; }
export function close(fd, cb) { if (cb) cb(null); }
export function closeSync() {}
export function fsync(fd, cb) { if (cb) cb(null); }
export function fsyncSync() {}
export function statSync() { return { isFile: () => false, isDirectory: () => false, size: 0 }; }
export function stat(a, b) { const cb = typeof a === "function" ? a : b; if (cb) cb(null, statSync()); }
export const constants = { O_WRONLY: 1, O_CREAT: 64, O_APPEND: 1024 };
`;

function shimContent(name) {
  if (REAL.has(name)) {
    let extra = "";
    if (name === "stream") {
      extra = `\nimport { EventEmitter as __EE } from "node:events";\nconst __S = (def && def.Stream) || (typeof def === "function" ? def : class extends __EE {});\nexport { __S as Stream };\n`;
    } else if (name === "util") {
      // workerd's node:util lacks some legacy exports (e.g. deprecate, which
      // the `debug` package calls at module load). Provide safe fallbacks.
      extra = `\nconst __dep = (def && def.deprecate) || ((fn) => fn);\nexport { __dep as deprecate };\n`;
    }
    return `import def from "node:${name}";\nexport * from "node:${name}";\nexport default def;${extra}\n`;
  }
  const named = (STUB_EXPORTS[name] || [])
    .map((n) => `export const ${n} = (...a) => false;`)
    .join("\n");
  const extra = name === "fs" ? FS_STUB_EXTRA : "";
  return `const stub = new Proxy(function(){}, { get: (t, k) => (k === "__esModule" ? true : (t[k] ??= stub)), apply: () => stub, construct: () => stub });\nexport default stub;\n${named}\n${extra}\n`;
}

// Pre-generate every shim up front. Writing them lazily inside onResolve is a
// race: concurrent writeFile calls to the same path can truncate the file
// while esbuild is reading it, producing an empty module in the bundle.
const shimFiles = new Map();
for (const name of [...REAL, ...Object.keys(STUB_EXPORTS)]) {
  const file = path.join(shimDir, name.replaceAll("/", "_") + ".mjs");
  await writeFile(file, shimContent(name));
  shimFiles.set(name, file);
}
function shimFor(name) {
  let file = shimFiles.get(name);
  if (!file) {
    file = path.join(shimDir, name.replaceAll("/", "_") + ".mjs");
    shimFiles.set(name, file);
    return writeFile(file, shimContent(name)).then(() => file);
  }
  return file;
}

// Node's CJS builtins export a *class* as module.exports (require('events')
// IS EventEmitter, require('stream') IS the Stream class). ESM shims can't
// reproduce that through esbuild's interop, so rewrite bare require calls
// (require not followed by a property access) to unwrap the shim namespace.
const patchCjsPlugin = {
  name: "patch-cjs",
  setup(b) {
    b.onLoad({ filter: /\.js$/ }, async (args) => {
      if (!args.path.includes("node_modules")) return null;
      const { readFile } = await import("node:fs/promises");
      let contents = await readFile(args.path, "utf8");
      let out = contents
        .replace(/require\((['"])events\1\)(?!\s*[.[(])/g,
          "(require('events').EventEmitter||require('events').default||require('events'))")
        .replace(/require\((['"])stream\1\)(?!\s*[.[(])/g,
          "(require('stream').Stream||require('stream').default||require('stream'))")
        // is-promise resolves to its ESM build (default-only export) under our
        // conditions, but CJS consumers call the export directly as a function.
        .replace(/require\((['"])is-promise\1\)(?!\s*[.[(])/g,
          "(require('is-promise').default||require('is-promise'))");
      // pg/lib/index.js: esbuild wraps pg-pool's CJS class export in an
      // interop namespace; unwrap it so `class BoundPool extends Pool` works.
      if (/pg[\\/]lib[\\/]index\.js$/.test(args.path)) {
        out = out.replace("require('pg-pool')",
          "(require('pg-pool').default||require('pg-pool'))");
      }
      // pg/lib/stream.js: pg detects workerd and switches to pg-cloudflare
      // (cloudflare:sockets startTls), whose lazy TLS handshake fails against
      // the Supabase pooler. The plain node:net + node:tls path works fine in
      // workerd — force it.
      if (/pg[\\/]lib[\\/]stream\.js$/.test(args.path)) {
        out = out.replace("if (isCloudflareRuntime()) {", "if (false) {");
      }
      if (out === contents) return null;
      return { contents: out, loader: "js" };
    });
  },
};

const nodeShimPlugin = {
  name: "node-shim",
  setup(b) {
    b.onResolve({ filter: /^[a-z0-9_:/.-]+$/ }, async (args) => {
      const name = args.path.replace(/^node:/, "");
      if (!BUILTINS.has(args.path) && !BUILTINS.has(name)) return null;
      if (!builtinModules.includes(name)) return null;
      if (args.kind === "require-call" || args.kind === "require-resolve") {
        return { path: await shimFor(name) };
      }
      return { path: `node:${name}`, external: true };
    });
  },
};

await build({
  entryPoints: [path.resolve(dir, "entry.ts")],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "import", "default"],
  outfile: path.join(outdir, "index.js"),
  external: ["cloudflare:node", "cloudflare:sockets", "cloudflare:workers", "node:*", "*.node"],
  plugins: [nodeShimPlugin, patchCjsPlugin],
  define: {
    "process.env.NODE_ENV": '"production"',
    // workerd leaves import.meta.url undefined in some bundled CJS interop
    // paths; fs is stubbed anyway, so a fixed value is enough.
    "import.meta.url": '"file:///worker/index.js"',
  },
  banner: {
    js: `// workerd bans timers/IO/RNG in global scope. Dummy them during module
// evaluation; the entry point restores the originals on first request.
(() => {
  const saved = {};
  const dummyTimer = () => ({ unref() {}, refresh() {}, hasRef: () => false });
  const dummyFetch = () => new Promise(() => {});
  for (const n of ["setInterval", "setTimeout", "setImmediate", "queueMicrotask"]) {
    if (typeof globalThis[n] === "function") { saved[n] = globalThis[n]; globalThis[n] = n === "queueMicrotask" ? () => {} : dummyTimer; }
  }
  if (typeof globalThis.fetch === "function") { saved.fetch = globalThis.fetch; globalThis.fetch = dummyFetch; }
  globalThis.__orahdex_orig__ = saved;
})();`,
  },
  logLevel: "info",
  minify: true,
});
console.log("worker bundle built");
