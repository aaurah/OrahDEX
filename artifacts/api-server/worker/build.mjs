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
// Named imports the codebase takes from stubbed modules.
const STUB_EXPORTS = {
  fs: ["existsSync", "readFileSync", "writeFileSync", "readdirSync", "mkdirSync", "createReadStream", "createWriteStream", "promises"],
  "fs/promises": ["readFile", "writeFile", "mkdir", "readdir", "rm"],
  child_process: ["exec", "spawn", "execSync", "spawnSync"],
  vm: [],
};

async function shimFor(name) {
  const file = path.join(shimDir, name.replaceAll("/", "_") + ".mjs");
  if (REAL.has(name)) {
    await writeFile(file, `import def from "node:${name}";\nexport * from "node:${name}";\nexport default def;\n`);
  } else {
    const named = (STUB_EXPORTS[name] || [])
      .map((n) => `export const ${n} = (...a) => { throw new Error("${name}.${n} is not available in this environment"); };`)
      .join("\n");
    await writeFile(file, `const stub = new Proxy(function(){}, { get: (t, k) => (k === "__esModule" ? true : (t[k] ??= stub)), apply: () => stub, construct: () => stub });\nexport default stub;\n${named}\n`);
  }
  return file;
}

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
  plugins: [nodeShimPlugin],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
  minify: true,
});
console.log("worker bundle built");
