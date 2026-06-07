import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true, // listen on 0.0.0.0 for container/LAN access
    proxy: {
      // dev convenience: forward API calls to the backend
      '/api': 'http://localhost:3100',
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        manualChunks(id: string) {
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/zustand')) return 'state';
        },
      },
    },
  },
  plugins: [react()],
});
