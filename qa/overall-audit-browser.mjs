// Run interactively from geneus-web: node qa/overall-audit-browser.mjs
// Uses installed Chrome and Node's WebSocket; no browser-testing dependency.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';

const output = resolve(process.env.OVERALL_AUDIT_OUTPUT ?? (process.argv[2] ? 'qa/artifacts/overall-redesign' : '../docs/design-review/overall-product-2026-10-26'));
const previewOrigin = process.env.PATIENT_FLOW_PREVIEW ?? 'http://127.0.0.1:5196';
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(previewOrigin), 'Use a local synthetic preview origin');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'geneus-clinical-qa-'));
const server = process.env.PATIENT_FLOW_PREVIEW ? undefined : await createServer({
  configFile: false, root: process.cwd(), logLevel: 'error',
  resolve: { alias: [
    { find: /^@\/data$/, replacement: resolve('qa/clinical-device.ts') },
    { find: '@shared', replacement: resolve('shared/src') },
    { find: '@', replacement: resolve('src') },
  ] },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 5196, strictPort: true },
});
await server?.listen();
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9336', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
let closeBrowser;
const errors = [];
const results = [];
const batch = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : undefined;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  let target;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { target = (await (await fetch('http://127.0.0.1:9336/json/list')).json()).find((item) => item.type === 'page'); if (target) break; } catch {}
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
      const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request?.timer);
      if (message.error) request?.reject(new Error(message.error.message)); else request?.resolve(message.result);
    }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome command timed out: ' + method)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  closeBrowser = () => cdp('Browser.close');
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
    const point = await evaluate(`(() => { const node = [...(document.querySelector('dialog[open]') ?? document).querySelectorAll(${JSON.stringify(selector)})].sort((a,b)=>Number(Boolean(b.closest('nav[aria-label="Patient record sections"]')))-Number(Boolean(a.closest('nav[aria-label="Patient record sections"]')))).find(n => n.textContent.trim() === ${JSON.stringify(text)} && n.getClientRects().length); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.scrollIntoView({block:'center'}); const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(120);
  };

  const inPage = (callback,...args) => evaluate('('+callback.toString()+')(...'+JSON.stringify(args)+')');
  const fill = async (label,value) => {
    await inPage((name,value) => {
      const scope=document.querySelector('dialog[open]')??document;
      const label=[...scope.querySelectorAll('label')].find(n=>n.textContent.trim().startsWith(name));
      const input=label?.control??label?.querySelector('input,textarea,select');
      if(!input)throw new Error('Missing field: '+name);
      const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    },label,value); await pause(120);
  };
  const clickLabel=async(label)=>{
    const point=await inPage(label=>{const n=[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===label&&n.getClientRects().length);if(!n)throw new Error('Missing labeled button: '+label);n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},label);
    await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await pause(150);
  };
  const key=async(value,code)=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:code});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value,windowsVirtualKeyCode:code});await pause(100);};
  const go=async(path)=>{await evaluate('window.designAudit.go('+JSON.stringify(path)+')');await pause(350);};
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setTimezoneOverride',{timezoneId:'Africa/Lagos'});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
  let currentRole, currentWidth;
  console.log(batch ? 'Running connected workflow checks.' : 'Audit browser ready. Enter one JSON capture/action command per line.');
  for await (const line of batch ? batch.map((command) => JSON.stringify(command)) : createInterface({ input: process.stdin, terminal: false })) {
    if (!line.trim()) continue;
    let command;
    try { command = JSON.parse(line); }
    catch { console.log('Invalid JSON command; no action taken.'); continue; }
    if (command.finish) break;
    try {
      const role = command.role ?? currentRole ?? 'doctor', width = command.width ?? currentWidth ?? 1440;
      if (role !== currentRole || width !== currentWidth || command.reload) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: width > 800 ? 1024 : 844, deviceScaleFactor: 1, mobile: width <= 800 });
        await cdp('Page.navigate', { url: previewOrigin + '/qa/overall-audit.html?role=' + encodeURIComponent(role) + (command.combined ? '&combined=1' : '') + (command.readonly ? '&readonly=1' : '') + (command.actor ? '&actor=' + encodeURIComponent(command.actor) : '') });
        await waitFor('Boolean(window.designAudit)&&Boolean(document.querySelector("h1"))');await evaluate('document.fonts.ready.then(()=>true)');
        currentRole = role; currentWidth = width;
      }
      if (command.path) await go(command.path);
      if (command.click) await click(command.click, command.selector ?? 'button');
      if (command.label) await clickLabel(command.label);
      if (command.fill) await fill(command.fill.label, command.fill.value);
      if (command.key) await key(command.key, command.code ?? 27);
      if (command.evaluate) console.log(JSON.stringify({evaluation: await evaluate(command.evaluate)}));
      if (command.scroll !== undefined) await evaluate('window.scrollTo(0,' + Number(command.scroll) + ')');
      await pause(250);
      if (command.name) {
        assert.match(command.name, /^[a-zA-Z0-9-]+$/);
        const png = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(output, command.name + '.png'), Buffer.from(png.data, 'base64'));
        const observed = await evaluate(`({path:window.designAudit.path,search:window.designAudit.search,title:document.title,body:document.body.innerText,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,scrollY},headings:[...document.querySelectorAll('h1,h2,h3')].map(n=>({tag:n.tagName,text:n.textContent})),controls:[...document.querySelectorAll('button,a,input,select,textarea,summary,[role=button]')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,role:n.getAttribute('role'),text:(n.getAttribute('aria-label')??n.textContent??'').trim().slice(0,120),disabled:n.disabled??false,tabIndex:n.tabIndex,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),mainCount:document.querySelectorAll('main').length})`);
        await writeFile(join(output, command.name + '.json'), JSON.stringify({ role, observed, errors }, null, 2));
        console.log(JSON.stringify({captured:command.name,role,path:observed.path,viewport:observed.viewport,headings:observed.headings,errors}));
      } else if (!batch) console.log(JSON.stringify({ok:true,body:(await evaluate('document.body.innerText')).slice(-1800)}));
      if (command.assert) {
        assert.equal(await evaluate(command.assert), true, (command.description ?? command.assert) + '\n' + await evaluate('document.body.innerText'));
        results.push({ description: command.description ?? command.assert, passed: true });
        if (batch) console.log(JSON.stringify({ passed: command.description ?? command.assert }));
      }
    } catch (error) { console.log(JSON.stringify({error:String(error),exceptions:errors})); results.push({ description: command.description ?? command.name ?? 'Command', passed: false, error: String(error) }); if (batch) { process.exitCode = 1; break; } }
  }
  if (batch) { assert.deepEqual(errors, [], 'Uncaught browser exceptions'); await writeFile(join(output, process.argv[2].includes('-appointments-') ? 'appointment-results.json' : process.argv[2].includes('-visual-') ? 'visual-results.json' : 'results.json'), JSON.stringify({ results, errors }, null, 2)); }
} finally {
  await closeBrowser?.().catch(() => {});
  socket?.close(); chrome.kill(); await server?.close();
  process.stdin.pause();
  await pause(300);
  const absoluteProfile = resolve(profile);
  if (absoluteProfile.startsWith(resolve(tmpdir()) + '\\') || absoluteProfile.startsWith(resolve(tmpdir()) + '/')) await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
