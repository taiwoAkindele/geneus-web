import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Step 1: React + Tailwind only. PWA/offline (vite-plugin-pwa) and the @shared
// submodule alias are added in the integration steps.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [react()],
});
