import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import pg from 'pg';
import { test as base, expect, type Page } from '@playwright/test';
import { seedDatabase } from '../../scripts/db/seed-data.mjs';
import { startTestOidc } from '../../scripts/inquiries-test-oidc.mjs';
import { startProcess, runProcess } from '../../scripts/dev/process.mjs';
import { assertControlDatabase, processEnvironment } from '../../scripts/e2e/policy.mjs';

export type AccountKind = 'customer' | 'garage' | 'other' | 'editor' | 'admin' | 'moderator';
export type App = Awaited<ReturnType<typeof createApplication>>;

async function freePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((done) => listener.close(() => done()));
  return address.port;
}

export async function createApplication() {
  const root = process.cwd();
  const baseUrl = assertControlDatabase(process.env['AUTOKOSOVA_E2E_DATABASE_URL']);
  const control = new pg.Client({ connectionString: baseUrl.href });
  const databaseName = 'ak_e2e_' + randomUUID().replaceAll('-', '');
  const sandbox = await mkdtemp(join(tmpdir(), 'ak-e2e-app-'));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const subjects: Record<AccountKind, string> = {
    customer: 'e2e-customer-' + randomUUID(),
    garage: 'e2e-garage-' + randomUUID(),
    other: 'e2e-other-' + randomUUID(),
    editor: 'e2e-editor-' + randomUUID(),
    admin: 'e2e-admin-' + randomUUID(),
    moderator: 'e2e-moderator-' + randomUUID(),
  };
  const provider = await startTestOidc(origin + '/auth/callback', subjects.customer);
  baseUrl.pathname = '/' + databaseName;
  const database = new pg.Client({ connectionString: baseUrl.href });
  const env = {
    ...processEnvironment(),
    ...provider.environment,
    NODE_ENV: 'test',
    DATABASE_URL: baseUrl.href,
    PORT: String(port),
    AUTOKOSOVA_DEMO_GARAGE_SUBJECT: subjects.garage,
    AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: subjects.customer,
    AUTOKOSOVA_DEMO_ADMIN_SUBJECT: subjects.admin,
    AUTOKOSOVA_DEMO_MODERATOR_SUBJECT: subjects.moderator,
    AUTOKOSOVA_LOCAL_DEMO_FILES: '1',
  };
  let child: ReturnType<typeof startProcess> | undefined;
  let created = false;
  let connected = false;
  async function seed() {
    await seedDatabase(database, 'demo-workflows', env);
  }
  async function start() {
    // Use the real migrations and workflow seed, also on restart; no schema rewrite/reset.
    await runProcess(process.execPath, [resolve(root, 'scripts/db/migrate.mjs')], {
      cwd: sandbox,
      env,
      timeout: 30_000,
    });
    await seed();
    child = startProcess(process.execPath, [resolve(root, 'dist/autokosova/server/server.mjs')], {
      cwd: sandbox,
      env,
    });
    await expect
      .poll(
        async () => {
          if (child?.finished) throw new Error('Isolated application exited before readiness');
          try {
            const response = await fetch(origin + '/api/public/search?all=true&service=bremsen', {
              signal: AbortSignal.timeout(1000),
            });
            const payload = (await response.json()) as { results?: unknown[] };
            return response.ok && Array.isArray(payload.results);
          } catch {
            return false;
          }
        },
        { message: 'Isolated DB-backed application readiness', timeout: 25_000 },
      )
      .toBe(true);
  }
  async function close() {
    try {
      await child?.stop();
    } finally {
      try {
        await provider.close();
        await database.end();
      } finally {
        try {
          if (created) {
            assert.match(databaseName, /^ak_e2e_[a-f0-9]{32}$/);
            // Only the random database created by this fixture, never the control/user DB.
            await control.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
          }
        } finally {
          if (connected) await control.end();
          await rm(sandbox, { recursive: true, force: true });
        }
      }
    }
  }
  try {
    await control.connect();
    connected = true;
    await control.query(`CREATE DATABASE ${databaseName}`);
    created = true;
    await database.connect();
    await start();
  } catch {
    await close();
    throw new Error(
      'Isolated E2E setup failed; database creation/migration or application readiness',
    );
  }
  return {
    origin,
    subjects,
    database,
    provider,
    seed,
    close,
    async restart() {
      await child!.stop();
      child = undefined;
      await start();
    },
    async login(page: Page, kind: AccountKind, locale = 'de', returnTo?: string) {
      provider.setRoles(kind === 'admin' ? ['admin'] : kind === 'moderator' ? ['moderator'] : []);
      provider.setSubject(subjects[kind]);
      provider.setProfile({
        name: `E2E ${kind}`,
        preferred_username: `e2e-${kind}`,
        email: `${kind}@example.test`,
      });
      const query = new URLSearchParams(returnTo === undefined ? { locale } : { returnTo });
      await page.goto(origin + '/auth/login?' + query);
      const account = await page.request.get(origin + '/api/me');
      expect(account.status()).toBe(200);
      const identity = (await account.json()) as { userId: string; accountType: string };
      expect(identity.userId).toBe(subjects[kind]);
      return identity;
    },
  };
}

export const test = base.extend<{ app: App; noBrowserErrors: void }>({
  app: async ({}, use) => {
    const app = await createApplication();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  noBrowserErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      context.on('page', (page) =>
        page.on('pageerror', () => errors.push('Browser runtime exception')),
      );
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
