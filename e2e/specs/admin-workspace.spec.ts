import { expect, test } from '../support/application';

async function confirm(page: import('@playwright/test').Page, selector: string) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(selector).click();
}

test('admin-context publishes the complete review in one confirmed write and keeps contextual navigation honest', async ({
  page,
  app,
}) => {
  await app.login(page, 'admin', 'de', '/admin/garages');
  await page.locator('[data-admin-query]').fill('demo-admin-garage-pending');
  await page.locator('[data-admin-search]').click();
  await page.locator('[data-admin-open-garage]').first().click();
  const editor = page.locator('[data-admin-garage] details').first();
  await editor.locator('summary').click();
  for (const key of ['phone', 'contactPerson', 'companyDocument', 'location'])
    await page.locator(`[data-admin-check="${key}"]`).selectOption('verified');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/demo-admin-garage-pending/'))
      writes.push(request.url());
  });
  await confirm(page, '[data-publish-garage]');
  await expect(page.locator('[data-admin-result]')).toContainText('Werkstatt veröffentlicht');
  expect(writes.filter((url) => url.endsWith('/decision'))).toHaveLength(1);
  expect(writes.some((url) => url.endsWith('/verification'))).toBe(false);
  await page.locator('[data-admin-tab="photos"]').click();
  await expect(page).toHaveURL(/tab=photos/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=review/);
  await expect(page.locator('[data-admin-tab="review"]')).toHaveAttribute('aria-current', 'page');
});
