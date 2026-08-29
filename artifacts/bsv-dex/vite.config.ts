import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { cpSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-routes',
      closeBundle() {
        cpSync(resolve(__dirname, 'public/_routes.json'), resolve(__dirname, 'dist/public/_routes.json'))
      },
    },
  ],
  resolve: {
    alias: {
      '@noble/curves/secp256k1': resolve(__dirname, 'node_modules/@noble/curves/secp256k1.js'),
      '@ledgerhq/context-module': resolve(__dirname, 'stubs/ledgerhq-context-module.js'),
      '@ledgerhq/device-signer-kit-ethereum': resolve(__dirname, 'stubs/ledgerhq-device-signer.js'),
    },
  },
  build: {
    outDir: 'dist/public',
  },
})
