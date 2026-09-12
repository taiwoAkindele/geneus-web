import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// PWA/offline (vite-plugin-pwa) is added in a later integration step.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared/src'),
    },
  },
  plugins: [react()],
  optimizeDeps: {
    // The PowerSync client ships web workers and WASM that Vite's dependency
    // pre-bundling would break (its own guidance for Vite projects).
    exclude: ['@powersync/web'],
  },
  worker: {
    format: 'es',
  },
});
