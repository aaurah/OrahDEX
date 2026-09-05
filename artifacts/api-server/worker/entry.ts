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
import net from "node:net";
import tls from "node:tls";
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

// Temporary diagnostics endpoint: runs staged connectivity checks (TCP, TLS,
// pg query) with per-stage timeouts so workerd/pg incompatibilities are
// visible without log access. Remove once production is verified.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms at ${label}`)), ms)),
  ]);
}

async function dbCheck(): Promise<Response> {
  const out: Record<string, unknown> = {};
  const rawUrl = process.env.DATABASE_URL || "";
  out.url = rawUrl ? "set" : "MISSING";
  try {
    const u = new URL(rawUrl);
    const host = u.hostname;
    const port = Number(u.port || 5432);
    out.target = `${host}:${port}`;

    // Stage 1: raw TCP via node:net
    await withTimeout(
      new Promise<void>((res, rej) => {
        const s = net.connect({ host, port });
        s.once("connect", () => { s.destroy(); res(); });
        s.once("error", rej);
      }),
      8000, "tcp");
    out.tcp = "ok";

    // Stage 2: TLS over the TCP socket
    await withTimeout(
      new Promise<void>((res, rej) => {
        const s = net.connect({ host, port });
        s.once("error", rej);
        const t = tls.connect({ socket: s, servername: host });
        t.once("secureConnect", () => { t.destroy(); res(); });
        t.once("error", rej);
      }),
      8000, "tls");
    out.tls = "ok";

    // Stage 3: real query through the app's pooled pg connection
    const { pool } = await import("@workspace/db");
    const r = await withTimeout(pool.query("SELECT 1 AS ok, (SELECT count(*) FROM markets) AS markets"), 15000, "pg-query");
    out.result = r.rows;
    out.status = "connected";
  } catch (e) {
    out.status = "failed";
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    out.stack = e instanceof Error ? (e.stack || "").split("\n").slice(0, 8) : undefined;
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json" } });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    // Restore real timers/fetch before ANY path — the diagnostics endpoint
    // needs working setTimeout too, and it bypasses getHandler().
    restoreGlobals();
    const path = new URL(request.url).pathname;
    // Reachable both directly (workers.dev) and through the /api/* route.
    if (path === "/__dbcheck" || path === "/api/__dbcheck") return dbCheck();
    const h = await getHandler();
    return h.fetch(request, env, ctx);
  },
};
