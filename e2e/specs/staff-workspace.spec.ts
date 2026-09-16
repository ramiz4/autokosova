import { test, expect } from '../support/application';

test('staff-context preserves authorized case context across navigation, drafts, reload, language, claim and stale boundaries', async ({
  app,
  page,
}) => {
  const assigned = 'review:demo-staff-review-assigned';
  const deep = `/moderation/cases/${assigned}?queue=todo&page=1&kind=review_submission`;
  await app.login(page, 'moderator', 'de', deep);
  await expect(page).toHaveURL(app.origin + deep);
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await page.locator('input[name="garageMatches"]').check();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-back-cases]').click();
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await expect(page.locator('input[name="garageMatches"]')).toBeChecked();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-back-cases]').click();
  await expect(page.locator('[data-staff-list]')).toBeVisible();
  await expect(page.locator('[data-open-case]').first()).toBeFocused();

  // Reload and a locale URL keep only bounded queue context, never private review text or drafts.
  await page.goto(app.origin + deep);
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await page.locator('input[name="garageMatches"]').check();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('app-language-switcher button').press('Enter');
  await page.getByRole('link', { name: 'English' }).press('Enter');
  await expect(page).toHaveURL(app.origin + deep);
  await expect(page.locator('input[name="garageMatches"]')).toBeChecked();
  await expect(page.locator('[data-staff-case]')).toBeVisible();

  await app.login(page, 'admin', 'de', '/admin/cases/review:demo-staff-review-unassigned');
  await expect(page.locator('#staff-assignee')).toContainText('E2E admin');
  await expect(page.locator('[data-take-case]')).toBeEnabled();
  await page.locator('[data-take-case]').click();
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await expect(page.locator('[data-case-assignee]')).toContainText('E2E admin');

  // A current server change turns the old revision into a 409; the entered local check remains
  // visible until the reviewer deliberately reloads the authorized case.
  await app.login(page, 'moderator', 'de', deep);
  await page.locator('input[name="garageMatches"]').check();
  await page.locator('input[name="serviceMatches"]').check();
  await page.locator('input[name="visitMonthMatches"]').check();
  await expect(page.locator('[data-publish-review]')).toBeEnabled();
  const caseDetail = await (
    await page.request.get(app.origin + `/api/staff/cases/${encodeURIComponent(assigned)}`)
  ).json();
  await app.database.query('UPDATE moderation_case SET revision=revision+1 WHERE id=$1', [
    assigned,
  ]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-publish-review]').click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
  await expect(page.locator('input[name="garageMatches"]')).toBeChecked();
  await expect(page.locator('input[name="serviceMatches"]')).toBeChecked();
  await expect(page.locator('input[name="visitMonthMatches"]')).toBeChecked();
  await expect(page.locator('[data-publish-review]')).toBeDisabled();
  await expect(page.getByRole('button', { name: /Aktuellen Stand prüfen/i })).toBeVisible();
  expect(caseDetail.revision).toBeGreaterThan(0);
});
