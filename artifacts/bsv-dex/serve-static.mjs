import http from "http";
import fs from "fs";
import path from "path";
import zlib from "zlib";
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

// Extensions worth gzip-compressing (binary formats already compressed)
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg", ".xml", ".txt"]);

// In-memory gzip cache — key = absolute file path, value = Buffer
const gzipCache = new Map();

function getGzipped(filePath, raw) {
  if (gzipCache.has(filePath)) return gzipCache.get(filePath);
  const compressed = zlib.gzipSync(raw, { level: 6 });
  gzipCache.set(filePath, compressed);
  return compressed;
}

function clientAcceptsGzip(req) {
  return (req.headers["accept-encoding"] ?? "").includes("gzip");
}

function proxyToApi(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    console.log(`[proxy] ${req.method} ${req.url} → localhost:${API_PORT}`);
  }
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
    console.error("API proxy error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API unavailable", detail: err.message }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

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
  const isHtml = ext === ".html";

  try {
    const raw = fs.readFileSync(filePath);
    const useGzip = COMPRESSIBLE.has(ext) && clientAcceptsGzip(req);

    const headers = {
      "Content-Type": mime,
      "Cache-Control": isHtml ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Accept-Encoding",
    };

    if (useGzip) {
      const compressed = getGzipped(filePath, raw);
      headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = compressed.length;
      res.writeHead(200, headers);
      res.end(compressed);
    } else {
      headers["Content-Length"] = raw.length;
      res.writeHead(200, headers);
      res.end(raw);
    }
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
  console.log(`OrahDEX static server running on http://0.0.0.0:${PORT} — proxying /api → localhost:${API_PORT} (gzip enabled)`);
});
