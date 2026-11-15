// Real end-to-end care-services run: the actual web app (its own Vite config) against the actual
// geneus-server, PostgreSQL and PowerSync started by geneus-server/scripts/care-services-staging.ts.
// No stand-in routes. Synthetic hospital and patients only.
//   node qa/care-services-staging-browser.mjs <handoff.json> <output-dir>
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const [handoffPath, outputArg] = process.argv.slice(2);
const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
const output = resolve(outputArg ?? 'qa/artifacts/care-services-staging');
await mkdir(output, { recursive: true });
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(handoff.api), 'Run only against the local staging stack');
process.env.VITE_API_URL = handoff.api;
process.env.VITE_SIGNING_PUBLIC_KEY = handoff.signingPublicKey;
const server = await createServer({ root: process.cwd(), mode: 'development', logLevel: 'error', server: { host: '127.0.0.1', port: 5197, strictPort: true } });
await server.listen();
// Never attach to someone else's browser: the debugging port must be free before this run starts its own Chrome.
const portTaken = await fetch('http://127.0.0.1:9348/json/version').then(() => true, () => false);
assert.ok(!portTaken, 'Port 9348 already has a Chrome debugger; close it before running');
const profile = await mkdtemp(join(tmpdir(), 'geneus-care-staging-'));
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  ...(process.env.HEADED ? ['--window-size=1460,1100'] : ['--headless=new']), '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9348', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const errors = [], results = [], timeline = [];
let socket, step = 0;
const inspect = async (path, method = 'GET') => (await fetch(handoff.inspector + path, { method })).json();

