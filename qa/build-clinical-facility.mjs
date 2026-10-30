// Compile the complete application without reading environment files or altering the user's Vite config.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, sep } from 'node:path';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const outDir = resolve('qa/artifacts/application-build');
if (!outDir.startsWith(resolve('qa/artifacts') + sep)) throw new Error('Unexpected build output path');
await build({ configFile: false, envFile: false, root: process.cwd(), plugins: [react()], resolve: { alias: { '@': resolve('src'), '@shared': resolve('shared/src') } }, optimizeDeps: { exclude: ['@powersync/web'] }, worker: { format: 'es' }, build: { outDir, emptyOutDir: true, reportCompressedSize: false } });
const html = readFileSync(resolve(outDir, 'index.html'), 'utf8');
const entry = html.match(/src="\/(assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error('No application entry was generated');
const preloads = [...html.matchAll(/modulepreload[^>]*href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const initialKb = [entry, ...preloads].reduce((total, file) => total + gzipSync(readFileSync(resolve(outDir, file))).length / 1024, 0);
console.log(`Initial application JavaScript: ${initialKb.toFixed(1)} KB gzipped; budget 300 KB`);
if (initialKb > 300) throw new Error('The initial bundle exceeds the cheap-Android budget');
