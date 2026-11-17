import simpleSwapCatalog from "./simpleswap-catalog.json";
export interface Env {
  DB: D1Database;
}

interface MarketRow {
  symbol: string;
  base_asset: string;
  quote_asset: string;
  last_price: string;
  price_change_24h: string;
  price_change_percent_24h: string;
  volume_24h: string;
  high_24h: string;
  low_24h: string;
  market_cap: string | null;
  status: string;
  type: string;
  min_order_size: string;
  max_order_size: string;
  tick_size: string;
  maker_fee: string;
  taker_fee: string;
  updated_at: string;
  contract_addresses: string | null;
  enabled: number;
  pinned: number;
}

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

function parseInteger(
  raw: string | null,
  fallback: number,
  maximum: number
): number | null {
  if (raw === null) return fallback;

  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value > maximum) {
    return null;
  }

  return value;
}

function marketToPublic(row: MarketRow) {
  let contractAddresses: unknown = null;

  if (row.contract_addresses !== null) {
    try {
      contractAddresses = JSON.parse(row.contract_addresses);
    } catch {
      contractAddresses = null;
    }
  }

  return {
    ...row,
    contract_addresses: contractAddresses,
    enabled: row.enabled === 1,
    pinned: row.pinned === 1
  };
}

async function listMarkets(
  url: URL,
  env: Env
): Promise<Response> {
  const limit = parseInteger(
    url.searchParams.get("limit"), 20, 100
  );

  const offset = parseInteger(
    url.searchParams.get("offset"), 0, 1000000
  );

  if (limit === null || limit < 1 || offset === null) {
    return json({
      error: "Invalid pagination",
      maxLimit: 100,
      maxOffset: 1000000
    }, 400);
  }

  const type = url.searchParams.get("type");
  const allowedTypes = new Set([
    "spot",
    "futures",
    "catalog",
    "simpleswap",
    "letsexchange"
  ]);

  if (type !== null && !allowedTypes.has(type)) {
    return json({ error: "Invalid market type" }, 400);
  }

  try {
    const filter = type === null ? "" : "WHERE type = ?";

    const query = `
      SELECT *
      FROM markets
      ${filter}
      ORDER BY symbol ASC
      LIMIT ? OFFSET ?
    `;

    const statement = env.DB.prepare(query);

    const result = type === null
      ? await statement.bind(limit, offset).all<MarketRow>()
      : await statement.bind(type, limit, offset).all<MarketRow>();

    return json({
      service: "orahdex-cloud-api",
      database: "orahdex-cloud-staging",
      production: false,
      data: result.results.map(marketToPublic),
      pagination: {
        limit,
        offset,
        returned: result.results.length
      }
    });
  } catch {
    return json({
      error: "Market database unavailable"
    }, 503);
  }
}

async function marketStats(env: Env): Promise<Response> {
  try {
    const [total, types] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS total FROM markets"
      ).first<{ total: number }>(),

      env.DB.prepare(`
        SELECT type, COUNT(*) AS total
        FROM markets
        GROUP BY type
        ORDER BY type
      `).all<{ type: string; total: number }>()
    ]);

    return json({
      service: "orahdex-cloud-api",
      database: "orahdex-cloud-staging",
      production: false,
      totalMarkets: total?.total ?? 0,
      byType: types.results
    });
  } catch {
    return json({
      error: "Market statistics unavailable"
    }, 503);
  }
}

async function getMarket(
  symbol: string,
  env: Env
): Promise<Response> {
  if (!symbol || symbol.length > 200) {
    return json({ error: "Invalid market symbol" }, 400);
  }

  try {
    const market = await env.DB.prepare(
      "SELECT * FROM markets WHERE symbol = ? LIMIT 1"
    ).bind(symbol).first<MarketRow>();

    if (!market) {
      return json({ error: "Market not found" }, 404);
    }

    return json({
      service: "orahdex-cloud-api",
      database: "orahdex-cloud-staging",
      production: false,
      data: marketToPublic(market)
    });
  } catch {
    return json({
      error: "Market database unavailable"
    }, 503);
  }
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
      const databaseReady = await checkDatabase(env);

      return json({
        status: databaseReady ? "ok" : "degraded",
        service: "orahdex-cloud-api",
        runtime: "cloudflare-workers",
        version: "0.2.0",
        apiReady: true,
        databaseReady,
        tradingReady: false,
        blockchainReady: false,
        timestamp: new Date().toISOString()
      }, databaseReady ? 200 : 503);
    }

    if (url.pathname === "/api/status") {
      return json({
        service: "OrahDEX Cloud API",
        migration: "stage-7e",
        production: false,
        termuxRequiredForProduction: true
      });
    }


    if (url.pathname === "/api/simpleswap/currencies") {
      return json(simpleSwapCatalog);
    }

    if (url.pathname === "/api/markets/stats") {
      return marketStats(env);
    }

    if (url.pathname === "/api/markets") {
      return listMarkets(url, env);
    }

    if (url.pathname.startsWith("/api/markets/")) {
      const rawSymbol = url.pathname.slice(
        "/api/markets/".length
      );

      let symbol: string;

      try {
        symbol = decodeURIComponent(rawSymbol);
      } catch {
        return json({ error: "Invalid symbol encoding" }, 400);
      }

      return getMarket(symbol, env);
    }

    return json({ error: "Not found" }, 404);
  }
};
