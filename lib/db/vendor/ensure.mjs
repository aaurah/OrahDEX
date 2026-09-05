// Materializes the vendored Neon serverless driver (@neondatabase/serverless
// v1.1.0, MIT) as neon-serverless.mjs next to this file. The driver is NOT an
// npm dependency and NOT committed to git (the file is 147 KB of minified
// protocol code); it is downloaded once at build time from the npm CDN and
// verified against a pinned SHA-256. Idempotent — subsequent builds skip the
// download. Runs at the top of every esbuild bundle (build.mjs and
// worker/build.mjs).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.1.0";
const SHA256 = "2913bd33766e5e9ca954c86d77c3664fc4169b2188cc8de558a07bb04ca0df27";
const URLS = [
  `https://unpkg.com/@neondatabase/serverless@${VERSION}/index.mjs`,
  `https://cdn.jsdelivr.net/npm/@neondatabase/serverless@${VERSION}/index.mjs`,
];

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "neon-serverless.mjs");

if (!existsSync(out)) {
  let lastErr;
  for (const url of URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = createHash("sha256").update(buf).digest("hex");
      if (hash !== SHA256) throw new Error(`sha256 mismatch: ${hash}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(out, buf);
      console.log(`[lib/db] vendored @neondatabase/serverless@${VERSION} from ${url}`);
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw new Error(`Failed to vendor neon-serverless driver: ${lastErr}`);
}
