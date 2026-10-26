// Synthetic review only. Uses actual screens and repositories without enrollment.
import { createServer } from 'vite';
import { resolve } from 'node:path';

const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve('qa/clinical-device.ts') },
    { find: '@shared', replacement: resolve('shared/src') },
    { find: '@', replacement: resolve('src') },
  ] },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 5197, strictPort: true },
});
await server.listen();
console.log('Synthetic combined dashboard: http://127.0.0.1:5197/qa/overall-audit.html?role=doctor&combined=1');
console.log('Other roles: cashier, records_officer, facility_admin. Reload resets synthetic changes. Stop with Ctrl+C.');
process.on('SIGINT', async () => { await server.close(); process.exit(0); });
