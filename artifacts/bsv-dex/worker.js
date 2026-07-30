export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backend = 'https://748c5e24-ef08-447f-a71b-5e9894ce4896-00-3bzpx34oxbhbj.janeway.replit.dev';
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth') || url.pathname.startsWith('/socket') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/health') || url.pathname.startsWith('/v1') || url.pathname.startsWith('/graphql')) {
      const backendUrl = backend + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.set('Host', new URL(backend).host);
      const proxyRequest = new Request(backendUrl, { method: request.method, headers: headers, body: request.body, redirect: 'manual' });
      const response = await fetch(proxyRequest);
      if (response.status === 101) return response;
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', '*');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '86400' } });
    }
    return env.ASSETS.fetch(request);
  }
};
