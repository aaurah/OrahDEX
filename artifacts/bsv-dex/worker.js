const PROXY_PREFIXES = ['/api', '/auth', '/socket', '/ws', '/health', '/v1', '/graphql'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/worker-health') {
      return new Response(JSON.stringify({ status: 'ok', assets: !!env.ASSETS, backend }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // Proxy API requests to backend
    if (PROXY_PREFIXES.some(p => url.pathname.startsWith(p))) {
      const targetUrl = backend + url.pathname + url.search;
      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers: request.headers,
          body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        });
        const newHeaders = new Headers(response.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, { status: response.status, headers: newHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'API unavailable', backend }), {
          status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env) {
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');
    try { await fetch(backend + '/api/health'); } catch (e) {}
  },
};
