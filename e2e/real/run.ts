import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processEnvironment } from '../../scripts/e2e/policy.mjs';
import { realConfiguration } from '../../scripts/e2e/real-config.mjs';
import { realSteps } from '../../scripts/e2e/real-policy.mjs';
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
  card,
} from '../support/journeys';
import { signIn, checkProfile, toggleInquiry, fullLogout } from './journeys';

// No raw errors, traces, screenshots, videos, auth-state files or network dumps in this mode.
const config = realConfiguration(process.env);
const marker = 'E2E REAL ' + randomUUID();
const lock = join(
  tmpdir(),
  'ak-e2e-real-' + createHash('sha256').update(config.origin).digest('hex').slice(0, 16),
);
const result = {
  mode: 'real-zitadel',
  status: 'failed',
  stage: 'preflight',
  commit: process.env['E2E_REAL_COMMIT_SHA'],
  nonce: process.env['E2E_REAL_RUN_NONCE'],
  runId: process.env['E2E_REAL_RUN_ID'],
  runAttempt: process.env['E2E_REAL_RUN_ATTEMPT'],
  accounts: [] as string[],
  completed: [] as string[],
  cleanup: 'not-run',
};
let ownsLock = false;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const contexts: BrowserContext[] = [];
const records: { page: Page; kind: 'customer' | 'garage'; id: string }[] = [];
async function step(name: string, operation: () => Promise<unknown>) {
  expect(realSteps).toContain(name);
  result.stage = name;
  await operation();
  result.completed.push(name);
}
async function accountPage() {
  const context = await browser!.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  contexts.push(context);
  await context.route('**/*', (route) => {
    const origin = new URL(route.request().url()).origin;
    return [config.origin, new URL(config.issuer).origin, config.loginOrigin].includes(origin)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return page;
}
function forget(id: string) {
  const index = records.findIndex((record) => record.id === id);
  if (index >= 0) records.splice(index, 1);
}
try {
  await mkdir(lock);
  ownsLock = true;
  browser = await chromium.launch({ headless: !config.headed, env: processEnvironment() });
  const customer = await accountPage();
  const garage = await accountPage();
  await step('customer-login', async () => {
    await signIn(customer, config, config.accounts[0]);
    await expect(customer).toHaveURL(config.origin + '/inquiries');
    await readyInquiries(customer);
    result.accounts.push('customer');
  });
  await step('customer-profile', () => checkProfile(customer, config.origin, 'customer'));
  const beforeInquiries = (
    await (await api(customer, config.origin, '/api/me/repair-requests')).json()
  ).requests;
  let inquiryId = '',
    garageId = '';
  await step('customer-create', async () => {
    inquiryId = await createInquiry(customer, config.origin, marker + ' inquiry', (id) =>
      records.push({ page: customer, kind: 'customer', id }),
    );
  });
  await step('customer-edit', () =>
    editInquiry(customer, config.origin, inquiryId, marker + ' edited inquiry'),
  );
  await step('customer-toggle', () => toggleInquiry(customer, config.origin, inquiryId));
  const inquiry = await (await api(customer, config.origin, requestPath(inquiryId))).json();
  await step('garage-login', async () => {
    await signIn(garage, config, config.accounts[1]);
    await expect(garage).toHaveURL(config.origin + '/garages/new');
    await readyGarages(garage);
    result.accounts.push('garage');
  });
  await step('garage-profile', () => checkProfile(garage, config.origin, 'garage'));
  const beforeGarages = (await (await api(garage, config.origin, '/api/me/garages')).json())
    .garages;
  await step('garage-create', async () => {
    garageId = await createGarage(garage, config.origin, marker + ' garage', (id) =>
      records.push({ page: garage, kind: 'garage', id }),
    );
  });
  await step('garage-edit', () =>
    editGarage(garage, config.origin, garageId, marker + ' edited garage'),
  );
  const garageRecord = await (await api(garage, config.origin, garagePath(garageId))).json();
  // Negative writes target only this run's extra marked records, not existing test data.
  await step('foreign-inquiry', async () => {
    const input = Object.fromEntries(
      [
        'serviceCategoryId',
        'symptom',
        'earliestDropoffOn',
        'latestPickupOn',
        'vehicle',
        'areas',
        'attachmentIds',
      ].map((key) => [key, inquiry[key]]),
    );
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'])
      expect(
        (
          await api(
            garage,
            config.origin,
            requestPath(inquiryId),
            method,
            method === 'PUT' ? input : method === 'PATCH' ? { active: false } : undefined,
            inquiry.revision,
          )
        ).status(),
      ).toBe(404);
    expect(await (await api(customer, config.origin, requestPath(inquiryId))).json()).toEqual(
      inquiry,
    );
  });
  await step('foreign-garage', async () => {
    for (const method of ['GET', 'PUT', 'DELETE'])
      expect(
        (
          await api(
            customer,
            config.origin,
            garagePath(garageId),
            method,
            method === 'PUT' ? garageRecord.profile : undefined,
            garageRecord.revision,
          )
        ).status(),
      ).toBe(403);
    expect(await (await api(garage, config.origin, garagePath(garageId))).json()).toEqual(
      garageRecord,
    );
  });
  await step('customer-delete', async () => {
    await deleteInquiry(customer, config.origin, inquiryId, true);
    forget(inquiryId);
    expect(
      (await (await api(customer, config.origin, '/api/me/repair-requests')).json()).requests,
    ).toEqual(beforeInquiries);
  });
  await step('garage-delete', async () => {
    await deleteGarage(garage, config.origin, garageId);
    forget(garageId);
    expect((await (await api(garage, config.origin, '/api/me/garages')).json()).garages).toEqual(
      beforeGarages,
    );
  });
  await step('garage-logout', () => fullLogout(garage, config));
  await step('customer-logout', () => fullLogout(customer, config));
  // Same browser context, without clearing cookies/storage: reject unintended account reuse.
  await step('account-switch', async () => {
    await signIn(customer, config, config.accounts[1]);
    await expect(customer).toHaveURL(config.origin + '/garages/new');
    await readyGarages(customer);
    expect((await (await api(customer, config.origin, '/api/me/garages')).json()).garages).toEqual(
      beforeGarages,
    );
    await customer.goto(config.origin + '/inquiries');
    await readyInquiries(customer);
    for (const record of beforeInquiries) await expect(card(customer, record.id)).toHaveCount(0);
    expect(
      (await (await api(customer, config.origin, '/api/me/repair-requests')).json()).requests,
    ).toEqual([]);
  });
  await step('switched-logout', () => fullLogout(customer, config));
} catch {
  // Fixed stage retained; no arbitrary error messages or personal data.
} finally {
  const failedStage = result.completed.length === realSteps.length - 2 ? undefined : result.stage;
  let cleanupFailed = false;
  for (const { page, kind, id } of records) {
    try {
      const path = kind === 'customer' ? requestPath(id) : garagePath(id);
      const response = await api(page, config.origin, path);
      if (kind === 'customer' && response.status() === 404) continue;
      expect(response.status()).toBe(200);
      const record = await response.json();
      expect(
        String(kind === 'customer' ? record.symptom : record.profile.name).startsWith(marker),
      ).toBe(true);
      expect(
        (await api(page, config.origin, path, 'DELETE', undefined, record.revision)).status(),
      ).toBe(204);
    } catch {
      cleanupFailed = true;
    }
  }
  if (!cleanupFailed) result.completed.push('records-cleanup');
  for (const operation of [
    ...contexts.map((context) => () => context.close()),
    () => browser?.close(),
    () => ownsLock && rm(lock, { recursive: true, force: true }),
  ]) {
    try {
      await operation();
    } catch {
      cleanupFailed = true;
    }
  }
  if (!cleanupFailed) result.completed.push('browser-cleanup');
  result.cleanup = cleanupFailed ? 'failed' : 'passed';
  if (
    !failedStage &&
    !cleanupFailed &&
    JSON.stringify(result.completed) === JSON.stringify(realSteps)
  ) {
    result.status = 'passed';
    result.stage = 'complete';
  } else result.stage = cleanupFailed ? 'cleanup' : failedStage!;
  await writeFile(process.env['E2E_REAL_RESULT_FILE']!, JSON.stringify(result, null, 2) + '\n');
}
process.exitCode = result.status === 'passed' ? 0 : 1;
