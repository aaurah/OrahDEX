import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

const root = import.meta.dirname;
const output = path.resolve(root, "dist/public");

export default defineConfig({
  root,
  base: "/",

  plugins: [
    react(),
    tailwindcss(),

    {
      name: "orahdex-staging-html",
      apply: "build",
      enforce: "post",

      generateBundle(_, bundle) {
        const entry = bundle["staging.html"];

        if (!entry || entry.type !== "asset") {
          throw new Error(
            "Staging HTML output not found"
          );
        }

        delete bundle["staging.html"];

        this.emitFile({
          type: "asset",
          fileName: "index.html",
          source: entry.source,
        });
      },
    },
  ],

  build: {
    outDir: output,
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(root, "staging.html"),
    },
  },

  define: {
    "import.meta.env.VITE_API_BASE":
      JSON.stringify("/api"),
  },
});
