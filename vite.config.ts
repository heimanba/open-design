import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DAEMON_PORT = Number(process.env.OCD_PORT) || 7456;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${DAEMON_PORT}`,
        changeOrigin: true,
        // Daemon uses SSE on /api/chat — disable Vite's buffering.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          });
        },
      },
      // The daemon serves persisted artifacts and the shared device-frame
      // library; proxy them through so the dev SPA can iframe them without
      // hitting a different origin.
      '/artifacts': {
        target: `http://127.0.0.1:${DAEMON_PORT}`,
        changeOrigin: true,
      },
      '/frames': {
        target: `http://127.0.0.1:${DAEMON_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
