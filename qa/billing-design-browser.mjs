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
let socket, step = process.env.RESUME_PROFILE ? 1 : 0;
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
    step += 1; if(process.env.RESUME_FROM&&step<Number(process.env.RESUME_FROM))return; const started = Date.now();
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
  const pinsSet = new Set(process.env.RESUME_PROFILE?(process.env.RESUME_PINS??'admin').split(','):[]);
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

if(process.env.RESUME_PROFILE)await signIn('admin');
  const {first,second}=handoff.patients;
  const close=async()=>{await press(`document.querySelector('dialog[open] button[aria-label=Close]')`);await pause(300);};
  let firstBill,secondBill;
  for(const c of (await inspect('/records')).charges.filter(c=>c.bill_id)){const id=first+'|NGN|bill:'+c.bill_id;if(c.description==='Consultation QA')secondBill=id;else firstBill=id;}
  await check('Existing PIN onboarding and catalogue rollout safeguards remain usable',async()=>{
    await signIn('admin');await go('/billing/settings/fees');await waitText('Advanced catalogue compatibility');await click('Advanced catalogue compatibility','summary');await verifyEmail(people.admin.email);await waitText('Lost QA device');await shot('02-compatibility-blocker');
    await click('Manage devices and retire inactive devices');await waitText('Facility devices');await waitText('Lost QA device');await press(`[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Lost QA device')).querySelector('button')`);await clickLabel('I have checked the impact');await click('Confirm revocation');await waitFor(`!document.querySelector('dialog[open]')`);assert.equal((await inspect('/devices')).find(d=>d.id==='qa:lost-old-device').status,'revoked');await inspect('/ready','POST');await cdp('Page.reload');await waitText('Facility devices');
    await go('/billing/settings/setup');await waitText('Ready to collect, in three steps');await shot('03-setup-prices');
    await click('Advanced catalogue compatibility','summary');await waitText('Expanded catalogue supported');
  });
  const selectFile=async(path)=>{const doc=await cdp('DOM.getDocument'),field=await cdp('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'dialog[open] input[type=file]'});assert.ok(field.nodeId);await cdp('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[path]});};
  await check('CSV preview validates all rows and imports all ten categories through verified atomic configuration',async()=>{
    const file=join(profile,'central-prices.csv');await writeFile(file,'Name,Category,Price,Description\r\nFull Blood Count QA,Laboratory,7000,Central lab price\r\nCeftriaxone Injection QA,Pharmacy,4500,\r\nCaesarean Section QA,Procedure,150000,\r\nUltrasound QA,Imaging,15000,\r\nRegistration QA,Registration,1000,\r\nPatient Card QA,Patient card,500,\r\nConsultation QA,Consultation,2000,\r\nNormal Delivery QA,Maternity,50000,\r\nWard Accommodation QA,Admission / Accommodation,10000,\r\nGeneral Fee QA,General / Other,1000,\r\n');
    await click('Upload prices');await waitText('Choose price file');await selectFile(file);await waitText('10 items · 0 errors');await shot('04-upload-preview');await click('Import 10 prices');await waitText('Prices imported.',45000);await close();await waitText('Full Blood Count QA');const fees=await inspect('/fees');assert.equal(fees.filter(f=>f.name.endsWith(' QA')).length,10);assert.ok(fees.filter(f=>f.name.endsWith(' QA')).every(f=>f.charge_when==='when_ordered'));assert.equal(fees.find(f=>f.name==='Full Blood Count QA').description,'Central lab price');
    await click('Continue to Collections');await waitText('Cash is available offline');await shot('05-setup-collections');await click('Continue to Review');await waitText('Review your billing setup');await shot('06-setup-review');
  });
  await check('Excel upload works and invalid imports remain editable without saving',async()=>{
    const XLSX=await import('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Name','Category','Price'],['Excel Procedure QA','Procedure',3200]]),'Prices');const file=join(profile,'prices.xlsx');await writeFile(file,Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})));
    await go('/billing/settings/fees');await click('Upload prices');await selectFile(file);await waitText('1 items · 0 errors');await verifyEmail(people.admin.email);await click('Import 1 prices');await waitText('Prices imported.',45000);await close();
    const invalid=join(profile,'invalid.csv');await writeFile(invalid,'Name,Category,Price\r\nInvalid QA,Unknown,12\r\n');await click('Upload prices');await selectFile(invalid);await waitText('1 errors');await verifyEmail(people.admin.email);assert.ok(await evaluate(`[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Import 1 prices')).disabled`));await shot('07-upload-error');await close();await clickContaining('Discard');assert.ok(!(await inspect('/fees')).some(f=>f.name==='Invalid QA'));
  });
  await check('Central prices remain discoverable in operational modules without duplicate configuration',async()=>{
    await go('/laboratory?tab=catalogue');await waitText('Search hospital catalogue');await waitText('Full Blood Count QA');await fill('Catalogue category','');await fill('Search hospital catalogue','Caesarean');await waitText('Caesarean Section QA');await shot('08-global-discovery');await go('/pharmacy?tab=catalogue');await waitText('Ceftriaxone Injection QA');
  });
  await check('New multi-item bill captures prices and a separate bill for the same patient stays separate',async()=>{
    if(!firstBill){await go('/billing');await waitText('New bill');await click('New bill');await fill('Find patient','Amaka');await clickContaining('Amaka Synthetic');await fill('Search hospital catalogue','Ceftriaxone');await click('Select item');await fill('Quantity','3');await fill('Search hospital catalogue','Full Blood Count');await click('Select item');await click('Create bill');await waitFor(`Boolean(new URLSearchParams(location.search).get('bill'))`);firstBill=await evaluate(`new URLSearchParams(location.search).get('bill')`);}
    await go('/billing?tab=bills&bill='+encodeURIComponent(firstBill));await waitText('Patient amount due');assert.match(await text(),/20,500\.00/);await shot('09-bill-detail');
    if(!secondBill){await go('/billing');await click('New bill');await fill('Find patient','Amaka');await clickContaining('Amaka Synthetic');await fill('Search hospital catalogue','Consultation QA');await click('Select item');await click('Create bill');await waitFor(`Boolean(new URLSearchParams(location.search).get('bill'))`);secondBill=await evaluate(`new URLSearchParams(location.search).get('bill')`);}
    assert.notEqual(firstBill,secondBill);await go('/billing');await waitFor(`document.querySelectorAll('tbody tr').length===2`);await shot('10-two-bills');const records=await inspect('/records');assert.equal(new Set(records.charges.map(c=>c.bill_id)).size,2);const quantity=records.charges.find(c=>Number(c.quantity)===3);assert.ok(quantity.fee_price_version);assert.equal(Number(quantity.unit_price_minor),450000);assert.equal(Number(quantity.amount_minor),1350000);
  });
  await check('Cashier offline cash collection pays only the selected bill and uploads exactly once',async()=>{
    await signOut();await signIn('cashier');await go('/billing/settings/fees');await waitText('Price Catalogue');assert.ok(!(await text()).includes('Upload prices'));await go('/billing?tab=bills&bill='+encodeURIComponent(firstBill));await waitText('Patient amount due');await click('Record cash payment');await click('Full amount');await click('Review payment');await inspect('/expire-sessions','POST');await offline(true);await click('Confirm & record cash');await waitText('Payment receipt');await shot('11-offline-receipt');assert.equal((await inspect('/payments')).length,0);await close();await offline(false);
    for(let i=0;i<120&&(await inspect('/payments')).length!==1;i++)await pause(500);assert.equal((await inspect('/payments')).length,1);await go('/billing');await waitText('Paid / settled');const body=await text();assert.match(body,/2,000\.00/);await shot('12-cashier-bills');await go('/billing?tab=payments');await waitText('View receipt');await shot('13-cash-payments');await pause(1500);assert.equal((await inspect('/payments')).length,1);
  });
  await check('Expired online financial session retains a price edit until the existing PIN check succeeds',async()=>{
    await signOut();await signIn('admin');await go('/billing/settings/fees');await click('Full Blood Count QA');await fill('Price','8000');assert.equal(await evaluate(`document.querySelector('dialog select[name=category]').disabled`),true);await inspect('/expire-sessions','POST');await click('Save item');await waitText('Confirm it is you');assert.equal(await evaluate(`document.querySelector('dialog input[name=amount]').value`),'8000');await shot('14-session-required');await fill('Your PIN',pinFor('admin'));await click('Confirm');await waitFor(`!${gate}`);await click('Save item');await waitFor(`!document.querySelector('dialog[open]')`);const records=await inspect('/records');assert.equal(Number(records.charges.find(c=>c.description==='Full Blood Count QA').amount_minor),700000);
  });
  await check('A general bank receipt appears once alongside cash and links to the exact second bill',async()=>{
    await go('/billing/settings/payments');await waitText('Payment settings');await fill('Paystack secret key','sk_live_QA');await click('Connect Paystack');await waitText('Provider connected');await fill('Or existing Paystack terminal code','999');await click('Link receiving account');await waitText('General hospital account');
    await go('/billing?tab=transfers');await waitText('Payments');await click('Missing bank payment?','summary');await fill('Paystack payment reference','DESIGN-RECEIPT-001');await click('Check with Paystack');await waitText('DESIGN-RECEIPT-001');await click('Refresh bank availability');await waitText('Needs a bill');await shot('15-unified-payments');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),2);
    await click('Link to bill');await fill('Find bill or patient','Amaka');await clickContaining('Amaka Synthetic');await waitText('Refresh verified availability');await click('Refresh verified availability');await pause(800);await click('Full amount');await click('Review payment');await click('Confirm allocation');await waitText('Payment receipt');await shot('16-bank-receipt');await close();await go('/billing?tab=payments');await click('Refresh bank availability');await waitText('Partly linked');assert.equal(await evaluate(`document.querySelectorAll('tbody tr').length`),2);await shot('17-linked-payments');
    const records=await inspect('/records'),payments=await inspect('/payments');assert.equal(payments.length,2);assert.equal(payments.filter(p=>p.incoming_transfer_id).length,1);assert.equal(Number(payments.find(p=>p.incoming_transfer_id).amount_minor),200000);assert.equal(records.charges.length,3);
  });
  await check('Bill printing uses its own scope; full patient statements remain explicitly separate',async()=>{
    await go('/billing?tab=bills&bill='+encodeURIComponent(firstBill));await waitText('Patient amount due');await evaluate(`window.open=()=>({document:document.implementation.createHTMLDocument('Print'),focus(){},print(){window.__printed=this.document.body.innerText;}})`);await click('Print bill');const printed=await evaluate('window.__printed');assert.ok(printed.includes('Full Blood Count QA'));assert.ok(!printed.includes('Consultation QA'));assert.ok(printed.includes('Insurer payments remain claim-level'));assert.ok((await text()).includes('Full patient statement'));await shot('18-scoped-bill-print');
  });
  await check('Unresolved financial review remains visible without conferring clinical authority',async()=>{
    await inspect('/acceptance-review','POST');await signOut();await signIn('cashier');await go('/billing');await click('Service billing questions');await waitText('Existing manual Laboratory bill requires financial review');await waitText('Existing three-unit manual bill requires source-association review');assert.ok(!(await text()).includes('Open clinical source'));assert.ok(!(await text()).includes('Confirm & lock'));await shot('19-financial-review');
  });
  await check('Desktop and mobile layouts fit the viewport with all payment methods in the same table',async()=>{
    await go('/billing?tab=payments');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(700);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('20-payments-mobile');await go('/billing');await pause(500);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('21-bills-mobile');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  });
  await check('Explicit ID price import updates the central item while historic bill prices and categories stay unchanged',async()=>{
    await signOut();await signIn('admin');await go('/billing/settings/fees');await waitText('Price Catalogue');const fees=await inspect('/fees'),fee=fees.find(f=>f.name==='Full Blood Count QA'),bulk=fees.find(f=>f.name==='Bulk Reimport QA');
    const file=join(profile,'price-update.csv');await writeFile(file,`Name,Category,Price,Description,Item ID,Currency\r\nFull Blood Count QA,Laboratory,9000,Bulk updated,${fee.id},NGN\r\nBulk Reimport QA,Laboratory,3000,,${bulk?.id??''},NGN\r\n`);
    await click('Upload prices');await selectFile(file);await waitText('2 items · 0 errors');await verifyEmail(people.admin.email);await click('Import 2 prices');await waitFor(`document.body.innerText.includes('Prices imported.')||document.body.innerText.includes('Prices will appear on this device after synchronization.')`,45000,'import accepted or awaiting synchronization');await close();await shot('22-updated-catalogue');const after=(await inspect('/fees')).find(f=>f.id===fee.id);assert.equal(Number(after.amount_minor),900000);assert.equal(after.description,'Bulk updated');assert.equal(after.category,'laboratory');assert.equal(after.charge_when,'when_ordered');assert.equal(Number((await inspect('/records')).charges.find(c=>c.description==='Full Blood Count QA').amount_minor),700000);
    await click('Add one item');assert.deepEqual(await evaluate(`[...document.querySelector('dialog[open] form').querySelectorAll('input[required],select[required],textarea[required]')].map(n=>n.name).sort()`),['amount','category','name']);assert.ok(!(await evaluate(`document.querySelector('dialog[open]').innerText`)).includes('Department'));await shot('23-basic-fee-form');await close();
    await go('/billing');await shot('24-final-bills');await go('/billing?tab=payments');await shot('25-final-payments');
  });
  await check('Final phone layout prioritizes bills and keeps extra filters collapsed',async()=>{
    await go('/billing');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(500);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));assert.equal(await evaluate(`document.querySelector('#billing-additional-filters').getClientRects().length`),0);assert.ok(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Open bill'&&b.getClientRects().length)`));await shot('26-final-phone-bills');
    await go('/billing?tab=bills&bill='+encodeURIComponent(firstBill));await waitText('Patient amount due');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('27-final-phone-bill-detail');await go('/billing?tab=payments');await pause(500);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await shot('28-final-phone-payments');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  });
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({results,errors},null,2));

} finally {
  await writeFile(join(output,'billing-design-results.json'),JSON.stringify({results,errors,timeline},null,2)).catch(()=>{});
  socket?.close(); chrome.kill(); await server.close();
  // Retain only the uniquely named temporary profile until the staging run is reviewed.
}
