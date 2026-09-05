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

// ── Cross-isolate KV cache for GET /api/letsexchange/currencies ──────────────
// The Express route's coin caches are per-isolate memory; every cold isolate
// otherwise re-fetches + re-normalises ~6k coins from LetsExchange (6–9 s CPU,
// intermittently tripping the free-plan 10 s CPU limit → error 1102). Serving
// the list from the ORAHDEX_KV binding gives all isolates one shared copy.
// Refreshed automatically from the first live response that has the full list.

interface KvLike {
  get(key: string, opts?: { type: "json" }): Promise<unknown>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface CtxLike { waitUntil(p: Promise<unknown>): void }
interface EnvLike { ORAHDEX_KV?: unknown; ALLOWED_ORIGINS?: string }

const KV_LE_CURRENCIES = "le:currencies:v1";
const KV_COIN_THRESHOLD = 400; // only persist the live list, never the 331-coin built-in fallback

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

async function serveCurrenciesFromKv(
  request: Request, env: EnvLike, ctx: CtxLike,
  next: () => Promise<Response>,
): Promise<Response> {
  const kv = env.ORAHDEX_KV as unknown as KvLike | undefined;
  if (!kv) return next();
  try {
    const hit = await kv.get(KV_LE_CURRENCIES, { type: "json" });
    if (Array.isArray(hit) && hit.length >= KV_COIN_THRESHOLD) {
      return new Response(JSON.stringify(hit), { headers: corsHeaders(request, env) });
    }
  } catch { /* KV read failed — fall through to the app */ }

  const res = await next();
  if (res.ok) {
    try {
      const clone = res.clone();
      ctx.waitUntil((async () => {
        try {
          const data = await clone.json();
          if (Array.isArray(data) && data.length >= KV_COIN_THRESHOLD) {
            await kv.put(KV_LE_CURRENCIES, JSON.stringify(data), { expirationTtl: 86400 });
          }
        } catch { /* non-JSON or KV write failure — non-fatal */ }
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
      if (request.method === "GET" && url.pathname === "/api/letsexchange/currencies") {
        return await serveCurrenciesFromKv(request, (env ?? {}) as EnvLike, ctx as CtxLike, next);
      }
    } catch { /* URL parse failure — fall through to the app */ }
    return next();
  },
};
