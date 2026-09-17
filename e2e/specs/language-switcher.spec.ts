import type { Locator } from '@playwright/test';
import { test, expect } from '../support/application';

test('language-switcher keeps native locale links in a nonmodal eight-pixel menu', async ({
  app,
  page,
}) => {
  const path = '/sq/help?topic=general#public-page-title';
  const ssr = await page.request.get(app.origin + path);
  expect(ssr.status()).toBe(200);
  expect(await ssr.text()).not.toContain('cdk-overlay-container');

  await page.goto(app.origin + path);
  const header = page.locator('app-site-header app-language-switcher');
  const headerDetails = header.locator('details');
  const headerTrigger = headerDetails.locator('summary');
  await expect(headerDetails).not.toHaveAttribute('open');
  await headerTrigger.focus();
  await page.keyboard.press('Enter');

  const headerPanel = headerDetails.locator('nav');
  await expect(headerPanel).toBeVisible();
  await expect(headerPanel).not.toHaveAttribute('role', 'dialog');
  await expect(headerPanel.locator('[role="menuitem"], [role="dialog"]')).toHaveCount(0);
  await expect(headerPanel.locator('a')).toHaveCount(3);
  await expect(headerPanel.locator('a').first()).toHaveAttribute(
    'href',
    '/help?topic=general#public-page-title',
  );
  await expect(headerPanel.getByRole('link', { name: 'English' })).toHaveAttribute(
    'href',
    '/en/help?topic=general#public-page-title',
  );
  await expect(headerPanel.getByRole('link', { name: 'Shqip' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(headerPanel.locator('a').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(headerPanel.locator('a').nth(1)).toBeFocused();

  const headerGeometry = await geometry(headerTrigger, headerPanel);
  expect(headerGeometry.panel.top).toBeGreaterThanOrEqual(headerGeometry.anchor.bottom + 7);
  expect(headerGeometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(headerGeometry.panel.right).toBeLessThanOrEqual(headerGeometry.viewport.width);
  await page.keyboard.press('Escape');
  await expect(headerPanel).not.toBeVisible();
  await expect(headerDetails).not.toHaveAttribute('open');
  await expect(headerTrigger).toBeFocused();

  const footer = page.locator('app-site-footer app-language-switcher');
  const footerDetails = footer.locator('details');
  const footerTrigger = footerDetails.locator('summary');
  await footerTrigger.scrollIntoViewIfNeeded();
  await footerTrigger.click();
  const footerPanel = footerDetails.locator('nav');
  await expect(footerPanel).toBeVisible();
  const footerGeometry = await geometry(footerTrigger, footerPanel);
  expect(footerGeometry.panel.bottom).toBeLessThanOrEqual(footerGeometry.anchor.top - 7);
  expect(footerGeometry.panel.left).toBeGreaterThanOrEqual(0);
  expect(footerGeometry.panel.right).toBeLessThanOrEqual(footerGeometry.viewport.width);
  await page.locator('main').click({ position: { x: 1, y: 1 } });
  await expect(footerPanel).not.toBeVisible();
  await expect(footerDetails).not.toHaveAttribute('open');
});

async function geometry(anchor: Locator, panel: Locator) {
  const [anchorBox, panelBox, viewport] = await Promise.all([
    anchor.boundingBox(),
    panel.boundingBox(),
    panel.evaluate(() => ({ height: innerHeight, width: innerWidth })),
  ]);
  if (!anchorBox || !panelBox) throw new Error('Language switcher geometry was unavailable');
  return {
    anchor: {
      bottom: anchorBox.y + anchorBox.height,
      top: anchorBox.y,
    },
    panel: {
      bottom: panelBox.y + panelBox.height,
      left: panelBox.x,
      right: panelBox.x + panelBox.width,
      top: panelBox.y,
    },
    viewport,
  };
}
