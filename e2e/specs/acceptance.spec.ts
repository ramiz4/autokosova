import { test, expect } from '../support/application';
import {
  api,
  card,
  garageButton,
  requestPath,
  garagePath,
  readyInquiries,
  readyGarages,
  inquiryAction,
  createInquiry,
  editInquiry,
  deleteInquiry,
  createGarage,
  editGarage,
  deleteGarage,
  layout,
  logout,
} from '../support/journeys';
import {
  demoAccountGarageIds as garages,
  demoAccountRequestIds as inquiries,
} from '../../scripts/db/demo-accounts.mjs';
import { inquiriesCopy } from '../../src/shared/inquiries-copy';
import { garageManagementCopy } from '../../src/shared/garage-management-copy';
import { checkActions } from '../support/actions';
import type { SavedRepairRequest } from '../../src/shared/saved-repair-request';

// Each test owns a separate database, application and browser context. No serial dependencies.
test('customer-crud creates, edits, toggles and deletes an inquiry through the UI', async ({
  app,
  page,
}, info) => {
  await app.login(page, 'customer');
  await expect(page).toHaveURL(app.origin + '/inquiries');
  const baseline = (await (await api(page, app.origin, '/api/me/repair-requests')).json()).requests;
  const id = await createInquiry(page, app.origin, 'E2E: fiktive Bremsenprüfung');
  const independentDraft = JSON.stringify({
    serviceCategoryId: 'motor',
    symptom: 'E2E independent unsaved draft',
  });
  await page.evaluate(
    (draft) => sessionStorage.setItem('autokosova.repair-request-draft.v1', draft),
    independentDraft,
  );
  await editInquiry(page, app.origin, id, 'E2E: fiktive Bremsbeläge prüfen');
  const saved = await (await api(page, app.origin, requestPath(id))).json();
  expect(saved.vehicle).toMatchObject({
    makeId: 'skoda',
    model: 'E2E Octavia',
    year: 2018,
    mileageKm: 0,
  });
  expect(saved.attachmentIds).toEqual([]);
  const originalCards = await page.locator('[data-inquiry-card]').elementHandles();
  await inquiryAction(page, id, 'toggle');
  await expect(card(page, id).locator('[data-inquiry-search-disabled]')).toBeDisabled();
  for (const originalCard of originalCards)
    expect(await originalCard.evaluate((element) => element.isConnected)).toBe(true);
  expect((await (await api(page, app.origin, requestPath(id))).json()).active).toBe(false);
  await page.reload();
  await readyInquiries(page);
  await expect(card(page, id).locator('[data-inquiry-search]')).toHaveCount(0);
  await page.locator('[data-inquiry-filter="inactive"]').click();
  await expect(card(page, id)).toBeVisible();
  await inquiryAction(page, id, 'toggle');
  await expect(card(page, id)).toHaveCount(0);
  await expect(page.locator('#inquiries-title')).toBeFocused();
  await page.locator('[data-inquiry-filter="active"]').click();
  await expect(card(page, id).locator('[data-inquiry-search]')).toBeVisible();
  expect((await (await api(page, app.origin, requestPath(id))).json()).active).toBe(true);
  await page.locator('[data-inquiry-filter="all"]').click();
  await layout(page, info, 'customer');
  await deleteInquiry(page, app.origin, id, true);
  expect(
    await page.evaluate(() => sessionStorage.getItem('autokosova.repair-request-draft.v1')),
  ).toBe(independentDraft);
  expect((await (await api(page, app.origin, '/api/me/repair-requests')).json()).requests).toEqual(
    baseline,
  );
  await logout(page, app.origin);
});

test('garage-crud creates, edits and deletes a draft through the UI', async ({
  app,
  page,
}, info) => {
  await app.login(page, 'garage');
  await expect(page).toHaveURL(app.origin + '/garages/new');
  const baseline = (await (await api(page, app.origin, '/api/me/garages')).json()).garages;
  const id = await createGarage(page, app.origin, 'E2E · Fiktive Werkstatt');
  await editGarage(page, app.origin, id, 'E2E · Bearbeitete Werkstatt');
  const garage = await (await api(page, app.origin, garagePath(id))).json();
  expect(garage.publicationState).toBe('draft');
  expect(garage.profile).toMatchObject({
    publicWhatsapp: true,
    serviceCategoryIds: ['bremsen'],
    languages: ['Deutsch'],
  });
  await layout(page, info, 'garage');
  await deleteGarage(page, app.origin, id);
  expect((await (await api(page, app.origin, '/api/me/garages')).json()).garages).toEqual(baseline);
  await logout(page, app.origin);
});

