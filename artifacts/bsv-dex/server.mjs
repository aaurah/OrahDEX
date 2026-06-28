import http from "http";
import fs from "fs";
import path from "path";
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
  ".txt":   "text/plain; charset=utf-8",
  ".xml":   "application/xml",
  ".map":   "application/json",
};

const CACHE_ASSETS = "public, max-age=31536000, immutable";
const CACHE_HTML   = "no-cache, no-store, must-revalidate";

const START_TIME = Date.now();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Health probe — always 200, no file I/O, no API dependency.
  if (url.pathname === "/health" || url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: Math.floor((Date.now() - START_TIME) / 1000) }));
    return;
  }

  const filePath = path.join(dist, url.pathname);
  const ext = path.extname(filePath).toLowerCase();

  function pipeFile(fp, mime, cache) {
    const stream = fs.createReadStream(fp);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "file unavailable", detail: err.message }));
      } else {
        res.destroy();
      }
    });
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": cache });
    stream.pipe(res);
  }

  const tryFile = (fp, fallbackToIndex) => {
    fs.stat(fp, (err, stat) => {
      if (!err && stat.isFile()) {
        const mime = MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream";
        const cache = fp.includes("/assets/") ? CACHE_ASSETS : CACHE_HTML;
        pipeFile(fp, mime, cache);
      } else if (fallbackToIndex) {
        const indexPath = path.join(dist, "index.html");
        pipeFile(indexPath, "text/html; charset=utf-8", CACHE_HTML);
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });
  };

  if (ext) {
    tryFile(filePath, false);
  } else {
    const htmlFile = filePath.endsWith("/") ? path.join(filePath, "index.html") : filePath + ".html";
    fs.stat(htmlFile, (err, stat) => {
      if (!err && stat.isFile()) {
        tryFile(htmlFile, false);
      } else {
        tryFile(path.join(dist, "index.html"), true);
      }
    });
  }
});

// Prevent a port-binding failure from producing an unhandled exception crash.
server.on("error", (err) => {
  console.error("OrahDEX static server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} already in use — exiting so the supervisor can reassign.`);
  }
  process.exit(1);
});

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`OrahDEX serving on port ${PORT}`);
});

// Graceful shutdown on SIGTERM / SIGINT.
// Stops accepting new connections, waits up to 5 s for in-flight requests
// to complete, then exits cleanly — avoids abrupt connection cuts when
// the deployment platform recycles the process.
function gracefulShutdown(signal) {
  console.log(`OrahDEX static server: received ${signal}, shutting down gracefully`);
  server.close((err) => {
    if (err) console.error("Error during server close:", err.message);
    process.exit(err ? 1 : 0);
  });
  // Hard-kill safety net: if connections don't drain within 5 s, exit anyway.
  setTimeout(() => {
    console.warn("OrahDEX static server: drain timeout, forcing exit");
    process.exit(0);
  }, 5_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
