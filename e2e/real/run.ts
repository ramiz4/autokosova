import { chromium, expect, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processEnvironment } from '../../scripts/e2e/policy.mjs';
import { realConfiguration } from '../../scripts/e2e/real-config.mjs';
import {
  api,
  createInquiry,
  editInquiry,
  deleteInquiry,
  createGarage,
  editGarage,
  deleteGarage,
  readyInquiries,
  readyGarages,
  requestPath,
  garagePath,
  logout,
} from '../support/journeys';

// Standalone runner: never emit Playwright's raw errors, call logs, traces or provider screenshots.
const config = realConfiguration(process.env);
const marker = 'E2E REAL ' + randomUUID().slice(0, 8);
const lock = join(
  tmpdir(),
  'ak-e2e-real-' + createHash('sha256').update(config.origin).digest('hex').slice(0, 16),
);
const result: { mode: string; status: string; stage: string; completed: string[] } = {
  mode: 'real-zitadel',
  status: 'failed',
  stage: 'preflight',
  completed: [],
};
let ownsLock = false;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function signIn(page: Page, account: (typeof config.accounts)[number]) {
  await page.goto(config.origin + '/auth/login?locale=de');
  await page.waitForURL((url) => url.origin === config.loginOrigin);
  // Exact-origin checks precede both input and submission; no cross-origin credentials.
  const username = page.locator(config.usernameSelector);
  await expect(username).toHaveCount(1);
  if (new URL(page.url()).origin !== config.loginOrigin) throw new Error('Unexpected login origin');
  await username.fill(account.login!);
  if (new URL(page.url()).origin !== config.loginOrigin) throw new Error('Unexpected login origin');
  await username.locator('xpath=ancestor::form').locator(config.submitSelector).click();
  const password = page.locator(config.passwordSelector);
  await expect(password).toBeVisible();
  if (new URL(page.url()).origin !== config.loginOrigin)
    throw new Error('Unexpected password origin');
  await password.fill(account.password!);
  if (new URL(page.url()).origin !== config.loginOrigin)
    throw new Error('Unexpected password origin');
  await password.locator('xpath=ancestor::form').locator(config.submitSelector).click();
  // MFA/challenges are never disabled or bypassed; approved headed runs may complete them manually.
  await page.waitForURL(
    (url) => url.origin === config.origin && !url.pathname.startsWith('/auth/'),
    { timeout: 90_000 },
  );
  const identity = await (await api(page, config.origin, '/api/me')).json();
  expect(identity.userId).toBe(account.subject);
  expect(identity.accountType).toBe(account.kind);
  expect(identity.roles).toEqual(['customer']);
}
try {
  await mkdir(lock);
  ownsLock = true;
  browser = await chromium.launch({ headless: !config.headed, env: processEnvironment() });
  for (const account of config.accounts) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      const origin = new URL(route.request().url()).origin;
      return [config.origin, config.loginOrigin].includes(origin)
        ? route.continue()
        : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const records = new Set<string>();
    let failedStage: string | undefined;
    try {
      result.stage = account.kind + ': sign-in';
      await signIn(page, account);
      result.stage = account.kind + ': CRUD';
      if (account.kind === 'customer') {
        await expect(page).toHaveURL(config.origin + '/inquiries');
        await readyInquiries(page);
        const before = (await (await api(page, config.origin, '/api/me/repair-requests')).json())
          .requests;
        const id = await createInquiry(page, config.origin, marker + ' private inquiry', (id) =>
          records.add(id),
        );
        await editInquiry(page, config.origin, id, marker + ' edited inquiry');
        await deleteInquiry(page, config.origin, id, true);
        records.delete(id);
        expect(
          (await (await api(page, config.origin, '/api/me/repair-requests')).json()).requests,
        ).toEqual(before);
      } else {
        await expect(page).toHaveURL(config.origin + '/garages/new');
        await readyGarages(page);
        const before = (await (await api(page, config.origin, '/api/me/garages')).json()).garages;
        const id = await createGarage(page, config.origin, marker + ' garage', (id) =>
          records.add(id),
        );
        await editGarage(page, config.origin, id, marker + ' edited garage');
        await deleteGarage(page, config.origin, id);
        records.delete(id);
        expect((await (await api(page, config.origin, '/api/me/garages')).json()).garages).toEqual(
          before,
        );
      }
    } catch {
      failedStage = result.stage;
      throw new Error('Real scenario failed');
    } finally {
      // Cleanup is limited to observed IDs created by this run, with a matching marker.
      try {
        for (const id of records) {
          const path = account.kind === 'customer' ? requestPath(id) : garagePath(id);
          const response = await api(page, config.origin, path);
          if (account.kind === 'customer' && response.status() === 404) continue;
          // A garage 403 might be lost ownership, not deletion: report cleanup failure rather than guessing.
          expect(response.status()).toBe(200);
          const record = await response.json();
          const text = account.kind === 'customer' ? record.symptom : record.profile.name;
          if (!String(text).startsWith(marker)) throw new Error('Cleanup ownership marker differs');
          expect(
            (await api(page, config.origin, path, 'DELETE', undefined, record.revision)).status(),
          ).toBe(204);
        }
        result.stage = account.kind + ': logout';
        if ((await api(page, config.origin, '/api/me')).status() === 200)
          await logout(page, config.origin);
      } finally {
        await context.close();
        if (failedStage) result.stage = failedStage;
      }
    }
    result.completed.push(account.kind);
  }
  result.status = 'passed';
  result.stage = 'complete';
} catch {
  // Only fixed stage labels, never error.message (may contain credentials, claims or URLs).
  console.error(
    'Real integration did not pass at ' +
      result.stage +
      '. Check approved credentials, provider steps and application readiness. No automatic retry.',
  );
} finally {
  await browser?.close();
  if (ownsLock) await rm(lock, { recursive: true, force: true });
  await mkdir('test-results/e2e-real', { recursive: true });
  await writeFile('test-results/e2e-real/summary.json', JSON.stringify(result, null, 2) + '\n');
}
console.log('Real ZITADEL integration: ' + result.status);
process.exitCode = result.status === 'passed' ? 0 : 1;
