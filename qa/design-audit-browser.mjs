// Run from geneus-web: node qa/design-audit-browser.mjs
// Uses installed Chrome and Node's WebSocket; no browser-testing dependency.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const output = resolve('qa/artifacts');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'geneus-clinical-qa-'));
const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve('qa/clinical-device.ts') },
    { find: '@shared', replacement: resolve('shared/src') },
    { find: '@', replacement: resolve('src') },
  ] },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 5194, strictPort: true },
});
await server.listen();
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9334', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const errors = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { target = (await (await fetch('http://127.0.0.1:9334/json/list')).json()).find((item) => item.type === 'page'); if (target) break; } catch {}
    await pause(100);
  }
  assert.ok(target, 'Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
    }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText') + '\n' + errors.join('\n'));
  };
  const click = async (text, selector = 'button') => {
    const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => n.textContent.trim() === ${JSON.stringify(text)} && n.getClientRects().length); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.scrollIntoView({block:'center'}); const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(120);
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5194/qa/design-audit.html' });
  await waitFor('Boolean(window.designAudit)');
  await waitFor('document.body.innerText.includes("Synthetic Clinical Patient")');
  const observations = [];
  const go = async (path, state) => {
    await evaluate('window.designAudit.go(' + JSON.stringify(path) + ',' + JSON.stringify(state ?? null) + ')');
    await waitFor('window.designAudit.path === ' + JSON.stringify(path)); await pause(450);
  };
  const snapshot = async (name) => {
    await evaluate('window.scrollTo(0,0)'); await pause(100);
    const metrics = await evaluate('({ width: innerWidth, viewportHeight: innerHeight, pageHeight: document.documentElement.scrollHeight, overflows: document.documentElement.scrollWidth > innerWidth, visibleTables: [...document.querySelectorAll("table")].filter(n => n.getClientRects().length > 0 && !n.closest("details:not([open])")).map(n => n.caption?.textContent), headings: [...document.querySelectorAll("h1,h2,h3")].filter(n=>n.getClientRects().length && !n.closest("details:not([open])")).map(n=>n.textContent), mainLandmarks: document.querySelectorAll("main,[role=main]").length })');
    observations.push({ screen: name, ...metrics });
    const layout = await cdp('Page.getLayoutMetrics');
    await writeFile(join(output, 'audit-' + name + '.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.width, height: Math.min(layout.cssContentSize.height, 12000), scale: 1 } })).data, 'base64'));
  };
  for (const width of [1440, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    const size = width === 390 ? 'mobile' : 'desktop';
    await go('/patients/search'); await snapshot('patients-' + size);
    const patientButton = await evaluate(`([...document.querySelectorAll('button')].find(n => n.textContent.includes('Synthetic Clinical Patient') && n.getClientRects().length)?.textContent.trim())`);
    assert.ok(patientButton, 'Patient search result should be visible');
    await click(patientButton);
    await pause(500);
    observations.push({ screen: 'patient-selection-' + size, path: await evaluate('window.designAudit.path'), embeddedPreview: await evaluate('Boolean(document.querySelector("aside[aria-label=\'Selected patient\']"))') });
    await snapshot('patient-selection-' + size);
    await go('/patients/profile', { patientId: 'QA-PHC-000001-K2' });
    await waitFor('document.body.innerText.includes("Synthetic ongoing problem")');
    await snapshot('profile-' + size);
    observations.push({ screen: 'profile-actions-' + size, actions: await evaluate('([...document.querySelectorAll("button")].filter(n=>n.textContent.includes("Start an encounter")||n.textContent.includes("Open encounter")||n.textContent.includes("Book appointment")).map(n=>({text:n.textContent.trim(),top:n.getBoundingClientRect().top})))') });
    await go('/encounters'); await click('All encounters'); await waitFor('document.body.innerText.includes("Open encounters")'); await snapshot('encounters-' + size);
    await click('Lab · 1'); await snapshot('lab-' + size);
    await go('/encounters/record', { patientId: 'QA-PHC-000001-K2', encounterId: 'encounter:open' });
    await waitFor('Boolean(document.querySelector("textarea"))'); await snapshot('encounter-' + size);
    observations.push({ screen: 'encounter-' + size, pendingSections: await evaluate('document.body.innerText.split("Complete the step above before recording this.").length - 1'), complaintTop: await evaluate('document.querySelector("textarea")?.getBoundingClientRect().top') });
    await go('/home'); await snapshot('home-' + size);
    await go('/appointments'); await snapshot('appointments-' + size);
    await go('/units'); await snapshot('units-' + size);
    await go('/registers'); await snapshot('registers-' + size);
    await go('/patients/new'); await snapshot('registration-' + size);
    // Observe the existing radio interaction, without saving any patient.
    await click('F');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    observations.push({ screen: 'radio-keyboard-' + size, selected: await evaluate('document.querySelector(\'[role="radio"][aria-checked="true"]\')?.textContent') });
    await go('/sync'); await snapshot('sync-' + size);
  }
  await go('/encounters/record', { patientId: 'QA-PHC-000001-K2', encounterId: 'encounter:open' });
  await waitFor('Boolean(document.querySelector("textarea"))');
  await click('Skip — not needed for this patient');
  const activeTitle = () => evaluate('([...document.querySelectorAll("span")].find(n => n.textContent.trim() === "Recording")?.parentElement.textContent)');
  const afterSkip = await activeTitle();
  await go('/home'); await go('/encounters/record', { patientId: 'QA-PHC-000001-K2', encounterId: 'encounter:open' });
  await waitFor('Boolean(document.querySelector("textarea"))');
  observations.push({ screen: 'skip-without-later-save', afterSkip, afterReturn: await activeTitle() });
  await go('/patients/profile');
  observations.push({ screen: 'profile-without-route-state', message: await evaluate('document.body.innerText.includes("No patient selected.")') });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
  await go('/patients/profile', { patientId: 'QA-PHC-000001-K2' }); await snapshot('profile-small-phone');
  await go('/encounters'); await click('All encounters'); await snapshot('encounters-small-phone');
  const contrast = (first, second) => {
    const luminance = (hex) => {
      const c = hex.match(/[a-f0-9]{2}/gi).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const a = luminance(first), b = luminance(second);
    return Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2));
  };
  observations.push({ screen: 'token-contrast', mutedOnWhite: contrast('6f7a71','ffffff'), mutedOnSurface: contrast('6f7a71','f8f9fa'), mutedOnContainer: contrast('6f7a71','edeeef'), brandOnWhite: contrast('00502e','ffffff'), outlineOnWhite: contrast('bec9bf','ffffff') });
  assert.deepEqual(errors, [], 'Audit harness should render without browser exceptions');
  await writeFile(join(output, 'design-audit-results.json'), JSON.stringify({ auditDate: new Date().toISOString(), method: 'Heuristic inspection of real screens with synthetic local data; not a clinical usability study or full WCAG conformance test.', observations, browserExceptions: errors }, null, 2));
  console.log(JSON.stringify({ screenshots: observations.filter(o => o.width).length, observations: observations.length, browserExceptions: errors, results: join(output, 'design-audit-results.json') }, null, 2));
} finally {
  socket?.close(); chrome.kill(); await server.close();
  // This is the exact profile freshly created by this script, never a user's browser profile.
  await pause(300);
  const absoluteProfile = resolve(profile);
  if (absoluteProfile.startsWith(resolve(tmpdir()) + '\\') || absoluteProfile.startsWith(resolve(tmpdir()) + '/')) {
    await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch((error) => console.warn('Could not remove temporary QA browser profile:', error.message));
  }
}


