import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
  cwd,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(`${origin}/health`)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Our isolated SSR server must start');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let measured = 0;
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const prefix of ['', '/sq', '/en']) {
      await page.goto(origin + (prefix || '/'));
      await page.locator('lucide-icon svg').first().waitFor({ state: 'attached' });
      if (width < 1280) {
        const toggle = page.locator('button[aria-controls="mobile-navigation"]');
        await toggle.click();
        await toggle.locator('svg.lucide-x').waitFor();
        await toggle.click();
        await toggle.locator('svg.lucide-menu').waitFor();
      }
      const measurements = await page.locator('lucide-icon').evaluateAll((elements) =>
        elements
          .map((host) => {
            const svg = host.querySelector('svg');
            const h = host.getBoundingClientRect(),
              s = svg.getBoundingClientRect();
            return {
              width: h.width,
              height: h.height,
              svgWidth: s.width,
              svgHeight: s.height,
              color: getComputedStyle(host).color,
              stroke: getComputedStyle(svg).stroke,
              overflow: document.documentElement.scrollWidth > innerWidth,
            };
          })
          .filter((icon) => icon.width && icon.height),
      );
      assert.ok(measurements.length > 5);
      for (const icon of measurements) {
        assert.ok(Math.abs(icon.width - icon.svgWidth) < 0.1, JSON.stringify(icon));
        assert.ok(Math.abs(icon.height - icon.svgHeight) < 0.1, JSON.stringify(icon));
        assert.equal(icon.color, icon.stroke);
        assert.equal(icon.overflow, false);
      }
      measured += measurements.length;
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/inquiry');
  const vehicles = page.locator('lucide-icon.h-8.w-12');
  await vehicles.first().waitFor();
  assert.equal(await vehicles.count(), 5);
  const vehicleSizes = await vehicles.evaluateAll((elements) =>
    elements.map((el) => {
      const host = el.getBoundingClientRect(),
        svg = el.querySelector('svg').getBoundingClientRect();
      return [host.width, host.height, svg.width, svg.height];
    }),
  );
  vehicleSizes.forEach((size) => assert.deepEqual(size, [48, 32, 48, 32]));
  const fill = await vehicles.first().evaluate((host) => {
    const svg = host.querySelector('svg');
    const before = getComputedStyle(svg).fill;
    host.style.setProperty('--lucide-fill', 'currentColor');
    const after = getComputedStyle(svg).fill;
    return { before, after, color: getComputedStyle(host).color };
  });
  assert.equal(fill.before, 'none');
  assert.equal(fill.after, fill.color);
  assert.deepEqual(errors, [], 'No hydration or browser runtime errors');
  console.log(
    JSON.stringify({
      passed: true,
      locales: ['de', 'sq', 'en'],
      viewports: [390, 1440],
      measuredIcons: measured,
      vehicleIcons: 5,
      signalMenuSwitches: 6,
      fillInheritance: true,
    }),
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
