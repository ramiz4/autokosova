import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import packageJson from '../package.json' with { type: 'json' };
import { loadEnvironment } from '../scripts/environment.mjs';
import { resolveConfig, seedEnvironment } from '../scripts/dev/config.mjs';
import { acquireLock, readLock } from '../scripts/dev/lock.mjs';

test('local development is not blocked by an exact npm devEngines gate', () => {
  assert.equal(packageJson.devEngines, undefined);
  assert.match(packageJson.engines.node, /22\.22\.3/);
});

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'autokosova-config-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('local files have explicit precedence, do not mutate the caller and are ignored in production', async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, '.env'), 'A=base\nB=base\n');
  await writeFile(join(root, '.env.local'), 'A=local\nB=local\n');
  const env = { B: 'process' };
  assert.deepEqual(loadEnvironment(root, env), { A: 'local', B: 'process' });
  assert.deepEqual(loadEnvironment(root, { A: undefined, B: 'process' }), {
    A: 'local',
    B: 'process',
  });
  assert.deepEqual(env, { B: 'process' });
  assert.deepEqual(loadEnvironment(root, { NODE_ENV: 'production' }), { NODE_ENV: 'production' });
});

test('worktrees have stable separate identities and consistently derived ports/URLs', async (t) => {
  const first = await workspace(t);
  const second = await workspace(t);
  const config = resolveConfig(first, {});
  assert.equal(config.appPort, 4200);
  assert.deepEqual(resolveConfig(first, {}), config);
  assert.notEqual(resolveConfig(second, {}).project, config.project);
  const overridden = resolveConfig(first, {
    AUTOKOSOVA_DB_PORT: '55434',
    AUTOKOSOVA_APP_PORT: '4201',
  });
  assert.equal(
    overridden.env.DATABASE_URL,
    'postgresql://autokosova:autokosova@127.0.0.1:55434/autokosova',
  );
  assert.equal(overridden.appPort, 4201);
});

test('production, remote/tunnel overrides, malformed ports and conflicting targets fail before Docker', async (t) => {
  const root = await workspace(t);
  for (const env of [
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://secret:password@remote/autokosova' },
    { DATABASE_URL: 'postgresql://autokosova:autokosova@127.0.0.1:55432/other' },
    { DOCKER_HOST: 'ssh://remote' },
    { DOCKER_HOST: 'unix:///tmp/other.sock' },
    { AUTOKOSOVA_DB_PORT: '5432oops' },
    { AUTOKOSOVA_DB_PORT: '0' },
    { AUTOKOSOVA_DB_PORT: '65536' },
    { AUTOKOSOVA_DB_PORT: '4200', AUTOKOSOVA_APP_PORT: '4200' },
  ])
    assert.throws(
      () => resolveConfig(root, env),
      (error) => !error.message.includes('secret:password'),
    );
});

test('profile permissions cannot leak from shell or be reloaded from local files', async (t) => {
  const root = await workspace(t);
  await writeFile(
    join(root, '.env.local'),
    'AUTOKOSOVA_DEMO_DATA=1\nAUTOKOSOVA_DEMO_WORKFLOW_DATA=1\nALLOW_LOCAL_RESET=1\nZITADEL_CLIENT_ID=incomplete\n',
  );
  const { env, notices } = resolveConfig(root, {});
  const reloaded = loadEnvironment(root, env);
  assert.equal(reloaded.AUTOKOSOVA_DEMO_DATA, '');
  assert.equal(reloaded.ALLOW_LOCAL_RESET, '');
  assert.equal(reloaded.ZITADEL_CLIENT_ID, '');
  assert.match(notices[0], /Login nicht konfiguriert/);
  assert.equal(seedEnvironment(env, 'reference').AUTOKOSOVA_DEMO_DATA, '');
  assert.equal(seedEnvironment(env, 'demo').AUTOKOSOVA_DEMO_WORKFLOW_DATA, '');
  assert.equal(seedEnvironment(env, 'demo').AUTOKOSOVA_DEMO_DATA, '1');
  assert.equal(seedEnvironment(env, 'demo-workflows').AUTOKOSOVA_DEMO_WORKFLOW_DATA, '1');
  assert.throws(() => seedEnvironment(env, 'unknown'));
});

