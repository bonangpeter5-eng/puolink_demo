import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forwards every /api/* request server-side to Spring Boot on 8080.
      // Because Vite does this proxying itself (not the browser), the
      // browser only ever talks to http://localhost:5173 — there is no
      // cross-origin request in dev mode at all, which is what actually
      // eliminates the CORS problem (the Spring-side CORS config is a
      // secondary safety net, not what makes this work).
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
