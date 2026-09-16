import { test, expect } from '../support/application';
import type { Page } from '@playwright/test';
import { adminLabel } from '../../src/shared/admin-copy';
import { onboardingCopy } from '../../src/shared/onboarding-copy';

async function confirm(page: Page, selector: string) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(selector).click();
}
async function openGarage(page: Page, id: string) {
  await page.locator('[data-admin-query]').fill(id);
  await page.locator('[data-admin-search]').click();
  await page.locator(`[data-admin-garage-id="${id}"] [data-admin-open-garage]`).click();
  await expect(page.locator('[data-admin-garage]')).toBeVisible();
  await openReviewEditor(page);
  await expect(page.locator('[data-admin-reason]')).toBeEnabled();
}
async function openReviewEditor(page: Page) {
  const editor = page.locator('[data-admin-garage] details').first();
  if (!(await editor.evaluate((element) => (element as HTMLDetailsElement).open)))
    await editor.locator('summary').click();
}
async function reason(page: Page, value: string, selector = '[data-admin-reason]') {
  await page.locator(selector).selectOption(value);
}

test('admin-workflow verifies garages, checks evidence, decides photos, suspends/restores and transfers ownership', async ({
  page,
  app,
}, testInfo) => {
  await app.login(page, 'admin');
  await expect(page.locator('[data-admin-overview]')).toBeVisible();
  await page.locator('app-admin-navigation a[href="/admin/garages"]').click();
  await expect(page.locator('[data-admin-garage-list]')).toBeVisible();
  const id = 'demo-admin-garage-pending';
  await openGarage(page, id);
  await page.locator('[data-company-document]').first().click();
  await expect(page.locator('[data-company-evidence]')).toContainText(
    'DEMO – kein echter Nachweis',
  );
  for (const key of ['phone', 'contactPerson', 'companyDocument', 'location'])
    await page.locator(`[data-admin-check="${key}"]`).selectOption('verified');
  await reason(page, 'company_verified');
  await page.locator('[data-save-checks]').click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(app.origin + '/api/admin/management/garages/' + id)).json())
          .verification.phone,
    )
    .toBe('verified');
  await expect(page.locator('[data-admin-reason]')).toHaveValue('');
  await confirm(page, '[data-publish-garage]');
  await expect(page.locator('[data-suspend-garage]')).toBeVisible();
  expect((await page.request.get(app.origin + '/api/public/garages/' + id)).status()).toBe(200);
  await page.locator('[data-admin-tab="photos"]').click();
  await reason(page, 'company_verified', '[name="photoReason"]');
  await confirm(page, '[data-approve-photo]');
  await expect
    .poll(
      async () =>
        (await (await page.request.get(app.origin + '/api/admin/management/garages/' + id)).json())
          .photos[0].visibility,
    )
    .toBe('approved');
  await expect(page.locator('[data-admin-reason]')).toHaveValue('');
  await page.locator('[data-admin-tab="review"]').click();
  await openReviewEditor(page);
  await reason(page, 'policy_violation', '[data-admin-decision-reason]');
  await confirm(page, '[data-suspend-garage]');
  await expect(page.locator('[data-restore-garage]')).toBeVisible();
  expect((await page.request.get(app.origin + '/api/public/garages/' + id)).status()).toBe(404);
  await reason(page, 'company_verified', '[data-admin-decision-reason]');
  await confirm(page, '[data-restore-garage]');
  await expect(page.locator('[data-suspend-garage]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('admin-garage.png'), fullPage: true });
  await page.locator('[data-admin-back]').click();
  await openGarage(page, 'demo-admin-garage-members');
  await page.locator('[data-admin-tab="team"]').click();
  await page.locator('#target-user').fill('demo-admin-next-owner');
  await page.locator('#target-user-option-0').click();
  const [transferResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url() ===
          app.origin + '/api/admin/management/garages/demo-admin-garage-members/ownership' &&
        r.request().method() === 'POST',
    ),
    confirm(page, '[data-transfer-owner]'),
  ]);
  expect(transferResponse.status()).toBe(204);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              app.origin + '/api/admin/management/garages/demo-admin-garage-members',
            )
          ).json()
        ).members.find((m: { userId: string }) => m.userId === 'demo-admin-next-owner')?.role,
    )
    .toBe('owner');
  await page.locator('[data-admin-back]').click();
  await openGarage(page, 'demo-admin-garage-incomplete');
  await reason(page, 'missing_information', '[data-admin-decision-reason]');
  await confirm(page, '[data-reject-garage]');
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              app.origin + '/api/admin/management/garages/demo-admin-garage-incomplete',
            )
          ).json()
        ).publicationState,
    )
    .toBe('rejected');
  // Reuse the ordinary garage editor through a documented support request, not impersonation.
  await page.locator('app-admin-navigation a[href="/admin/support"]').click();
  await page.locator('[data-support-applicant]').selectOption('demo-admin-owner');
  await page.locator('[data-support-reference]').fill('SYNTHETIC-SUPPORT-REQUEST');
  await page.locator('[data-start-support]').click();
  await page.locator('#garage-name').fill('DEMO – Assistentenaufnahme');
  await page.locator('#garage-place').selectOption('xk-pristina');
  await page.locator('#garage-street').fill('DEMO Straße 12 Prishtina');
  await page.locator('#garage-person').fill('DEMO Ansprechpartner');
  await page.locator('#garage-phone').fill('+99900000001');
  for (const [control, option] of [
    ['garage-services', 'Bremsen'],
    ['garage-languages', 'Deutsch'],
  ]) {
    await page.locator('#' + control).click();
    const panel = page.locator('#' + control + '-panel');
    await panel.getByRole('checkbox', { name: option, exact: true }).check();
    await panel.getByRole('button', { name: onboardingCopy.de.close, exact: true }).click();
  }
  await page.locator('input[name="consent"]').check();
  const [supportResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url() === app.origin + '/api/admin/garages/assisted-onboarding' &&
        r.request().method() === 'POST',
    ),
    page.locator('[data-save-garage]').click(),
  ]);
  expect(supportResponse.status()).toBe(201);
  const supportId = (await supportResponse.json()).id;
  await expect(page.locator('[data-admin-detail-heading]')).toContainText('Assistentenaufnahme');
  const support = await (
    await page.request.get(app.origin + '/api/admin/management/garages/' + supportId)
  ).json();
  expect(support.members.some((m: { userId: string }) => m.userId === app.subjects.admin)).toBe(
    false,
  );
  await app.restart();
  await app.login(page, 'admin');
  const after = await (
    await page.request.get(app.origin + '/api/admin/management/garages/' + id)
  ).json();
  expect(after.publicationState).toBe('published');
  expect(after.photos[0].visibility).toBe('approved');
});

