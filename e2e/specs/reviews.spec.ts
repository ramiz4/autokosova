import { randomUUID } from 'node:crypto';
import { test, expect, type App } from '../support/application';
import { api, layout, logout } from '../support/journeys';
import { staffDemoGarage, staffDemoFixtures } from '../../db/staff-demo-data.mjs';
import { reviewLabel } from '../../src/shared/review-copy';
import type { Page } from '@playwright/test';

const text =
  'DEMO – Die Arbeit war ordentlich, die Kommunikation und Preistransparenz waren aber enttäuschend.';
async function fillReview(page: Page) {
  await page.locator('#review-service').selectOption('bremsen');
  await page.locator('#review-month').fill('2026-08');
  await page.locator('#review-make').selectOption('skoda');
  for (const field of ['workQuality', 'communication', 'priceTransparency', 'punctuality'])
    await page.locator('#review-' + field).selectOption({ label: '2 / 5' });
  await page.locator('#review-text').fill(text);
  await page.locator('#review-evidence-file').setInputFiles({
    name: 'demo-visit.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(staffDemoFixtures['visit-valid']),
  });
  await page.locator('[data-upload-review-evidence]').click();
  await expect(page.locator('[data-review-evidence-uploaded]')).toBeVisible();
}
async function newReview(app: App, page: Page) {
  await app.login(page, 'customer', 'de', `/garages/${staffDemoGarage}/reviews/new`);
  await fillReview(page);
  await expect(page.locator('[data-review-overall]')).toHaveText('2.0 / 5');
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/me/reviews',
  );
  await page.locator('[data-submit-review]').click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const review = await response.json();
  await expect(page.locator('[data-review-submitted]')).toBeVisible();
  return review as { id: string; garageId: string };
}

test('review-workflow submits evidence, assigns, verifies, publishes, replies and updates through actual UI', async ({
  app,
  page,
}, info) => {
  await app.login(page, 'moderator');
  await logout(page, app.origin); // Verified directory entry, not a seeded role.
  const review = await newReview(app, page);
  expect(
    (await (await api(page, app.origin, '/api/me/reviews/' + review.id)).json()).publicationState,
  ).toBe('submitted');
  const publicBefore = await (
    await api(page, app.origin, `/api/public/garages/${staffDemoGarage}/reviews`)
  ).json();
  expect(publicBefore.reviews.some((r: { id: string }) => r.id === review.id)).toBe(false);
  await page.getByRole('link', { name: 'Meine Bewertungen', exact: true }).last().click();
  await page.locator(`[data-review-id="${review.id}"] [data-open-own-review]`).click();
  await expect(page.locator('[data-own-review-status]')).toHaveText('Eingereicht');
  await page.locator('[data-open-own-evidence]').click();
  await expect(page.locator('[data-own-evidence]')).toContainText('DEMO – kein echter Nachweis');
  await layout(page, info, 'own-review-submitted');
  await logout(page, app.origin);
  await app.login(page, 'admin');
  const row = () => page.locator(`[data-case-id="review:${review.id}"]`);
  await expect(page.locator('select[name="status"]')).toBeVisible();
  await page.locator('select[name="status"]').selectOption('submitted');
  await page
    .locator('form')
    .filter({ has: page.locator('select[name="status"]') })
    .getByRole('button')
    .click();
  await expect(row()).toBeVisible();
  await row().locator('[data-open-case]').click();
  await page.locator('#staff-assignee').selectOption(app.subjects.moderator);
  await page.locator('[data-assign]').click();
  await logout(page, app.origin);
  await app.login(page, 'moderator');
  await row().locator('[data-open-case]').click();
  await page.locator('[data-evidence]').click();
  await expect(page.locator('[data-evidence-text]')).toContainText('DEMO – kein echter Nachweis');
  await page.locator('#staff-decision-action').selectOption('publish_review');
  for (const field of ['garageMatches', 'serviceMatches', 'visitMonthMatches'])
    await page.locator(`input[name="${field}"]`).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-submit-decision]').click();
  await expect(page.locator('[data-staff-case]')).toHaveCount(0);
  await logout(page, app.origin);
  await app.login(page, 'customer');
  await page.goto(app.origin + '/reviews');
  await page.locator(`[data-review-id="${review.id}"] [data-open-own-review]`).click();
  await expect(page.locator('[data-own-review-status]')).toHaveText('Veröffentlicht');
  await page.locator('[data-start-contribution]').click();
  await page
    .locator('[data-contribution-text]')
    .fill('DEMO – Nach unserer Reklamation wurde eine Nacharbeit durchgeführt.');
  await page.locator('select[name="kind"]').selectOption('rework');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-save-contribution]').click();
  await expect(page.locator('[data-own-review-detail]')).toContainText('Nach unserer Reklamation');
  // Additional synthetic membership for this scenario only; no existing owner/demo binding is modified.
  await app.database.query(
    "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'editor','active',$3)",
    [app.subjects.garage, staffDemoGarage, app.subjects.admin],
  );
  await logout(page, app.origin);
  await app.login(page, 'garage', 'de', `/garages/${staffDemoGarage}`);
  const card = page.locator(`[data-public-review-id="${review.id}"]`);
  await expect(card).toBeVisible();
  await card.locator('[data-start-contribution]').click();
  const reply = 'DEMO – Danke für die Rückmeldung. Wir haben den Vorgang besprochen.';
  await card.locator('[data-contribution-text]').fill(reply);
  page.once('dialog', (dialog) => dialog.accept());
  await card.locator('[data-save-contribution]').click();
  await expect(card).toContainText(reply);
  await expect(card).toContainText(text);
  await expect(card).toContainText('Nach unserer Reklamation');
  await layout(page, info, 'public-review-response');
  const current = await (
    await api(page, app.origin, `/api/public/garages/${staffDemoGarage}/reviews`)
  ).json();
  const result = current.reviews.find((r: { id: string }) => r.id === review.id);
  expect(result.ratings.overall).toBe(2);
  expect(result.updates).toHaveLength(1);
  expect(result.garageResponse.text).toBe(reply);
  expect(JSON.stringify(result)).not.toContain(app.subjects.customer);
  expect(JSON.stringify(result)).not.toContain('evidenceFileId');
  await app.restart();
  await app.login(page, 'customer', 'de', '/reviews');
  await page.locator(`[data-review-id="${review.id}"] [data-open-own-review]`).click();
  await expect(page.locator('[data-own-review-status]')).toHaveText('Veröffentlicht');
  await expect(page.locator('[data-own-review-detail]')).toContainText('Nach unserer Reklamation');
});

