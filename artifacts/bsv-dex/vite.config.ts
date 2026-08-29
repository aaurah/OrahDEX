import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@noble/curves/secp256k1': resolve(__dirname, 'node_modules/@noble/curves/secp256k1.js'),
    },
  },
  build: {
    outDir: 'dist/public',
    rollupOptions: {
      external: [
        '@ledgerhq/context-module',
        '@ledgerhq/device-signer-kit-ethereum',
      ],
    },
  },
})
