import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { assertFreePort } from '../dev/docker.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { seedDatabase } from '../db/seed-data.mjs';
import { runProcess, startProcess } from '../dev/process.mjs';
import { assertControlDatabase, processEnvironment } from './policy.mjs';
import { providerEnvironment } from './real-policy.mjs';

// Own random database and process only. No local .env, user DB, reset, or synthetic provider.
export async function createRealApplication(root, source, signal) {
  const provider = providerEnvironment(source);
  const origin = new URL(source.E2E_REAL_BASE_URL).origin;
  const port = Number(new URL(origin).port || 80);
  const url = assertControlDatabase(source.AUTOKOSOVA_E2E_DATABASE_URL);
  await assertFreePort(port, 'E2E_REAL_BASE_URL');
  await assertFreePort(port, 'E2E_REAL_BASE_URL', '::1');
  const control = new pg.Client({ connectionString: url.href });
  const name = 'ak_e2e_' + randomUUID().replaceAll('-', '');
  url.pathname = '/' + name;
  const database = new pg.Client({ connectionString: url.href });
  const sandbox = await mkdtemp(join(tmpdir(), 'ak-e2e-real-app-'));
  let created = false,
    connected = false,
    child;
  async function close() {
    const failures = [];
    for (const operation of [
      () => child?.stop(),
      () => database.end(),
      () => created && control.query(`DROP DATABASE ${name} WITH (FORCE)`),
      () => connected && control.end(),
      () => rm(sandbox, { recursive: true, force: true }),
    ]) {
      try {
        await operation();
      } catch {
        failures.push(true);
      }
    }
    if (failures.length) throw new Error('Isolated application cleanup failed');
  }
  try {
    signal?.throwIfAborted();
    await control.connect();
    connected = true;
    await control.query(`CREATE DATABASE ${name}`);
    created = true;
    await database.connect();
    // Migration sees only a local DB URL, never provider or browser credentials.
    await runProcess(process.execPath, [resolve(root, 'scripts/db/migrate.mjs')], {
      cwd: sandbox,
      env: { ...processEnvironment(source), NODE_ENV: 'test', DATABASE_URL: url.href },
      timeout: 30_000,
      signal,
    });
    await seedDatabase(database, 'demo-workflows', {
      ZITADEL_ISSUER: source.ZITADEL_ISSUER,
      AUTOKOSOVA_DEMO_CUSTOMER_SUBJECT: source.E2E_REAL_CUSTOMER_SUBJECT,
      AUTOKOSOVA_DEMO_GARAGE_SUBJECT: source.E2E_REAL_GARAGE_SUBJECT,
    });
    signal?.throwIfAborted();
    child = startProcess(process.execPath, [resolve(root, 'dist/autokosova/server/server.mjs')], {
      cwd: sandbox,
      env: { ...provider, DATABASE_URL: url.href, PORT: String(port) },
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      signal?.throwIfAborted();
      if (child.finished) throw new Error('Isolated application exited');
      try {
        const response = await fetch(origin + '/api/public/search?all=true', {
          signal: AbortSignal.timeout(1000),
        });
        const body = await response.json();
        if (response.ok && Array.isArray(body.results) && !child.finished)
          return { close, origin, databaseName: name };
      } catch {
        /* Readiness polling only, never repeat login or acceptance. */
      }
      await delay(250, undefined, { signal });
    }
    throw new Error('Isolated application not ready');
  } catch {
    await close();
    throw new Error('Isolated application setup failed');
  }
}
