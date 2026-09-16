import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['dist/autokosova/server/server.mjs'], {
  cwd,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

const profile = {
  contact: {},
  id: 'gallery-fixture',
  languages: ['Deutsch'],
  name: 'Galerie Testwerkstatt',
  photoIds: ['photo-a', 'photo-b'],
  placeId: 'xk-peja',
  selfReportedSpecializations: [],
  serviceCategoryIds: [],
  vehicleMakeIds: [],
};

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
  assert.ok(ready, 'The local SSR server must start');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/public/garages/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/reviews'))
      return route.fulfill({ json: { hasMore: false, page: 1, reviews: [] } });
    if (/^\/api\/public\/garages\/[^/]+$/u.test(pathname)) return route.fulfill({ json: profile });
    return route.continue();
  });

  await page.goto(`${origin}/garages/${profile.id}`);
  const trigger = page.locator('#photos button').first();
  await trigger.waitFor();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Fotos' });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  await assertFocused(page, '[data-gallery-close]');

  const controls = dialog.locator('button');
  await page.keyboard.press('Tab');
  await assertFocusedLocator(page, controls.nth(1));
  await page.keyboard.press('Tab');
  await assertFocusedLocator(page, controls.nth(2));
  await page.keyboard.press('Tab');
  await assertFocused(page, '[data-gallery-close]');
  await page.keyboard.press('Shift+Tab');
  await assertFocusedLocator(page, controls.nth(2));

  await page.keyboard.press('ArrowRight');
  await assertCaption(dialog, 'Foto 2 von 2');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await assertFocusedLocator(page, trigger);

  await trigger.click();
  await dialog.waitFor();
  await trigger.evaluate((element) => element.remove());
  await page.goto(`${origin}/garages/gallery-other`);
  await page.locator('app-garage-profile #photos button').first().waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Fotos' }).count(), 0);
  assert.deepEqual(errors, [], 'No browser runtime or hydration errors are permitted');
  console.log(
    JSON.stringify({
      passed: true,
      modalName: true,
      tabCycle: true,
      arrowNavigation: true,
      escapeFocusReturn: true,
      routeChangeFallback: true,
    }),
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function assertCaption(dialog, expected) {
  await dialog.locator('figcaption').filter({ hasText: expected }).waitFor();
}

async function assertFocused(page, selector) {
  await assertFocusedLocator(page, page.locator(selector));
}

async function assertFocusedLocator(page, locator) {
  const focused = await locator.evaluate((element) => document.activeElement === element);
  assert.equal(
    focused,
    true,
    `Expected focus on ${await locator.evaluate((element) => element.outerHTML)}`,
  );
}
