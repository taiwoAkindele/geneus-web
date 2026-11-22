import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

// The real public React app with synthetic API responses. Provider navigation is intercepted locally.
// Database settlement is covered separately by geneus-server/tests/checkout.test.ts.
const origin = 'http://127.0.0.1:5227';
const token = 'A'.repeat(43);
const reference = 'geneus-co-11111111-1111-4111-8111-111111111111';
const api = `/public/documents/bill/${token}`;
const output = resolve('../.qa/patient-checkout');
const profile = await mkdtemp(join(tmpdir(), 'geneus-checkout-browser-'));
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let mode = 'unpaid';
let starts = 0;
let socket;
let chrome;

process.env.VITE_API_URL = origin;

const bill = () => ({
  kind: 'bill',
  bill: {
    key: 'SYNTHETIC-000001-K2|NGN|charge:synthetic',
    reference: 'B-SYNTHETIC',
    currency: 'NGN',
    issuedOn: '2026-11-22T00:00:00.000Z',
    status: mode === 'paid' ? 'Paid' : 'Unpaid',
    hospital: { name: 'Synthetic Hospital', email: 'desk@example.org', timeZone: 'Africa/Lagos' },
    patient: { name: 'Synthetic Patient', patientId: 'SYNTHETIC-000001-K2' },
    lines: [{ description: 'Synthetic consultation', category: 'Consultation', quantity: 1, unitMinor: 10_000, amountMinor: 10_000, exempt: false }],
    totals: {
      subtotalMinor: 10_000,
      exemptMinor: 0,
      reducedMinor: 0,
      insuranceMinor: 0,
      undecidedMinor: 0,
      totalMinor: 10_000,
      paidMinor: mode === 'paid' ? 10_000 : 0,
      dueMinor: mode === 'paid' ? 0 : 10_000,
      creditMinor: 0,
    },
    payable: mode !== 'paid',
  },
});

const server = await createServer({
  root: process.cwd(),
  envDir: false,
  logLevel: 'error',
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 5227, strictPort: true },
  plugins: [{
    name: 'synthetic-patient-checkout-api',
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/public/documents/')) {
          next();
          return;
        }

        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');

        if (request.url === `${api}/pay`) {
          starts += 1;
          response.end(JSON.stringify({
            checkoutUrl: 'https://checkout.paystack.com/synthetic',
            reference,
            amountMinor: 10_000,
            currency: 'NGN',
          }));
          return;
        }

        if (request.url === `${api}/checkout/${reference}`) {
          if (mode === 'confirmation-error') {
            response.statusCode = 503;
            response.end(JSON.stringify({ error: 'provider_unavailable', message: 'The provider is temporarily unavailable. Try again.' }));
            return;
          }

          response.end(JSON.stringify({ status: mode === 'paid' ? 'paid' : 'pending', amountMinor: 10_000, currency: 'NGN', heldMinor: 0 }));
          return;
        }

        response.end(JSON.stringify(bill()));
      });
    },
  }],
});

try {
  await mkdir(output, { recursive: true });
  await server.listen();
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let port;

  for (let index = 0; index < 80 && !port; index += 1) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
    } catch {
      await pause(100);
    }
  }

  assert.ok(port, 'Headless Chrome did not start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === 'page');
  assert.ok(target);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });

  let sequence = 0;
  const pending = new Map();
  const requests = [];
  const exceptions = [];
  const call = (method, params = {}) => new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`Browser timed out: ${method}`)), 15_000);
    pending.set(id, { done, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });

  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);

    if (message.method === 'Network.requestWillBeSent') {
      requests.push(message.params.request.url);
    }

    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.text);
    }

    if (message.method === 'Fetch.requestPaused') {
      void call('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html' }],
        body: Buffer.from('<h1>Synthetic provider checkout</h1>').toString('base64'),
      });
    }

    if (!message.id) {
      return;
    }

    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request?.timer);

    if (message.error) {
      request?.reject(new Error(message.error.message));
    } else {
      request?.done(message.result);
    }
  };

  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await evaluate(expression)) {
        return;
      }

      await pause(100);
    }

    throw new Error(`Browser condition failed: ${expression}`);
  };
  const textIncludes = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;
  const navigate = async (query = '') => {
    await call('Page.navigate', { url: `${origin}/p/b/${token}${query}` });
    await waitFor(textIncludes('Synthetic Hospital'));
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Fetch.enable', { patterns: [{ urlPattern: 'https://checkout.paystack.com/*', requestStage: 'Request' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate();
  await waitFor(textIncludes('Pay now'));
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  assert.equal(requests.some((url) => /\/src\/(app\/App|data\/db|data\/facilityWorkspaces|lib\/secureStorage)/.test(url)), false);
  assert.deepEqual(await evaluate('indexedDB.databases().then(databases => databases.map(database => database.name))'), []);
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(join(output, 'mobile-bill.png'), Buffer.from(screenshot.data, 'base64'));
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Pay now').click()");
  await waitFor(textIncludes('Synthetic provider checkout'));
  assert.equal(starts, 1);

  mode = 'confirmation-error';
  await navigate(`?checkout=${reference}&status=success`);
  await waitFor(textIncludes('Check payment again'));
  assert.equal(await evaluate(textIncludes('Payment received')), false);
  assert.equal(await evaluate(textIncludes('The provider is temporarily unavailable')), true);

  mode = 'paid';
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Check payment again').click()");
  await waitFor(textIncludes('Payment received'));
  await waitFor(textIncludes('Nothing to pay'));
  assert.equal(await evaluate(textIncludes('Download receipt')), true);
  assert.equal(await evaluate(textIncludes('Pay now')), false);
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(join(output, 'desktop-paid.png'), Buffer.from(desktop.data, 'base64'));
  assert.deepEqual(exceptions, []);

  const report = {
    checks: ['mobile bill', 'no horizontal overflow', 'no staff modules or device databases', 'checkout navigation', 'confirmation error and retry', 'redirect status is not proof', 'paid bill refresh', 'receipt download link', 'desktop layout', 'no browser exceptions'],
    providerRequests: starts,
  };
  await writeFile(join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  chrome?.kill();
  await server.close();
}
