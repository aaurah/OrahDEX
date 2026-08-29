import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Empty module stub for packages that break the build
const emptyModule = 'export default {}; export {};'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stub-broken-packages',
      resolveId(source) {
        if (
          source.startsWith('@ledgerhq/context-module') ||
          source.startsWith('@ledgerhq/device-signer-kit-ethereum')
        ) {
          return '\0stub:' + source
        }
        return null
      },
      load(id) {
        if (id.startsWith('\0stub:')) {
          return emptyModule
        }
        return null
      },
    },
  ],
  resolve: {
    alias: {
      '@noble/curves/secp256k1': resolve(__dirname, 'node_modules/@noble/curves/secp256k1.js'),
    },
  },
  build: {
    outDir: 'dist/public',
  },
})
