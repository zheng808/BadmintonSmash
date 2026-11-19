import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  server: {
    port: 5173,
    // Local dev: forward API calls to the Hono dev server so the browser stays same-origin (no CORS).
    proxy: { '/v1': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true } },
  },
  build: { sourcemap: false, target: 'es2020' },
});
