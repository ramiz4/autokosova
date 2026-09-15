import { isCanceledFixtureResponse } from './browser-fixture-lifecycle.mjs';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const chrome = [process.env.CHROME_BIN, 'google-chrome', 'chromium', 'chromium-browser'].find(
  (candidate) => candidate && spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0,
);
assert.ok(chrome, 'Install Chrome/Chromium or set CHROME_BIN to run account browser checks.');

async function until(check, label) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'autokosova-account-'));
const screenshots = 'test-results/account';
let server;
let browser;
let socket;
let closeBrowser;
let launchError;
let diagnostics = '';

try {
  server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-8000);
  });
  server.on('error', (error) => (launchError = error));
  await until(async () => {
    if (launchError) throw launchError;
    return (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok;
  }, 'local SSR server');
  browser = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--disable-background-networking',
      ...(process.env.CI ? ['--no-sandbox'] : []),
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  browser.stderr.on('data', (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-8000);
  });
  browser.on('error', (error) => (launchError = error));
  const target = await until(async () => {
    if (launchError) throw launchError;
    const debugPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((item) => item.type === 'page');
  }, 'isolated Chrome debugging target');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  function command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Chrome command timed out: ${method}`));
      }, 10_000);
      pending.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  closeBrowser = () => command('Browser.close');
  async function evaluate(expression) {
    const response = await command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  async function key(name, code) {
    await command('Input.dispatchKeyEvent', {
      type: name === 'Enter' ? 'keyDown' : 'rawKeyDown',
      key: name,
      code: name,
      windowsVirtualKeyCode: code,
      ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
    });
    await command('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: name,
      code: name,
      windowsVirtualKeyCode: code,
    });
  }
  // Browser fixtures are intercepted here only; the production server has no test login.
  const fixture = (kind = 'admin') => ({
    userId: `fictional-browser-${kind}`,
    displayName: `FIKTIVES TESTKONTO · ${kind}`,
    username: `fixture-${kind}`,
    email: `${kind}@example.invalid`,
    roles:
      kind === 'admin'
        ? ['customer', 'moderator', 'admin']
        : kind === 'moderator'
          ? ['customer', 'moderator']
          : ['customer'],
    garageMemberships:
      kind === 'member'
        ? [{ garageId: 'fictional-garage', garageName: 'FIKTIVE TESTGARAGE', role: 'editor' }]
        : [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  let accountPayload = fixture();
  let accountStatus = 200;
  let accountResponseGate;
  let accountRequests = 0;
  let accountReplies = 0;
  const errors = [];
  const canceledRequests = new Set();
  const documentVersions = new Map();
  const fixtureFailures = [];
  const fixtureResponses = [];
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.method === 'Page.frameNavigated' || event.method === 'Page.frameDetached') {
      const id = event.params.frame?.id ?? event.params.frameId;
      documentVersions.set(id, (documentVersions.get(id) ?? 0) + 1);
    }
    if (event.method === 'Network.loadingFailed' && event.params.canceled)
      canceledRequests.add(event.params.requestId);
    if (event.method === 'Runtime.exceptionThrown') errors.push('Browser runtime exception');
    if (event.method !== 'Fetch.requestPaused') return;
    const { requestId, request, networkId, frameId } = event.params;
    const documentVersion = documentVersions.get(frameId) ?? 0;
    const isLogout = new URL(request.url).pathname === '/auth/logout';
    if (isLogout) {
      accountStatus = 401;
      accountPayload = { loginAvailable: true };
    }
    const responseCode = isLogout ? 204 : accountStatus;
    const body = isLogout ? '' : Buffer.from(JSON.stringify(accountPayload)).toString('base64');
    if (!isLogout) accountRequests++;
    fixtureResponses.push(
      (isLogout ? Promise.resolve() : (accountResponseGate ?? Promise.resolve()))
        .then(() =>
          command('Fetch.fulfillRequest', {
            requestId,
            responseCode,
            responseHeaders: [
              { name: 'content-type', value: 'application/json' },
              { name: 'cache-control', value: 'private, no-store' },
            ],
            body,
          }),
        )
        .then(() => {
          if (!isLogout) accountReplies++;
        })
        .catch((error) =>
          fixtureFailures.push({
            error,
            networkId,
            documentChanged: (documentVersions.get(frameId) ?? 0) !== documentVersion,
          }),
        ),
    );
  });
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Fetch.enable', {
    patterns: [
      { urlPattern: `${origin}/api/me`, requestStage: 'Request' },
      { urlPattern: `${origin}/auth/logout*`, requestStage: 'Request' },
    ],
  });
  await command('Page.enable');
  await command('Page.bringToFront');
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await mkdir(screenshots, { recursive: true });
  // Hold the actual session refresh and inspect every animation frame, not just its final state.
  async function openStableAccountMenu() {
    let release;
    accountResponseGate = new Promise((resolve) => (release = resolve));
    const requestsBefore = accountRequests;
    const repliesBefore = accountReplies;
    try {
      await evaluate(`document.querySelector('button[aria-controls="account-menu"]').focus()`);
      await evaluate(`(async () => {
        await document.fonts.ready;
        const selectors = ['header', '#desktop-navigation', 'header app-language-switcher',
          'button[aria-controls="account-menu"]', '.mobile-menu-toggle', '.site-logo'];
        const elements = selectors.map((selector) => document.querySelector(selector));
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        };
        const boxes = elements.map(box);
        const name = elements[3].textContent;
        const probe = window.__navbarProbe = { frames: 0, menuFrames: 0, failures: [] };
        let animation;
        let menuBox;
        const fail = (message) => { if (probe.failures.length < 10) probe.failures.push(message); };
        const sample = () => {
          probe.frames++;
          elements.forEach((element, index) => {
            if (document.querySelector(selectors[index]) !== element)
              fail('DOM node replaced: ' + selectors[index]);
            if (box(element).some((value, dimension) => Math.abs(value - boxes[index][dimension]) > 0.25))
              fail('Layout moved: ' + selectors[index]);
          });
          if (!elements[0].classList.contains('is-authenticated')) fail('Authenticated class removed');
          if (elements[3].textContent !== name) fail('Account button name changed');
          if (elements[3].getAttribute('aria-expanded') === 'true') {
            probe.menuFrames++;
            const menu = document.querySelector('#account-menu');
            if (!menu?.querySelector('[data-account-name]') || !menu?.querySelector('[data-account-inquiries]'))
              fail('Account menu contents disappeared');
            if (menu) {
              menuBox ??= box(menu);
              if (box(menu).some((value, dimension) => Math.abs(value - menuBox[dimension]) > 0.25))
                fail('Account menu resized');
            }
          }
          animation = requestAnimationFrame(sample);
        };
        probe.stop = () => {
          cancelAnimationFrame(animation);
          return { frames: probe.frames, failures: probe.failures };
        };
        animation = requestAnimationFrame(sample);
      })()`);
      await key('Enter', 13);
      await until(() => accountRequests > requestsBefore, 'held account refresh');
      await until(() => evaluate('window.__navbarProbe.menuFrames >= 8'), 'pending refresh frames');
      release();
      accountResponseGate = undefined;
      await until(() => accountReplies > repliesBefore, 'released account response');
      const frames = await evaluate('window.__navbarProbe.frames');
      await until(
        () => evaluate(`window.__navbarProbe.frames >= ${frames + 4}`),
        'settled refresh frames',
      );
      const probe = await evaluate('window.__navbarProbe.stop()');
      assert.deepEqual(
        probe.failures,
        [],
        'Navbar and account menu must stay stable during revalidation',
      );
      assert.ok(probe.frames >= 12);
    } finally {
      release();
      accountResponseGate = undefined;
    }
  }
  const rendered = `!!document.querySelector('[data-account-id]')`;
  for (const locale of ['de', 'sq', 'en']) {
    const path = `${locale === 'de' ? '' : '/' + locale}/profile`;
    const serverPage = await fetch(origin + path, {
      headers: { cookie: 'autokosova_session=fictional-cookie' },
    });
    assert.equal(serverPage.status, 200);
    assert.equal(serverPage.headers.get('cache-control'), 'private, no-store');
    assert.equal(serverPage.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await serverPage.text();
    assert.doesNotMatch(html, /fictional-browser|FIKTIVES TESTKONTO|admin@example\.invalid/);
    for (const width of [360, 390, 430, 1280, 1448]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      await command('Page.navigate', { url: origin + path });
      await until(
        () => evaluate(`${rendered} && document.documentElement.lang === '${locale}'`),
        'localized account rendering',
      );
      const geometry = await evaluate(`(() => {
        const main = document.querySelector('main');
        const visible = (element) => element.getClientRects().length > 0;
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          editable: !!main.querySelector('input, textarea, select'),
          roles: main.querySelector('[data-account-roles]').children.length,
          smallTargets: [...main.querySelectorAll('a,button,summary')].filter(visible).filter((element) => {
            const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44;
          }).length,
          clipped: [...main.querySelectorAll('p,dd,h1,h2,li')].filter(visible).filter((element) => element.scrollWidth > element.clientWidth + 1).length,
        };
      })()`);
      assert.deepEqual(geometry, {
        overflow: false,
        editable: false,
        roles: 3,
        smallTargets: 0,
        clipped: 0,
      });
      assert.equal(await evaluate("document.querySelector('[data-account-details]').open"), false);
      assert.equal(
        await evaluate("!!document.querySelector('[aria-controls=account-notifications]')"),
        false,
      );
      await evaluate("document.querySelector('[data-account-details] summary').focus()");
      await key('Enter', 13);
      assert.equal(await evaluate("document.querySelector('[data-account-details]').open"), true);
      await key('Enter', 13);
      assert.equal(await evaluate("document.querySelector('[data-account-details]').open"), false);
      await openStableAccountMenu();
      await until(
        () => evaluate(`!!document.querySelector('[data-account-name]')`),
        'keyboard account menu opening',
      );
      assert.equal(
        await evaluate(`document.querySelectorAll('[data-account-menu-roles] li').length`),
        1,
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-account-profile]').getAttribute('href')`),
        path,
      );
      await evaluate(`document.querySelector('[data-account-profile]').focus()`);
      await key('Escape', 27);
      await until(
        () =>
          evaluate(
            `!document.querySelector('#account-menu') && document.activeElement.matches('button[aria-controls="account-menu"]')`,
          ),
        'Escape focus restoration',
      );
      assert.ok(
        await evaluate(
          `document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2`,
        ),
      );
      // Reopening must be equally stable; the first opening must not merely warm a cache.
      await openStableAccountMenu();
      await key('Escape', 27);
      await until(
        () => evaluate(`!document.querySelector('#account-menu')`),
        'reopened menu dismissal',
      );
      await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await delay(80);
      await evaluate(`window.scrollTo(0, 0)`);
      const layout = await command('Page.getLayoutMetrics');
      const image = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: layout.cssContentSize.height, scale: 1 },
      });
      await writeFile(
        join(screenshots, `${locale}-${width}.png`),
        Buffer.from(image.data, 'base64'),
      );
      console.log(
        `Account browser stable-refresh/layout/keyboard passed: ${locale}, ${width}px (fictional API fixture)`,
      );
    }
  }
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  for (const kind of ['customer', 'member', 'moderator', 'admin']) {
    accountPayload = fixture(kind);
    accountStatus = 200;
    await command('Page.navigate', { url: origin + '/profile' });
    await until(
      () =>
        evaluate(
          `${rendered} && document.querySelector('[data-account-id]').textContent.includes('fictional-browser-${kind}')`,
        ),
      'account switch',
    );
    await command('Page.reload', { ignoreCache: true });
    await until(
      () =>
        evaluate(
          `${rendered} && document.querySelector('[data-account-id]').textContent.includes('fictional-browser-${kind}')`,
        ),
      'account reload',
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('[data-account-roles] li').length`),
      accountPayload.roles.length,
    );
    assert.equal(
      await evaluate(
        `!!document.querySelector('[data-account-memberships]')?.textContent.includes('FIKTIVE TESTGARAGE')`,
      ),
      kind === 'member',
    );
  }
  await evaluate(
    `document.querySelector('main app-language-switcher a[href="/sq/profile"]').click()`,
  );
  await until(
    () =>
      evaluate(
        `${rendered} && location.pathname === '/sq/profile' && document.documentElement.lang === 'sq'`,
      ),
    'language switch on profile',
  );
  await evaluate(`document.querySelector('[data-account-logout]').focus()`);
  await key('Enter', 13);
  await until(
    () => evaluate(`location.pathname === '/sq' && !document.querySelector('[data-account-id]')`),
    'logout',
  );
  assert.ok(await evaluate(`!document.body.textContent.includes('admin@example.invalid')`));

  // Network errors and missing provider configuration must never display the previous account.
  accountStatus = 503;
  accountPayload = { error: 'Account information unavailable' };
  await command('Page.navigate', { url: origin + '/profile' });
  await until(() => evaluate(`!!document.querySelector('main [role="alert"]')`), 'account error');
  assert.equal(await evaluate(rendered), false);
  accountStatus = 401;
  accountPayload = { loginAvailable: false };
  await command('Page.reload', { ignoreCache: true });
  await until(
    () =>
      evaluate(`document.querySelector('main').textContent.includes('noch nicht eingerichtet')`),
    'unconfigured login',
  );
  assert.equal(await evaluate(`!!document.querySelector('main a[href^="/auth/login"]')`), false);
  accountStatus = 200;
  accountPayload = {
    ...fixture('minimal'),
    displayName: undefined,
    username: undefined,
    email: undefined,
  };
  await command('Page.reload', { ignoreCache: true });
  await until(() => evaluate(rendered), 'optional profile claims');
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('Nicht vom Anmeldedienst bereitgestellt')`,
    ),
  );
  await Promise.all(fixtureResponses);
  for (const failure of fixtureFailures) {
    if (!isCanceledFixtureResponse(failure, canceledRequests))
      errors.push('Fixture response failed: ' + (failure.error.code ?? 'unknown protocol error'));
  }
  assert.deepEqual(errors, []);
  console.log(
    'Account browser state/reload/switch/logout/error checks passed (fictional API fixtures; not live ZITADEL).',
  );
} catch (error) {
  console.error(error, diagnostics);
  throw error;
} finally {
  await closeBrowser?.().catch((error) => console.warn('Browser cleanup:', error.message));
  socket?.close();
  await stop(browser);
  await stop(server);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(
    (error) => console.warn('Temporary profile cleanup:', error.message),
  );
}
