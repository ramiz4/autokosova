import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Uses the same isolated native Chrome/CDP approach as account-browser-smoke.mjs.
const chrome = [process.env.CHROME_BIN, 'google-chrome', 'chromium', 'chromium-browser'].find(
  (candidate) => candidate && spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0,
);
assert.ok(chrome, 'Install Chrome/Chromium or set CHROME_BIN.');
async function until(check, label) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value; } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
}
const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
const port = listener.address().port; await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'autokosova-inquiries-'));
const screenshots = 'test-results/inquiries';
const draftKey = 'autokosova.repair-request-draft.v1';
const draft = JSON.stringify({ symptom: 'FIKTIVER LOKALER ENTWURF', serviceCategoryId: 'motor' });
let server, browser, socket, closeBrowser, launchError;
let diagnostics = '';
try {
  server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-8000); });
  server.on('error', (error) => { launchError = error; });
  await until(async () => {
    if (launchError) throw launchError;
    return (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok;
  }, 'local SSR server');
  browser = spawn(chrome, ['--headless', '--disable-gpu', '--disable-background-networking',
    ...(process.env.CI ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', (chunk) => { diagnostics = (diagnostics + chunk).slice(-8000); });
  browser.on('error', (error) => { launchError = error; });
  const target = await until(async () => {
    if (launchError) throw launchError;
    const debugPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    return (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === 'page');
  }, 'isolated Chrome target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data), task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome command timed out: ${method}`)); }, 10_000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  }
  closeBrowser = () => command('Browser.close');
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  }
  async function key(name, code) {
    await command('Input.dispatchKeyEvent', { type: name === 'Enter' ? 'keyDown' : 'rawKeyDown', key: name, code: name, windowsVirtualKeyCode: code,
      ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
  }
  const account = (id = 'a') => ({ userId: `fictional-owner-${id}`, displayName: `FIKTIVES TESTKONTO ${id}`, roles: ['customer'], garageMemberships: [], expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const detail = {
    id: 'fictional-request-a', createdAt: '2026-09-14T12:00:00Z', serviceCategoryId: 'bremsen',
    symptom: 'FIKTIVER TESTFALL – Geräusch beim Bremsen.\nPRIVATE-SYMPTOM <b>Nur Text</b>',
    areas: [{ placeId: 'xk-pristina', radiusKm: 20 }, { placeId: 'xk-peja', radiusKm: 35 }],
    vehicle: { makeId: 'skoda', model: 'Fiktives Modell', year: 2018, vehicleClass: 'suv', engineDetails: 'PRIVATE-ENGINE', mileageKm: 0 },
    earliestDropoffOn: '2026-10-02', latestPickupOn: '2026-10-06', attachmentIds: ['PRIVATE-ATTACHMENT'],
  };
  const summary = { id: detail.id, createdAt: detail.createdAt, serviceCategoryId: detail.serviceCategoryId,
    symptomPreview: detail.symptom, areas: detail.areas, vehicle: { makeId: 'skoda', model: 'Fiktives Modell', year: 2018, vehicleClass: 'suv' } };
  const minimal = { id: 'fictional-minimal', createdAt: detail.createdAt, serviceCategoryId: 'reifen', areas: [] };
  let accountPayload = account(), accountStatus = 200, listStatus = 200, detailStatus = 200, empty = false;
  const errors = [], analytics = [];
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.method === 'Runtime.exceptionThrown') errors.push('Browser runtime exception');
    if (event.method === 'Network.requestWillBeSent' && event.params.request.url.includes('/api/analytics')) analytics.push(event.params.request.url);
    if (event.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = event.params;
    const url = new URL(request.url);
    let status = 200, payload;
    if (url.pathname === '/auth/logout') {
      accountStatus = 401; accountPayload = { loginAvailable: true }; status = 204;
    } else if (url.pathname === '/api/me') {
      status = accountStatus; payload = accountPayload;
    } else if (url.pathname === '/api/me/repair-requests') {
      status = listStatus;
      payload = empty ? { requests: [], nextCursor: null }
        : accountPayload.userId === 'fictional-owner-b' ? { requests: [{ ...minimal, id: 'fictional-request-b', symptomPreview: 'FIKTIVER TESTFALL KONTO B' }], nextCursor: null }
        : url.searchParams.has('cursor') ? { requests: [minimal], nextCursor: null }
        : { requests: [summary], nextCursor: summary.id };
    } else { status = detailStatus; payload = detail; }
    void command('Fetch.fulfillRequest', { requestId, responseCode: status,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'cache-control', value: 'private, no-store' }],
      body: status === 204 ? '' : Buffer.from(JSON.stringify(payload ?? {})).toString('base64'),
    }).catch(() => errors.push('Fixture response failed'));
  });
  await command('Runtime.enable'); await command('Network.enable'); await command('Page.enable');
  // Fixtures intercept browser requests only. No test login, session cookie or auth bypass is added to the app.
  await command('Fetch.enable', { patterns: [
    { urlPattern: `${origin}/api/me`, requestStage: 'Request' },
    { urlPattern: `${origin}/api/me/repair-requests*`, requestStage: 'Request' },
    { urlPattern: `${origin}/auth/logout`, requestStage: 'Request' },
  ] });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `if (!sessionStorage.getItem(${JSON.stringify(draftKey)})) sessionStorage.setItem(${JSON.stringify(draftKey)}, ${JSON.stringify(draft)});` });
  await mkdir(screenshots, { recursive: true });
  const rendered = `document.querySelectorAll('[data-inquiry-card]').length > 0`;
  for (const locale of ['de', 'sq', 'en']) {
    const path = `${locale === 'de' ? '' : '/' + locale}/inquiries`;
    const serverPage = await fetch(origin + path, { headers: { cookie: 'autokosova_session=fictional-invalid-cookie' } });
    assert.equal(serverPage.status, 200);
    assert.equal(serverPage.headers.get('cache-control'), 'private, no-store');
    assert.equal(serverPage.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(serverPage.headers.get('vary'), 'Cookie');
    assert.doesNotMatch(await serverPage.text(), /fictional-request|PRIVATE-ENGINE|PRIVATE-SYMPTOM|fictional-owner/);
    for (const width of [360, 390, 430, 1280]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 });
      await command('Page.navigate', { url: origin + path });
      await until(() => evaluate(`${rendered} && document.documentElement.lang === '${locale}'`), 'localized inquiry rendering');
      await evaluate(`document.querySelector('button[aria-controls="account-menu"]').focus()`); await key('Enter', 13);
      await until(() => evaluate(`!!document.querySelector('[data-account-inquiries]')`), 'keyboard account menu');
      assert.deepEqual(await evaluate(`(() => { const link = document.querySelector('[data-account-inquiries]'); return [link.getAttribute('href'), link.getAttribute('aria-current'), link.classList.contains('bg-blue-50')]; })()`), [path, 'page', true]);
      await evaluate(`document.querySelector('[data-account-inquiries]').focus()`);
      assert.ok(await evaluate(`document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2`));
      await key('Escape', 27);
      await until(() => evaluate(`!document.querySelector('#account-menu') && document.activeElement.matches('button[aria-controls="account-menu"]')`), 'Escape restores focus');
      await until(() => evaluate(rendered), 'list after session refresh');
      await evaluate(`document.querySelector('[data-inquiry-view]').focus()`); await key('Enter', 13);
      await until(() => evaluate(`!!document.querySelector('[data-inquiry-detail]')`), 'readonly expansion');
      assert.ok(await evaluate(`!!document.querySelector('time[datetime="2026-10-02"]') && !!document.querySelector('time[datetime="2026-10-06"]')`));
      const query = new URL(await evaluate(`document.querySelector('[data-inquiry-search]').href`));
      assert.equal(query.pathname, path.replace('/inquiries', '/garages'));
      assert.deepEqual([...query.searchParams.keys()].sort(), ['places', 'service']);
      assert.doesNotMatch(query.href, /fictional-request|PRIVATE|2026-10|skoda/);
      assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(draftKey)})`), draft);
      const geometry = await evaluate(`(() => {
        const main = document.querySelector('main'), visible = (el) => el.getClientRects().length > 0;
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
          editable: !!main.querySelector('input,textarea,select'), injected: !!main.querySelector('[data-inquiry-detail] b'),
          smallTargets: [...main.querySelectorAll('a,button')].filter(visible).filter(el => { const box = el.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).length,
          clipped: [...main.querySelectorAll('p,dd,h1,h2,li,button,a')].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1).length };
      })()`);
      assert.deepEqual(geometry, { overflow: false, editable: false, injected: false, smallTargets: 0, clipped: 0 });
      await evaluate(`document.querySelector('[data-inquiries-more]').click()`);
      await until(() => evaluate(`document.querySelectorAll('[data-inquiry-card]').length === 2`), 'pagination and missing optional fields');
      await evaluate('window.scrollTo(0, document.body.scrollHeight)'); await delay(80); await evaluate('window.scrollTo(0, 0)');
      const layout = await command('Page.getLayoutMetrics');
      const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: layout.cssContentSize.height, scale: 1 } });
      await writeFile(join(screenshots, `${locale}-${width}.png`), Buffer.from(image.data, 'base64'));
      console.log(`Inquiries layout, keyboard, details, privacy and pagination passed: ${locale} ${width}px (fictional fixtures)`);
    }
  }
  assert.deepEqual(analytics, [], 'Private overview must not emit analytics');
  await command('Page.navigate', { url: origin + '/inquiries' }); await until(() => evaluate(rendered), 'overview');
  await evaluate(`document.querySelector('[data-inquiry-search]').click()`);
  await until(() => evaluate(`location.pathname === '/garages'`), 'matching navigation');
  assert.equal(await evaluate(`sessionStorage.getItem(${JSON.stringify(draftKey)})`), draft);
  await evaluate('history.back()'); await until(() => evaluate(`location.pathname === '/inquiries' && ${rendered}`), 'browser back');
  await evaluate('history.forward()'); await until(() => evaluate(`location.pathname === '/garages'`), 'browser forward');
  await evaluate('history.back()'); await until(() => evaluate(rendered), 'back to saved requests');
  await command('Page.reload', { ignoreCache: true }); await until(() => evaluate(rendered), 'reload persists account view');
  assert.equal(await evaluate(`document.querySelector('[data-new-inquiry]').getAttribute('href')`), '/inquiry');

  accountPayload = account('b');
  await evaluate(`window.dispatchEvent(new Event('focus'))`);
  await until(() => evaluate(`document.querySelector('main').textContent.includes('FIKTIVER TESTFALL KONTO B')`), 'account switch');
  assert.ok(!await evaluate(`document.querySelector('main').textContent.includes('PRIVATE-SYMPTOM')`));
  accountPayload = account(); empty = true;
  await command('Page.reload', { ignoreCache: true }); await until(() => evaluate(`!!document.querySelector('[data-inquiries-empty]')`), 'empty account');
  empty = false; listStatus = 503;
  await command('Page.reload', { ignoreCache: true }); await until(() => evaluate(`!!document.querySelector('[data-inquiries-retry]')`), 'list error');
  listStatus = 200; await evaluate(`document.querySelector('[data-inquiries-retry]').click()`); await until(() => evaluate(rendered), 'list retry');
  detailStatus = 503; await evaluate(`document.querySelector('[data-inquiry-view]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-detail-retry]')`), 'detail error');
  detailStatus = 200; await evaluate(`document.querySelector('[data-detail-retry]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-inquiry-detail]')`), 'detail retry');
  await evaluate(`document.querySelector('[data-inquiry-view]').click()`); detailStatus = 404;
  await evaluate(`document.querySelector('[data-inquiry-view]').click()`);
  await until(() => evaluate(`document.querySelector('main [role="alert"]')?.textContent.includes('nicht mehr verfügbar')`), 'missing detail');
  detailStatus = 200; accountPayload = { ...account(), expiresAt: new Date(Date.now() + 3000).toISOString() };
  await command('Page.reload', { ignoreCache: true }); await until(() => evaluate(rendered), 'short-lived session');
  await until(() => evaluate(`!!document.querySelector('[data-inquiries-login]') && !(${rendered})`), 'session expiry');
  assert.equal(await evaluate(`document.querySelector('[data-inquiries-login]').getAttribute('href')`), '/auth/login?returnTo=%2Finquiries');
  assert.ok(!await evaluate(`document.querySelector('main').textContent.includes('PRIVATE-SYMPTOM')`));
  accountPayload = account();
  await command('Page.reload', { ignoreCache: true }); await until(() => evaluate(rendered), 'session restored');
  await evaluate(`document.querySelector('button[aria-controls="account-menu"]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-account-inquiries]')`), 'menu selection');
  await evaluate(`document.querySelector('[data-account-inquiries]').click()`);
  await until(() => evaluate(`!document.querySelector('#account-menu')`), 'selection closes menu');
  await evaluate(`document.querySelector('button[aria-controls="account-menu"]').click()`);
  await until(() => evaluate(`!!document.querySelector('[data-account-inquiries]')`), 'logout menu');
  await evaluate(`[...document.querySelectorAll('#account-menu button')].find(button => button.textContent.includes('Abmelden')).click()`);
  await until(() => evaluate(`location.pathname === '/'`), 'logout returns home');
  await command('Page.navigate', { url: origin + '/sq/inquiries' });
  await until(() => evaluate(`!!document.querySelector('[data-inquiries-login]')`), 'guest return path');
  assert.equal(await evaluate(`document.querySelector('[data-inquiries-login]').getAttribute('href')`), '/auth/login?returnTo=%2Fsq%2Finquiries');
  assert.deepEqual(errors, []);
  console.log('Inquiries navigation, reload, account switch, empty/error/retry/missing, expiry and logout passed. Fixtures only; not live ZITADEL.');
} catch (error) {
  console.error(error, diagnostics); throw error;
} finally {
  await closeBrowser?.().catch((error) => console.warn('Browser cleanup:', error.message));
  socket?.close(); await stop(browser); await stop(server);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch((error) => console.warn('Temporary profile cleanup:', error.message));
}
