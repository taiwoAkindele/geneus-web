// Real end-to-end insurance run: the actual web app (its own Vite config) against the actual
// geneus-server, PostgreSQL and PowerSync started by geneus-server/scripts/insurance-staging.ts.
// No stand-in routes. Synthetic hospital and patients only.
//   node qa/insurance-staging-browser.mjs <handoff.json> <output-dir>
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
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
const server = await createServer({ root: process.cwd(), mode: 'development', logLevel: 'error', server: { host: '127.0.0.1', port: 5199, strictPort: true } });
await server.listen();
const profile = await mkdtemp(join(tmpdir(), 'geneus-staging-'));
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9337', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const errors = [], results = [], timeline = [];
let socket, step = 0;
const inspect = async (path, method = 'GET') => (await fetch(handoff.inspector + path, { method })).json();

try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9337/json/list')).json()).find((t) => t.type === 'page'); } catch {} if (!target) await pause(150); }
  assert.ok(target, 'Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') timeline.push({ console: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300) });
    if (m.id) { const r = pending.get(m.id); pending.delete(m.id); clearTimeout(r?.timer); if (m.error) r?.reject(new Error(m.error.message)); else r?.resolve(m.result); }
  };
  const cdp = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); fail(new Error('Chrome timed out: ' + method)); }, 30000); pending.set(id, { resolve: ok, reject: fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
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
  const offline = (value) => cdp('Network.setBlockedURLs', { urls: value ? ['*127.0.0.1:18080*', '*127.0.0.1:18090*'] : [] });
  const keypad = async (digits) => { for (const d of digits) await click(d); };

  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Lagos' });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: handoff.web + '/onboarding/join' });

  const people = handoff.people;
  const pinFor = (key) => ({ admin: '246810', desk: '135791', cashier: '112358', officer: '314159', supervisor: '271828' }[key]);
  const pinsSet = new Set();
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
  const verifyEmail = async (email) => {
    await click('Email me a verification code');
    let code;
    for (let i = 0; i < 40 && !code; i++) { const m = await inspect('/mail?to=' + encodeURIComponent(email)); code = m?.text?.match(/(\d{6})/)?.[1]; if (!code) await pause(250); }
    assert.ok(code, 'No verification email arrived');
    await fill('Six-digit code', code); await click('Verify');
    await waitText('Verified until', 20000);
  };
  const synced = async () => { await waitFor(`!document.body.innerText.includes('Syncing') || true`, 1000).catch(() => {}); await pause(3000); };

  await check('Enroll this browser as a facility device with a real enrollment code', async () => {
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
  const closeDialog = async () => { await press(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.getAttribute('aria-label')?.startsWith('Close'))`).catch(() => {}); await pause(300); };
  const server = (patientId) => inspect('/positions?patient=' + encodeURIComponent(patientId));
  const waitServer = async (patientId, predicate, label, ms = 60000) => { const until = Date.now() + ms; let last; while (Date.now() < until) { last = await server(patientId); if (predicate(last)) return last; await pause(1000); } throw new Error('Server never reached: ' + label + '\n' + JSON.stringify(last)); };
  const { first, second } = handoff.patients;

  await check('Officer signs in with an admin PIN code and sets a PIN', async () => { await signIn('officer'); await shot('02-officer-home'); });

  await check('Officer verifies by email, adds a payer and saves a contract draft (prices stay on the server)', async () => {
    await go('/insurance/contracts'); await waitText('Payers & contracts');
    await verifyEmail(people.officer.email);
    await waitText('Add payer', 30000); await click('Add payer'); await fill('Payer name', 'Synthetic Staging HMO'); await fill('Short code', 'SSH'); await click('Save payer');
    // The payer list is the synced copy: the new payer appears once PowerSync delivers it.
    const savedAt = Date.now();
    await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Contracts')`, 90000, 'payer synced down');
    timeline.push({ payerSyncDownMs: Date.now() - savedAt });
    await click('Contracts'); await waitText('First contract version', 30000);
    await fill('Starts on', '2026-01-01');
    await selectByText('May a member choose', 'Allowed');
    await fillIn('How each kind', 'Consultation', 'per_service'); await fillIn('How each kind', 'Laboratory', 'per_service');
    await fill('General consultation: contract price per unit', '1500'); await fill('Malaria RDT: contract price per unit', '1000');
    await fill('Plan code', 'GOLD'); await fill('Plan name', 'Staging Gold');
    for (const category of ['Consultation', 'Laboratory']) { await fillIn(category, 'Cover', 'covered'); await fillIn(category, 'Co-pay', 'percent'); await fillIn(category, 'Percent', '10'); }
    await click('Save draft'); await waitText('Draft version 1 saved', 30000);
    await shot('03-contract-draft');
    return { draftSavedOnServer: true };
  });

  await check('Administrator activates version 1 after device readiness, acknowledging unsupported terms', async () => {
    await signOut(); await signIn('admin');
    await inspect('/ready', 'POST');
    await go('/insurance/contracts'); await waitText('Payers & contracts');
    await verifyEmail(people.admin.email);
    await click('Contracts'); await waitText('Activate draft version 1', 30000);
    await waitFor(`document.body.innerText.includes('Every device is ready')`, 90000, 'devices ready');
    await clickLabel('I understand services'); await click('Activate version 1');
    await waitText('Version 1 is active', 30000);
    await shot('04-activated');
    return { devices: await inspect('/devices') };
  });

  await check('Cashier, offline, takes NGN 3,500 cash for patient 1 before any cover is recorded; it uploads on reconnect', async () => {
    await signOut(); await signIn('cashier');
    await offline(true);
    await account(first); await waitText('Amount due');
    await click('Full amount'); await click('Review payment'); await click('Confirm & record cash');
    await waitFor(`!document.body.innerText.includes('Review payment')`, 15000, 'payment recorded offline');
    await shot('05-offline-payment');
    await offline(false);
    const payments = await (async () => { for (let i = 0; i < 60; i++) { const p = await inspect('/payments'); if (p.length) return p; await pause(1000); } return []; })();
    assert.equal(payments.length, 1, 'the offline payment reached the server');
    assert.equal(payments[0].amount_minor, 350_000);
    await closeDialog();
    return { payment: payments[0] };
  });

  await check('Desk records cover and a verified check for both patients (offline-capable writes, synced)', async () => {
    await signOut(); await signIn('desk');
    for (const patient of [first, second]) {
      await go(`/patients/profile?patient=${encodeURIComponent(patient)}&tab=details`); await waitText('Insurance cover', 30000);
      await click('Add cover'); await selectByText('Payer', 'Synthetic Staging HMO'); await fill('Plan code', 'GOLD'); await fill('Enrollee number', 'STG-' + patient.slice(-9, -3)); await click('Save cover');
      await waitText('Never checked', 30000);
      await click('Record check'); await click('Save check'); await waitText('Last check: Verified', 30000);
    }
    await shot('06-desk-cover');
    const p1 = await waitServer(first, (rows) => rows.every((r) => r.state === 'estimated'), 'patient 1 estimated');
    const p2 = await waitServer(second, (rows) => rows.every((r) => r.state === 'estimated'), 'patient 2 estimated');
    return { first: p1.map((r) => [r.chargeId, r.state, r.baseMinor, r.balanceMinor]), second: p2.map((r) => [r.chargeId, r.state, r.baseMinor, r.balanceMinor]) };
  });

  await check('Cashier sees the same figures as the server: co-pay only for patient 2, a credit for patient 1', async () => {
    await signOut(); await signIn('cashier');
    await account(second); await waitText('Insurance estimate', 60000);
    const t2 = await evaluate(`document.querySelector('dialog[open]').innerText`);
    assert.match(t2, /Amount due\s+NGN\s150\.00/, 'patient 2 owes the 10% co-pay of the NGN 1,500 contract price');
    await closeDialog(); await account(first); await waitText('Insurance estimate', 60000);
    const t1 = await evaluate(`document.querySelector('dialog[open]').innerText`);
    assert.match(t1, /Patient credit NGN\s1,850\.00/); assert.match(t1, /Patient credit NGN\s1,400\.00/);
    assert.ok(t1.includes('refunded once insurance for the charge is confirmed'));
    const s1 = await server(first);
    assert.deepEqual(s1.map((r) => r.balanceMinor).sort((a, b) => a - b), [-185_000, -140_000], 'server agrees');
    await shot('07-cashier-credit'); await closeDialog();
    await go('/insurance'); await pause(800);
    const denied = !(await text()).includes('Insurance work') || (await text()).includes('need');
    assert.ok(denied, 'a cashier cannot open the insurance work list');
    return { deviceShows: ['NGN 150.00 due (patient 2)', 'credits 1,850 + 1,400 (patient 1)'], serverBalances: s1.map((r) => [r.chargeId, r.balanceMinor]) };
  });

  await check('Officer confirms: expired session is caught and renewed; routine and exception confirmations reach the device', async () => {
    await signOut(); await signIn('officer');
    await go('/insurance'); await waitText('Insurance work', 30000);
    await verifyEmail(people.officer.email);
    await waitText('Routine visits (1)', 60000); await waitText('Needs review (1)');
    await inspect('/expire-sessions', 'POST');
    await click('Confirm 1 routine visit');
    await waitText('Your verification ended', 20000);
    await verifyEmail(people.officer.email);
    await click('Confirm 1 routine visit'); await waitText('confirmed', 20000);
    await fill('Reason for your decision', 'Staging: paid cash before cover was verified'); await click('Apply cover');
    await waitFor(`/2 charges confirmed/.test(document.body.innerText)`, 20000, 'exception confirmed');
    const p1 = await waitServer(first, (rows) => rows.every((r) => r.state === 'finalised'), 'patient 1 finalised');
    await waitText('collected by Chika Cashier', 60000);
    await shot('08-officer-confirmed');
    return { snapshots: p1.map((r) => r.split) };
  });

  await check('Supervisor refunds the consultation credit; the refund syncs back and every figure agrees', async () => {
    await signOut(); await signIn('supervisor');
    await account(first); await waitText('Refund credit', 60000);
    await click('Refund credit');
    await verifyEmail(people.supervisor.email);
    await fill('Amount refunded', '1850'); await fill('Reason', 'Staging: overpayment returned in cash'); await click('Record refund');
    await waitFor(`/Refunded NGN\\s1,850\\.00/.test(document.body.innerText)`, 60000, 'refund visible on device');
    const s1 = await server(first);
    const consult = s1.find((r) => r.chargeId === 'charge:p1-consult'), lab = s1.find((r) => r.chargeId === 'charge:p1-lab');
    assert.equal(consult.balanceMinor, 0); assert.equal(consult.money.receivedMinor, 200_000); assert.equal(consult.money.refundedMinor, 185_000);
    assert.equal(consult.split.patient_share_minor + consult.split.payer_share_minor + consult.split.contract_adjustment_minor, 200_000);
    const t = await evaluate(`document.querySelector('dialog[open]').innerText`);
    assert.match(t, /Balance NGN\s0\.00/); assert.match(t, /Paid NGN\s2,000\.00/); assert.match(t, /Patient credit NGN\s1,400\.00/);
    await shot('09-refund');
    return { consult: { received: consult.money.receivedMinor, refunded: consult.money.refundedMinor, patientShare: consult.split.patient_share_minor, payerShare: consult.split.payer_share_minor, adjustment: consult.split.contract_adjustment_minor, balance: consult.balanceMinor },
      lab: { balance: lab.balanceMinor }, refunds: await inspect('/refunds') };
  });

  console.log(JSON.stringify({ results, errors, timeline: timeline.slice(-20) }, null, 2));
} finally {
  await writeFile(join(output, 'staging-results.json'), JSON.stringify({ results, errors, timeline }, null, 2)).catch(() => {});
  socket?.close(); chrome.kill(); await server.close();
  await pause(300); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
