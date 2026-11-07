import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve } from 'node:path';
import { parseFile } from '../site/core/brokers/index.js';
import { fifo } from '../site/core/fifo.js';
import { yearly } from '../site/core/tax.js';
import { uah } from '../site/ui/render.js';

const SITE = resolve('site');
const SAMPLE = join(SITE, 'sample.csv');
const RATE = 40;
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
};

const rows = fifo(parseFile(await readFile(SAMPLE, 'utf8')).trades, (c) => (c === 'UAH' ? 1 : RATE));
const summary = yearly(rows);
const year = Object.keys(summary).at(-1);
const expected = uah(summary[year].pdfo + summary[year].military);

const server = createServer(async (req, res) => {
  const path = join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!path.startsWith(SITE)) return res.writeHead(403).end();
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const chromePath =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    existsSync,
  );
if (!chromePath) throw new Error('Не знайдено Chrome: задайте CHROME_PATH');
const profile = await mkdtemp(join(tmpdir(), 'smoke-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  ...(process.env.CI ? ['--no-sandbox'] : []),
]);
const wsUrl = await new Promise((ok, fail) => {
  let log = '';
  chrome.stderr.on('data', (d) => {
    log += d;
    const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) ok(m[1]);
  });
  chrome.once('exit', () => fail(new Error(`Chrome завершився:\n${log}`)));
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const listeners = new Map();
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.fail(new Error(msg.error.message));
    else p.ok(msg.result);
  } else listeners.get(msg.method)?.(msg.params);
});
let sessionId;
const send = (method, params = {}) =>
  new Promise((ok, fail) => {
    pending.set(++id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const on = (method, fn) => listeners.set(method, fn);

let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? '✔' : '✖'} ${what}`);
  if (!ok) failed = true;
};

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));

  on('Fetch.requestPaused', ({ requestId }) =>
    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'content-type', value: 'application/json' },
        { name: 'access-control-allow-origin', value: '*' },
      ],
      body: Buffer.from(JSON.stringify([{ rate: RATE }])).toString('base64'),
    }),
  );
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://bank.gov.ua/*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__problems = [];
      addEventListener('securitypolicyviolation', (e) => __problems.push('CSP: ' + e.violatedDirective + ' ' + e.blockedURI));
      addEventListener('error', (e) => __problems.push('JS: ' + e.message));
      addEventListener('unhandledrejection', (e) => __problems.push('Promise: ' + e.reason));`,
  });
  await send('Page.enable');
  const loaded = new Promise((r) => on('Page.loadEventFired', r));
  await send('Page.navigate', { url });
  await loaded;

  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

  const { root } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
  await send('DOM.setFileInputFiles', { nodeId, files: [SAMPLE] });

  const state = await evaluate(`new Promise((resolve) => {
    const started = Date.now();
    (function poll() {
      const total = document.querySelector('.stat.total b')?.textContent;
      const err = document.getElementById('err').textContent;
      if (total || err || Date.now() - started > 10000) resolve({ total, err, year: document.querySelector('select.year').value });
      else setTimeout(poll, 100);
    })();
  })`);
  check(!state.err, `без помилки${state.err ? `: ${state.err}` : ''}`);
  check(state.year === year, `обрано рік ${year} (є ${state.year})`);
  check(state.total === expected, `«Разом до сплати» = ${expected} (є ${state.total})`);

  const tabs = await evaluate(`(() => {
    const first = document.getElementById('t-calc');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return { focused: document.activeElement.id, detailShown: !document.getElementById('tab-detail').hidden,
             sales: document.querySelectorAll('#detail .sale').length };
  })()`);
  check(tabs.focused === 't-detail' && tabs.detailShown, 'стрілка вправо відкриває вкладку «Детально»');
  check(tabs.sales === rows.filter((r) => r.date.startsWith(year)).length, `карток продажів: ${tabs.sales}`);

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  const overflow = await evaluate(`(async () => {
    const out = [];
    for (const t of document.querySelectorAll('[role=tab]')) {
      t.click();
      await new Promise((r) => requestAnimationFrame(r));
      if (document.documentElement.scrollWidth > innerWidth) out.push(t.id);
    }
    return out;
  })()`);
  check(!overflow.length, `ширина 375 px без горизонтальної прокрутки${overflow.length ? `: ${overflow}` : ''}`);

  const problems = await evaluate('window.__problems');
  check(!problems.length, `без порушень CSP і помилок JS${problems.length ? `:\n  ${problems.join('\n  ')}` : ''}`);
} finally {
  ws.close();
  await new Promise((r) => {
    chrome.once('exit', r);
    chrome.kill();
  });
  server.close();
  // На Linux дочірні процеси Chrome ще дописують у профіль після виходу головного: пробуємо кілька разів,
  // а якщо не вийшло — лишаємо тимчасову теку, бо на результат тесту це не впливає
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch((e) =>
    console.warn(`Не вдалося прибрати ${profile}: ${e.code}`),
  );
}
process.exit(failed ? 1 : 0);
