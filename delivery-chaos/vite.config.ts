import { defineConfig } from 'vitest/config';

// Dev: Vite serves the client on 5173 and proxies WebSocket upgrades on /ws to the
// Node server on 8080 (see server/index.ts). Prod: `npm run build && npm start` serves
// dist/ and /ws from the single Node server.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'http://localhost:8080', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
