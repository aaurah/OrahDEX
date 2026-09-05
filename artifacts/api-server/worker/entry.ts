// Cloudflare Workers entry: runs the full Express app inside a Worker via
// the nodejs_compat httpServerHandler bridge.
//
// workerd forbids timers / async I/O / RNG in global scope, but several
// services start setInterval loops at module top level. The build banner
// therefore replaces those globals with harmless dummies during initial
// module evaluation; we restore the real ones on the first request, right
// before dynamically importing the app (so all side effects happen inside a
// request context, where they are allowed).
import http from "node:http";
import { httpServerHandler } from "cloudflare:node";

declare global {
  // eslint-disable-next-line no-var
  var __orahdex_orig__: Record<string, unknown> | undefined;
}

let handlerPromise: Promise<{ fetch: (r: Request, e: unknown, c: unknown) => Promise<Response> }> | null = null;

function restoreGlobals() {
  const saved = globalThis.__orahdex_orig__;
  if (!saved) return;
  for (const [k, v] of Object.entries(saved)) {
    (globalThis as Record<string, unknown>)[k] = v;
  }
  delete globalThis.__orahdex_orig__;
}

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      restoreGlobals();
      // Signal to the app that it runs inside workerd. Used to disable the
      // compression middleware (workerd zlib streaming corrupts gzip bodies;
      // Cloudflare's edge compresses responses automatically anyway).
      process.env.ORAHDEX_RUNTIME = "worker";
      const { default: app } = await import("../src/app");
      const server = http.createServer(app);
      return httpServerHandler(server) as { fetch: (r: Request, e: unknown, c: unknown) => Promise<Response> };
    })();
  }
  return handlerPromise;
}

// ── Cross-isolate KV cache for heavy read-only JSON endpoints ────────────────
// The Express routes' caches are per-isolate memory; every cold isolate
// otherwise re-fetches + re-normalises ~6k coins / ~100k pairs from the
// upstream venue APIs (6–9 s CPU, intermittently tripping the free-plan 10 s
// CPU limit → error 1102). Serving these GET endpoints from the ORAHDEX_KV
// binding gives all isolates one shared copy. Entries are refreshed
// automatically from the first live response that looks complete.

interface KvLike {
  get(key: string, opts?: { type: "json" }): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface CtxLike { waitUntil(p: Promise<unknown>): void }
interface EnvLike { ORAHDEX_KV?: unknown; ALLOWED_ORIGINS?: string }

// path → { ttl seconds, minBytes } — minBytes guards against caching the
// built-in fallback / partial cold-start responses as if they were live data.
// (The built-in fallback is ~30 KB; live responses are ≥ 1 MB.)
const KV_CACHED_GETS: Record<string, { ttl: number; minBytes: number }> = {
  "/api/letsexchange/currencies": { ttl: 86400, minBytes: 100_000 },
  "/api/letsexchange/pairs":      { ttl: 1800,  minBytes: 100_000 },
  "/api/simpleswap/pairs":        { ttl: 1800,  minBytes: 50_000 },
};

function kvKey(url: URL): string {
  // include the query string so ?all=true and ?quote=BSV cache separately
  return `kv:v2:${url.pathname}${url.search}`;
}

function corsHeaders(request: Request, env: EnvLike): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const h: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (origin && (allowed.includes(origin) || allowed.length === 0)) {
    h["access-control-allow-origin"] = origin;
    h["vary"] = "Origin";
  }
  return h;
}

async function serveJsonFromKv(
  request: Request, url: URL, cfg: { ttl: number; minBytes: number },
  env: EnvLike, ctx: CtxLike,
  next: () => Promise<Response>,
): Promise<Response> {
  const kv = env.ORAHDEX_KV as unknown as KvLike | undefined;
  if (!kv) return next();
  const key = kvKey(url);
  // Serve the cached JSON body as-is — zero parse/serialize CPU.
  // Stored gzip-compressed (27 MB raw → ~3 MB, under KV's 25 MiB value limit).
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");
  try {
    const buf = await kv.get(key, { type: "arrayBuffer" });
    if (buf && buf.byteLength > 0) {
      const headers = corsHeaders(request, env);
      if (acceptsGzip) {
        headers["content-encoding"] = "gzip";
        return new Response(buf, { headers });
      }
      // Client can't take gzip — decompress via native stream (cheap CPU).
      const plain = new Response((buf as ArrayBuffer)).body!
        .pipeThrough(new DecompressionStream("gzip"));
      return new Response(plain, { headers });
    }
  } catch { /* KV read failed — fall through to the app */ }

  const res = await next();
  if (res.ok) {
    try {
      const clone = res.clone();
      // Store gzip-compressed via a native stream — no JSON.parse (a 27 MB
      // parse would blow the free-plan CPU budget inside waitUntil and
      // silently kill the write), and compression keeps the full all-quotes
      // response under KV's 25 MiB value limit.
      ctx.waitUntil((async () => {
        try {
          const text = await clone.text();
          if (text.length >= cfg.minBytes && (text.startsWith("[") || text.startsWith("{"))) {
            const gz = new Response(text).body!.pipeThrough(new CompressionStream("gzip"));
            const buf = await new Response(gz).arrayBuffer();
            await kv.put(key, buf, { expirationTtl: cfg.ttl });
            await kv.put("kv:debug:lastwrite", JSON.stringify({ key, raw: text.length, gz: buf.byteLength, at: Date.now() }), { expirationTtl: 3600 }).catch(() => {});
          } else {
            await kv.put("kv:debug:skip", JSON.stringify({ key, bytes: text.length, head: text.slice(0, 40), at: Date.now() }), { expirationTtl: 3600 }).catch(() => {});
          }
        } catch (werr) {
          await kv.put("kv:debug:lasterror", JSON.stringify({ key, err: String(werr), at: Date.now() }), { expirationTtl: 3600 }).catch(() => {});
        }
      })());
    } catch { /* clone failed — non-fatal */ }
  }
  return res;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    restoreGlobals();
    const h = await getHandler();
    const next = () => h.fetch(request, env, ctx);
    try {
      const url = new URL(request.url);
      const cfg = request.method === "GET" ? KV_CACHED_GETS[url.pathname] : undefined;
      if (cfg) {
        return await serveJsonFromKv(request, url, cfg, (env ?? {}) as EnvLike, ctx as CtxLike, next);
      }
    } catch { /* URL parse failure — fall through to the app */ }
    return next();
  },
};
