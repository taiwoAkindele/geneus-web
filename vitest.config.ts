import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests run in Node against fakes: the pieces under test — authorization,
// the write boundary, the row mapping, the connector — have no DOM in them.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
