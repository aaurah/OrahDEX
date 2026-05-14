import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Resolve the vite-plugin-node-polyfills package directory so we can return
// absolute paths to shim files, bypassing Rolldown's broken conditions check
// for the deprecated trailing-slash exports pattern.
const _require = createRequire(import.meta.url);
const _polyfillsPkgDir = path.resolve(
  path.dirname(_require.resolve("vite-plugin-node-polyfills")),
  "..",
);

// PORT is only needed for the dev/preview server, not the production build.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  optimizeDeps: {
    include: ["jsqr"],
    exclude: [
      "gridplus-sdk",
      "@trezor/connect-web",
      "@keystonehq/bc-ur-registry-eth",
    ],
  },
  define: {
    'import.meta.env.VITE_REOWN_PROJECT_ID': JSON.stringify(process.env.VITE_REOWN_PROJECT_ID ?? ''),
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE ?? ''),
  },
  plugins: [
    // Rolldown (Vite 8) strips ".js" from subpath specifiers when looking up
    // the package exports map. "@noble/curves" v2.x exports ONLY ".js" keys
    // (e.g. "./secp256k1.js"), so Rolldown can't find them (looks for
    // "./secp256k1" without .js). This plugin intercepts extensionless
    // @noble/curves/* and @noble/hashes/* imports, checks the exports map,
    // and if there is no extensionless key (v2.x), resolves the .js file
    // by absolute path — bypassing the broken exports map lookup entirely.
    // v1.x packages have extensionless keys and are left alone.
    // Rolldown (Vite 8) fails to resolve vite-plugin-node-polyfills shim
    // imports: its conditions check ["module","browser","production","require"]
    // stops at "production" (not in the shim's {"require":...,"import":...}
    // value) instead of continuing to "require". Also handles the deprecated
    // trailing-slash folder export pattern ("./shims/buffer/") that Rolldown
    // doesn't support. Bypass both issues by returning the absolute ESM path.
    {
      name: "polyfills-shims-compat",
      enforce: "pre",
      resolveId(id: string) {
        const m = id.match(
          /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)\/?$/,
        );
        if (!m) return null;
        return path.join(_polyfillsPkgDir, `shims/${m[1]}/dist/index.js`);
      },
    },
    {
      name: "noble-pkg-compat",
      enforce: "pre",
      async resolveId(id: string, importer: string | undefined) {
        if (!importer) return null;
        const match = id.match(/^(@noble\/(curves|hashes))\/([^./]+)$/);
        if (!match) return null;
        const pkg = match[1];
        const subpath = match[3];

        // Resolve the package main entry relative to the importer so we get
        // the correct nested version (not necessarily the workspace root).
        const pkgMain = await this.resolve(pkg, importer, { skipSelf: true });
        if (!pkgMain) return null;

        // Walk up to find the node_modules/<pkg> directory.
        const pkgMarker = `/node_modules/${pkg}/`;
        const markerIdx = pkgMain.id.lastIndexOf(pkgMarker);
        if (markerIdx === -1) return null;
        const pkgDir = pkgMain.id.slice(0, markerIdx + pkgMarker.length - 1);

        // Read the exports map and check for an extensionless key.
        let pkgExports: Record<string, unknown> = {};
        try {
          const raw = fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8");
          pkgExports = JSON.parse(raw).exports ?? {};
        } catch {
          return null;
        }

        // If the extensionless key exists, let Rolldown handle it normally.
        if (pkgExports[`./${subpath}`]) return null;

        // No extensionless key (v2.x) — resolve the .js file by absolute path
        // so Rolldown never touches the exports map for this import.
        const jsFile = path.join(pkgDir, `${subpath}.js`);
        if (!fs.existsSync(jsFile)) return null;
        return { id: jsFile };
      },
    },
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    /* Let Rolldown do automatic code splitting — manualChunks was causing
       the entry chunk to statically import 4 MB of JS (modals + pages chunks),
       blocking the app from mounting on mobile. */
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React runtime — always tiny, loads first
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // Routing + query
          if (id.includes("node_modules/@tanstack/") || id.includes("node_modules/wouter/")) {
            return "vendor-query";
          }
          // Chart library — heavy, only needed on trading pages
          if (id.includes("node_modules/lightweight-charts") || id.includes("node_modules/fancy-canvas")) {
            return "vendor-charts";
          }
          // Crypto / wallet libs — heavy, only needed on wallet pages
          if (
            id.includes("node_modules/@noble/") ||
            id.includes("node_modules/@scure/") ||
            id.includes("node_modules/bigi") ||
            id.includes("node_modules/bs58") ||
            id.includes("node_modules/ecpair") ||
            id.includes("node_modules/tiny-secp256k1")
          ) {
            return "vendor-crypto";
          }
          // UI component library
          if (id.includes("node_modules/@radix-ui/") || id.includes("node_modules/lucide-react")) {
            return "vendor-ui";
          }
          // Reown / WalletConnect — only needed when wallet modal opens
          if (id.includes("node_modules/@reown/") || id.includes("node_modules/@walletconnect/") || id.includes("node_modules/viem/") || id.includes("node_modules/wagmi/")) {
            return "vendor-walletconnect";
          }
          // Everything else in node_modules stays in a shared vendor chunk
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      "/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  clearScreen: false,
  logLevel: "info",
});
