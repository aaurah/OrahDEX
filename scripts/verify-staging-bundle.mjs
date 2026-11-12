import fs from "node:fs";
import path from "node:path";

const root = "artifacts/bsv-dex/dist/public";
const assets = path.join(root, "assets");

if (!fs.existsSync(path.join(root, "index.html"))) {
  throw Error("Staging index.html missing");
}

if (!fs.existsSync(assets)) {
  throw Error("Staging assets missing");
}

const files = fs.readdirSync(assets)
  .filter(name => name.endsWith(".js"));

if (!files.length) {
  throw Error("No JavaScript bundles found");
}

const forbidden = [
  "eth_sendTransaction",
  "signTransaction",
  "usePlaceOrder",
  "WalletConnect",
  "create-payment-intent",
  "/api/withdrawals",
  "/api/admin/"
];

let total = 0;

for (const file of files) {
  const content = fs.readFileSync(
    path.join(assets, file),
    "utf8"
  );

  total += Buffer.byteLength(content);

  for (const token of forbidden) {
    if (content.includes(token)) {
      throw Error(
        `Forbidden staging token "${token}" in ${file}`
      );
    }
  }
}


const html = fs.readFileSync(
  path.join(root, "index.html"),
  "utf8"
);

if (!html.includes("Read-Only Cloud Preview")) {
  throw Error("Incorrect staging HTML generated");
}

const forbiddenHtml = [
  'href="/trade/',
  'href="/futures/',
  'href="/swap"',
  'href="https://orahdex.org/"',
  '/src/production-main',
  '/src/main.tsx',
  'WalletConnect',
  'eth_sendTransaction'
];

for (const token of forbiddenHtml) {
  if (html.includes(token)) {
    throw Error(`Forbidden staging HTML: ${token}`);
  }
}

console.log("PASS: No forbidden tokens detected");
console.log("JavaScript files:", files.length);
console.log("Total JS bytes:", total);
