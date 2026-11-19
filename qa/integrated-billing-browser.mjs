// Release 1 acceptance: the actual web app (its own Vite config) against the actual
// geneus-server, PostgreSQL and PowerSync started by scripts/integrated-billing-staging.ts.
// No stand-in routes. Synthetic hospital and patients only.
//   node qa/integrated-billing-browser.mjs <handoff.json> <output-dir>
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { realpath, mkdir, readFile, writeFile, rm, mkdtemp, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const [handoffPath, outputArg] = process.argv.slice(2);
const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
const output = resolve(outputArg ?? 'qa/artifacts/insurance-staging');
await mkdir(output, { recursive: true });
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(handoff.api), 'Run only against the local staging stack');
process.env.VITE_API_URL = handoff.api;
process.env.VITE_SIGNING_PUBLIC_KEY = handoff.signingPublicKey;
const server = await createServer({ root: process.cwd(), mode: 'qa', envDir: false, logLevel: 'error', server: { fs: {allow:[process.cwd(),await realpath('node_modules')]}, host: '127.0.0.1', port: 5219, strictPort: true } });
await server.listen();
const profile = process.env.RESUME_PROFILE??await mkdtemp(join(tmpdir(), 'geneus-billing-integrated-'));
assert.ok(profile.startsWith(join(tmpdir(),'geneus-billing-integrated-')),'Resume only this harness’s own temporary profile');
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  // HEADED=1 opens a visible window so a person can watch the run.
  ...(process.env.HEADED ? ['--window-size=1460,1100'] : ['--headless=new']), '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9359', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const errors = [], results = [], timeline = [];
