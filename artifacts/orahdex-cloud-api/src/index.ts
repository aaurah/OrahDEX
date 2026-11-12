export interface Env { DB: D1Database }

async function checkDatabase(env: Env): Promise<boolean> {
  try {
    const result = await env.DB
      .prepare("SELECT 1 AS connected")
      .first<{ connected: number }>();

    return result?.connected === 1;
  } catch {
    return false;
  }
}


function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/api/health/database") {
      const connected = await checkDatabase(env);
      return json({
        service: "orahdex-cloud-api",
        database: "orahdex-cloud-staging",
        connected,
        timestamp: new Date().toISOString()
      }, connected ? 200 : 503);
    }

    if (url.pathname === "/api/health") {
      return json({
        status: "ok",
        service: "orahdex-cloud-api",
        runtime: "cloudflare-workers",
        version: "0.1.0",
        apiReady: true,
        databaseReady: await checkDatabase(env),
        tradingReady: false,
        blockchainReady: false,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/status") {
      return json({
        service: "OrahDEX Cloud API",
        migration: "stage-4",
        production: false,
        termuxRequiredForProduction: true
      });
    }

    return json({ error: "Not found" }, 404);
  }
};
