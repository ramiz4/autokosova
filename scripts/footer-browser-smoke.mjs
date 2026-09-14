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
assert.ok(chrome, 'Install Chrome/Chromium or set CHROME_BIN to run footer browser checks.');

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
const profile = await mkdtemp(join(tmpdir(), 'autokosova-footer-'));
const screenshots = 'test-results/footer';
const selector = 'app-site-footer app-language-switcher';
let server;
let browser;
let socket;
let launchError;

try {
  server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
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
    { stdio: 'ignore' },
  );
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
    for (const type of ['keyDown', 'keyUp']) {
      await command('Input.dispatchKeyEvent', { type, key: name, windowsVirtualKeyCode: code });
    }
  }
  await command('Page.enable');
  await mkdir(screenshots, { recursive: true });
  for (const locale of ['de', 'sq', 'en']) {
    for (const width of [360, 390, 430, 1280, 1448]) {
      const path = `${locale === 'de' ? '' : `/${locale}`}/privacy`;
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 640,
      });
      await command('Page.navigate', { url: origin + path });
      const ready = `document.readyState === 'complete' &&
        document.documentElement.lang === '${locale}' &&
        !!document.querySelector('app-site-footer a[href="${path}"]')`;
      await until(() => evaluate(ready), `${locale} ${width}px page rendering`);
      const geometry = await evaluate(`(() => {
        const footer = document.querySelector('app-site-footer footer');
        footer.scrollIntoView();
        const visible = (element) => element.getClientRects().length &&
          (!element.closest('details:not([open])') || element.tagName === 'SUMMARY');
        const controls = [...footer.querySelectorAll('a, button, summary')].filter(visible);
        const columns = [...footer.querySelector('nav').children];
        const rect = footer.getBoundingClientRect();
        return {
          count: document.querySelectorAll('footer').length,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          smallTargets: controls.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.height < 44 || box.width < 44;
          }).map((element) => element.textContent.trim()),
          clipped: [...footer.querySelectorAll('a, p, h2, summary')]
            .filter((element) => visible(element) &&
              element.scrollWidth > element.clientWidth + 1)
            .map((element) => element.textContent.trim()),
          columns: columns.map((element) => element.getBoundingClientRect().top),
          clip: { x: rect.left + scrollX, y: rect.top + scrollY,
            width: rect.width, height: rect.height, scale: 1 }
        };
      })()`);
      assert.equal(geometry.count, 1);
      assert.equal(geometry.overflow, false, `${locale} ${width}px page overflow`);
      assert.deepEqual(geometry.smallTargets, [], `${locale} ${width}px touch targets`);
      assert.deepEqual(geometry.clipped, [], `${locale} ${width}px clipped text`);
      assert.equal(geometry.columns[0], geometry.columns[1]);
      if (width < 640) assert.ok(geometry.columns[2] > geometry.columns[0]);
      else assert.equal(geometry.columns[0], geometry.columns[2]);
      await evaluate(`document.querySelector('${selector} summary').focus()`);
      await key('Enter', 13);
      const isOpen = `document.querySelector('${selector} details').open`;
      await until(() => evaluate(isOpen), 'keyboard language menu opening');
      const menuInBounds = await evaluate(`(() => {
        const switcher = document.querySelector('${selector}');
        const menu = switcher.querySelector('nav').getBoundingClientRect();
        const toggle = switcher.querySelector('summary').getBoundingClientRect();
        return menu.bottom <= toggle.top && menu.top >= 0 &&
          menu.left >= 0 && menu.right <= innerWidth;
      })()`);
      assert.ok(menuInBounds, `${locale} ${width}px language menu position`);
      await key('Tab', 9);
      assert.ok(await evaluate(`document.activeElement.matches('${selector} a')`));
      // Retrying Escape also waits for hydration to attach the Angular key handler.
      await until(async () => {
        await key('Escape', 27);
        return evaluate(`!document.querySelector('${selector} details').open &&
          document.activeElement === document.querySelector('${selector} summary')`);
      }, 'Escape and focus restoration');
      const focusVisible = await evaluate(`document.activeElement.matches(':focus-visible') &&
        parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 2`);
      assert.ok(focusVisible, `${locale} ${width}px visible keyboard focus`);
      const image = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: geometry.clip,
      });
      await writeFile(join(screenshots, `${locale}-${width}.png`), Buffer.from(image.data, 'base64'));
      console.log(`Footer browser checks passed: ${locale}, ${width}px`);
    }
  }
} finally {
  socket?.close();
  await stop(browser);
  await stop(server);
  await rm(profile, { recursive: true, force: true });
}
