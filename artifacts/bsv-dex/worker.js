export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');

    // Proxy API requests to backend
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/api')) {
      const proxyUrl = backend + url.pathname + url.search;
      const proxyReq = new Request(proxyUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      try {
        const response = await fetch(proxyReq);
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        return newResponse;
      } catch (e) {
        return new Response(JSON.stringify({ error: 'API unavailable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env) {
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');
    try {
      await fetch(backend + '/api/health', { method: 'GET' });
    } catch (e) {}
  },
};
