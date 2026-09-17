import { expect, test } from '../support/application';

async function confirm(page: import('@playwright/test').Page, selector: string) {
  await page.locator(selector).click();
  await page.locator('[data-confirmation-confirm]').click();
}

test('admin-context publishes the complete review in one confirmed write and keeps contextual navigation honest', async ({
  page,
  app,
}) => {
  await app.login(page, 'admin');
  // A task deep link (no originating case queue lists garage checks any more; #192 moved that
  // entry point to the admin overview and the garage list itself).
  await page.goto(app.origin + '/admin/garages?garageId=demo-admin-garage-pending&tab=review');
  await expect(page).toHaveURL(/admin\/garages\?garageId=demo-admin-garage-pending/);
  await expect(page.locator('[data-admin-garage]')).toBeVisible();
  // The four checks are visible without an action selector or an intermediate save.
  await expect(page.locator('[data-admin-check="phone"]')).toBeVisible();
  await expect(page.locator('[data-review-save]')).not.toHaveAttribute('open');
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
  await page.locator('[data-admin-back]').click();
  // A task deep link has no originating garage-list page. The default bounded page need not
  // contain this garage; in that case the heading receives focus, without inventing a search.
  await expect(page.locator('main h1')).toBeFocused();
  await page.locator('[data-admin-query]').fill('demo-admin-garage-pending');
  await page.locator('[data-admin-search]').click();
  const garage = page.locator(
    '[data-admin-garage-id="demo-admin-garage-pending"] [data-admin-open-garage]',
  );
  await garage.click();
  await expect(page.locator('[data-admin-detail-heading]')).toBeVisible();
  await page.locator('[data-admin-back]').click();
  await expect(page.locator('[data-admin-query]')).toHaveValue('demo-admin-garage-pending');
  await expect(garage).toBeFocused();
});
