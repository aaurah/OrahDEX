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

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/worker-health') {
      return new Response(JSON.stringify({ status: 'ok', version: '4.1', timestamp: Date.now(), hasServiceBinding: !!env.ORAHDEX_API }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    if (env.ASSETS && !PROXY_PREFIXES.some(p => url.pathname.startsWith(p))) {
      return env.ASSETS.fetch(request);
    }

    if (env.ORAHDEX_API) {
      try {
        const newReq = new Request(new URL(url.pathname + url.search, request.url), request);
        const response = await env.ORAHDEX_API.fetch(newReq);
        const newHeaders = new Headers(response.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'API Worker error: ' + err.message, status: 502 }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
      }
    }

    const backend = 'https://orahdex-api.orahdex.workers.dev';
    const targetUrl = backend + url.pathname + url.search;
    try {
      const response = await fetch(targetUrl, { method: request.method, headers: request.headers, body: ['GET', 'HEAD'].includes(request.method) ? null : request.body, redirect: 'follow' });
      const newHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Backend unavailable: ' + err.message, status: 503 }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }
  },

  async scheduled(event, env) {
    if (env.ORAHDEX_API) {
      try {
        await env.ORAHDEX_API.fetch(new Request('https://internal/api/health'));
      } catch (err) {
        console.error('Keep-alive failed:', err.message);
      }
    }
  },
};
