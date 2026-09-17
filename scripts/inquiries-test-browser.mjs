import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

export async function until(check, label) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}
export async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([ended, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await ended;
  }
}

/** Native CDP driver; does not intercept or replace application API responses. */
export async function startBrowser(port, environment) {
  const chrome = [
    process.env.CHROME_BIN,
    'google-chrome',
    'chromium',
    'chromium-browser',
    // Playwright is already the supported local browser runtime for the other smoke suites.
    // Its executable remains a native Chromium/CDP target; we only use it as a fallback.
    chromium.executablePath(),
  ].find(
    (candidate) =>
      candidate && spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0,
  );
  assert.ok(chrome, 'Chrome/Chromium is required');
  const profile = await mkdtemp(join(tmpdir(), 'autokosova-db-browser-'));
  const origin = `http://127.0.0.1:${port}`;
  let browser, server, socket, command;
  const errors = [];
  const cleanup = async () => {
    await command?.('Browser.close').catch(() => undefined);
    socket?.close();
    await stop(browser);
    await stop(server);
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
      env: { ...process.env, ...environment, PORT: String(port), NODE_ENV: 'test' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await until(
      async () => (await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) })).ok,
      'SSR readiness',
    );
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
      { stdio: ['ignore', 'ignore', 'ignore'] },
    );
    const target = await until(async () => {
      const debugPort = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(
        '\n',
      )[0];
      return (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(
        (item) => item.type === 'page',
      );
    }, 'Chrome target');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') errors.push('Browser runtime exception');
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    });
    command = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Chrome timeout: ' + method));
        }, 10000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      assert.ok(!result.exceptionDetails, 'Browser expression failed');
      return result.result.value;
    }
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Page.bringToFront');
    await command('Emulation.setFocusEmulationEnabled', { enabled: true });
    return {
      origin,
      command,
      evaluate,
      errors,
      close: cleanup,
      async click(selector) {
        await until(
          () => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),
          'click target ' + selector,
        );
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      },
      async fill(selector, value) {
        await evaluate(
          `(() => {const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
      },
      async key(key, code) {
        await command('Input.dispatchKeyEvent', {
          type: key === 'Enter' ? 'keyDown' : 'rawKeyDown',
          key,
          code: key,
          windowsVirtualKeyCode: code,
          ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
        });
        await command('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          code: key,
          windowsVirtualKeyCode: code,
        });
      },
      async navigate(path, ready) {
        // Do not accept the previous DOM when navigating/reloading the same URL.
        await evaluate('window.__inquiriesPreviousDocument = true');
        await command('Page.navigate', { url: origin + path });
        await until(
          () =>
            evaluate(
              `!window.__inquiriesPreviousDocument && document.readyState === 'complete' && location.pathname === ${JSON.stringify(path.split('?')[0])} && (${ready})`,
            ),
          'navigation ' + path,
        );
      },
      async screenshot(path, width, viewportOnly = false) {
        await mkdir(join(path, '..'), { recursive: true });
        const { cssContentSize } = await command('Page.getLayoutMetrics');
        const image = await command('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: !viewportOnly,
          clip: { x: 0, y: 0, width, height: viewportOnly ? 900 : cssContentSize.height, scale: 1 },
        });
        await writeFile(path, Buffer.from(image.data, 'base64'));
      },
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
