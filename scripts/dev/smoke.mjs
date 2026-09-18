import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import pg from 'pg';
import { resolveConfig } from './config.mjs';
import { inspectDocker } from './docker.mjs';
import { runProcess, startProcess } from './process.mjs';

// Only synthetic DBs in two new worktrees. Never reset or delete a DB/volume.
const source = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'autokosova-dev-smoke-'));
const env = {
  ...process.env,
  DATABASE_URL: '',
  NODE_ENV: 'development',
  AUTOKOSOVA_DB_PORT: undefined,
  AUTOKOSOVA_APP_PORT: undefined,
};
for (const key of Object.keys(env)) if (key.startsWith('ZITADEL_')) env[key] = '';
const run = (command, args, cwd = source) =>
  runProcess(command, args, { cwd, env, timeout: 180000 });
const worktrees = [];
const running = new Set();
const usedPorts = new Set();
async function freePort() {
  while (true) {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
}

async function start(root, profile = 'demo', viaNpm = false) {
  const command = viaNpm ? 'npm' : process.execPath;
  const args = viaNpm
    ? ['run', profile === 'reference' ? 'dev' : `dev:${profile}`]
    : ['scripts/dev.mjs', '--profile', profile];
  const child = startProcess(command, args, {
    cwd: root,
    env,
    // The starter first waits for its own Angular process group (up to 3 seconds),
    // then releases the worktree lock. Its parent must not kill it at the same deadline.
    shutdownTimeout: 10000,
  });
  running.add(child);
  const end = Date.now() + 180000;
  while (!child.output.includes('Bereit:') && !child.finished && Date.now() < end) await delay(200);
  assert.ok(child.output.includes('Bereit:'), `Dev-Start fehlgeschlagen:\n${child.output}`);
  return child;
}
async function stop(child) {
  await child.stop();
  running.delete(child);
}
async function database(config, operation) {
  const client = new pg.Client({ connectionString: config.env.DATABASE_URL });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

try {
  const files = (await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']))
    .split('\0')
    .filter(Boolean);
  for (const name of ['a', 'b']) {
    const root = join(temporary, name);
    await run('git', ['worktree', 'add', '--detach', root, 'HEAD']);
    worktrees.push(root);
    // Include the current reviewed implementation when invoked before commit.
    for (const file of files) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await copyFile(join(source, file), join(root, file));
    }
    // Explicit overrides for parallel test worktrees; the normal Angular default stays 4200.
    await writeFile(
      join(root, '.env.local'),
      `AUTOKOSOVA_APP_PORT=${await freePort()}\nAUTOKOSOVA_DB_PORT=${await freePort()}\n`,
    );
    await run('npm', ['ci'], root);
  }
  const [first, second] = worktrees;
  const a = resolveConfig(first, env);
  const b = resolveConfig(second, env);
  assert.notEqual(a.project, b.project);
  assert.notEqual(a.dbPort, b.dbPort);
  const firstApp = await start(first, 'demo', true);
  const secondApp = await start(second);
  console.log('PASS: Zwei frische Worktrees starten parallel mit erreichbaren Demo-Daten.');
  await assert.rejects(run(process.execPath, ['scripts/dev.mjs', '--profile', 'demo'], first));
  assert.equal(firstApp.finished, false);
  assert.equal(secondApp.finished, false);
  console.log('PASS: Doppelstart verändert keinen laufenden Starter.');

  await firstApp.interrupt();
  running.delete(firstApp);
  await assert.rejects(readFile(join(first, '.autokosova-dev.lock', 'owner')), { code: 'ENOENT' });
  const restarted = await start(first);
  await database(a, (db) =>
    db.query(
      "CREATE TABLE local_dx_smoke (value text); INSERT INTO local_dx_smoke VALUES ('retained')",
    ),
  );
  assert.equal(secondApp.finished, false);
  const result = await database(a, (db) => db.query('SELECT value FROM local_dx_smoke'));
  assert.equal(result.rows[0].value, 'retained');
  await runProcess('npm', ['run', 'test:demo-seed'], { cwd: first, env: a.env });
  await stop(restarted);
  console.log('PASS: Wiederholter Start erhält eigene Daten; anderer Worktree läuft weiter.');

  const brokenMigration = join(first, 'db/migrations/9999_dx_smoke_failure.sql');
  await writeFile(brokenMigration, 'THIS IS INTENTIONALLY INVALID SQL;');
  try {
    const failed = startProcess(process.execPath, ['scripts/dev.mjs'], { cwd: first, env });
    running.add(failed);
    assert.notEqual(await failed.done, 0);
    assert.match(failed.output, /Migration fehlgeschlagen/);
    assert.equal(failed.output.includes('Starte Angular'), false);
    await stop(failed);
  } finally {
    await unlink(brokenMigration);
  }
  console.log('PASS: Migrationsfehler stoppt vor Seed und App-Start.');

  // Force a real seed error without removing any existing records.
  await database(a, (db) =>
    db.query(
      "CREATE FUNCTION dx_seed_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic seed failure'; END $$; CREATE TRIGGER dx_seed_failure BEFORE INSERT OR UPDATE ON service_category FOR EACH ROW EXECUTE FUNCTION dx_seed_failure()",
    ),
  );
  try {
    const failed = startProcess(process.execPath, ['scripts/dev.mjs', '--profile', 'demo'], {
      cwd: first,
      env,
    });
    running.add(failed);
    assert.notEqual(await failed.done, 0);
    assert.match(failed.output, /Seed fehlgeschlagen/);
    assert.equal(failed.output.includes('Starte Angular'), false);
    await stop(failed);
  } finally {
    await database(a, (db) =>
      db.query('DROP TRIGGER dx_seed_failure ON service_category; DROP FUNCTION dx_seed_failure()'),
    );
  }
  console.log('PASS: Seed-Fehler stoppt vor dem App-Start.');
  const workflows = await start(first, 'demo');
  await runProcess('npm', ['run', 'test:demo-workflow-seed'], { cwd: first, env: a.env });
  await stop(workflows);
  console.log('PASS: Demo-Profil mit Workflow- und privaten Daten.');
  await stop(secondApp);
  for (const root of worktrees) {
    await assert.rejects(readFile(join(root, '.autokosova-dev.lock', 'owner')), { code: 'ENOENT' });
    await run(process.execPath, ['scripts/dev.mjs', '--doctor'], root);
  }
  console.log('PASS: Abbruch räumt App-Prozesse/Sperren auf; lesende Diagnose danach erfolgreich.');
} finally {
  for (const child of running) await child.stop();
  for (const root of worktrees) {
    try {
      await (await inspectDocker(resolveConfig(root, env))).stop();
    } catch {
      console.error(`DB-Stop manuell prüfen: ${root}`);
    }
  }
  console.log(`Test-Worktrees und DB-Volumes bleiben zur Prüfung erhalten: ${temporary}`);
}
