import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local development the API runs on port 5000; requests to /api are
// proxied there so the client code can use relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
