// Local synthetic demonstration. Uses the QA fixture, never the application database.
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonical = resolve(root, '../geneus-shared/src');
const contract = existsSync(resolve(canonical, 'index.ts')) ? canonical : resolve(root, 'shared/src');
const server = await createServer({
  root, configFile: false, envFile: false, cacheDir: 'node_modules/.vite/ward-care-demo',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve(root, 'qa/clinical-device.ts') },
    { find: '@shared', replacement: contract },
    { find: /^zod$/, replacement: resolve(root, 'node_modules/zod/index.js') },
    { find: '@', replacement: resolve(root, 'src') },
  ] },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5197, strictPort: true,
    fs: { allow: [root, contract, await realpath(resolve(root, 'node_modules'))] } },
});
await server.listen();
console.log('Ward care demo: http://127.0.0.1:5197/qa/ward-care-demo.html');
console.log('Synthetic records only. Refresh restarts the sample stay. Stop with Ctrl+C.');
const close = async () => { await server.close(); process.exit(0); };
process.once('SIGINT', close);
process.once('SIGTERM', close);
