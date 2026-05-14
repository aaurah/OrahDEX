import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// PORT is only needed for the dev/preview server, not the production build.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  define: {
    'import.meta.env.VITE_REOWN_PROJECT_ID': JSON.stringify(process.env.VITE_REOWN_PROJECT_ID ?? ''),
    'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE ?? ''),
  },
  plugins: [
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