let socket, step = 0;
const inspect = async (path, method = 'GET') => (await fetch(handoff.inspector + path, { method })).json();
// Synthetic upload fixtures: a minimal PDF, and a text file named .pdf that the server must refuse.
const samplePdf = join(profile, 'synthetic-agreement.pdf'), fakePdf = join(profile, 'not-a-pdf.pdf');
await writeFile(samplePdf, '%PDF-1.4\n% synthetic staging agreement\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
await writeFile(fakePdf, '=HYPERLINK("http://example.org","click") this is not a PDF');
// An HMO-style tariff sheet: a title row, a currency in the header, a near-miss name, a service the hospital lacks, and a formula-like cell.
const tariffCsv = join(profile, 'synthetic-hmo-tariff.csv');
await writeFile(tariffCsv, 'Synthetic Staging HMO approved tariff 2026,,,\r\nS/N,HMO Code,Service Description,Approved Tariff (₦)\r\n1,SSH-C01,General consultation,"1,500.00"\r\n2,SSH-L02,Malaria RDT (rapid test),1000\r\n3,SSH-X99,Appendicectomy,90000\r\n4,"=HYPERLINK(""http://example.org"")",=1+1,abc\r\n');

try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9359/json/list')).json()).find((t) => t.type === 'page'); } catch {} if (!target) await pause(150); }
  assert.ok(target, 'Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') timeline.push({ console: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 1500) });
    if (m.id) { const r = pending.get(m.id); pending.delete(m.id); clearTimeout(r?.timer); if (m.error) r?.reject(new Error(m.error.message)); else r?.resolve(m.result); }
  };
  const cdp = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); fail(new Error('Chrome timed out: ' + method)); }, 30000); pending.set(id, { resolve: ok, reject: fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
  await mkdir(join(output,'downloads'),{recursive:true});await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(output,'downloads')});
  const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const text = () => evaluate('document.body.innerText');
  const scope = `(document.querySelectorAll('dialog[open]').length ? [...document.querySelectorAll('dialog[open]')].at(-1) : document)`;
  const waitFor = async (expression, ms = 60000, label = expression) => { const until = Date.now() + ms; while (Date.now() < until) { if (await evaluate(expression).catch(() => false)) return; await pause(250); } throw new Error('Timed out waiting for: ' + label + '\n---\n' + (await text()).slice(0, 2500)); };
  const waitText = (value, ms) => waitFor(`document.body.innerText.includes(${JSON.stringify(value)})`, ms, value);
  const press = async (expression) => {
    // Real data arrives by sync: wait up to 20 s for the control before giving up.
    for (let i = 0; i < 80 && !(await evaluate(`Boolean(${expression})`).catch(() => false)); i++) await pause(250);
    const point = await evaluate(`(() => { const n = ${expression}; if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!point) throw new Error('Missing control: ' + expression + '\n---\n' + (await text()).slice(0, 2000));
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(200);
  };
  const click = (label, selector = 'button, a, [role=button]') => press(`[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.trim() === ${JSON.stringify(label)} && n.getClientRects().length && !n.disabled)`);
  const clickContaining = (value, selector = 'button, a, [role=button]') => press(`[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(value)}) && n.getClientRects().length && !n.disabled)`);
  const clickLabel = (name) => press(`[...${scope}.querySelectorAll('label')].find((n) => n.textContent.trim().startsWith(${JSON.stringify(name)}) && n.getClientRects().length)`);
  const fill = async (label, value, nth = 0) => {
    await waitFor(`Boolean([...${scope}.querySelectorAll('label')].filter(n=>n.textContent.trim().startsWith(${JSON.stringify(label)})&&n.getClientRects().length)[${nth}]?.control)`,20000,'field ready: '+label);
    const done = await evaluate(`(() => { const labels = [...${scope}.querySelectorAll('label')].filter((n) => n.textContent.trim().startsWith(${JSON.stringify(label)}) && n.getClientRects().length); const l = labels[${nth}]; const input = l?.control ?? l?.querySelector('input,textarea,select'); if (!input) return false;
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!done) throw new Error('Missing field: ' + label + ' #' + nth + '\n---\n' + (await text()).slice(0, 2000));
    await pause(150);
  };
  /** Fills a field inside the fieldset whose legend starts with `legend` (the contract editor repeats labels). */
  const fillIn = async (legend, label, value) => {
    const done = await evaluate(`(() => { const set = [...document.querySelectorAll('fieldset')].find((f) => f.querySelector('legend')?.textContent.trim().startsWith(${JSON.stringify(legend)}) && f.getClientRects().length); const l = set && [...set.querySelectorAll('label')].find((n) => n.textContent.trim().startsWith(${JSON.stringify(label)})); const input = l?.control ?? l?.querySelector('input,select,textarea'); if (!input) return false;
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!done) throw new Error(`Missing field ${label} in ${legend}`);
    await pause(150);
  };
  const go = async (path) => { await evaluate(`(history.pushState({}, '', ${JSON.stringify(path)}), dispatchEvent(new PopStateEvent('popstate')), true)`); await pause(600); };
  const shot = async (name) => { const png = await cdp('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, name + '.png'), Buffer.from(png.data, 'base64')); };
  const check = async (description, run) => {
    step += 1; const started = Date.now();
    try { const detail = await run(); results.push({ step, description, passed: true, ms: Date.now() - started, ...(detail ? { detail } : {}) }); console.log(`✔ ${step}. ${description}`); }
    catch (error) { results.push({ step, description, passed: false, ms: Date.now() - started, error: String(error).slice(0, 4000) }); console.log(`✖ ${step}. ${description}\n${String(error).slice(0, 1500)}`); await shot(`failure-${step}`).catch(() => {}); throw error; }
  };
  // Offline as the device experiences it: the Geneus server and sync service are unreachable. The app's own code
  // stays loadable, as an installed app's would (the dev server has no service worker cache).
  const offline = (value) => cdp('Network.setBlockedURLs', { urls: value ? ['*127.0.0.1:18280*', '*127.0.0.1:18290*'] : [] });
  const keypad = async (digits) => { for (const d of digits) await click(d); };

  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Lagos' });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: handoff.web + '/onboarding/join' });

  const people = handoff.people;
  const pinFor = (key) => ({ admin: '246810', desk: '135791', cashier: '112358', officer: '314159', supervisor: '271828', doctor: '161803',maternity:'123789',pharmacy:'987321' }[key]);
  const pinsSet = new Set(process.env.RESUME_PROFILE?['admin','cashier','maternity','pharmacy']:[]);
  const signIn = async (key) => {
    const person = people[key];
    await go('/login');
    await waitFor(`document.body.innerText.includes('Who is signing in?') || document.body.innerText.includes('Enter your PIN')`, 90000, 'sign-in screen');
    // The screen remembers the last person; someone else uses Not you?.
    if (await evaluate(`document.body.innerText.includes('Enter your PIN')`)) {
      if (await evaluate(`document.body.innerText.includes(${JSON.stringify(person.name)})`)) { await keypad(pinFor(key)); await waitFor(`location.pathname !== '/login'`, 60000, 'signed in'); return; }
      await click('Not you?'); await waitText('Who is signing in?');
    }
    await clickContaining(person.name);
    if (!pinsSet.has(key)) {
      // First time on this device: the admin's PIN setup code, then a new PIN.
      await waitText('I have a code from my admin');
      await click('I have a code from my admin');
      await fill('Code from your admin', person.pinCode);
      await click('Continue');
      await waitText('Choose your PIN', 30000);
      await keypad(pinFor(key)); await waitText('Confirm your PIN'); await keypad(pinFor(key));
      pinsSet.add(key);
      // Setting the PIN returns to the sign-in list; the person then signs in with it.
      await waitFor(`location.pathname !== '/onboarding/accept'`, 30000, 'PIN saved');
    }
    if (await evaluate(`location.pathname === '/login'`)) {
      await waitFor(`document.body.innerText.includes('Who is signing in?') || document.body.innerText.includes('Enter your PIN')`, 60000, 'sign-in screen');
      if (!(await evaluate(`document.body.innerText.includes('Enter your PIN')`))) await clickContaining(person.name);
      await waitText('Enter your PIN'); await keypad(pinFor(key));
    }
    await waitFor(`location.pathname !== '/login' && !location.pathname.startsWith('/onboarding')`, 60000, 'signed in');
  };
  const signOut = async () => {
    await press(`document.querySelector('header button[aria-label^="Your profile"]')`);
    await click('Sign out');
    await waitFor(`location.pathname === '/login'`, 30000, 'signed out');
  };
  // Online actions need the server to know who is signed in. Signing in online already proves the PIN to it;
  // the PIN is asked for again only if that has lapsed (for example after the session was ended on the server).
  const gate = `[...document.querySelectorAll('section[aria-label="Confirm it is you"]')].find(n => n.getClientRects().length)`;
  const verifyEmail = async (email) => {
    const key = Object.keys(people).find((k) => people[k].email === email) ?? 'admin';
    await pause(500);
    if (await evaluate(`Boolean(${gate})`)) {
      await press(`${gate}.querySelector('input')`);
      await fill('Your PIN', pinFor(key)); await click('Confirm');
      await waitFor(`!${gate}`, 20000, 'identity confirmed with the server');
    }
  };
  const synced = async () => { await waitFor(`!document.body.innerText.includes('Syncing') || true`, 1000).catch(() => {}); await pause(3000); };

  if(!process.env.RESUME_PROFILE)await check('Enroll this browser as a facility device with a real enrollment code', async () => {
    await waitText('Add this device to your facility', 60000);
    const { code } = await inspect('/enrollment-code', 'POST');
    await fill('Device code', code); await fill('Name for this device', 'Staging browser');
    await click('Add this device').catch(async () => click('Join facility'));
    await waitFor(`document.body.innerText.includes('Who is signing in?') || document.body.innerText.includes('already set up')`, 120000, 'enrolled');
    if (await evaluate(`document.body.innerText.includes('already set up')`)) await click('Sign in');
    await waitText('Who is signing in?', 120000);
    await shot('01-enrolled');
  });

  const selectByText = async (label, optionText) => {
    const done = await evaluate(`(() => { const l = [...${scope}.querySelectorAll('label')].find((n) => n.textContent.trim().startsWith(${JSON.stringify(label)}) && n.getClientRects().length); const s = l?.control ?? l?.querySelector('select'); const o = s && [...s.options].find((x) => x.textContent.trim().startsWith(${JSON.stringify(optionText)})); if (!o) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!done) throw new Error(`Missing option ${optionText} in ${label}`);
    await pause(150);
  };
  const money = (minor) => 'NGN ' + (minor / 100).toLocaleString('en', { minimumFractionDigits: 2 });
  const account = async (patientId) => { await go("/home"); await go(`/billing?tab=collections&patient=${encodeURIComponent(patientId)}`); await waitFor(`Boolean(document.querySelector('dialog[open]'))`, 30000, 'patient account'); };
  const closeDialog = async () => { await press(`[...[...document.querySelectorAll('dialog[open]')].at(-1).querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Close')&&!b.disabled)`); await pause(300); };
  const server = (patientId) => inspect('/positions?patient=' + encodeURIComponent(patientId));
  const waitServer = async (patientId, predicate, label, ms = 60000) => { const until = Date.now() + ms; let last; while (Date.now() < until) { last = await server(patientId); if (predicate(last)) return last; await pause(1000); } throw new Error('Server never reached: ' + label + '\n' + JSON.stringify(last)); };
  const { first, second } = handoff.patients;

  if(!process.env.RESUME_PROFILE){
  await check('Admin sees the blocking older device and retires it through existing device UI',async()=>{
    await signIn('admin');await go('/billing/settings/fees');await waitText('Price Catalogue');await verifyEmail(people.admin.email);await waitText('Catalogue compatibility');await waitText('Lost QA device');await shot('02-device-blocker');
    await click('Manage devices and retire inactive devices');await waitText('Facility devices');await waitText('Lost QA device');
    await press(`[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Lost QA device')).querySelector('button')`);
    await clickLabel('I have checked the impact');await click('Confirm revocation');await waitFor(`!document.querySelector('dialog[open]')`,30000,'retired');
    assert.equal((await inspect('/devices')).find(d=>d.id==='qa:lost-old-device').status,'revoked');
    await inspect('/ready','POST');
    await cdp('Page.reload');await waitText('Facility devices');await go('/billing/settings/fees');await waitText('Expanded catalogue supported',60000);await shot('03-compatible-catalogue');
  });
  await check('Central lab and pharmacy fee creation uses three fields and real server price versions',async()=>{
    for(const [name,category,price]of [['Full Blood Count QA','laboratory','7000'],['Ceftriaxone Injection QA','pharmacy','4500'],['Caesarean Section QA','procedure','150000'],['Ultrasound QA','imaging','15000'],['Registration QA','registration','1000'],['Patient Card QA','card','500'],['Consultation QA','consultation','2000'],['Normal Delivery QA','maternity','50000'],['Ward Accommodation QA','admission','10000'],['General Fee QA','other','1000']]){
      await click('Add item');await fill('Item name',name);await fill('Category',category);await fill('Price',price);
      assert.deepEqual(await evaluate(`[...document.querySelector('dialog[open] form').querySelectorAll('input[required],select[required],textarea[required]')].map(n=>n.name).sort()`),['amount','category','name']);
      await press(`document.querySelector('dialog input[name=name]')`);
      for(const field of ['category','amount']){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement.name'),field);}
      await shot('04-create-'+category);await click('Save item');await waitFor(`!document.querySelector('dialog[open]')`,30000,'central fee saved');await waitText(name);
    }
    const fees=await inspect('/fees');for(const name of ['Full Blood Count QA','Ceftriaxone Injection QA']){const f=fees.find(f=>f.name===name);assert.equal(f.charge_when,'when_ordered');assert.equal(f.department_id,null);}
    const records=await inspect('/records');assert.equal(records.definitions.length,0);assert.equal(records.stocks.length,0);
  });
  await check('Actual PowerSync exposes central items in both modules and supports hospital-wide search',async()=>{
    await go('/laboratory?tab=catalogue');await waitFor(`document.querySelector('h1')?.textContent==='Laboratory'`);await waitText('Search hospital catalogue');await waitText('Full Blood Count QA');await shot('05-lab-central');
    await fill('Catalogue category','');await fill('Search hospital catalogue','Ceftriaxone');await waitText('Ceftriaxone Injection QA');assert.ok(!(await text()).includes('Full Blood Count QA'));await shot('06-global-search');
    await go('/pharmacy?tab=catalogue');await waitText('Ceftriaxone Injection QA');await shot('07-pharmacy-central');
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('08-pharmacy-phone');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await go('/laboratory/settings/tests');await waitText('Full Blood Count QA');assert.ok(!(await text()).includes('Set price'));await shot('09-lab-settings-readonly');
  });
  await check('A maternity clinician discovers all ten categories without acquiring pricing or workflow authority',async()=>{
    await signOut();await signIn('maternity');await go('/laboratory?tab=catalogue');await waitFor(`document.querySelector('h1')?.textContent==='Laboratory'`);await waitText('Search hospital catalogue');await fill('Catalogue category','');
    const expected=[['Caesarean Section QA','procedure'],['Full Blood Count QA','laboratory'],['Ultrasound QA','imaging'],['Ceftriaxone Injection QA','pharmacy'],['Registration QA','registration'],['Patient Card QA','card'],['Consultation QA','consultation'],['Normal Delivery QA','maternity'],['Ward Accommodation QA','admission'],['General Fee QA','other']];
    for(const [name,category]of expected){await fill('Search hospital catalogue',name);await waitFor(`document.querySelector('section[aria-label="Hospital price catalogue"] li')?.textContent.includes(${JSON.stringify(name)})`);assert.equal(await evaluate(`document.querySelector('section[aria-label="Hospital price catalogue"] select').value`),'');await shot('14-clinician-'+category);}
    assert.ok(!(await text()).includes('Manage prices in Billing'));
    await fill('Search hospital catalogue','');await shot('15-clinician-all-categories');
    await signOut();await signIn('admin');
  });
  await check('Expired verified session preserves a price edit and cannot be bypassed by category editing',async()=>{
    await go('/billing/settings/fees');await waitText('Full Blood Count QA');await click('Full Blood Count QA');await fill('Price','8000');assert.equal(await evaluate(`document.querySelector('dialog select[name=category]').disabled`),true);
    await inspect('/expire-sessions','POST');await click('Save item');await waitText('Confirm it is you');assert.equal(await evaluate(`document.querySelector('dialog input[name=amount]').value`),'8000');await shot('10-session-required');
    await fill('Your PIN',pinFor('admin'));await click('Confirm');await waitFor(`!${gate}`,20000,'proven actor');await click('Save item');await waitFor(`!document.querySelector('dialog[open]')`,30000,'saved');
  });
  await check('Authorized offline quantity billing and cashier cash collection preserve permissions and sync once',async()=>{
    await signOut();await signIn('cashier');await go('/billing/settings/fees');await waitText('Price Catalogue');assert.ok(!(await text()).includes('Add item'));
    await account(first);assert.ok(!(await evaluate(`document.querySelector('dialog[open]').innerText`)).includes('Add to bill'),'cashier does not gain charging permission');await closeDialog();await signOut();await signIn('admin');
    await account(first);await waitText('Search hospital catalogue');await fill('Search hospital catalogue','Ceftriaxone');await waitText('Ceftriaxone Injection QA');await click('Select item');await fill('Quantity','3');await fill('Quantity unit (optional)','vials');
    await inspect('/expire-sessions','POST');await offline(true);await click('Add to bill');await waitText('Amount due');await shot('11-offline-quantity-bill');
    await closeDialog();await signOut();await signIn('cashier');await account(first);await waitText('Amount due');
    await click('Full amount');await click('Review payment');await shot('12-offline-cash-review');await click('Confirm & record cash');await waitText('Payment receipt');await shot('13-offline-receipt');
    assert.equal((await inspect('/payments')).filter(p=>p.patient_id===first).length,0,'blocked device has not uploaded cash');
    await offline(false);await waitServer(first,p=>p.length===1&&p[0].balanceMinor===0,'queued quantity and cash accepted');
    const records=await inspect('/records'),charge=records.charges.find(c=>c.quantity===3||c.quantity==='3');assert.equal(Number(charge.unit_price_minor),450000);assert.equal(Number(charge.list_price_minor),1350000);assert.ok(charge.fee_price_version);
    await pause(3000);assert.equal((await inspect('/payments')).filter(p=>p.patient_id===first).length,1);
  });
  await check('Unresolved Laboratory and prepaid partial-supply reviews remain visible to a financial reviewer without clinical signing',async()=>{
    await closeDialog();const seeded=await inspect('/acceptance-review','POST');assert.equal(seeded.ok,true,JSON.stringify(seeded));
    await go('/billing?tab=review');await waitText('Unresolved billing review');await waitText('Existing manual Laboratory bill requires financial review');await waitText('Existing three-unit manual bill requires source-association review');await waitText('Pemi Pharmacy');
    await waitFor(`document.querySelector('section[aria-label="Unresolved billing review"]').innerText.includes('acceptance:supply-two') && document.querySelector('section[aria-label="Unresolved billing review"]').innerText.includes('acceptance:supply-one')`);
    assert.ok(!(await text()).includes('Open clinical source'));assert.ok(!(await text()).includes('Confirm & lock'));
    const before=await inspect('/acceptance-state');assert.equal(before.charges.length,2);assert.equal(before.payments.length,1);assert.equal(before.sources.length,3);
    await shot('16-financial-review-desktop');
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('17-financial-review-phone');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await click('Review patient bill');await waitText('Amount due');await shot('18-review-existing-payment');await closeDialog();
    await cdp('Page.reload');await waitText('Unresolved billing review');await waitText('acceptance:supply-two');
    assert.deepEqual(await inspect('/acceptance-state'),before,'read-only review cannot mutate clinical sources, money or pending status');
    await signOut();await signIn('pharmacy');await go('/pharmacy?tab=pricing');await waitText('Billing review');await waitText('Billing review · 2');await click('View');await waitText('Supply medicines');
    await press(`document.querySelector('details summary')`);await waitText('Choose Billing item for this supply');await waitText('Supplied 2 vials');await waitText('Supplied 1 vials');await shot('19-pharmacy-review-actions');
    assert.deepEqual(await inspect('/acceptance-state'),before);
  });


  }else{step=(Number(process.env.RESUME_FROM)||9)-1;await go("/home");await waitFor("Boolean([...document.querySelectorAll(\"header button\")].find(b=>b.getAttribute(\"aria-label\")?.startsWith(\"Your profile\"))) || document.body.innerText.includes(\"Who is signing in?\") || document.body.innerText.includes(\"Enter your PIN\")",60000,"restored workspace");await pause(1000);if(await evaluate("Boolean([...document.querySelectorAll(\"header button\")].find(b=>b.getAttribute(\"aria-label\")?.startsWith(\"Your profile\")))"))await signOut();await signIn("cashier");}
  const associationRoot=(item)=>`[...document.querySelectorAll('section[aria-label="Unresolved billing review"] p')].find(p=>p.textContent.includes('Item: '+${JSON.stringify(item)}))?.parentElement`;
  const associationField=async(item,selector,value)=>{
    const done=await evaluate(`(()=>{const input=(${associationRoot(item)})?.querySelector(${JSON.stringify(selector)});if(!input)return false;const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);assert.ok(done,'Association field '+item);await pause(200);
  };
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=9)await check('Offline financial review associates prepaid 2+1 supplies without clinical signing, extra charges or payments',async()=>{
    await signOut();await signIn('cashier');await go('/billing?tab=review');await waitText('Unresolved billing review');await pause(1000);
    const baseline=await inspect('/acceptance-state'),initial=await inspect('/integrated-state');await offline(true);
    for(const item of ['acceptance:supply-two','acceptance:supply-one']){
      if(initial.allocations.some(a=>a.source_entry_id===item&&a.action==='allocate'))continue;
      await waitFor('Boolean(('+associationRoot(item)+')?.querySelector("select"))',30000,'association form ready');
      await associationField(item,'select','acceptance:manual-three');await associationField(item,'input:not([type=number])','Reviewed exact three-unit prepaid charge and this supply');
      await press(`[...(${associationRoot(item)}).querySelectorAll('button')].find(b=>b.textContent.includes('Request charge association'))`);
    }
    await waitText('Association awaiting server confirmation');assert.equal((await inspect('/integrated-state')).allocations.length,initial.allocations.length);await shot('20-offline-association-pending');
    await offline(false);for(let i=0;i<100;i++){if((await inspect('/integrated-state')).allocations.length===2)break;await pause(500);}
    const state=await inspect('/integrated-state');assert.equal(state.allocations.length,2);assert.equal(state.allocations.reduce((n,a)=>n+Number(a.quantity),0),3);assert.ok(state.allocations.every(a=>a.accepted_on));assert.deepEqual(await inspect('/acceptance-state'),baseline);
    await shot('21-prepaid-association-confirmed');
  });
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=10)await check('Laboratory financial association resolves the bill without performing clinical completion',async()=>{
    await go('/billing?tab=review');await waitText('acceptance:lab-item');await associationField('acceptance:lab-item','select','acceptance:manual-lab');await associationField('acceptance:lab-item','input:not([type=number])','Reviewed the exact manually billed investigation');await press(`[...(${associationRoot('acceptance:lab-item')}).querySelectorAll('button')].find(b=>b.textContent.includes('Request charge association'))`);
    for(let i=0;i<100;i++){if((await inspect('/integrated-state')).allocations.length===3)break;await pause(500);}assert.equal((await inspect('/integrated-state')).allocations.length,3);await waitText('No unresolved billing review records');await shot('22-financial-review-resolved');
  });
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=11)await check('A real Pharmacy return remains visible until a supervisor records its exact financial release',async()=>{
    await signOut();await signIn('pharmacy');await go('/pharmacy/request?'+new URLSearchParams({patient:second,visit:'acceptance:pharmacy-visit',prescription:'acceptance:prescription'}));await waitText('Supply medicines');await press('document.querySelector("details summary")');await waitText('Supplied 2 vials');
    assert.ok(!(await text()).includes('Choose Billing item for this supply'),'accepted source associations prevent duplicate price follow-up');
    await press(`[...document.querySelectorAll('li')].find(n=>n.textContent.includes('Supplied 2 vials')).querySelector('button')`);await waitText('Record a medicine return');await fill('Quantity returned','1');await fill('Is more of this medicine still needed?','false');await fill('Reason','One intact vial returned by the patient');await click('Review & save');await waitText('Review pharmacy record');await click('Confirm & save pharmacy record');await waitFor('!document.querySelector("dialog[open]")');await shot('23-real-clinical-return');
    await signOut();await signIn('admin');await go('/billing?tab=review');await waitText('Returns awaiting financial review');await waitText('returned');await shot('24-return-awaiting-financial-review');await account(second);await waitText('Service associations and returns');
    await press(`[...document.querySelectorAll('section[aria-label="Service association history"] article')].find(n=>n.textContent.includes('acceptance:supply-two')&&n.textContent.includes('allocate 2')).querySelector('button')`);await fill('Actual return (or association correction)',await evaluate("[...document.querySelectorAll('dialog[open] label')].find(l=>l.textContent.includes('Actual return')).control.options[1].value"));await fill('Release reason and evidence','Reviewed the returned vial and original prepaid charge');await clickLabel('Credit returned purchased units');await click('Request financial release');
    for(let i=0;i<100;i++){if((await inspect('/integrated-state')).credits.length)break;await pause(500);}const state=await inspect('/integrated-state');assert.equal(Number(state.credits[0].amount_minor),450000);await waitText('Patient credit');await shot('25-return-credit');
    await click('Refund credit');await fill('Reason','Return the approved prepaid vial credit');await click('Record refund');for(let i=0;i<100;i++){if((await inspect('/refunds')).length)break;await pause(500);}assert.equal(Number((await inspect('/refunds'))[0].amount_minor),450000);await shot('26-selfpay-refund-insurance-off');
  });
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=12)await check('Itemized, category and account statements print and export one reconciled projection on desktop and mobile',async()=>{
    while(await evaluate('Boolean(document.querySelector("dialog[open]"))'))await closeDialog();await signOut();await signIn('cashier');await account(second);await click('Patient bill and statements');await click('Generate current statement');await waitText('Financial breakdown');await waitFor('!document.querySelector("dialog[open] button[aria-busy=true]")&&!document.body.innerText.includes("Saved server-confirmed snapshot")',30000,'fresh statement finished');await shot('27-itemized-statement');
    const money=await evaluate('document.querySelector("[data-statement-mode] dl").innerText');
    await fill('Statement presentation','summary');assert.equal(await evaluate('document.querySelector("[data-statement-mode] dl").innerText'),money);await shot('28-category-summary');
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('29-mobile-statement');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await fill('Statement presentation','account');assert.equal(await evaluate('document.querySelector("[data-statement-mode] dl").innerText'),money);await shot('30-account-statement');await click('Export statement CSV');
    // Print uses the same DOM projection. Replace only the browser's native print dialog for this unattended run.
    await evaluate('window.__statementPrintCalls=0;window.__statementPrintHtml="";window.__originalOpen=window.open;window.open=function(...args){const p=window.__originalOpen.apply(this,args);if(p)p.print=()=>{window.__statementPrintCalls++;window.__statementPrintHtml=p.document.documentElement.outerHTML};return p}');await click('Print statement');assert.equal(await evaluate('window.__statementPrintCalls'),1);await writeFile(join(output,'printed-patient-statement.html'),await evaluate('window.__statementPrintHtml'));await pause(500);assert.ok((await readdir(join(output,'downloads'))).some(f=>f.endsWith('.csv')),'actual CSV file was downloaded');
    await closeDialog();await closeDialog();await offline(true);await account(second);await click('Patient bill and statements');await waitText('Saved server-confirmed snapshot');assert.equal(await evaluate('document.querySelector("[data-statement-mode] dl").innerText'),money);await shot('31-offline-confirmed-statement');await offline(false);await closeDialog();await closeDialog();
  });
  // Deliberately short dummy accepted by the local synthetic upstream; never a real API credential.
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=13)await check('One general receiving account verifies a bank transfer and pays multiple central categories',async()=>{
    await signOut();await signIn('admin');await go('/billing/settings/payments');await waitText('Payment settings');assert.ok(!(await text()).includes('Receiving department'));await fill('Paystack secret key','sk_live_QA');await click('Connect Paystack');await waitText('Provider connected');await fill('Or existing Paystack terminal code','999');await click('Link receiving account');await waitFor('document.body.innerText.includes("General hospital account")||document.body.innerText.includes("This receiving account is already linked")');if(!(await text()).includes('General hospital account'))await click('Use for hospital collections');await waitText('General hospital account');await shot('32-general-payment-account');
    await account(second);if(!(await inspect('/acceptance-state')).charges.some(c=>Number(c.amount_minor)===200000)){await fill('Search hospital catalogue','Consultation QA');await click('Select item');await click('Add to bill');await waitFor('Boolean(document.querySelector("dialog[open] button[aria-label=Close]:not(:disabled)"))',30000,'charge save complete');}await closeDialog();
    await go('/billing?tab=transfers');await fill('Missing transfer? Check its Paystack reference','INTEGRATED-RECEIPT-001');await click('Check with Paystack');await waitText('INTEGRATED-RECEIPT-001');await shot('33-verified-general-receipt');
    await click('Match to patient fees');await fill('Patient name or ID','Bayo');await clickContaining('Bayo Synthetic');await waitText('Refresh verified availability');await click('Refresh verified availability');await pause(1000);await click('Full amount');await click('Review payment');await click('Confirm allocation');await waitText('Payment receipt');await shot('34-general-receipt-collection');
  });
  if(!process.env.RESUME_PROFILE||Number(process.env.RESUME_FROM??9)<=14)await check('Insured return keeps clinical authority separate and reconciles contractual adjustments, patient credit and claim-level payments',async()=>{
    while(await evaluate('Boolean(document.querySelector("dialog[open]"))'))await closeDialog();await signOut();await signIn('admin');
    const fixture=await inspect('/insured-fixture','POST');assert.ok(fixture.patientId,JSON.stringify(fixture));const priorInsurance=await inspect('/insured-statement');if(!priorInsurance.totals.returnAdjustmentMinor){await go('/billing?tab=review');await waitText('insured:supply');}await account(fixture.patientId);await waitText('Service associations and returns');
    if(!priorInsurance.totals.returnAdjustmentMinor){await click('Patient bill and statements');await click('Generate current statement');await waitText('Financial breakdown');await waitFor('!document.querySelector("dialog[open] button[aria-busy=true]")&&!document.body.innerText.includes("Saved server-confirmed snapshot")',30000,'fresh statement finished');await shot('35-insured-original-statement');await closeDialog();
    await press(`[...document.querySelectorAll('section[aria-label="Service association history"] article')].find(n=>n.textContent.includes('insured:supply')&&n.textContent.includes('allocate 3')).querySelector('button')`);
    await fill('Actual return (or association correction)','insured:return:one');await fill('Release reason and evidence','Reviewed the exact returned insured unit using the original confirmed rules');await clickLabel('Recalculate returned units under the confirmed insurance rules');await click('Confirm insurance return');await waitText('Insurance return confirmed. Review the affected claim revision');await shot('36-insured-return-approved');}else{const confirmed=(await inspect('/integrated-state')).allocations.find(a=>a.return_entry_id==='insured:return:one');assert.equal(Number(confirmed?.credit_minor),40000);assert.ok(confirmed?.accepted_on);}
    const state=await inspect('/insured-statement');assert.equal(state.totals.originalMinor,1350000);assert.equal(state.totals.returnAdjustmentMinor,450000);assert.equal(state.totals.contractAdjustmentMinor,100000);assert.equal(state.totals.patientCreditMinor,40000);assert.equal(state.totals.payerReceivedMinor,400000);assert.equal(state.totals.payerOutstandingMinor,320000);assert.equal('payerReceivedMinor' in state.lines[0],false);
    await click('Patient bill and statements');await click('Generate current statement');await waitText('Financial breakdown');await waitFor('!document.querySelector("dialog[open] button[aria-busy=true]")&&!document.body.innerText.includes("Saved server-confirmed snapshot")',30000,'fresh statement finished');await shot('37-insured-return-statement');const totals=await evaluate('document.querySelector("[data-statement-mode] dl").innerText');await fill('Statement presentation','summary');assert.equal(await evaluate('document.querySelector("[data-statement-mode] dl").innerText'),totals);await shot('38-insured-summary');await closeDialog();await closeDialog();
    await go('/billing?tab=reports');await waitText('Hospital financial snapshot');await click('Generate financial snapshot');await waitText('Unallocated insurer receipts');await shot('39-integrated-financial-report');await click('Export financial snapshot CSV');await pause(500);return {insuranceApproval:priorInsurance.totals.returnAdjustmentMinor?'Previously completed through the actual UI in browser-completion; accepted return and credit reverified':'Completed through the actual UI in this run'};
  });
  assert.equal(errors.length,0, errors.join('\n'));
  console.log(JSON.stringify({results,errors},null,2));
} finally {
  await writeFile(join(output,'integrated-billing-results.json'),JSON.stringify({results,errors,timeline},null,2)).catch(()=>{});
  socket?.close(); chrome.kill(); await server.close();
  // Retain only the uniquely named temporary profile until the staging run is reviewed.
}
