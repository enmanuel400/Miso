import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const BACKEND = process.env.MISO_BACKEND || 'http://127.0.0.1:7345';

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, '..', 'dist', 'web'),
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      // El backend aporta busqueda, detalle y los proxies de imagen y HLS.
      // En desarrollo los consumimos a traves de Vite; en produccion los sirve
      // el propio servidor Express, sin proxy.
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
    },
  },
});