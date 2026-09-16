import { expect, type APIResponse, type Page, type TestInfo } from '@playwright/test';
import { requestCopy } from '../../src/shared/request-copy';
import { onboardingCopy } from '../../src/shared/onboarding-copy';
import { inquiriesCopy } from '../../src/shared/inquiries-copy';
import { garageManagementCopy } from '../../src/shared/garage-management-copy';
import { translate } from '../../src/shared/i18n';

export const card = (page: Page, id: string) => page.locator(`[data-inquiry-id="${id}"]`);
export const garageButton = (page: Page, id: string) => page.locator(`[data-garage-menu="${id}"]`);
export const requestPath = (id: string) => '/api/me/repair-requests/' + encodeURIComponent(id);
export const garagePath = (id: string) => '/api/garages/' + encodeURIComponent(id);

export async function api(
  page: Page,
  origin: string,
  path: string,
  method = 'GET',
  data?: unknown,
  revision?: number,
): Promise<APIResponse> {
  const csrf =
    (await page.context().cookies(origin)).find((cookie) => cookie.name === 'autokosova_csrf')
      ?.value ?? '';
  return page.request.fetch(origin + path, {
    method,
    data,
    timeout: 15_000,
    headers: {
      'x-csrf-token': csrf,
      ...(revision === undefined ? {} : { 'if-match': `"${revision}"` }),
    },
  });
}

export async function inquiryAction(
  page: Page,
  id: string,
  action: 'edit' | 'toggle' | 'delete',
): Promise<void> {
  await card(page, id).locator('[data-inquiry-menu]').click();
  await card(page, id)
    .locator(`[data-${action === 'toggle' ? 'toggle' : action}-inquiry]`)
    .click();
}

export async function readyInquiries(page: Page): Promise<void> {
  await expect(page.locator('[data-inquiries-list]')).toHaveAttribute('aria-busy', 'false');
}
export async function readyGarages(page: Page): Promise<void> {
  await expect(page.locator('[data-garages-overview]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-garages-loading]')).toHaveCount(0);
}
export async function garageAction(
  page: Page,
  id: string,
  action: 'edit' | 'delete',
): Promise<void> {
  await garageButton(page, id).click();
  await page
    .locator(action === 'edit' ? `[data-owned-garage="${id}"]` : '[data-delete-garage]')
    .click();
}
export async function logout(page: Page, origin: string): Promise<void> {
  await page.locator('[data-account-trigger]').click();
  await page
    .locator('[data-account-panel]')
    .getByRole('button', { name: /Abmelden|Sign out|Dil/ })
    .click();
  await expect.poll(async () => (await page.request.get(origin + '/api/me')).status()).toBe(401);
  await expect(page.locator('[data-account-panel]')).toHaveCount(0);
}

export async function createInquiry(
  page: Page,
  origin: string,
  symptom: string,
  onCreated: (id: string) => void = () => {},
): Promise<string> {
  await readyInquiries(page);
  await page.locator('[data-new-inquiry]').click();
  const text = requestCopy.de;
  const form = page.locator('form');
  await form.getByRole('combobox', { name: text.make, exact: true }).selectOption('skoda');
  await form.getByLabel(text.model, { exact: true }).fill('E2E Octavia');
  await form.getByLabel(text.year, { exact: true }).fill('2018');
  await form.getByLabel(text.mileage, { exact: true }).fill('0');
  const next = () =>
    form.getByRole('button', { name: translate('de', 'request.next'), exact: true }).click();
  await next();
  await form.getByRole('combobox', { name: text.service, exact: true }).selectOption('bremsen');
  await form.getByLabel(text.symptom, { exact: true }).fill(symptom);
  await next();
  const date = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  await form.getByLabel(text.dropoff, { exact: true }).fill(date(14));
  await form.getByLabel(text.pickup, { exact: true }).fill(date(18));
  await next();
  await expect(form.locator('input[type="file"]')).toBeVisible();
  await next();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + '/api/me/repair-requests' &&
        response.request().method() === 'POST',
    ),
    form.getByRole('button', { name: text.save, exact: true }).click(),
  ]);
  expect(response.status()).toBe(201);
  // The wizard does not consume its POST body. Verify persistence through a fresh private
  // read rather than relying on Chromium delivering an unread fetch body to DevTools.
  const stored = await api(page, origin, '/api/me/repair-requests?limit=20');
  expect(stored.status()).toBe(200);
  const matches = (await stored.json()).requests.filter(
    (request: { symptomPreview?: string }) => request.symptomPreview === symptom,
  );
  expect(matches).toHaveLength(1);
  const id: string = matches[0].id;
  expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  onCreated(id);
  await expect(form.getByRole('status')).toContainText(text.saved);
  await page.locator('[data-account-trigger]').click();
  await page.locator('[data-account-panel] [data-account-inquiries]').click();
  await readyInquiries(page);
  await expect(card(page, id)).toContainText(symptom);
  return id;
}

