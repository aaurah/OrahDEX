export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env) {
    const backend = (env.BACKEND_URL || 'https://orahdex-api.orahdex.workers.dev').replace(/\/+$/, '');
    try {
      await fetch(backend + '/api/health', { method: 'GET' });
    } catch (e) {}
  },
};