test('review-boundaries preserve input, reject foreign access and validate localized routes and private uploads', async ({
  app,
  page,
}, info) => {
  for (const locale of ['de', 'sq', 'en'] as const) {
    const path = `${locale === 'de' ? '' : '/' + locale}/garages/${staffDemoGarage}/reviews/new`;
    await app.login(page, 'customer', locale, path);
    await expect(page).toHaveURL(app.origin + path);
    await expect(
      page.getByRole('heading', { name: reviewLabel('write', locale), exact: true }),
    ).toBeVisible();
    const document = await page.request.get(app.origin + path);
    expect(document.headers()['cache-control']).toContain('no-store');
    expect(document.headers()['x-robots-tag']).toContain('noindex');
    await page.locator('#review-text').focus();
    await expect(page.locator('#review-text')).toBeFocused();
    await layout(page, info, 'review-new-' + locale);
  }
  await page.locator('#review-evidence-file').setInputFiles({
    name: 'unknown.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Not an allowlisted fictional fixture. Must never be stored.'),
  });
  await page.locator('#review-text').fill(text);
  await page.locator('[data-upload-review-evidence]').click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
  await expect(page.locator('#review-text')).toHaveValue(text);
  await expect(page.locator('[data-submit-review]')).toBeDisabled();
  page.once('dialog', (dialog) => dialog.accept());
  await page.goto(app.origin + `/garages/${staffDemoGarage}/reviews/new`);
  const review = await newReview(app, page);
  const own = await (await api(page, app.origin, '/api/me/reviews/' + review.id)).json();
  // Retry uses the same owned proof and returns the same review, not a second visit.
  const body = {
    garageId: staffDemoGarage,
    serviceCategoryId: 'bremsen',
    visitMonth: '2026-08',
    vehicleMakeId: 'skoda',
    text,
    workQuality: 2,
    communication: 2,
    priceTransparency: 2,
    punctuality: 2,
    evidenceFileId: own.evidenceFileId,
    evidenceKind: 'invoice',
  };
  const retry = await api(page, app.origin, '/api/me/reviews', 'POST', body);
  expect(retry.status()).toBe(201);
  expect((await retry.json()).id).toBe(review.id);
  expect(
    (
      await api(page, app.origin, '/api/me/reviews', 'POST', { ...body, visitMonth: '2099-01' })
    ).status(),
  ).toBe(422);
  await logout(page, app.origin);
  await app.login(page, 'other');
  expect((await api(page, app.origin, '/api/me/reviews/' + review.id)).status()).toBe(404);
  expect(
    (await api(page, app.origin, `/api/reviews/${review.id}/evidence/download-grant`)).status(),
  ).toBe(404);
  expect((await api(page, app.origin, '/api/me/reviews', 'POST', body)).status()).toBe(404);
  expect(
    (
      await api(page, app.origin, `/api/me/reviews/${review.id}/updates`, 'POST', {
        kind: 'rework',
        text,
        requestId: randomUUID(),
      })
    ).status(),
  ).toBe(404);
  await page.goto(app.origin + '/reviews');
  await expect(page.locator(`[data-review-id="${review.id}"]`)).toHaveCount(0);
  await logout(page, app.origin);
  expect((await api(page, app.origin, '/api/me/review-evidence/sample')).status()).toBe(401);
});
