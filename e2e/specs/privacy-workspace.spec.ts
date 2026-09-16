import { expect, test } from '../support/application';
import type { Page } from '@playwright/test';
import { adminLabel } from '../../src/shared/admin-copy';

async function confirm(page: Page, selector: string) {
  await page.locator(selector).click();
  await page.locator('[data-confirmation-confirm]').click();
}

test('privacy-context opens a bounded ownership blocker, returns from team context and refreshes it', async ({
  page,
  app,
}) => {
  await app.login(page, 'admin', 'de', '/admin/privacy');
  await expect(page.locator('[data-admin-deletions]')).toBeVisible();

  // The synthetic policy is deliberately marked as a test value; no production policy is implied.
  await page.locator('[data-policy-secondary] button').click();
  await page.locator('[name="policyVersion"]').fill('SYNTHETIC-PRIVACY-CONTEXT');
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
  await page.locator('[name="approvalConfirmed"]').check();
  await confirm(page, '[data-save-policy]');
  await expect(page.locator('[data-admin-result]')).toContainText(adminLabel('policySaved', 'de'));

  await page.locator('[name="deletionStatus"]').selectOption('blocked');
  const blocked = page.locator('[data-deletion-id="demo-admin-deletion-ownership"]');
  await blocked.getByRole('button', { name: adminLabel('open', 'de'), exact: true }).click();
  const context = page.locator('[data-privacy-context]');
  await expect(context).toContainText('SYNTHETIC-PRIVACY-CONTEXT');
  await expect(context.getByRole('link').first()).toBeVisible();
  await context.getByRole('link').first().click();
  await expect(page.locator('[data-admin-garage]')).toBeVisible();
  await page
    .getByRole('link', { name: adminLabel('returnDeletionRequest', 'de'), exact: true })
    .click();
  await expect(page.locator('[data-privacy-context]')).toBeVisible();
  await page
    .locator('[data-privacy-context]')
    .getByRole('button', { name: adminLabel('refreshPrerequisites', 'de'), exact: true })
    .click();
  await expect(page.locator('[data-privacy-context]')).toContainText(
    adminLabel('manual_content_decision_required', 'de'),
  );
});
