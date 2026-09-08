import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @jarvis/shared and @jarvis/types ship a CommonJS build (needed so apps/api's
      // compiled `node dist/server.js` can `require()` them) — but Vite's dev server
      // serves native ESM directly to the browser and doesn't CJS-interop symlinked
      // workspace packages the way its production bundler does. Aliasing straight to
      // the TS source sidesteps the package.json "exports" entirely for the frontend,
      // so Vite just transpiles them like any other source file.
      '@jarvis/shared': path.resolve(dirname, '../../packages/shared/src/index.ts'),
      '@jarvis/types': path.resolve(dirname, '../../packages/types/src/index.ts'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