test('published-deletion removes actual public visibility and keeps the operator type after the last garage', async ({
  app,
  page,
}) => {
  await app.login(page, 'garage');
  await readyGarages(page);
  const search = () => api(page, app.origin, '/api/public/search?all=true&service=bremsen');
  expect(
    (await (await search()).json()).results.some(
      (garage: { id: string }) => garage.id === garages[0],
    ),
  ).toBe(true);
  expect((await api(page, app.origin, '/api/public/garages/' + garages[0])).status()).toBe(200);
  await expect(page.locator(`[data-public-garage][href="/garages/${garages[0]}"]`)).toBeVisible();
  for (const id of garages) await deleteGarage(page, app.origin, id);
  expect(
    (await (await search()).json()).results.some((garage: { id: string }) =>
      garages.includes(garage.id),
    ),
  ).toBe(false);
  await expect(page.locator('[data-garages-empty]')).toBeVisible();
  const identity = await (await api(page, app.origin, '/api/me')).json();
  expect(identity.accountType).toBe('garage');
  expect(identity.garageMemberships).toHaveLength(0);
  // New registration is still usable even with no remaining membership.
  const id = await createGarage(page, app.origin, 'E2E · Neuanfang');
  await deleteGarage(page, app.origin, id);
});

test('account-isolation enforces private CRUD, owner/editor, CSRF and logout boundaries', async ({
  app,
  page,
}) => {
  await app.login(page, 'customer');
  const detail: SavedRepairRequest = await (
    await api(page, app.origin, requestPath(inquiries[0]))
  ).json();
  const input = {
    serviceCategoryId: detail.serviceCategoryId,
    symptom: detail.symptom,
    earliestDropoffOn: detail.earliestDropoffOn,
    latestPickupOn: detail.latestPickupOn,
    vehicle: detail.vehicle,
    areas: detail.areas,
    attachmentIds: detail.attachmentIds,
  };
  await app.login(page, 'garage');
  const profile = (await (await api(page, app.origin, garagePath(garages[0]))).json()).profile;
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const response = await api(
      page,
      app.origin,
      requestPath(inquiries[0]),
      method,
      method === 'PUT' ? input : method === 'PATCH' ? { active: false } : undefined,
      detail.revision,
    );
    expect(response.status(), 'Foreign inquiry ' + method).toBe(404);
  }
  const csrf = await page.request.delete(app.origin + garagePath(garages[0]));
  expect(csrf.status()).toBe(403);
  expect((await csrf.json()).code).toBe('csrf_invalid');
  await app.login(page, 'customer');
  for (const method of ['GET', 'PUT', 'DELETE'])
    expect(
      (
        await api(
          page,
          app.origin,
          garagePath(garages[0]),
          method,
          method === 'PUT' ? profile : undefined,
        )
      ).status(),
    ).toBe(403);
  await expect(page.locator('[data-owned-garage]')).toHaveCount(0);
  // Editor is setup data, not an application privilege bypass or an injected session.
  await app.database.query("INSERT INTO app_user(id,oidc_subject,status) VALUES($1,$1,'active')", [
    app.subjects.editor,
  ]);
  await app.database.query(
    "INSERT INTO membership(user_id,garage_id,role,state,granted_by) VALUES($1,$2,'editor','active',$3)",
    [app.subjects.editor, garages[0], app.subjects.garage],
  );
  await app.login(page, 'editor');
  await readyGarages(page);
  await garageButton(page, garages[0]).click();
  await expect(page.locator('form')).toBeVisible();
  await expect(page.locator('[data-delete-garage]')).toHaveCount(0);
  expect((await api(page, app.origin, garagePath(garages[0]), 'DELETE')).status()).toBe(403);
  expect((await api(page, app.origin, garagePath(garages[0]), 'PUT', profile)).status()).toBe(204);
  // Same-tab account switch must not leave the previous garage data on screen.
  await app.login(page, 'other');
  await readyInquiries(page);
  await expect(page.locator('[data-inquiries-empty]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(profile.contactPerson);
  await logout(page, app.origin);
  expect((await api(page, app.origin, '/api/me/repair-requests')).status()).toBe(401);
});

test('persistent-restart preserves edits and deletions across a real app restart and demo seed', async ({
  app,
  page,
}) => {
  await app.login(page, 'customer');
  await readyInquiries(page);
  await editInquiry(page, app.origin, inquiries[0], 'E2E PERSISTENT PRIVATE REQUEST');
  await editInquiry(page, app.origin, inquiries[1], 'E2E SECOND SEEDED REQUEST');
  await deleteInquiry(page, app.origin, inquiries[1]);
  await app.login(page, 'garage');
  await readyGarages(page);
  await editGarage(page, app.origin, garages[0], 'E2E PERSISTENT GARAGE');
  await deleteGarage(page, app.origin, garages[1]);
  // Process is actually stopped; database, seed ownership and signing provider are retained.
  await app.restart();
  expect((await api(page, app.origin, '/api/me')).status()).toBe(401);
  await app.login(page, 'customer');
  await readyInquiries(page);
  await expect(card(page, inquiries[0])).toContainText('E2E PERSISTENT PRIVATE REQUEST');
  await expect(card(page, inquiries[1])).toHaveCount(0);
  expect((await api(page, app.origin, requestPath(inquiries[1]))).status()).toBe(404);
  await app.login(page, 'garage');
  await readyGarages(page);
  await expect(garageButton(page, garages[0])).toHaveAttribute(
    'aria-label',
    /E2E PERSISTENT GARAGE/,
  );
  await expect(garageButton(page, garages[1])).toHaveCount(0);
  expect((await api(page, app.origin, garagePath(garages[1]))).status()).toBe(403);
  await garageButton(page, garages[0]).click();
  await expect(page.locator('#garage-name')).toHaveValue('E2E PERSISTENT GARAGE');
});

test('localized-navigation checks both account types, explicit destinations, keyboard, SSR privacy and viewports', async ({
  app,
  page,
}, info) => {
  test.setTimeout(180_000);
  // Preserve the previously verified 360/390/430/1280 action-menu viewports.
  for (const width of info.project.name === 'mobile' ? [360, 390, 430] : [1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['de', 'sq', 'en'] as const) {
      const prefix = locale === 'de' ? '' : '/' + locale;
      await app.login(page, 'customer', locale);
      await expect(page).toHaveURL(app.origin + prefix + '/inquiries');
      await readyInquiries(page);
      await expect(page.locator('#inquiries-title')).toHaveText(inquiriesCopy[locale].title);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const inactive = await (await api(page, app.origin, requestPath(inquiries[1]))).json();
      if (inactive.active)
        expect(
          (
            await api(
              page,
              app.origin,
              requestPath(inquiries[1]),
              'PATCH',
              { active: false },
              inactive.revision,
            )
          ).status(),
        ).toBe(200);
      await page.reload();
      await readyInquiries(page);
      await checkActions(page, inquiries[0], inquiries[1], locale);
      await layout(page, info, locale + '-' + width + '-customer');
      const menu = card(page, inquiries[0]).locator('[data-inquiry-menu]');
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(card(page, inquiries[0]).locator('[data-delete-inquiry]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await inquiryAction(page, inquiries[0], 'edit');
      await expect(page.locator('[data-inquiry-editor]')).toBeVisible();
      await expect(page.locator('#edit-service')).toBeFocused();
      await layout(page, info, locale + '-' + width + '-editor');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-inquiry-editor]')).toHaveCount(0);
      const source = await page.request.get(app.origin + prefix + '/inquiries');
      expect(source.headers()['cache-control']).toBe('private, no-store');
      expect(source.headers()['x-robots-tag']).toBe('noindex, nofollow');
      expect(await source.text()).not.toContain(app.subjects.customer);
      await app.login(page, 'garage', locale);
      await expect(page).toHaveURL(app.origin + prefix + '/garages/new');
      await readyGarages(page);
      await expect(page.locator('#form-title')).toHaveText(garageManagementCopy[locale].title);
      await expect(page.locator('[data-garage-status][data-state="published"]')).toHaveCount(2);
      await layout(page, info, locale + '-' + width + '-garage');
      await app.login(page, 'garage', locale, prefix + '/inquiries');
      await expect(page).toHaveURL(app.origin + prefix + '/inquiries');
      await expect(page.locator('[data-inquiries-empty]')).toBeVisible();
      await app.login(page, 'customer', locale, prefix + '/inquiry');
      await expect(page).toHaveURL(app.origin + prefix + '/inquiry');
      await expect(page.locator('form')).toBeVisible();
    }
  }
});

test('error-feedback preserves unsaved edits on network, conflict, permission and CSRF failures', async ({
  app,
  page,
}) => {
  await app.login(page, 'customer');
  await readyInquiries(page);
  await inquiryAction(page, inquiries[0], 'edit');
  await expect(page.locator('[data-save-inquiry]')).toBeDisabled();
  await page.locator('#edit-symptom').fill('E2E UNSAVED TEXT');
  // Controlled failure only. Successful CRUD responses in this suite always come from the app.
  const target = app.origin + requestPath(inquiries[0]);
  await page.route(target, (route) =>
    route.request().method() === 'PUT' ? route.abort('failed') : route.continue(),
  );
  await page.locator('[data-save-inquiry]').click();
  await expect(page.locator('dialog [role="alert"]')).toContainText(inquiriesCopy.de.writeError);
  await expect(page.locator('#edit-symptom')).toHaveValue('E2E UNSAVED TEXT');
  await page.unroute(target);
  const current: SavedRepairRequest = await (
    await api(page, app.origin, requestPath(inquiries[0]))
  ).json();
  expect(
    (
      await api(
        page,
        app.origin,
        requestPath(inquiries[0]),
        'PATCH',
        { active: false },
        current.revision,
      )
    ).status(),
  ).toBe(200);
  await page.locator('[data-save-inquiry]').click();
  await expect(page.locator('dialog [role="alert"]')).toContainText(inquiriesCopy.de.conflict);
  await expect(page.locator('#edit-symptom')).toHaveValue('E2E UNSAVED TEXT');
  expect((await (await api(page, app.origin, requestPath(inquiries[0]))).json()).symptom).toBe(
    current.symptom,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-discard-edit]')).toBeVisible();
  await page.getByRole('button', { name: inquiriesCopy.de.keepEditing, exact: true }).click();
  await expect(page.locator('#edit-symptom')).toHaveValue('E2E UNSAVED TEXT');
  await page.keyboard.press('Escape');
  await page.locator('[data-discard-edit]').click();
  await app.login(page, 'garage');
  await readyGarages(page);
  await garageButton(page, garages[0]).click();
  const name = await page.locator('#garage-name').inputValue();
  await page.locator('#garage-name').fill('E2E UNSAVED GARAGE');
  const original = (await page.context().cookies(app.origin)).find(
    (cookie) => cookie.name === 'autokosova_csrf',
  )!;
  // Tamper with CSRF for a negative test; never inject an authenticated session.
  await page.context().addCookies([{ ...original, value: 'invalid-csrf' }]);
  await page.locator('[data-save-garage]').click();
  await expect(page.locator('form [role="alert"]')).toHaveText(garageManagementCopy.de.csrfError);
  await page.context().addCookies([original]);
  await app.database.query(
    "UPDATE membership SET state='revoked' WHERE user_id=$1 AND garage_id=$2",
    [app.subjects.garage, garages[0]],
  );
  await page.locator('[data-save-garage]').click();
  await expect(page.locator('form [role="alert"]')).toHaveText(garageManagementCopy.de.forbidden);
  await expect(page.locator('#garage-name')).toHaveValue('E2E UNSAVED GARAGE');
  await expect(page.locator('form a[href^="/auth/login"]')).toHaveCount(0);
  expect(
    (await app.database.query('SELECT name FROM garage WHERE id=$1', [garages[0]])).rows[0].name,
  ).toBe(name);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('[data-cancel-garage]').click();
  await expect(page.locator('#garage-name')).toHaveValue('E2E UNSAVED GARAGE');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-cancel-garage]').click();
  await expect(page.locator('form')).toHaveCount(0);
});

test('late-response cannot restore private garage data after another tab changes account', async ({
  app,
  page,
}) => {
  await app.login(page, 'garage');
  await readyGarages(page);
  const target = app.origin + garagePath(garages[0]);
  let release!: () => void;
  let fetched!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    fetched = resolve;
  });
  let responseName = '';
  await page.route(target, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    responseName = (await response.json()).profile.name;
    fetched();
    await held;
    await route.fulfill({ response }); // The actual authorized response, only delayed.
  });
  await garageButton(page, garages[0]).click();
  await reached;
  const other = await page.context().newPage();
  try {
    await app.login(other, 'other');
    await readyInquiries(other);
    await page.bringToFront();
    // Trigger the real browser lifecycle listener; do not replace account/API state.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('[data-account-trigger]')).toContainText('E2E other');
    release();
    await expect(page.locator('#garage-name')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText(responseName);
    await expect(page.locator('[data-delete-garage]')).toHaveCount(0);
    await page.unroute(target);
    await logout(other, app.origin);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('body')).not.toContainText(responseName);
  } finally {
    release();
    await other.close();
  }
});
