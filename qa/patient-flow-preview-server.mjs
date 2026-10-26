// Synthetic, in-memory review of the real patient components. No production data.
import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve('qa/clinical-device.ts') },
    { find: '@shared', replacement: resolve('shared/src') },
    { find: '@', replacement: resolve('src') },
  ] },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5195, strictPort: true },
});
await server.listen();
console.log('Synthetic patient review: http://127.0.0.1:5195/qa/patient-flow.html');
console.log('Open Amaka Okoro. Changes reset when the page reloads. Ctrl+C stops the preview.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