test('configured OIDC requires the exact localhost callback for the selected app port', async (t) => {
  const root = await workspace(t);
  const env = Object.fromEntries(
    ['AUDIENCE', 'AUTHORIZATION_ENDPOINT', 'CLIENT_ID', 'ISSUER', 'JWKS_URI', 'TOKEN_ENDPOINT'].map(
      (suffix) => [`ZITADEL_${suffix}`, 'configured'],
    ),
  );
  Object.assign(env, {
    AUTOKOSOVA_APP_PORT: '4200',
    ZITADEL_REDIRECT_URI: 'http://localhost:4200/auth/callback',
  });
  const { notices } = resolveConfig(root, env);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Provider-Logout nicht konfiguriert/);
  assert.match(notices[0], /ZITADEL_END_SESSION_ENDPOINT/);
  assert.match(notices[0], /ZITADEL_POST_LOGOUT_URI/);
  assert.match(notices[0], /vertrauenswürdigen Discovery/);
  assert.match(notices[0], /registrieren/);
  assert.match(notices[0], /neu starten/);
  assert.doesNotMatch(notices[0], /configured/);
  for (const callback of [
    'http://localhost:4000/auth/callback',
    'https://external/auth/callback',
    'malformed',
  ]) {
    assert.throws(
      () => resolveConfig(root, { ...env, ZITADEL_REDIRECT_URI: callback }),
      /OIDC-Redirect/,
    );
  }
});

test('copying the environment example keeps Angular on 4200 and does not activate partial OIDC', async (t) => {
  const root = await workspace(t);
  await writeFile(
    join(root, '.env.local'),
    await readFile(new URL('../.env.example', import.meta.url)),
  );
  const config = resolveConfig(root, {});
  assert.equal(config.appPort, 4200);
  assert.equal(config.env.ZITADEL_REDIRECT_URI, '');
  assert.ok(config.notices.some((notice) => notice.includes('Login nicht konfiguriert')));
});

test('guest development remains available without OIDC or provider-logout configuration', async (t) => {
  const root = await workspace(t);
  const config = resolveConfig(root, {});
  assert.equal(config.env.ZITADEL_END_SESSION_ENDPOINT, '');
  assert.equal(config.env.ZITADEL_POST_LOGOUT_URI, '');
  assert.deepEqual(config.notices, [
    'Login nicht konfiguriert; öffentliche Suche verfügbar. Siehe docs/architecture/AUTH-INTEGRATION.md.',
  ]);
});

test('atomic worktree lock rejects concurrent starts and never steals a stale lock', async (t) => {
  const root = await workspace(t);
  assert.equal(await readLock(root), undefined);
  const release = await acquireLock(root);
  assert.match(await readLock(root), /^\d+\n$/);
  await assert.rejects(acquireLock(root), /Startsperre/);
  await writeFile(join(root, '.autokosova-dev.lock', 'owner'), '999999999\n');
  await assert.rejects(acquireLock(root), /Startsperre/);
  await release();
  const nextRelease = await acquireLock(root);
  await nextRelease();
});

test('provider logout is opt-in, paired, same-origin and uses the exact app-port callback', async (t) => {
  const root = await workspace(t);
  const env = {
    ZITADEL_AUDIENCE: 'fixture',
    ZITADEL_CLIENT_ID: 'fixture',
    ZITADEL_ISSUER: 'https://issuer.invalid',
    ZITADEL_AUTHORIZATION_ENDPOINT: 'https://issuer.invalid/authorize',
    ZITADEL_TOKEN_ENDPOINT: 'https://issuer.invalid/token',
    ZITADEL_JWKS_URI: 'https://issuer.invalid/jwks',
    ZITADEL_REDIRECT_URI: 'http://localhost:4200/auth/callback',
    ZITADEL_END_SESSION_ENDPOINT: 'https://issuer.invalid/end_session',
    ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback',
  };
  assert.deepEqual(resolveConfig(root, env).notices, []);
  for (const patch of [
    { ZITADEL_END_SESSION_ENDPOINT: '' },
    { ZITADEL_POST_LOGOUT_URI: '' },
    { ZITADEL_END_SESSION_ENDPOINT: 'https://evil.invalid/end_session' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4000/auth/logout/callback' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback?next=evil' },
  ])
    assert.throws(
      () => resolveConfig(root, { ...env, ...patch }),
      (error) => {
        assert.match(error.message, /OIDC-Logout-Konfiguration ungültig oder unvollständig/);
        assert.match(error.message, /ZITADEL_END_SESSION_ENDPOINT/);
        assert.match(error.message, /ZITADEL_POST_LOGOUT_URI/);
        assert.doesNotMatch(error.message, /issuer\.invalid|evil\.invalid/);
        return true;
      },
    );
});
