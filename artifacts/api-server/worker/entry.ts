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
      const { default: app } = await import("../src/app");
      const server = http.createServer(app);
      return httpServerHandler(server) as { fetch: (r: Request, e: unknown, c: unknown) => Promise<Response> };
    })();
  }
  return handlerPromise;
}

// Temporary diagnostics endpoint: runs a real query through the app's pooled
// pg connection and returns the exact error so workerd/pg incompatibilities
// are visible without log access. Remove once production is verified.
async function dbCheck(): Promise<Response> {
  const out: Record<string, unknown> = { url: process.env.DATABASE_URL ? "set" : "MISSING" };
  try {
    const { pool } = await import("@workspace/db");
    const r = await pool.query("SELECT 1 AS ok, (SELECT count(*) FROM markets) AS markets");
    out.result = r.rows;
    out.status = "connected";
  } catch (e) {
    out.status = "failed";
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    out.stack = e instanceof Error ? (e.stack || "").split("\n").slice(0, 6) : undefined;
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    if (new URL(request.url).pathname === "/__dbcheck") return dbCheck();
    const h = await getHandler();
    return h.fetch(request, env, ctx);
  },
};
