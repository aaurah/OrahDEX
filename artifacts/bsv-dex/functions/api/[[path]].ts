interface PagesContext {
  request: Request;
}

export const onRequest = async (
  context: PagesContext
): Promise<Response> => {
  const incoming = new URL(context.request.url);
  const isOrderRoute =
    incoming.pathname === "/api/orders" ||
    incoming.pathname.startsWith("/api/orders/");
  const isPublicMarketRoute =
    incoming.pathname === "/api/markets" ||
    incoming.pathname.startsWith("/api/markets/");

  // Explicitly allow the read-only market API plus the staging EVM orderbook API.
  const allowed =
    incoming.pathname === "/api/health" ||
    isPublicMarketRoute ||
    isOrderRoute ||
    incoming.pathname === "/api/simpleswap/currencies";

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Preview API route disabled" }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const method = context.request.method.toUpperCase();
  const orderIdRoute = /^\/api\/orders\/[^/]+$/.test(incoming.pathname);
  const methodAllowed =
    method === "GET" ||
    (method === "POST" &&
      (incoming.pathname === "/api/orders" ||
        incoming.pathname === "/api/orders/recover-evm")) ||
    (method === "DELETE" && orderIdRoute);

  if (!methodAllowed) {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "content-type": "application/json" },
      }
    );
  }

  let body: ArrayBuffer | undefined;
  if (method !== "GET") {
    body = await context.request.arrayBuffer();
    if (body.byteLength > 64 * 1024) {
      return new Response(
        JSON.stringify({ error: "Request body is too large" }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        }
      );
    }
  }

  const upstream = new URL(
    incoming.pathname + incoming.search,
    "https://orahdex-cloud-api.orahdex.workers.dev"
  );

  try {
    const response = await fetch(upstream.toString(), {
      method,
      headers: {
        Accept: "application/json",
        ...(context.request.headers.get("content-type")
          ? { "Content-Type": context.request.headers.get("content-type")! }
          : {}),
      },
      ...(body ? { body } : {}),
      redirect: "manual",
    });

    const headers = new Headers();
    headers.set(
      "content-type",
      response.headers.get("content-type") ||
        "application/octet-stream"
    );
    headers.set("cache-control", "no-store");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Backend unavailable" }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
