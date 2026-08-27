cat > artifacts/bsv-dex/worker.js << 'ENDOFCODE'
const PROXY_PREFIXES = ['/api', '/auth', '/socket', '/ws', '/health', '/v1', '/graphql'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};
const STRIP_HEADERS = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker', 'x-forwarded-proto', 'x-forwarded-for', 'x-real-ip', 'cdn-loop', 'true-client-ip'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/worker-health') {
      return new Response(JSON.stringify({ status: 'ok', version: '4.0', backend, timestamp: Date.now() }), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
    }

    if (env.ASSETS && !PROXY_PREFIXES.some(p => url.pathname.startsWith(p))) {
      return env.ASSETS.fetch(request);
    }

    const targetUrl = backend + url.pathname + url.search;
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!STRIP_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
    }
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Forwarded-Host', url.hostname);

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    let bodyBuffer = null;
    if (hasBody && request.body) bodyBuffer = await request.arrayBuffer();

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fetchOptions = { method: request.method, headers, redirect: 'follow' };
        if (hasBody && bodyBuffer) fetchOptions.body = bodyBuffer;
        const response = await fetch(targetUrl, fetchOptions);
        const newHeaders = new Headers(response.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
      } catch (err) {
        console.error(`Attempt ${attempt}/3 failed: ${err.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    return new Response(JSON.stringify({ error: 'Backend temporarily unavailable', status: 503, backend }), { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
  },

  async scheduled(event, env) {
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');
    try {
      await fetch(backend + '/api/health', { headers: { 'User-Agent': 'orahdex-keepalive/4.0' } });
    } catch (err) {
      console.error('Keep-alive failed:', err.message);
    }
  },
};
ENDOFCODE
