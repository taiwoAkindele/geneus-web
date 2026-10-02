import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/**
 * The cheap-Android budget (PLAN.md §4): the JavaScript a phone must download
 * and parse before the first screen — the entry chunk plus everything Vite
 * preloads with it — gzipped, against a ceiling. Everything loaded later
 * (routes, the PowerSync client, the SQLite WASM) is reported, not counted;
 * the WASM is listed by name so its size is never out of sight.
 *
 *   npm run build && node scripts/check-bundle-size.mjs
 */
const BUDGET_KB = 300;
const dist = 'dist';
const html = readFileSync(`${dist}/index.html`, 'utf8');
const gzipKb = (file) => gzipSync(readFileSync(`${dist}/${file}`)).length / 1024;

const entry = html.match(/src="\/(assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error('no entry script in dist/index.html — run npm run build first');
const preloaded = [...html.matchAll(/modulepreload[^>]*href="\/(assets\/[^"]+\.js)"/g)].map((match) => match[1]);
const initial = [entry, ...preloaded];

const initialKb = initial.reduce((total, file) => total + gzipKb(file), 0);
const wasm = readdirSync(`${dist}/assets`).filter((file) => file.endsWith('.wasm'));

for (const file of initial) console.log(`  ${gzipKb(file).toFixed(1).padStart(7)} KB gz  ${file}`);
console.log(`\n  initial JS: ${initialKb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);
for (const file of wasm) console.log(`  runtime asset, loaded once after enrollment: ${gzipKb(`assets/${file}`).toFixed(0)} KB gz  assets/${file}`);

if (initialKb > BUDGET_KB) {
  console.error(`\n  over budget by ${(initialKb - BUDGET_KB).toFixed(1)} KB`);
  process.exit(1);
}
