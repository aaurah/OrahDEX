interface PagesContext {
  request: Request;
}

export const onRequest = async (
  context: PagesContext
): Promise<Response> => {
  const incoming = new URL(context.request.url);

  // Preview only: allow health and public market data.
  const allowed =
    incoming.pathname === "/api/health" ||
    incoming.pathname === "/api/markets" ||
    incoming.pathname.startsWith("/api/markets/");

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Preview API route disabled" }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      }
    );
  }

  if (context.request.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const upstream = new URL(
    incoming.pathname + incoming.search,
    "https://orahdex.com"
  );

  try {
    const response = await fetch(upstream.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
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
