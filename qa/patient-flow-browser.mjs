// Run from geneus-web: node qa/patient-flow-browser.mjs
// Uses installed Chrome and Node's WebSocket; no browser-testing dependency.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const output = resolve('qa/artifacts');
const previewOrigin = process.env.PATIENT_FLOW_PREVIEW ?? 'http://127.0.0.1:5194';
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
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 5194, strictPort: true },
});
await server?.listen();
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9334', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket;
const errors = [];
const checks = [];
let captureFailure;
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
    const point = await evaluate(`(() => { const node = [...(document.querySelector('dialog[open]') ?? document).querySelectorAll(${JSON.stringify(selector)})].sort((a,b)=>Number(Boolean(b.closest('nav[aria-label="Patient record sections"]')))-Number(Boolean(a.closest('nav[aria-label="Patient record sections"]')))).find(n => n.textContent.trim() === ${JSON.stringify(text)} && n.getClientRects().length); if (!node) throw new Error('Missing control: ' + ${JSON.stringify(text)}); node.scrollIntoView({block:'center'}); const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await pause(120);
  };

  captureFailure = async () => writeFile(join(output,'patient-flow-failure.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
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
  const screenshot=async(name)=>{
    await evaluate('window.scrollTo(0,0)');await pause(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,name+' overflows the viewport');
    await writeFile(join(output,'patient-'+name+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  };
  const go=async(path)=>{await evaluate('window.designAudit.go('+JSON.stringify(path)+')');await pause(350);};
  const chart='/patients/profile?patient=QA-PHC-000001-K2';
  const visibleTables=()=>evaluate('[...document.querySelectorAll("table")].filter(n=>n.getClientRects().length&&!n.closest("details:not([open])")).length');
  const clinicalSave=async(update=false)=>{await click(update?'Review & sign update':'Review & sign entry');await click('Save permanently');await waitFor('!document.querySelector("dialog[open]")');};
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setTimezoneOverride',{timezoneId:'Africa/Lagos'});
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1024,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:previewOrigin+'/qa/patient-flow.html'});
  await waitFor('Boolean(window.designAudit)&&document.body.innerText.includes("Amaka Okoro")');await evaluate('document.fonts.ready');
  await click('Amaka Okoro');await waitFor('document.body.innerText.includes("Medical chart")');
  assert.equal(await evaluate('Boolean(document.querySelector("aside[aria-label=\'Selected patient\']"))'),false);
  assert.equal(await evaluate('document.querySelectorAll("main").length'),1);
  checks.push('Patient search opens a full chart with one main landmark');

  await click('Clinical record');await waitFor('document.body.innerText.includes("Maintain ongoing care.")');
  await fill('Search clinical records','not-a-record');await waitFor('document.body.innerText.includes("No records match this search")');
  await click('Clear search');await waitFor('document.body.innerText.includes("Hypertension")');
  checks.push('Clinical record search distinguishes no matches from an empty chart');
  await click('Review / update');await fill('Condition / problem','Hypertension follow-up');
  await clickLabel('Close');await waitFor('document.body.innerText.includes("Discard unsaved changes?")');
  await click('Keep editing');
  assert.equal(await evaluate('document.querySelector(\'dialog input[name="label"]\').value'),'Hypertension follow-up');
  await clinicalSave(true);
  const clinical=await evaluate('window.designAudit.rows.clinical_events');
  assert.equal(clinical.length,2);assert.equal(clinical[1].previousId,'clinical:problem');assert.equal(JSON.parse(clinical[0].values).label,'Hypertension');
  await click('Overview');await waitFor('document.body.innerText.includes("Hypertension follow-up")');
  checks.push('Clinical review/sign creates a version, retains originals and refreshes the chart');
  checks.push('Dirty clinical editor cannot be silently dismissed');
  await click('Clinical record');await click('Allergies (1)');await click('Review legacy allergy');
  await fill('Reaction','Reported rash');await fill('Severity','mild');await clinicalSave();
  assert.deepEqual(await evaluate('JSON.parse(window.designAudit.rows.patients[0].allergies)'),['Penicillin']);
  await waitFor('document.body.innerText.includes("Reported rash")');
  checks.push('Legacy allergy review preserves its source and updates alert/count');

  await click('Personal details');await click('Edit personal details');await fill('Phone','08000000047');
  await evaluate('window.designAudit.setPatient({address:"Concurrent preserved address"})');await pause(200);
  await click('Save changes');await waitFor('!document.querySelector("dialog[open]")');
  assert.equal(await evaluate('window.designAudit.rows.patients[0].phone'),'08000000047');
  assert.equal(await evaluate('window.designAudit.rows.patients[0].address'),'Concurrent preserved address');
  checks.push('Demographic edits preserve concurrent updates to untouched fields');
  await click('Edit personal details');await fill('Phone','08000000999');
  await evaluate('window.designAudit.setPatient({phone:"08000000888"})');await pause(150);await click('Save changes');
  await waitFor('document.body.innerText.includes("changed while you were editing")');
  assert.equal(await evaluate('window.designAudit.rows.patients[0].phone'),'08000000888');
  await click('Cancel');await click('Discard changes');await waitFor('!document.querySelector("dialog[open]")');
  checks.push('Conflicting demographic edits are refused without overwriting the saved value');

  await click('Appointments');await click('Book appointment');await click('Pick date & time');
  await fill('Date','2026-11-09');await fill('Time','10:00');await fill('Reason','Synthetic booked follow-up');
  await click('Save appointment');await waitFor('!document.querySelector("dialog[open]")');
  await waitFor('document.body.innerText.includes("Synthetic booked follow-up")');
  assert.equal(await evaluate('window.designAudit.rows.appointments.length'),2);
  checks.push('Appointment booking saves through the repository and returns to the patient list');

  await click('Visits');assert.equal(await visibleTables(),1);await click('View visit');
  await waitFor('document.body.innerText.includes("Saved entries · reading view")');
  assert.equal(await evaluate('Boolean(document.querySelector("textarea"))'),false);
  await click('View activity log');await waitFor('document.querySelector("dialog[open]")?.innerText.includes("Visit activity log")');await clickLabel('Close');
  await click('Print visit summary');
  await evaluate('window.auditPrint={};window.open=()=>({document:document.implementation.createHTMLDocument("print"),focus(){},print(){window.auditPrint.text=this.document.body.innerText;}})');
  await click('Print summary');
  assert.equal(await evaluate('window.auditPrint.text.includes("QA-PHC-000001-K2")&&window.auditPrint.text.includes("Routine review")'),true);
  await clickLabel('Close');checks.push('Saved visits have a signed-history reader, activity log and print preview');

  await click('Add amendment');await fill('Signed entry to amend','entry:closed-note');await fill('Amendment / reason','Synthetic additional history clarification');
  await click('Review amendment');await click('Confirm & sign amendment');await waitFor('!document.querySelector("dialog[open]")');
  await waitFor('document.body.innerText.includes("Synthetic additional history clarification")');
  assert.equal(await evaluate('JSON.parse(window.designAudit.rows.encounter_entries.find(e=>e.id==="entry:closed-note").values).note'),'Synthetic follow-up concerns reviewed.');
  checks.push('Entry amendments select a target and retain the original signed note');
  await click('Add amendment');await fill('Signed entry to amend','entry:closed-vitals');await click('Correct recorded values');
  await fill('Temp (°C)','36.7');await fill('Reason for correction','Synthetic transcription correction');
  await click('Review entry');await click('Confirm & save permanently');await waitFor('!document.querySelector("dialog[open]")');
  await waitFor('document.body.innerText.includes("36.7")');
  assert.equal(await evaluate('JSON.parse(window.designAudit.rows.encounter_entries.find(e=>e.id==="entry:closed-vitals").values).temperatureC'),36.8);
  checks.push('Structured corrections update displayed values while preserving signed originals');

  await click('Back to visits');
  const menuLabel=await evaluate('([...document.querySelectorAll("button[aria-haspopup=menu]")].map(n=>n.getAttribute("aria-label")).filter(n=>n.startsWith("Visit actions")).at(-1))');
  await clickLabel(menuLabel);await waitFor('Boolean(document.querySelector("[role=menu]"))');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=menuitem]")].map(n=>n.textContent.trim())'),['Print visit summary','View activity log','Add amendment…']);
  await key('Escape',27);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),menuLabel);
  checks.push('Visit overflow menu has agreed actions and restores focus on Escape');
  await go('/encounters');await click('All visits');assert.equal(await visibleTables(),1);
  await click('Lab (1)');assert.equal(await visibleTables(),1);assert.equal(await evaluate('document.body.innerText.includes("Demo Second Patient")'),true);
  checks.push('Facility visit and station queue views each use one table');

  await go(chart+'&tab=overview');await click('Continue visit');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Chief complaint")');
  assert.equal(await evaluate('document.querySelector("textarea").getBoundingClientRect().top<innerHeight'),true);
  await fill("Patient's complaints",'Synthetic fever and sore throat');await fill('Clinical note','Synthetic consultation findings recorded for acceptance.');
  await click('Review & sign complaint');await click('Confirm & lock');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Lab investigations ordered")');
  await click('Skip for now');await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Diagnosis")');
  await waitFor('window.designAudit.rows.encounter_drafts.some(row=>row.step==="_navigation"&&JSON.parse(row.data).skipped.includes("lab_results"))');
  await click('Back to patient record');await click('Continue visit');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Diagnosis")');
  checks.push('Skipped lab tasks persist in the clinician’s private device draft when reopening the visit');
  await fill('Diagnosis','Synthetic acute diagnosis');await click('Review & sign diagnosis');await click('Confirm & lock');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Follow-up")');
  await click('Review & complete visit');await click('Confirm & complete visit');await waitFor('document.body.innerText.includes("Saved entries · reading view")');
  checks.push('Consultation signs and advances, no-test path skips lab tasks and closure opens the saved reader');

  await click('Back to visits');await click('Start visit');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Vitals")');
  await click('Skip for now');await fill("Patient's complaints",'Synthetic new-visit concern');
  await click('Review & sign complaint');await click('Confirm & lock');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Lab investigations ordered")');
  await waitFor('window.designAudit.rows.encounter_drafts.some(row=>row.step==="_navigation"&&row.encounterKey!=="new"&&JSON.parse(row.data).skipped.includes("vitals"))');
  await click('Back to patient record');await click('Continue visit');
  await waitFor('document.querySelector("h2[tabindex]")?.textContent.includes("Lab investigations ordered")');
  checks.push('The first signature carries private skipped-task state from a new visit to its saved visit ID');


  await go(chart+'&tab=visits');
  await evaluate('window.designAudit.seedHistory(30)');
  await waitFor('document.body.innerText.includes("33 of 33 visits")');
  const dateSort=await evaluate('[...document.querySelectorAll("thead button")].find(n=>n.textContent.trim().startsWith("Visit date")).textContent.trim()');
  await click(dateSort);await click('Next');await click('View visit');await click('Back to visits');
  assert.equal(await evaluate('new URLSearchParams(window.designAudit.search).get("visitPage")'),'1');
  assert.equal(await evaluate('new URLSearchParams(window.designAudit.search).get("visitSort")'),'visit');
  assert.equal(await evaluate('document.body.innerText.includes("26–33 of 33")'),true);
  checks.push('Visit pagination and sorting survive opening a record and returning');
  const visitsBeforeUnavailable = await evaluate('window.designAudit.rows.encounters.length');
  await go(chart+'&tab=visits&visit=encounter:unavailable');
  await waitFor('document.body.innerText.includes("not available in this patient")');
  await go('/encounters/record?patient=QA-PHC-000001-K2&visit=encounter:unavailable');
  await waitFor('document.body.innerText.includes("not available for this patient")');
  assert.equal(await evaluate('Boolean(document.querySelector("textarea"))'),false);
  assert.equal(await evaluate('window.designAudit.rows.encounters.length'),visitsBeforeUnavailable);
  checks.push('Unavailable visit links do not open a new clinical form or create an episode');

  for(const width of [1487,390,320]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===1487?1058:844,deviceScaleFactor:1,mobile:width!==1487});
    await cdp('Page.navigate',{url:previewOrigin+'/qa/patient-flow.html'});
    await waitFor('Boolean(window.designAudit)&&document.body.innerText.includes("Amaka Okoro")');
    await go(chart);await waitFor('document.body.innerText.includes("Medical chart")');await screenshot('overview-'+width);
    await click('Visits');assert.equal(await visibleTables(),1);await screenshot('visits-'+width);
    const label=await evaluate('([...document.querySelectorAll("button[aria-haspopup=menu]")].map(n=>n.getAttribute("aria-label")).filter(n=>n.startsWith("Visit actions")).at(-1))');
    await clickLabel(label);await waitFor('Boolean(document.querySelector("[role=menu]"))');
    await writeFile(join(output,'patient-menu-'+width+'.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));await key('Escape',27);
    await click('View visit');await screenshot('saved-visit-'+width);await click('Back to visits');
    await click('Clinical record');await click('Review / update');await screenshot('clinical-editor-'+width);await clickLabel('Close');
    await click('Appointments');await click('Book appointment');await click('Pick date & time');
    await fill('Date','2026-11-09');await fill('Time','10:00');await fill('Visit type','follow_up');await fill('Reason','Follow-up review');
    await screenshot('booking-'+width);await clickLabel('Close');await click('Discard changes');
    await click('Personal details');await click('Edit personal details');
    await evaluate('document.querySelector("dialog details").open=true');await screenshot('details-'+width);await clickLabel('Close');
    await go('/encounters');await click('All visits');assert.equal(await visibleTables(),1);await screenshot('facility-visits-'+width);
    await go(chart);await click('Continue visit');await waitFor('Boolean(document.querySelector("textarea"))');await screenshot('record-visit-'+width);
    checks.push('Patient chart, editors, menus and visit views fit '+width+'px');
  }
  await cdp('Page.navigate',{url:previewOrigin+'/qa/patient-flow.html?readonly=1'});
  await waitFor('Boolean(window.designAudit)&&document.body.innerText.includes("Amaka Okoro")');
  await go(chart);await waitFor('document.body.innerText.includes("Medical chart")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(n=>["Start visit","Continue visit","Book appointment"].includes(n.textContent.trim()))'),false);
  await click('Clinical record');assert.equal(await evaluate('document.body.innerText.includes("View access")'),true);
  await click('Personal details');assert.equal(await evaluate('[...document.querySelectorAll("button")].some(n=>n.textContent.trim()==="Edit personal details")'),false);
  await click('Visits');await click('View visit');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(n=>n.textContent.trim()==="Add amendment")'),false);
  checks.push('Read-only staff can inspect records without recording, amendment or demographic actions');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'patient-flow-results.json'),JSON.stringify({checks,browserExceptions:errors},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,browserExceptions:errors},null,2));

} catch (error) { await captureFailure?.().catch(() => {}); throw error;
} finally {
  socket?.close(); chrome.kill(); await server?.close();
  // This is the exact profile freshly created by this script, never a user's browser profile.
  await pause(300);
  const absoluteProfile = resolve(profile);
  if (absoluteProfile.startsWith(resolve(tmpdir()) + '\\') || absoluteProfile.startsWith(resolve(tmpdir()) + '/')) {
    await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch((error) => console.warn('Could not remove temporary QA browser profile:', error.message));
  }
}




