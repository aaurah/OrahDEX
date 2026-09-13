/**
 * aaurah.org API Server — Cloudflare Worker
 * Runs 24/7 via HTTP fetch handler + cron scheduled handler.
 */

export default {
  // Handles all HTTP requests to aaurah.org
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({ status: "ok", uptime: "24/7", timestamp: new Date().toISOString() }, corsHeaders);
    }

    // API info
    if (url.pathname === "/api") {
      return jsonResponse({
        name: "aaurah.org API",
        version: "1.0.0",
        endpoints: ["/", "/health", "/api", "/api/status"],
        timestamp: new Date().toISOString(),
      }, corsHeaders);
    }

    // Status endpoint
    if (url.pathname === "/api/status") {
      return jsonResponse({
        status: "running",
        worker: "orahdex",
        domain: "aaurah.org",
        cron: "active (* * * * *)",
        timestamp: new Date().toISOString(),
      }, corsHeaders);
    }

    // 404 for unknown routes
    return jsonResponse({ error: "Not found", path: url.pathname }, corsHeaders, 404);
  },

  // Cron trigger handler — fires every minute to keep the Worker alive
  async scheduled(event, env, ctx) {
    // Keep-warm ping — you can add background tasks here
    console.log(`Cron fired at ${new Date().toISOString()} — keeping aaurah.org API warm`);
  },
};

/**
 * Helper: return a JSON response with CORS headers
 */
function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
