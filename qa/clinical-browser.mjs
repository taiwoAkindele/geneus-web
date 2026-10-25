// Run from geneus-web: node qa/clinical-browser.mjs
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
const results = [];
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
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
  };
  const click = async (text, selector = 'button') => {
    const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => n.textContent.trim() === ${JSON.stringify(text)} && n.getClientRects().length); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.scrollIntoView({block:'center'}); const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(120);
  };
  const fill = async (label, value) => evaluate(`(() => {
    const wrapper = [...document.querySelectorAll('dialog[open] label')].find(n => n.textContent.trim().startsWith(${JSON.stringify(label)}));
    const input = wrapper?.querySelector('input,textarea,select'); if (!input) throw new Error('Missing field: ' + ${JSON.stringify(label)});
    const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  const expand = async (title) => {
    const needsOpen = await evaluate(`(() => { const summary = [...document.querySelectorAll('summary')].find(n => n.textContent.trim().startsWith(${JSON.stringify(title)})); return summary && !summary.parentElement.open ? summary.textContent.trim() : ''; })()`);
    if (needsOpen) await click(needsOpen, 'summary');
  };
  const save = async () => { await click('Save permanently'); await waitFor('!document.querySelector("dialog[open]")'); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5194/qa/clinical.html' });
  await waitFor('document.body.innerText.includes("Add problem")');
  await click('Add problem'); await fill('Condition / problem', 'Synthetic hypertension'); await save();
  results.push('Problem creation');
  await expand('Clinical history'); await click('Add history / examination'); await fill('Past medical history', 'Synthetic history for acceptance'); await save();
  results.push('Structured clinical history');
  await expand('Medication reconciliation'); await click('Add medication');
  await fill('Medication', 'Synthetic medicine'); await fill('Dose', '1 tablet'); await fill('Frequency', 'daily'); await save();
  results.push('Medication reconciliation');
  await expand('Allergies'); await click('Add allergy'); await fill('Allergen', 'Synthetic allergen'); await fill('Reaction', 'Synthetic rash'); await save();
  await waitFor('document.body.innerText.includes("Synthetic allergen — Synthetic rash")');
  results.push('Allergy alert');
  await click('Review legacy allergy'); await fill('Reaction', 'Synthetic historical report reviewed'); await fill('Verification', 'refuted'); await fill('Status', 'inactive'); await save();
  await waitFor('!document.querySelector(\'span[role="status"]\')?.textContent.includes("Legacy synthetic allergen")');
  results.push('Legacy allergy review without changing demographics');
  await expand('Care plans'); await click('Add care plan'); await fill('Care plan', 'Synthetic review'); await fill('Treatment / care goal', 'Review synthetic progress'); await fill('Planned actions', 'Review observations'); await save();
  results.push('Care plan creation');
  await expand('Specialty care'); await click('Add specialty assessment'); await fill('Care pathway', 'diabetes');
  await pause(200); await fill('Assessment', 'Synthetic assessment'); await fill('Care plan / next actions', 'Synthetic review plan'); await fill('HbA1c (%)', '7');
  await writeFile(join(output, 'specialty-mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await save(); results.push('Specialty assessment and measurements');
  await evaluate(`document.querySelector('article').id = 'qa-problem-card'`);
  await click('Review / update', '#qa-problem-card button'); await fill('Status', 'resolved'); await save();
  results.push('Problem resolution with revision history');
  await evaluate(`([...document.querySelectorAll('article')].find(n => n.querySelector('b')?.textContent.trim() === 'Synthetic review')).id = 'qa-care-plan-card'`);
  await click('Review / update', '#qa-care-plan-card button'); await fill('Review findings / outcome', 'Synthetic follow-up completed'); await fill('Status', 'completed'); await save();
  results.push('Care-plan review and outcome');
  await click('Repeat observation'); await fill('Temp (°C)', '38'); await click('Review entry'); await click('Confirm & save permanently'); await waitFor('!document.querySelector("dialog[open]")');
  results.push('Repeat observations');
  await click('Correct original observation'); await fill('Temp (°C)', '37'); await fill('Reason for correction', 'Synthetic transcription correction'); await click('Review entry'); await click('Confirm & save permanently'); await waitFor('!document.querySelector("dialog[open]")');
  results.push('Structured correction');
  await click('Add progress note'); await fill('Assessment', 'Synthetic progress assessment'); await fill('Clinical plan / advice', 'Synthetic progress plan'); await click('Review entry'); await click('Confirm & save permanently'); await waitFor('!document.querySelector("dialog[open]")');
  results.push('Structured progress note');
  const rows = await evaluate('window.clinicalQa.rows');
  assert.equal(rows.clinical_events.length, 9);
  assert.equal(rows.encounter_entries.length, 4);
  assert.deepEqual(JSON.parse(rows.patients[0].allergies), ['Legacy synthetic allergen']);
  assert.equal(JSON.parse(rows.encounter_entries[0].values).temperatureC, 39);
  assert.equal(JSON.parse(rows.encounter_entries[2].values).correctedValues.temperatureC, 37);
  await pause(3200);
  await evaluate('window.scrollTo(0,0)');
  await writeFile(join(output, 'summary-mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'Mobile layout overflows the viewport');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await writeFile(join(output, 'summary-desktop.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'results.json'), JSON.stringify({ passed: results, browserExceptions: errors }, null, 2));
  console.log(JSON.stringify({ passed: results, browserExceptions: errors }, null, 2));
} finally {
  socket?.close(); chrome.kill(); await server.close();
  // This is the exact profile freshly created by this script, never a user's browser profile.
  await pause(300);
  const absoluteProfile = resolve(profile);
  if (absoluteProfile.startsWith(resolve(tmpdir()) + '\\') || absoluteProfile.startsWith(resolve(tmpdir()) + '/')) {
    await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch((error) => console.warn('Could not remove temporary QA browser profile:', error.message));
  }
}
