import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const stats = JSON.parse(
  readFileSync(new URL('../dist/autokosova/stats.json', import.meta.url), 'utf8'),
);
const featureChunks = [
  'src/app/monetization.component.ts',
  'src/app/repair-request.component.ts',
  'src/app/search-handoff.component.ts',
  'src/app/garage-profile.component.ts',
].map((source) => {
  const output = Object.entries(stats.outputs).find(
    ([file, info]) => file.endsWith('.js') && info.entryPoint === source,
  );
  assert.ok(output, `${source} must have a lazy browser entry`);
  return `/${output[0]}`;
});
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
  const scripts = new Set();
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.add(new URL(request.url()).pathname);
    if (request.resourceType() === 'document') documentRequests++;
  });
  let measured = 0;
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const prefix of ['', '/sq', '/en']) {
      scripts.clear();
      await Promise.all([
        page.waitForResponse((response) => response.url() === `${origin}/api/me`),
        page.goto(origin + (prefix || '/')),
      ]);
      featureChunks.forEach((chunk) =>
        assert.ok(!scripts.has(chunk), `Eager feature request: ${chunk}`),
      );
      await page.locator('lucide-icon svg').first().waitFor({ state: 'attached' });
      if (width < 1280) {
        const toggle = page.locator('button.mobile-menu-toggle');
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
  const documentsBeforeNavigation = documentRequests;
  await page.locator('main a[href="/en/inquiry"]:visible').first().click();
  await page.locator('#request-title').waitFor();
  assert.ok(scripts.has(featureChunks[1]), 'The inquiry chunk loads on client navigation');
  assert.equal(
    documentRequests,
    documentsBeforeNavigation,
    'Navigation must not reload the document',
  );
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
  for (const prefix of ['', '/sq', '/en']) {
    for (const path of ['/monetization', '/inquiry', '/garages', '/garages/bundle-smoke-missing']) {
      const [, response] = await Promise.all([
        page.waitForResponse((response) => response.url() === `${origin}/api/me`),
        page.goto(origin + prefix + path),
      ]);
      assert.equal(response.status(), 200);
      assert.match(await response.text(), /<main[\s>]/, `SSR content missing for ${prefix}${path}`);
      assert.equal(await page.locator('main').count(), 1);
      assert.equal(await page.locator('footer').count(), 1);
    }
  }
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
      landingExcludesFeatureChunks: true,
      clientNavigationWithoutReload: true,
      localizedLazyDeepLinks: 12,
    }),
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