try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9348/json/list')).json()).find((t) => t.type === 'page'); } catch {} if (!target) await pause(150); }
  assert.ok(target, 'Chrome did not start');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Network.loadingFailed') timeline.push({ failed: m.params.errorText, blocked: m.params.blockedReason ?? m.params.corsErrorStatus?.corsError });
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) timeline.push({ status: m.params.response.status, url: m.params.response.url });
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') timeline.push({ console: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 1500) });
    if (m.id) { const r = pending.get(m.id); pending.delete(m.id); clearTimeout(r?.timer); if (m.error) r?.reject(new Error(m.error.message)); else r?.resolve(m.result); }
  };
  const cdp = (method, params = {}) => new Promise((ok, fail) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); fail(new Error('Chrome timed out: ' + method)); }, 30000); pending.set(id, { resolve: ok, reject: fail, timer }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const text = () => evaluate('document.body.innerText');
  const scope = `(document.querySelectorAll('dialog[open]').length ? [...document.querySelectorAll('dialog[open]')].at(-1) : document)`;
  const waitFor = async (expression, ms = 60000, label = expression) => { const until = Date.now() + ms; while (Date.now() < until) { if (await evaluate(expression).catch(() => false)) return; await pause(250); } throw new Error('Timed out: ' + label + '\n---\n' + (await text()).slice(0, 2500)); };
  const waitText = (value, ms) => waitFor(`document.body.innerText.includes(${JSON.stringify(value)})`, ms, value);
  const press = async (expression) => {
    for (let i = 0; i < 80 && !(await evaluate(`Boolean(${expression})`).catch(() => false)); i++) await pause(250);
    // A DOM click: React handles it exactly as a tap. Synthetic mouse coordinates did not register in headless Chrome here.
    const clicked = await evaluate(`(() => { const n = ${expression}; if (!n) return false; n.scrollIntoView({ block: 'center' }); n.click(); return true; })()`);
    if (!clicked) throw new Error('Missing control: ' + expression + '\n---\n' + (await text()).slice(0, 2000));
    await pause(200);
  };
  const click = (label, selector = 'button, a, [role=button]') => press(`[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.trim() === ${JSON.stringify(label)} && n.getClientRects().length && !n.disabled)`);
  const clickStarting = (value, selector = 'button, a, [role=button]') => press(`[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.trim().startsWith(${JSON.stringify(value)}) && n.getClientRects().length && !n.disabled)`);
  const clickContaining = (value, selector = 'button, a, [role=button]') => press(`[...${scope}.querySelectorAll(${JSON.stringify(selector)})].find((n) => n.textContent.includes(${JSON.stringify(value)}) && n.getClientRects().length && !n.disabled)`);
  const control = (label) => `(() => { const l = [...${scope}.querySelectorAll('label')].find((n) => n.textContent.trim().startsWith(${JSON.stringify(label)}) && n.getClientRects().length); return l?.control ?? l?.querySelector('input,textarea,select'); })()`;
  const valueOf = (label) => evaluate(`${control(label)}?.value`);
  const optionsOf = (label) => evaluate(`[...(${control(label)}?.options ?? [])].map((o) => o.textContent)`);
  const fill = async (label, value) => {
    const done = await evaluate(`(() => { const input = ${control(label)}; if (!input) return false;
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!done) throw new Error('Missing field: ' + label + '\n---\n' + (await text()).slice(0, 2000));
    await pause(150);
  };
  const selectByText = async (label, optionText) => {
    const done = await evaluate(`(() => { const s = ${control(label)}; const o = s && [...s.options].find((x) => x.textContent.trim() === ${JSON.stringify(optionText)}); if (!o) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    if (!done) throw new Error(`Missing option ${optionText} in ${label}: ${JSON.stringify(await optionsOf(label))}`);
    await pause(200);
  };
  const go = async (path) => { await evaluate(`(history.pushState({}, '', ${JSON.stringify(path)}), dispatchEvent(new PopStateEvent('popstate')), true)`); await pause(700); };
  const shot = async (name) => { const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(join(output, name + '.png'), Buffer.from(png.data, 'base64')); };
  const check = async (description, run) => {
    step += 1; const started = Date.now();
    try { const detail = await run(); results.push({ step, description, passed: true, ms: Date.now() - started, ...(detail ? { detail } : {}) }); console.log(`✔ ${step}. ${description}`); }
    catch (error) { results.push({ step, description, passed: false, ms: Date.now() - started, error: String(error).slice(0, 4000) }); console.log(`✖ ${step}. ${description}\n${String(error).slice(0, 2500)}`); await shot(`failure-${step}`).catch(() => {}); throw error; }
  };
  const keypad = async (digits) => { for (const d of digits) await click(d); };
  const untilServer = async (path, predicate, label, ms = 60000) => { const until = Date.now() + ms; let last; while (Date.now() < until) { last = await inspect(path); if (predicate(last)) return last; await pause(1000); } throw new Error('Server never reached: ' + label + '\n' + JSON.stringify(last).slice(0, 2000)); };
  const gateShown = () => evaluate(`Boolean(document.querySelector('section[aria-label="Confirm it is you"]'))`);

  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Lagos' });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: handoff.web + '/onboarding/join' });

  const people = handoff.people;
  const pinFor = (key) => ({ admin: '246810', desk: '135791', doctor: '161803' }[key]);
  const pinsSet = new Set();
  const signIn = async (key) => {
    const person = people[key];
    await go('/login');
    await waitFor(`document.body.innerText.includes('Who is signing in?') || document.body.innerText.includes('Enter your PIN')`, 90000, 'sign-in screen');
    if (await evaluate(`document.body.innerText.includes('Enter your PIN')`)) {
      if (await evaluate(`document.body.innerText.includes(${JSON.stringify(person.name)})`)) { await keypad(pinFor(key)); await waitFor(`location.pathname !== '/login'`, 60000, 'signed in'); return; }
      await click('Not you?'); await waitText('Who is signing in?');
    }
    await clickContaining(person.name);
    if (!pinsSet.has(key)) {
      await waitText('I have a code from my admin');
      await click('I have a code from my admin');
      await fill('Code from your admin', person.pinCode);
      await click('Continue');
      await waitText('Choose your PIN', 30000);
      await keypad(pinFor(key)); await waitText('Confirm your PIN'); await keypad(pinFor(key));
      pinsSet.add(key);
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
  /** Online settings need the server to know who is signed in; confirm only if that lapsed. */
  const confirmIfAsked = async (key) => {
    await pause(600);
    if (await gateShown()) {
      await fill('Your PIN', pinFor(key)); await click('Confirm');
      await waitFor(`!document.querySelector('section[aria-label="Confirm it is you"]')`, 20000, 'identity confirmed');
    }
  };
  const offerings = () => inspect('/offerings');
  const offeringId = async (name) => (await offerings()).find((o) => o.name === name)?.id;

  await check('Enroll this browser as a facility device with a real enrollment code', async () => {
    await waitText('Add this device to your facility', 60000);
    const { code } = await inspect('/enrollment-code', 'POST');
    await fill('Device code', code); await fill('Name for this device', 'Care services staging browser');
    console.log('join buttons', await evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Join facility').map((b) => ({ disabled: b.disabled, rects: b.getClientRects().length })))`));
    await evaluate(`([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Join facility' && !b.disabled)?.click(), true)`);
    await waitText('Who is signing in?', 120000).catch(async (e) => { console.log(JSON.stringify(timeline.slice(-15))); throw e; });
  });

  await check('Step 1 is filled from registration, with Nigeria, naira and Africa/Lagos, and the administrator saves the details on the server', async () => {
    await signIn('admin');
    await go('/setup?step=facility');
    await waitFor(`Boolean(${control('Facility name')})`, 60000, 'facility form');
    const facility = await inspect('/facility');
    assert.equal(await valueOf('Facility name'), facility.name);
    assert.equal(await valueOf('State'), facility.state);
    assert.equal(await valueOf('LGA'), facility.lga);
    assert.equal(await valueOf('Country'), 'NG'); assert.equal(await valueOf('Currency'), 'NGN'); assert.equal(await valueOf('Time zone'), 'Africa/Lagos');
    assert.ok((await text()).includes(facility.code) && !(await evaluate(`Boolean(${control('Facility code')}?.tagName === 'INPUT')`)), 'the code is shown, not editable');
    assert.equal(facility.time_zone, null, 'nothing was set before the administrator confirmed it');
    await fill('Address (optional)', '12 Sample Road, Ikeja'); await fill('Phone (optional)', '+234 800 000 0000');
    await confirmIfAsked('admin');
    await shot('01-facility-details');
    await click('Save facility details');
    await waitText('Facility details saved', 30000);
    const saved = await untilServer('/facility', (f) => f.address === '12 Sample Road, Ikeja' && f.time_zone === 'Africa/Lagos', 'facility saved');
    assert.equal(saved.country, 'NG'); assert.equal(saved.currency, 'NGN'); assert.equal(saved.phone, '+234 800 000 0000'); assert.equal(saved.code, facility.code);
    await waitFor(`[...document.querySelectorAll('nav[aria-label="Setup steps"] li')][0]?.textContent.includes('Done')`, 60000, 'step 1 done after sync');
    return { saved };
  });

  await check('An ordinary page reload keeps the verified session: no PIN prompt in Settings or the wizard', async () => {
    await cdp('Page.reload'); await pause(2500);
    await waitFor(`Boolean(document.querySelector('h1'))`, 60000, 'app after reload');
    if (await evaluate(`location.pathname === '/login'`)) await signIn('admin');
    await go('/setup?step=services'); await waitText('Add care services', 60000); await pause(1200);
    assert.equal(await gateShown(), false, 'wizard asks for no PIN after reload');
    await go('/settings/billing/fees'); await pause(2000);
    assert.equal(await gateShown(), false, 'Settings asks for no PIN after reload');
    const sessions = await inspect('/sessions');
    assert.ok(sessions.some((s) => s.staff_id === people.admin.id && s.current && !s.ended), 'the server session is still the open one');
    return { sessions: sessions.length };
  });

  await check('Step 4 lists care services only: the lab catalogue’s tests are neither shown nor counted', async () => {
    await go('/setup?step=services'); await waitText('Add care services', 60000);
    const body = await text();
    for (const test of ['Haemoglobin', 'Full blood count', 'Hepatitis C antibody']) assert.ok(!body.includes(test), `${test} is not a care service`);
    assert.ok(body.includes('No care services yet') && !body.includes('Server accepted'), 'no care services yet, and no technical status');
    await shot('02-care-services-empty');
  });

  const addPreset = async (name, expectTeam, expectPlace) => {
    await clickStarting(name);
    await waitFor(`Boolean(document.querySelector('dialog[open]'))`, 10000, 'add sheet');
    if (expectTeam) assert.equal(await evaluate(`${control('Responsible team')}?.selectedOptions[0]?.textContent`), expectTeam);
    if (expectPlace) assert.equal(await evaluate(`${control('Where it happens')}?.selectedOptions[0]?.textContent`), expectPlace);
    await confirmIfAsked('admin');
    await click('Add care service');
    await waitFor(`!document.querySelector('dialog[open]')`, 60000, `${name} saved`);
  };
  await check('The administrator adds outpatient, antenatal and inpatient care with sensible team and place defaults', async () => {
    await addPreset('General outpatient consultation', 'Outpatients', 'Consulting room 1 · Room');
    await addPreset('Antenatal care');
    await addPreset('Inpatient care', undefined, 'Female ward · Ward');
    const rows = await untilServer('/offerings', (o) => ['General outpatient consultation', 'Antenatal care', 'Inpatient care'].every((n) => o.some((x) => x.name === n)), 'three care services');
    const by = (n) => rows.find((x) => x.name === n);
    assert.deepEqual(by('General outpatient consultation').visit_types, ['general', 'follow_up']);
    assert.deepEqual(by('Antenatal care').visit_types, ['antenatal']);
    assert.deepEqual(by('Inpatient care').visit_types, []);
    assert.deepEqual(by('Inpatient care').location_ids, ['location:fw']);
    assert.equal(rows.filter((x) => x.lab_test).length, 3, 'lab tests untouched');
    await waitText('3 active care services', 60000);
    const step4 = await evaluate(`[...document.querySelectorAll('nav[aria-label="Setup steps"] li')][3]?.textContent`);
    assert.ok(step4.includes('Done'), step4);
    await waitFor(`[...document.querySelectorAll('section[aria-labelledby=care-services-list] li')].length === 3`, 30000, 'three rows listed');
    await shot('03-care-services-added');
    return { offerings: rows.map((x) => `${x.name}: ${JSON.stringify(x.visit_types)}`) };
  });

  let kemi;
  await check('Registration offers the hospital’s walk-in care services; an antenatal registration keeps the service and its fee exemption', async () => {
    await signOut(); await signIn('desk');
    await go('/patients/new'); await waitFor(`Boolean(${control('Full name')})`, 60000, 'registration');
    await fill('Full name', 'Kemi Synthetic');
    await press(`[...document.querySelectorAll('[role=radio]')].find((n) => n.textContent.trim() === 'F')`);
    await fill('Age', '29'); await fill('Address', 'Synthetic road');
    await waitFor(`Boolean(${control('Care service')})`, 30000, 'care service picker');
    const options = await optionsOf('Care service');
    assert.deepEqual(options, ['General outpatient consultation', 'Antenatal care', 'Emergency'], 'walk-in visit services, plus emergency care; no lab tests or inpatient care');
    await selectByText('Care service', 'Antenatal care');
    await shot('04-registration-care-service');
    await press(`[...document.querySelectorAll('button[type=submit]')].find((b) => /^Register( |$)/.test(b.textContent.trim()) && !b.disabled)`);
    await pause(1500);
    if ((await text()).includes('Possible existing record') || (await text()).includes('Is this the same person')) await clickContaining('new patient');
    const anc = await offeringId('Antenatal care');
    const appointments = await untilServer('/appointments', (a) => a.some((x) => x.offering_id === anc), 'antenatal booking synced');
    kemi = appointments.find((x) => x.offering_id === anc);
    assert.equal(kemi.visit_type, 'antenatal');
    const charges = await untilServer('/charges', (c) => c.some((x) => x.patient_id === kemi.patient_id && x.fee_item_id === 'fee:consultation'), 'consultation fee');
    const fee = charges.find((x) => x.patient_id === kemi.patient_id && x.fee_item_id === 'fee:consultation');
    assert.equal(Number(fee.amount_minor), 0); assert.equal(fee.exemption_reason, 'Antenatal policy');
    return { appointment: kemi, fee };
  });

  let review;
  await check('Booking ahead offers only bookable care services and the visit kinds each records', async () => {
    await go(`/patients/profile?patient=${encodeURIComponent(handoff.patientId)}`); await waitText('Amaka Synthetic', 60000);
    await clickStarting('Book appointment');
    await waitFor(`Boolean(document.querySelector('dialog[open]'))`, 10000, 'booking sheet');
    await click('Pick date & time'); await clickStarting('Tomorrow');
    await press(`[...document.querySelectorAll('dialog[open] button')].find((b) => /^1[0-1]:00/.test(b.textContent.trim()))`);
    await waitFor(`Boolean(${control('Care service')})`, 30000, 'care service picker');
    assert.deepEqual(await optionsOf('Care service'), ['General outpatient consultation', 'Antenatal care', 'Emergency']);
    await selectByText('Care service', 'General outpatient consultation');
    assert.deepEqual(await optionsOf('Kind of visit'), ['General', 'Follow-up']);
    await selectByText('Kind of visit', 'Follow-up');
    assert.deepEqual(await optionsOf('Reserve staff and places'), ['No resource reservation', 'Reserve for General outpatient consultation'], 'resources are reserved only for the booked service');
    await shot('05-booking-care-service');
    await click('Save appointment');
    const opd = await offeringId('General outpatient consultation');
    review = (await untilServer('/appointments', (a) => a.some((x) => x.patient_id === handoff.patientId && x.offering_id === opd), 'follow-up booking synced')).find((x) => x.patient_id === handoff.patientId);
    assert.equal(review.visit_type, 'follow_up');
    return { appointment: review };
  });

  await check('The appointments worklist names the care service booked', async () => {
    await go('/appointments'); await pause(1500);
    await clickContaining('Upcoming').catch(() => {});
    await waitText('General outpatient consultation', 30000);
    await shot('06-worklist-care-service');
  });

  await check('At the visit, the booked care service is carried onto the encounter the server keeps', async () => {
    await signOut(); await signIn('doctor');
    await go(`/encounters/record?patient=${encodeURIComponent(kemi.patient_id)}&appointment=${encodeURIComponent(kemi.id)}`);
    await waitFor(`Boolean(${control('Visit for')})`, 60000, 'visit screen');
    assert.equal(await evaluate(`${control('Visit for')}?.selectedOptions[0]?.textContent`), 'Antenatal care');
    await shot('07-visit-care-service');
    const fields = await evaluate(`[...document.querySelectorAll('label')].filter((l) => l.getClientRects().length).map((l) => l.textContent.trim()).slice(0, 60)`);
    const pulse = fields.find((f) => /pulse/i.test(f)); assert.ok(pulse, 'a vitals field: ' + fields.join(' | '));
    await fill(pulse, '84');
    if (fields.some((f) => f.startsWith('Reason for seeing'))) await fill('Reason for seeing', 'Synthetic: collect later');
    await clickStarting('Review & sign vitals');
    await waitFor(`Boolean(document.querySelector('dialog[open]'))`, 15000, 'review before signing');
    await shot('07b-sign-review');
    await press(`[...document.querySelectorAll('dialog[open] button')].find((b) => /^(Sign|Confirm)/.test(b.textContent.trim()) && !b.disabled)`);
    const anc = await offeringId('Antenatal care');
    const encounters = await untilServer('/encounters', (e) => e.some((x) => x.appointment_id === kemi.id), 'visit synced', 90000);
    const visit = encounters.find((x) => x.appointment_id === kemi.id);
    assert.equal(visit.offering_id, anc); assert.equal(visit.visit_type, 'antenatal');
    return { visit };
  });

  await check('The monthly report counts visits by care service', async () => {
    await go('/reports/month'); await waitText('Visits by care service', 60000);
    await shot('08-report-care-services');
    assert.ok((await text()).includes('Antenatal care'));
  });

  await check('Signing out ends the verified session on the server', async () => {
    await signOut();
    const sessions = await untilServer('/sessions', (s) => s.filter((x) => x.staff_id === people.doctor.id).every((x) => x.ended || !x.current), 'doctor session ended', 30000);
    return { sessions: sessions.length };
  });

  console.log(JSON.stringify({ results, errors, timeline: timeline.slice(-20) }, null, 2));
} finally {
  await writeFile(join(output, 'staging-results.json'), JSON.stringify({ results, errors, timeline }, null, 2)).catch(() => {});
  socket?.close(); chrome.kill(); await server.close();
  await pause(300); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