export async function editInquiry(
  page: Page,
  origin: string,
  id: string,
  symptom: string,
): Promise<void> {
  await inquiryAction(page, id, 'edit');
  await expect(page.locator('[data-inquiry-editor]')).toBeVisible();
  await expect(page.locator('[data-save-inquiry]')).toBeDisabled();
  await page.locator('#edit-symptom').fill(symptom);
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + requestPath(id) && response.request().method() === 'PUT',
    ),
    page.locator('[data-save-inquiry]').click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(page.locator('[data-inquiry-editor]')).toHaveCount(0);
  await expect(page.locator('[data-inquiry-notice]')).toContainText(inquiriesCopy.de.updated);
  await page.reload();
  await readyInquiries(page);
  await expect(card(page, id)).toContainText(symptom);
  const detail = await api(page, origin, requestPath(id));
  expect(detail.status()).toBe(200);
  expect((await detail.json()).symptom).toBe(symptom);
}

export async function deleteInquiry(
  page: Page,
  origin: string,
  id: string,
  cancelFirst = false,
): Promise<void> {
  const open = async () => {
    await inquiryAction(page, id, 'delete');
    await expect(page.locator('[data-delete-dialog]')).toBeVisible();
    await expect(page.locator('[data-cancel-delete]')).toBeFocused();
  };
  await open();
  if (cancelFirst) {
    await page.locator('[data-cancel-delete]').click();
    expect((await api(page, origin, requestPath(id))).status()).toBe(200);
    await open();
  }
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + requestPath(id) && response.request().method() === 'DELETE',
    ),
    page.locator('[data-confirm-delete]').click(),
  ]);
  expect(response.status()).toBe(204);
  await expect(card(page, id)).toHaveCount(0);
  await page.reload();
  await readyInquiries(page);
  await expect(card(page, id)).toHaveCount(0);
  expect((await api(page, origin, requestPath(id))).status()).toBe(404);
}

export async function createGarage(
  page: Page,
  origin: string,
  name: string,
  onCreated: (id: string) => void = () => {},
): Promise<string> {
  await readyGarages(page);
  await expect(page.locator('form')).toHaveCount(0);
  await page.getByRole('button', { name: garageManagementCopy.de.create, exact: true }).click();
  await page.locator('#garage-name').fill(name);
  await page.locator('#garage-place').selectOption('xk-pristina');
  await page.locator('#garage-street').fill('Fiktive E2E-Strasse 12, Prishtina');
  await page.locator('#garage-person').fill('Fiktiver E2E Kontakt');
  await page.locator('#garage-phone').fill('+99900000001');
  await page.locator('#garage-public-phone').fill('+99900000002');
  await page.locator('input[name="publicWhatsapp"]').check();
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
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + '/api/garages' && response.request().method() === 'POST',
    ),
    page.locator('[data-save-garage]').click(),
  ]);
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  onCreated(id);
  await expect(page.locator('[data-save-garage]')).toBeDisabled();
  await expect(page.locator('[data-garage-status]')).toHaveAttribute('data-state', 'draft');
  await page.locator('[data-garages-back]').click();
  await readyGarages(page);
  await expect(garageButton(page, id)).toBeVisible();
  await garageButton(page, id).click();
  await expect(page.locator('[data-public-garage]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  return id;
}

export async function editGarage(
  page: Page,
  origin: string,
  id: string,
  name: string,
): Promise<void> {
  await garageAction(page, id, 'edit');
  await expect(page.locator('[data-save-garage]')).toBeDisabled();
  await page.locator('#garage-name').fill(name);
  await expect(page.locator('[data-save-garage]')).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + garagePath(id) && response.request().method() === 'PUT',
    ),
    page.locator('[data-save-garage]').click(),
  ]);
  expect(response.status()).toBe(204);
  await expect(page.locator('[data-save-garage]')).toBeDisabled();
  await expect(page.locator('form [role="status"]')).toBeVisible();
  await page.reload();
  await readyGarages(page);
  await garageAction(page, id, 'edit');
  await expect(page.locator('#garage-name')).toHaveValue(name);
  const detail = await api(page, origin, garagePath(id));
  expect(detail.status()).toBe(200);
  expect((await detail.json()).profile.name).toBe(name);
  await page.locator('[data-garages-back]').click();
  await readyGarages(page);
}

