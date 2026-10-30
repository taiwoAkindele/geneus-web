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
const profile = await mkdtemp(join(tmpdir(), 'geneus-workforce-qa-'));
const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve('qa/workforce-device.ts') },
    { find: '@shared', replacement: resolve('shared/src') },
    { find: '@', replacement: resolve('src') },
  ] },
  esbuild: { jsx: 'automatic',target:'esnext' }, optimizeDeps:{exclude:['@powersync/web']},worker:{format:'es'}, server: { host: '127.0.0.1', port: 5197, strictPort: true },
});
await server.listen();
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9337', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const errors = [];
const results = [];results.push=(...items)=>{console.log('PASS',...items);return Array.prototype.push.apply(results,items);};
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { target = (await (await fetch('http://127.0.0.1:9337/json/list')).json()).find((item) => item.type === 'page'); if (target) break; } catch {}
    await pause(100);
  }
  assert.ok(target, 'Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if(message.method==='Page.javascriptDialogOpening'&&message.params.type==='beforeunload')socket.send(JSON.stringify({id:++sequence,method:'Page.handleJavaScriptDialog',params:{accept:true}}));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
    }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);pending.set(id, { resolve:(value)=>{clearTimeout(timer);resolve(value);}, reject:(cause)=>{clearTimeout(timer);reject(cause);} }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await cdp('Runtime.evaluate', { expression:`(async()=>(${expression}))()`, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
  };
  const click = async (text, selector = 'button') => {
    await waitFor(`[...document.querySelectorAll(${JSON.stringify(selector)})].some(n=>n.textContent.trim()===${JSON.stringify(text)}&&n.getClientRects().length)`);
    const point = await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => n.textContent.trim() === ${JSON.stringify(text)} && n.getClientRects().length); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.scrollIntoView({block:'center'}); const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(120);
  };
  const fill = async (label, value) => evaluate(`(() => {
    const wrapper = [...document.querySelectorAll(document.querySelector('dialog[open]') ? 'dialog[open] label' : 'label')].find(n => n.textContent.trim().startsWith(${JSON.stringify(label)}));
    const input = wrapper?.control ?? wrapper?.querySelector('input,textarea,select'); if (!input) throw new Error('Missing field: ' + ${JSON.stringify(label)});
    const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  const expand = async (title) => {
    const needsOpen = await evaluate(`(() => { const summary = [...document.querySelectorAll('summary')].find(n => n.textContent.trim().startsWith(${JSON.stringify(title)})); return summary && !summary.parentElement.open ? summary.textContent.trim() : ''; })()`);
    if (needsOpen) await click(needsOpen, 'summary');
  };

  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:'http://127.0.0.1:5197/qa/workforce.html'});
  await waitFor('document.body.innerText.includes("Complete setup in a few clear steps")');
  await writeFile(join(output,'workforce-facility-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('Departments & units');await waitFor('document.body.innerText.includes("Ward team")');results.push('PHC and hospital structure with consistent tabs');
  await click('Add team');await waitFor('document.querySelector("dialog[open] input")');await fill('Name','Synthetic outreach team');await fill('Organization type','unit');await click('Save / review changes');await waitFor('!document.querySelector("dialog[open]")');
  assert.equal(await evaluate('(await window.workforceQa.db.getAll("SELECT name FROM units WHERE name = ?",["Synthetic outreach team"])).length'),1);
  assert.equal(await evaluate(`(await window.workforceQa.db.getAll("SELECT json_extract(data,'$.id') AS id FROM ps_crud")).some(r=>r.id)`),true);results.push('Actual PowerSync SQLite save and pending-ID query');
  await click('Locations');await click('Add location');await fill('Name','Unsaved synthetic room');await fill('Place type','room');await pause(750);
  await cdp('Page.reload');await waitFor('document.body.innerText.includes("Complete setup in a few clear steps")&&Boolean(window.workforceQa)');await click('Locations');await click('Add location');await waitFor('document.querySelector("dialog[open] input")?.value==="Unsaved synthetic room"');results.push('Encrypted staff-scoped editor recovery after reload');
  await fill('Name','Synthetic examination room');await click('Save / review changes');await waitFor('!document.querySelector("dialog[open]")');
  await click('Services');await click('Outpatient consultation','a');await waitFor('document.body.innerText.includes("Service overview")||document.body.innerText.includes("Team & coverage")');
  await writeFile(join(output,'workforce-service-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));results.push('Service detail and linked care context');
  await click('Staff profile','nav a');await waitFor('document.body.innerText.includes("Registered nurse")');await click('Update profile');await waitFor('document.querySelector("dialog[open] textarea")');await fill('Specialties','Community health, chronic care\nMaternal care');await click('Save / review changes');await waitFor('!document.querySelector("dialog[open]")');const profileRow=await evaluate('(await window.workforceQa.db.getAll("SELECT * FROM practitioner_profiles"))[0]');assert.equal(profileRow.staffId,'staff:qa-nurse');const specialties=JSON.parse(profileRow.specialties);assert.equal(specialties.length,2);assert.equal(specialties[0].code,'original-specialty');assert.equal(specialties[0].system,'urn:synthetic:specialty');results.push('Profile update preserves person and existing specialty terminology');await click('Work & access');await waitFor('document.body.innerText.includes("Service assignments")');results.push('Professional profile, software access and assignments remain separate');
  await click('Profile');await waitFor('document.body.innerText.includes("Private professional evidence")');assert.equal(await evaluate('document.body.innerText.includes("Verify staff contact")'),false);assert.equal(await evaluate('document.body.innerText.includes("Send staff verification code")'),true);results.push('Private evidence locked until independent contact verification');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});await pause(200);await evaluate('window.scrollTo(0,0)');assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'Staff layout overflows at 320px');
  await writeFile(join(output,'workforce-staff-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));await click('Coverage','nav a');await waitFor('document.body.innerText.includes("Planned coverage is separate")');assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'Coverage layout overflows at 320px');results.push('320px staff and coverage layouts');
  assert.deepEqual(errors,[]);await writeFile(join(output,'workforce-results.json'),JSON.stringify({passed:results,browserExceptions:errors},null,2));console.log(JSON.stringify({passed:results,browserExceptions:errors},null,2));
}finally{socket?.close();chrome.kill();await server.close();await pause(300);const absoluteProfile=resolve(profile);if(absoluteProfile.startsWith(resolve(tmpdir())+'\\geneus-workforce-qa-'))await rm(absoluteProfile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(e=>console.warn(e.message));}
