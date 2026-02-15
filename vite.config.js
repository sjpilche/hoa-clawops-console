/**
 * @file vite.config.js
 * @description Vite build configuration for ClawOps Console.
 *
 * KEY DECISIONS:
 * - Tailwind CSS v4 uses the @tailwindcss/vite plugin (no PostCSS config needed)
 * - The proxy setting forwards /api and /socket.io requests to our Express server
 *   so we don't hit CORS issues during development
 * - Port 5173 is Vite's default; the Express BFF runs on 3001
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  // Path alias: lets you write `import Foo from '@/components/Foo'`
  // instead of messy relative paths like `../../../components/Foo`
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5174,

    // PROXY: During development, forward API calls to the Express server.
    // This means the React app can call `/api/agents` and it will be
    // transparently forwarded to `http://localhost:3001/api/agents`.
    // In production, you'd use nginx or similar to handle this.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true, // Enable WebSocket proxying
      },
    },
  },
});
