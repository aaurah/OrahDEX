import http from "http";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 20180;
const dist = path.join(__dirname, "dist/public");

const MIME = {
  ".js":    "application/javascript; charset=utf-8",
  ".mjs":   "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".html":  "text/html; charset=utf-8",
  ".json":  "application/json; charset=utf-8",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".webp":  "image/webp",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".txt":   "text/plain; charset=utf-8",
  ".xml":   "application/xml",
  ".map":   "application/json",
  ".wasm":  "application/wasm",
};

const COMPRESSIBLE = new Set([
  "text/html; charset=utf-8",
  "application/javascript; charset=utf-8",
  "text/css; charset=utf-8",
  "image/svg+xml",
  "application/json; charset=utf-8",
  "application/json",
  "font/woff",
  "font/ttf",
  "text/plain; charset=utf-8",
  "application/xml",
]);

const CACHE_ASSETS = "public, max-age=31536000, immutable";
const CACHE_HTML   = "no-cache, no-store, must-revalidate";

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
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy": CSP,
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function acceptsGzip(req) {
  return /\bgzip\b/.test(req.headers["accept-encoding"] ?? "");
}

function etag(buf) {
  return `"${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)}"`;
}

const START_TIME = Date.now();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health" || url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) }));
    return;
  }

  const filePath = path.join(dist, url.pathname);
  const ext = path.extname(filePath).toLowerCase();

  function serveFile(fp) {
    let content;
    let stat;
    try {
      stat = fs.statSync(fp);
      content = fs.readFileSync(fp);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const mime = MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream";
    const isHtml = fp.endsWith(".html");
    const cache = fp.includes("/assets/") && !isHtml ? CACHE_ASSETS : CACHE_HTML;
    const tag = etag(content);
    const lastModified = stat.mtime.toUTCString();

    if (req.headers["if-none-match"] === tag) {
      res.writeHead(304, { ETag: tag, ...SECURITY_HEADERS });
      res.end();
      return;
    }

    const baseHeaders = {
      "Content-Type": mime,
      "Cache-Control": cache,
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
  }

  function serveIndex() {
    serveFile(path.join(dist, "index.html"));
  }

  if (ext) {
    const target = fs.existsSync(filePath) ? filePath : null;
    if (target) serveFile(target);
    else { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found"); }
  } else {
    const htmlFile = filePath.endsWith("/")
      ? path.join(filePath, "index.html")
      : filePath + ".html";
    if (fs.existsSync(htmlFile)) serveFile(htmlFile);
    else serveIndex();
  }
});

server.on("error", (err) => {
  console.error("OrahDEX static server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} already in use — exiting so the supervisor can reassign.`);
  }
  process.exit(1);
});

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`OrahDEX serving on port ${PORT} (gzip + ETag + security headers)`);
});

function gracefulShutdown(signal) {
  console.log(`OrahDEX static server: received ${signal}, shutting down gracefully`);
  server.close((err) => {
    if (err) console.error("Error during server close:", err.message);
    process.exit(err ? 1 : 0);
  });
  setTimeout(() => {
    console.warn("OrahDEX static server: drain timeout, forcing exit");
    process.exit(0);
  }, 5_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
