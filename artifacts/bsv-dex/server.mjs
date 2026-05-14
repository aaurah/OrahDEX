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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const filePath = path.join(dist, url.pathname);
  const ext = path.extname(filePath).toLowerCase();

  const tryFile = (fp, fallbackToIndex) => {
    fs.stat(fp, (err, stat) => {
      if (!err && stat.isFile()) {
        const mime = MIME[path.extname(fp).toLowerCase()] ?? "application/octet-stream";
        const cache = fp.includes("/assets/") ? CACHE_ASSETS : CACHE_HTML;
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": cache });
        fs.createReadStream(fp).pipe(res);
      } else if (fallbackToIndex) {
        const indexPath = path.join(dist, "index.html");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": CACHE_HTML,
        });
        fs.createReadStream(indexPath).pipe(res);
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

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`OrahDEX serving on port ${PORT}`);
});
