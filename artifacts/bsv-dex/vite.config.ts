import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          /* ── Reown / WalletConnect / Wagmi — heaviest SDK, own chunk ── */
          if (
            id.includes("node_modules/@reown/") ||
            id.includes("node_modules/@walletconnect/") ||
            id.includes("node_modules/wagmi") ||
            id.includes("node_modules/viem") ||
            id.includes("node_modules/@wagmi/")
          ) {
            return "vendor-wallet";
          }
          /* ── TradingView / chart libraries ── */
          if (id.includes("node_modules/lightweight-charts")) {
            return "vendor-charts";
          }
          /* ── Icons — tree-shaken but still large ── */
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          /* ── UI component library ── */
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          /* ── Ethers / blockchain utils ── */
          if (id.includes("node_modules/ethers") || id.includes("node_modules/web3")) {
            return "vendor-ethers";
          }
          /* Admin pages grouped into one chunk */
          if (id.includes("/pages/admin/")) {
            return "pages-admin";
          }
          /* Mobile pages + components grouped into one chunk */
          if (id.includes("/pages/mobile/") || id.includes("/components/mobile/")) {
            return "pages-mobile";
          }
          /* Wallet connect modal — loaded lazily, own chunk */
          if (id.includes("/WalletConnectModal") || id.includes("/BuyCryptoModal") || id.includes("/AiAssistant")) {
            return "modals";
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
});
