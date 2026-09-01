const BACKEND = 'https://748c5e24-ef08-447f-a71b-5e9894ce4896-00-3bzpx34oxbhbj.janeway.replit.dev';

const PROXY_PREFIXES = ['/api', '/auth', '/socket', '/ws', '/health', '/v1', '/graphql', '/letsexchange', '/simpleswap', '/simple-swap', '/bridge', '/swap', '/handcash', '/status'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Proxy API requests to Replit backend
    if (PROXY_PREFIXES.some(p => url.pathname.startsWith(p))) {
      const target = BACKEND + url.pathname + url.search;
      try {
        const resp = await fetch(target, {
          method: request.method,
          headers: request.headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        });
        const h = new Headers(resp.headers);
        Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
        return new Response(resp.body, { status: resp.status, headers: h });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Backend unavailable' }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env) {
    try { await fetch(BACKEND + '/api/health'); } catch (e) {}
  },
};
