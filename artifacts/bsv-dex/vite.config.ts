import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
