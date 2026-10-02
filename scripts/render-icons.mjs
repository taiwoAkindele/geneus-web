import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Renders the install icons in public/icons from public/favicon.svg, so the
 * SVG stays the one source of the mark. Android will only install a PWA that
 * has PNG icons; a headless Chrome rasterises them, so no image package is
 * needed. Run it again whenever favicon.svg changes, and commit the PNGs.
 *
 *   node scripts/render-icons.mjs        (CHROME_PATH to use a specific browser)
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const chrome = CHROME_CANDIDATES.find((candidate) => candidate && existsSync(candidate));
if (!chrome) throw new Error('no Chrome found — set CHROME_PATH to a Chrome or Chromium executable');

const favicon = readFileSync('public/favicon.svg', 'utf8');
// A maskable icon is cropped by the launcher to its own shape, so it must fill
// the whole square; the mark already sits inside the 80% safe zone.
const maskable = favicon.replace(/ rx="[^"]*"/, '');

const icons = [
  { file: 'icon-192.png', size: 192, svg: favicon },
  { file: 'icon-512.png', size: 512, svg: favicon },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
];

const workDirectory = mkdtempSync(path.join(tmpdir(), 'geneus-icons-'));
try {
  for (const icon of icons) {
    const page = path.join(workDirectory, `${icon.size}.html`);
    const sizedSvg = icon.svg.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `);
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${sizedSvg}</body></html>`);
    const output = path.resolve('public/icons', icon.file);
    execFileSync(chrome, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${icon.size},${icon.size}`,
      `--screenshot=${output}`,
      pathToFileURL(page).href,
    ]);
    console.log(`  ${icon.size}px  public/icons/${icon.file}`);
  }
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