test('admin-boundaries checks staff separation, takeover, policy gates and localized private pages', async ({
  page,
  app,
}, testInfo) => {
  expect((await page.request.get(app.origin + '/api/admin/management/users')).status()).toBe(401);
  for (const role of ['customer', 'moderator'] as const) {
    await app.login(page, role, 'de', '/admin/garages');
    expect((await page.request.get(app.origin + '/api/admin/management/users')).status()).toBe(403);
    await expect(page.locator('[data-admin-garage-list]')).toHaveCount(0);
  }
  await app.login(page, 'admin');
  await page
    .locator('[data-case-id="review:demo-staff-review-unassigned"] [data-open-case]')
    .click();
  await page.locator('[data-take-case]').click();
  await expect(page.locator('[data-staff-case]')).toBeVisible();
  await expect(page.locator('[data-case-heading]')).toContainText('DEMO');
  await expect(page.locator('[data-case-assignee]')).toContainText('Admin');
  await expect(page.locator('[data-take-case]')).toHaveCount(0);
  await page.locator('app-admin-navigation a[href="/admin/privacy"]').click();
  await expect(page.locator('[data-admin-deletions]')).toBeVisible();
  const request = page.locator('[data-deletion-id="demo-admin-deletion-policy"]');
  await expect(request.locator('[data-process-deletion]')).toHaveCount(0);
  await page.locator('[data-policy-secondary] button').click();
  await expect(page.locator('[data-save-policy]')).toBeDisabled();
  await page.locator('[name="policyVersion"]').fill('SYNTHETIC-E2E-ONLY');
  await page
    .locator('[name="approvalReference"]')
    .fill('SYNTHETIC TEST NOT REAL OPERATOR APPROVAL');
  for (const key of [
    'reviewEvidenceRetentionDays',
    'repairRequestRetentionDays',
    'reportRetentionDays',
    'auditLogRetentionDays',
  ])
    await page.locator(`[data-policy-duration="${key}"]`).fill('30');
  await page.locator('[name="publicReviewHandling"]').selectOption('delete');
  await expect(page.locator('[data-save-policy]')).toBeDisabled();
  await page.locator('[name="approvalConfirmed"]').check();
  await confirm(page, '[data-save-policy]');
  await request.getByRole('button', { name: adminLabel('open', 'de'), exact: true }).click();
  const selected = page.locator('[data-privacy-context]');
  await expect(selected.locator('[data-process-deletion]')).toBeVisible();
  await confirm(page, '[data-privacy-context] [data-process-deletion]');
  await expect(selected).toContainText(adminLabel('completed', 'de'));
  await expect(selected.locator('[data-process-deletion]')).toHaveCount(0);
  for (const language of ['de', 'sq', 'en'] as const) {
    const prefix = language === 'de' ? '' : '/' + language;
    await app.login(page, 'admin', language, prefix + '/admin/users');
    await expect(page.locator('main h1')).toHaveText(adminLabel('users', language));
    await expect(page.locator('[data-admin-users]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath('admin-users-' + language + '.png'),
      fullPage: true,
    });
  }
  await app.login(page, 'moderator', 'de', '/admin/users');
  await expect(page.locator('[data-admin-users]')).toHaveCount(0);
});
