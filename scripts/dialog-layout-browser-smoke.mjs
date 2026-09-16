import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

// Isolated browser-only fixtures: no real identity, database writes or contact actions.
const cwd = fileURLToPath(new URL('..', import.meta.url));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
// An empty working directory prevents local .env files from supplying real credentials.
const serverDirectory = await mkdtemp(join(tmpdir(), 'autokosova-dialog-layout-'));
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: '',
  PORT: String(port),
  PUBLIC_SITE_URL: '',
};
for (const key of Object.keys(env)) {
  if (/^(ZITADEL_|AUTOKOSOVA_)/.test(key)) delete env[key];
}
const server = spawn(process.execPath, [join(cwd, 'dist/autokosova/server/server.mjs')], {
  cwd: serverDirectory,
  env,
  stdio: 'ignore',
});
let launchError;
server.on('error', (error) => {
  launchError = error;
});
let browser;
const errors = [];
const request = {
  id: 'dialog-layout-fixture',
  active: true,
  revision: 1,
  createdAt: '2026-09-14T12:00:00Z',
  updatedAt: '2026-09-14T12:00:00Z',
  serviceCategoryId: 'bremsen',
  symptom: 'Fiktive Anfrage für einen Layouttest.',
  symptomPreview: 'Fiktive Anfrage für einen Layouttest.',
  areas: [{ placeId: 'xk-pristina', radiusKm: 20 }],
  vehicle: { makeId: 'audi', model: 'Q7', year: 2024, vehicleClass: 'car', mileageKm: 20000 },
  earliestDropoffOn: '2026-10-02',
  latestPickupOn: '2026-10-06',
  attachmentIds: [],
};
const garage = {
  id: 'dialog-layout-garage',
  name: 'Fiktive Layout-Werkstatt',
  placeId: 'xk-pristina',
  contact: { phone: '+38344123456', whatsapp: true },
  languages: ['de', 'sq'],
  serviceCategoryIds: ['bremsen'],
  vehicleMakeIds: ['audi'],
  selfReportedSpecializations: [],
  photoIds: ['layout-photo'],
};
async function installFixtures(page) {
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('Synthetic fixture error:', error.message);
  });
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  await page.route(`${origin}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/photos/')) {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="gray"/></svg>',
      });
      return;
    }
    const json =
      path === '/api/me'
        ? {
            userId: 'dialog-layout-owner',
            displayName: 'Fiktives Layoutkonto',
            roles: ['customer'],
            garageMemberships: [],
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }
        : path === '/api/me/repair-requests'
          ? { requests: [request], nextCursor: null }
          : path.startsWith('/api/me/repair-requests/')
            ? request
            : path === `/api/public/garages/${garage.id}`
              ? garage
              : path.endsWith('/reviews')
                ? { reviews: [], nextCursor: null }
                : { garageIds: [] };
    await route.fulfill({ json });
  });
}
async function assertBodyOnlyScroll(panel) {
  await expect(panel).toBeVisible();
  const body = panel.locator('.app-dialog-body');
  await expect(body).toHaveCount(1);
  const geometry = await panel.evaluate((element) => {
    const body = element.querySelector('.app-dialog-body');
    const header = element.querySelector('.app-dialog-header');
    const footer = element.querySelector('.app-dialog-footer');
    const box = (node) => node?.getBoundingClientRect().toJSON();
    return {
      panel: box(element),
      body: box(body),
      header: box(header),
      footer: box(footer),
      viewport: { width: innerWidth, height: innerHeight },
      panelOverflow: getComputedStyle(element).overflowY,
      bodyOverflow: getComputedStyle(body).overflowY,
      contained: getComputedStyle(body).overscrollBehaviorY,
      panelScroll: element.scrollHeight - element.clientHeight,
      horizontal: element.scrollWidth - element.clientWidth,
      bodyHorizontal: body.scrollWidth - body.clientWidth,
      headerInBody: body.contains(header),
      footerInBody: !!footer && body.contains(footer),
    };
  });
  assert.equal(geometry.panelOverflow, 'hidden');
  assert.equal(geometry.bodyOverflow, 'auto');
  assert.equal(geometry.contained, 'contain');
  assert.ok(geometry.panelScroll <= 1, JSON.stringify(geometry));
  assert.ok(geometry.horizontal <= 1 && geometry.bodyHorizontal <= 1, JSON.stringify(geometry));
  assert.ok(
    geometry.panel.y >= -1 && geometry.panel.bottom <= geometry.viewport.height + 1,
    JSON.stringify(geometry),
  );
  assert.ok(
    geometry.panel.x >= -1 && geometry.panel.right <= geometry.viewport.width + 1,
    JSON.stringify(geometry),
  );
  assert.ok(geometry.body.height > 0, JSON.stringify(geometry));
  assert.equal(geometry.headerInBody, false);
  assert.equal(geometry.footerInBody, false);
  assert.ok(geometry.header.bottom <= geometry.body.y + 1, JSON.stringify(geometry));
  if (geometry.footer)
    assert.ok(geometry.body.bottom <= geometry.footer.y + 1, JSON.stringify(geometry));
  // Force long synthetic content even in naturally short confirmations/share dialogs.
  await body.evaluate((element) => {
    const content = document.createElement('p');
    content.dataset.layoutOverflow = '';
    content.textContent = 'Fiktiver langer Dialoginhalt. '.repeat(250);
    content.style.minHeight = '1400px';
    element.append(content);
    element.scrollTop = 0;
  });
  const beforeScroll = await panel.evaluate((element) => ({
    header: element.querySelector('.app-dialog-header').getBoundingClientRect().toJSON(),
    footer: element.querySelector('.app-dialog-footer')?.getBoundingClientRect().toJSON(),
  }));
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  assert.ok(await body.evaluate((element) => element.scrollTop > 0));
  const after = await panel.evaluate((element) => ({
    panelScroll: element.scrollTop,
    header: element.querySelector('.app-dialog-header').getBoundingClientRect().toJSON(),
    footer: element.querySelector('.app-dialog-footer')?.getBoundingClientRect().toJSON(),
  }));
  assert.equal(after.panelScroll, 0);
  assert.equal(after.header.y, beforeScroll.header.y);
  assert.equal(after.header.height, beforeScroll.header.height);
  if (geometry.footer) {
    assert.equal(after.footer.y, beforeScroll.footer.y);
    assert.equal(after.footer.height, beforeScroll.footer.height);
  }
  await body.evaluate((element) => {
    element.querySelector('[data-layout-overflow]').remove();
    element.scrollTop = 0;
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (server.exitCode !== null) throw new Error('Isolated SSR server exited');
    try {
      ready = (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, 'Isolated SSR fixture server must start');
  browser = await chromium.launch({ headless: true });
  for (const locale of ['de', 'sq', 'en']) {
    for (const [width, height] of [
      [1280, 900],
      [390, 844],
      [360, 640],
      [430, 844],
      [640, 450],
      [844, 390],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      await installFixtures(page);
      const prefix = locale === 'de' ? '' : `/${locale}`;
      await page.goto(`${origin}${prefix}/inquiries`);
      const trigger = page.locator('[data-inquiry-menu]');
      await trigger.click();
      await page.locator('[data-edit-inquiry]').click();
      const editor = page.locator('[data-inquiry-editor]');
      await assertBodyOnlyScroll(editor);
      await editor.locator('#edit-pickup').focus();
      assert.ok(
        await editor.locator('.app-dialog-body').evaluate((element) => element.scrollTop > 0),
      );
      assert.equal(await editor.evaluate((element) => element.scrollTop), 0);
      await page.keyboard.press('Escape');
      await expect(editor).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.locator('[data-delete-inquiry]').click();
      const deletion = page.locator('[data-delete-dialog]');
      await assertBodyOnlyScroll(deletion);
      await deletion.locator('[data-cancel-delete]').click();
      await expect(deletion).toBeHidden();
      await expect(trigger).toBeFocused();
      await page.goto(`${origin}${prefix}/garages/${garage.id}`);
      await page.locator('[data-contact-open]:visible').first().click();
      const contactDialog = page.locator('[role="dialog"][aria-labelledby="contact-dialog-title"]');
      await expect(contactDialog).toBeVisible();
      const contact = contactDialog.locator('.app-dialog-panel');
      await contact.locator('input[type="checkbox"]').check();
      await assertBodyOnlyScroll(contact);
      await contact.locator('.app-dialog-header button').click();
      await expect(contactDialog).toBeHidden();
      await page.locator('[data-share-open]').click();
      const shareDialog = page.locator('[role="dialog"][aria-labelledby="share-dialog-title"]');
      await expect(shareDialog).toBeVisible();
      const share = shareDialog.locator('.app-dialog-panel');
      await assertBodyOnlyScroll(share);
      await share.locator('.app-dialog-header button').click();
      await page.locator('[data-gallery-open]:visible').first().click();
      const gallery = page.locator('[role="dialog"]').filter({ has: page.locator('figure') });
      await expect(gallery).toBeVisible();
      const galleryFits = await gallery.evaluate((element) => {
        const nodes = element.querySelectorAll('img, figcaption, button');
        return (
          [...nodes].every((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.top >= -1 &&
              rect.left >= -1 &&
              rect.bottom <= innerHeight + 1 &&
              rect.right <= innerWidth + 1
            );
          }) && element.scrollHeight <= element.clientHeight + 1
        );
      });
      assert.ok(galleryFits, `Gallery must fit ${locale} ${width}x${height}`);
      await page.keyboard.press('Escape');
      await expect(gallery).toBeHidden();
      await page.goto(`${origin}${prefix}/garages/${garage.id}/reviews/new`);
      await page.locator('#review-service').selectOption('bremsen');
      await page.locator('app-site-header a').first().click();
      const confirmation = page.locator('[data-confirmation-dialog]');
      await assertBodyOnlyScroll(confirmation);
      await confirmation.locator('[data-confirmation-cancel]').click();
      await expect(confirmation).toBeHidden();
      await expect(page.locator('#review-service')).toHaveValue('bremsen');
      assert.equal(
        await page.evaluate(() => {
          const dialog = document.createElement('dialog');
          dialog.className = 'app-dialog-panel';
          dialog.textContent = 'Fiktiver geschlossener Dialog';
          document.body.append(dialog);
          const display = getComputedStyle(dialog).display;
          dialog.remove();
          return display;
        }),
        'none',
        'Shared layout must not reveal closed native dialogs',
      );
      await page.close();
      console.log(
        `Body-only dialog scrolling passed: ${locale} ${width}x${height} (six dialog types)`,
      );
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  if (server.pid && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGKILL');
      await exited;
    }
  }
  await rm(serverDirectory, { recursive: true, force: true });
}
