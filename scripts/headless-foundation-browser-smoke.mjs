import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const productionNegative = process.argv.includes('--production-negative');
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
  assert.ok(ready, 'The isolated SSR fixture server must start');

  const ssr = await (await fetch(`${origin}/__foundation-ui-pilot`)).text();
  if (productionNegative) {
    assert.doesNotMatch(ssr, /data-foundation-pilot/);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${origin}/__foundation-ui-pilot`);
    assert.equal(await page.locator('[data-foundation-pilot]').count(), 0);
    console.log(JSON.stringify({ passed: true, productionFixtureUnavailable: true }));
  }
  if (!productionNegative) {
    assert.match(ssr, /data-foundation-pilot/);
    assert.match(ssr, /data-foundation-dialog-trigger/);
    assert.match(ssr, /data-foundation-overlay-trigger/);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/__foundation-ui-pilot`);
    await page.locator('[data-foundation-pilot]').waitFor();

    const dialogTrigger = page.locator('[data-foundation-dialog-trigger]');
    await dialogTrigger.click();
    const dialogPanel = page.locator('[data-foundation-dialog-panel]');
    await dialogPanel.waitFor();
    assert.equal(
      await dialogPanel.evaluate((panel) => !!panel.closest('[role="dialog"]')),
      true,
      'Brain dialog content must be portaled with dialog semantics',
    );
    await page.locator('[data-foundation-native-trigger]').click();
    const nativeDialog = page.locator('[data-foundation-native-dialog]');
    await nativeDialog.waitFor();
    assert.equal(
      await nativeDialog.evaluate((dialog) => dialog.matches(':modal')),
      true,
      'Native dialog must enter the top layer above a Brain portal',
    );
    await page.locator('[data-foundation-native-close]').click();
    await page.locator('[data-foundation-dialog-close]').click();
    await dialogPanel.waitFor({ state: 'detached' });
    await assertFocused(page, '[data-foundation-dialog-trigger]');

    const overlayTrigger = page.locator('[data-foundation-overlay-trigger="below"]');
    assert.equal(await overlayTrigger.getAttribute('aria-haspopup'), null);
    await overlayTrigger.click();
    const overlayPanel = page.locator('[data-foundation-overlay-panel="below"]');
    await overlayPanel.waitFor();
    assert.equal(
      await overlayPanel.evaluate(
        (panel) => !!document.querySelector('.cdk-overlay-container')?.contains(panel),
      ),
      true,
      'Generic Overlay content must be attached to the CDK portal container',
    );
    assert.equal(
      await overlayPanel.getAttribute('role'),
      null,
      'Nonmodal overlay must not claim dialog',
    );
    await page.waitForFunction(() => {
      const anchor = document.querySelector('[data-foundation-overlay-trigger="below"]');
      const panel = document.querySelector('[data-foundation-overlay-panel="below"]');
      if (!anchor || !panel) return false;
      return panel.getBoundingClientRect().top >= anchor.getBoundingClientRect().bottom + 7;
    });
    const belowGeometry = await geometry(page, overlayTrigger, overlayPanel);
    assert.ok(
      belowGeometry.panel.y >= belowGeometry.anchor.y + belowGeometry.anchor.height + 7,
      JSON.stringify(belowGeometry),
    );
    await page.keyboard.press('Escape');
    await overlayPanel.waitFor({ state: 'detached' });
    await assertFocused(page, '[data-foundation-overlay-trigger="below"]');

    const aboveTrigger = page.locator('[data-foundation-overlay-trigger="above"]');
    await aboveTrigger.click();
    const abovePanel = page.locator('[data-foundation-overlay-panel="above"]');
    await abovePanel.waitFor();
    await page.waitForFunction(() => {
      const anchor = document.querySelector('[data-foundation-overlay-trigger="above"]');
      const panel = document.querySelector('[data-foundation-overlay-panel="above"]');
      if (!anchor || !panel) return false;
      return panel.getBoundingClientRect().bottom <= anchor.getBoundingClientRect().top - 7;
    });
    const aboveGeometry = await geometry(page, aboveTrigger, abovePanel);
    assert.ok(
      aboveGeometry.panel.y + aboveGeometry.panel.height <= aboveGeometry.anchor.y - 7,
      JSON.stringify(aboveGeometry),
    );
    await page.keyboard.press('Escape');
    await abovePanel.waitFor({ state: 'detached' });
    await assertFocused(page, '[data-foundation-overlay-trigger="above"]');

    const collapsibleTrigger = page.locator('[data-foundation-collapsible-trigger]');
    assert.equal(await collapsibleTrigger.getAttribute('aria-expanded'), 'false');
    await collapsibleTrigger.click();
    await page.locator('[data-foundation-collapsible-trigger][aria-expanded="true"]').waitFor();
    await page.locator('[data-foundation-collapsible-content]').waitFor({ state: 'visible' });

    const menuTrigger = page.locator('[data-foundation-menu-trigger]');
    await menuTrigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.locator('[data-foundation-menu]');
    await menu.waitFor();
    assert.equal(await menu.getAttribute('role'), 'menu');
    await page.keyboard.press('ArrowDown');
    await assertFocused(page, '[data-foundation-menu-close]');
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached' });
    await assertFocused(page, '[data-foundation-menu-trigger]');

    assert.deepEqual(errors, [], 'No browser runtime or hydration errors are permitted');
    console.log(
      JSON.stringify({
        passed: true,
        ssrFixture: true,
        hydrationErrors: 0,
        dialogFocusRestore: true,
        nativeDialogTopLayer: true,
        nonmodalOverlayPortal: true,
        overlayGeometry: { above: true, below: true },
        collapsibleAria: true,
        menuKeyboardFocusRestore: true,
      }),
    );
  }
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function assertFocused(page, selector) {
  const result = await page.locator(selector).evaluate((element) => ({
    actual: document.activeElement?.outerHTML,
    expected: element.outerHTML,
    focused: document.activeElement === element,
  }));
  assert.equal(result.focused, true, JSON.stringify(result));
}

async function geometry(page, anchor, panel) {
  return {
    anchor: await anchor.boundingBox(),
    panel: await panel.boundingBox(),
  };
}