export async function deleteGarage(page: Page, origin: string, id: string): Promise<void> {
  await garageAction(page, id, 'delete');
  await expect(page.locator('[data-confirmation-confirm]')).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + garagePath(id) && response.request().method() === 'DELETE',
    ),
    page.locator('[data-confirmation-confirm]').click(),
  ]);
  expect(response.status()).toBe(204);
  await readyGarages(page);
  await expect(garageButton(page, id)).toHaveCount(0);
  await page.reload();
  await readyGarages(page);
  await expect(garageButton(page, id)).toHaveCount(0);
  const search = await (
    await api(page, origin, '/api/public/search?all=true&service=bremsen')
  ).json();
  expect(search.results.some((garage: { id: string }) => garage.id === id)).toBe(false);
  expect((await api(page, origin, garagePath(id))).status()).toBe(403);
  expect((await api(page, origin, '/api/public/garages/' + id)).status()).toBe(404);
}

export async function layout(page: Page, info?: TestInfo, label = 'application'): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true);
  const surface = page
    .locator('dialog[open]')
    .or(page.locator('main'))
    .or(page.locator('[aria-labelledby="form-title"]'))
    .or(page.locator('[aria-labelledby="workspace-title"]'));
  const geometry = await surface.evaluateAll((elements) =>
    elements.map((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      smallTargets: [...element.querySelectorAll<HTMLElement>('a,button,summary')]
        .filter((control) => control.checkVisibility())
        .filter((control) => {
          const box = control.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        }).length,
      clipped: [...element.querySelectorAll<HTMLElement>('p,dd,h1,h2,li')]
        .filter((item) => item.checkVisibility())
        .some((item) => item.scrollWidth > item.clientWidth + 1),
    })),
  );
  expect(geometry.length).toBeGreaterThan(0);
  for (const item of geometry)
    expect(item).toEqual({ overflow: false, smallTargets: 0, clipped: false });
  if (info) {
    // Called on known synthetic application screens only, never provider/callback pages.
    expect(new URL(page.url()).pathname).not.toMatch(/^\/auth\//);
    await page.screenshot({
      path: info.outputPath(label + '.png'),
      fullPage: !(await page.locator('dialog[open]').count()),
    });
  }
}

/** Exercise the actual visible staff navigation at each viewport, never hidden duplicates. */
export async function staffSection(
  page: Page,
  section: 'garages' | 'users' | 'privacy' | 'audit' | 'catalog',
): Promise<void> {
  const current = page.locator('[data-admin-garage], [data-staff-case]');
  if (await current.count()) await expect(current).toHaveAttribute('aria-busy', 'false');
  const mobile = page.locator('[data-staff-section-select]:visible');
  if (await mobile.count()) await mobile.selectOption(section);
  else await page.locator(`aside app-admin-navigation a[href$="/admin/${section}"]`).click();
}
