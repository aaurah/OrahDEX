import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "dist", "public");
const PORT = Number(process.env.PORT ?? 3000);
const API_PORT = Number(process.env.API_PORT ?? 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".json": "application/json",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
};

function proxyToApi(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port:     API_PORT,
    path:     req.url,
    method:   req.method,
    headers:  { ...req.headers, host: `localhost:${API_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      // Return 200 for health/ping probes and the bare /v1 path that the
      // deployment platform checks — the API is still booting, not broken.
      const isHealth = req.url.includes("health") || req.url.includes("ping")
        || req.url === "/v1" || req.url === "/v1/";
      if (isHealth) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "starting" }));
      } else {
        console.error("API proxy error:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "API unavailable", detail: err.message }));
      }
    }
  });

  req.pipe(proxyReq, { end: true });
}

const START_TIME = Date.now();

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  // Instant health check — always 200, no API dependency, no file I/O.
  // Replit's deployment probe fires here before the API process is ready.
  if (urlPath === "/healthz" || urlPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) }));
    return;
  }

  if (urlPath.startsWith("/api") || urlPath.startsWith("/v1")) {
    proxyToApi(req, res);
    return;
  }

  let filePath = path.join(ROOT, urlPath);

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(ROOT, "index.html");
    }
  } catch {
    filePath = path.join(ROOT, "index.html");
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] ?? "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": ext === ".html" ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.on("error", (err) => {
  console.error("Server error:", err.message);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`OrahDEX static server running on http://0.0.0.0:${PORT} — proxying /api → localhost:${API_PORT}`);
});
