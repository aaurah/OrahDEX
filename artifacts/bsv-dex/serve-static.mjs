import http from "http";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
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

const COMPRESSIBLE = new Set([
  "text/html; charset=utf-8",
  "application/javascript",
  "text/css",
  "image/svg+xml",
  "application/json",
  "font/woff",
  "font/ttf",
]);

function acceptsGzip(req) {
  return /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
}

function etag(buf) {
  return `"${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)}"`;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' https: wss: ws:",
  "font-src 'self' https: data:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "media-src 'self' https: blob:",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": CSP,
  "Referrer-Policy": "strict-origin-when-cross-origin",
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
      const url = req.url ?? "/";
      const isHealthProbe =
        url.includes("health") ||
        url.includes("ping") ||
        url === "/api"  || url === "/api/"  ||
        url === "/v1"   || url === "/v1/";
      if (isHealthProbe) {
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

  if (urlPath === "/healthz" || urlPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) }));
    return;
  }

  if (
    urlPath.startsWith("/api") ||
    urlPath.startsWith("/v1") ||
    urlPath.startsWith("/docs") ||
    urlPath.startsWith("/rpc")
  ) {
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
  const isHtml = ext === ".html" || ext === "";

  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath);
    const tag = etag(content);
    const lastModified = stat.mtime.toUTCString();

    if (req.headers["if-none-match"] === tag) {
      res.writeHead(304, { ETag: tag, ...SECURITY_HEADERS });
      res.end();
      return;
    }

    const cacheControl = isHtml
      ? "no-cache, no-store, must-revalidate"
      : "public, max-age=31536000, immutable";

    const baseHeaders = {
      "Content-Type": mime,
      "Cache-Control": cacheControl,
      "ETag": tag,
      "Last-Modified": lastModified,
      "Vary": "Accept-Encoding",
      ...SECURITY_HEADERS,
    };

    if (acceptsGzip(req) && COMPRESSIBLE.has(mime)) {
      zlib.gzip(content, { level: zlib.constants.Z_BEST_SPEED }, (err, compressed) => {
        if (err) {
          res.writeHead(200, { ...baseHeaders, "Content-Length": content.length });
          res.end(content);
          return;
        }
        res.writeHead(200, {
          ...baseHeaders,
          "Content-Encoding": "gzip",
          "Content-Length": compressed.length,
        });
        res.end(compressed);
      });
    } else {
      res.writeHead(200, { ...baseHeaders, "Content-Length": content.length });
      res.end(content);
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
  console.log(`OrahDEX static server running on http://0.0.0.0:${PORT} — proxying /api → localhost:${API_PORT}`);
});
