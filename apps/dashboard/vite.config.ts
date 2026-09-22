import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@earthquake/contracts', '@earthquake/domain'],
    exclude: ['maplibre-gl'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/(contracts|domain)\/dist/],
    },
  },
  server: { port: 5173 },
});
