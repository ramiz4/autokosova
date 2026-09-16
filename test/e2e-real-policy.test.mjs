import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  providerKeys,
  browserEnvironment,
  providerEnvironment,
  realSteps,
  assertRealReport,
  readRealReport,
} from '../scripts/e2e/real-policy.mjs';
import { assertReferences, credentialKeys } from '../scripts/e2e/real-references.mjs';
const issuer = 'https://provider.example.invalid';
const fake = {
  AUTOKOSOVA_E2E_REAL: '1',
  E2E_REAL_BASE_URL: 'http://localhost:4200',
  E2E_REAL_ISSUER: issuer,
  E2E_REAL_END_SESSION_ENDPOINT: issuer + '/end_session',
  ...Object.fromEntries(credentialKeys.map((key) => [key, key + '-fixture'])),
  ...Object.fromEntries(providerKeys.map((key) => [key, issuer + '/' + key.toLowerCase()])),
  ZITADEL_ISSUER: issuer,
  ZITADEL_CLIENT_ID: 'fixture-client',
  ZITADEL_AUDIENCE: 'fixture-client',
  ZITADEL_REDIRECT_URI: 'http://localhost:4200/auth/callback',
  ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback',
  ZITADEL_END_SESSION_ENDPOINT: issuer + '/end_session',
};
test('real process environments are allowlisted, not masked inherited secret bags', () => {
  const hostile = {
    ...fake,
    OP_SERVICE_ACCOUNT_TOKEN: 'sentinel-op-token',
    NODE_OPTIONS: '--inspect',
    DEBUG: '*',
    GITHUB_TOKEN: 'sentinel-github-token',
    DATABASE_URL: 'sentinel-user-db',
    E2E_REAL_UNRELATED: 'sentinel-unrelated',
  };
  const app = providerEnvironment(hostile),
    browser = browserEnvironment(hostile);
  for (const key of [
    'OP_SERVICE_ACCOUNT_TOKEN',
    'NODE_OPTIONS',
    'DEBUG',
    'GITHUB_TOKEN',
    'DATABASE_URL',
    'E2E_REAL_UNRELATED',
  ]) {
    assert.equal(app[key], undefined);
    assert.equal(browser[key], undefined);
  }
  for (const key of credentialKeys) {
    assert.equal(app[key], undefined);
    assert.equal(browser[key], fake[key]);
  }
  for (const key of providerKeys) {
    assert.equal(app[key], fake[key]);
    assert.equal(browser[key], undefined);
  }
});
test('isolated app requires complete, consistent issuer/client/callback configuration', () => {
  for (const key of providerKeys) assert.throws(() => providerEnvironment({ ...fake, [key]: '' }));
  for (const patch of [
    { ZITADEL_REDIRECT_URI: 'http://localhost:4000/auth/callback' },
    { ZITADEL_POST_LOGOUT_URI: 'http://localhost:4200/auth/logout/callback?other=1' },
    { ZITADEL_AUDIENCE: 'other-client' },
    { ZITADEL_ISSUER: 'https://other.example.invalid' },
    { ZITADEL_TOKEN_ENDPOINT: 'https://other.example.invalid/token' },
    { ZITADEL_USERINFO_ENDPOINT: issuer + '/userinfo#fragment' },
    { E2E_REAL_END_SESSION_ENDPOINT: 'https://other.example.invalid/end_session' },
    { E2E_REAL_BASE_URL: 'https://localhost:4200' },
  ])
    assert.throws(() => providerEnvironment({ ...fake, ...patch }));
});
test('all references stay in a dedicated named-by-ID vault; missing and foreign refs fail closed', () => {
  const vault = 'a'.repeat(26),
    item = 'b'.repeat(26);
  const refs = {
    OP_CI_TEST_VAULT_ID: vault,
    ...Object.fromEntries(
      [...providerKeys, ...credentialKeys].map((key) => [
        key + '_REF',
        `op://${vault}/${item}/field`,
      ]),
    ),
  };
  assertReferences(refs);
  for (const key of [...providerKeys, ...credentialKeys]) {
    for (const value of [
      '',
      'plain-value',
      `op://${'c'.repeat(26)}/${item}/password`,
      `op://${vault}/${item}/password?attribute=other`,
      `op://${vault}/${item}/field\nextra`,
    ])
      assert.throws(() => assertReferences({ ...refs, [key + '_REF']: value }));
  }
  assert.throws(() => assertReferences({ ...refs, OP_CI_TEST_VAULT_ID: '' }));
});
const expected = { commit: 'a'.repeat(40), nonce: 'run-fixture', runId: '123', runAttempt: '1' };
const passed = {
  mode: 'real-zitadel',
  status: 'passed',
  stage: 'complete',
  ...expected,
  accounts: ['customer', 'garage'],
  completed: realSteps,
  cleanup: 'passed',
};
test('real evidence rejects stale, skipped, incomplete, retried, malformed and sensitive results', () => {
  assertRealReport(passed, expected);
  for (const patch of [
    { mode: 'synthetic' },
    { status: 'NOT RUN' },
    { status: 'skipped' },
    { cleanup: 'failed' },
    { commit: 'b'.repeat(40) },
    { nonce: 'stale' },
    { runId: 'other-run' },
    { runAttempt: '2' },
    { accounts: ['customer'] },
    { completed: [] },
    { completed: [...realSteps, realSteps[0]] },
    { password: 'sentinel' },
    { retries: 1 },
    { stage: 'customer-login' },
    ...realSteps.map((_, index) => ({ completed: realSteps.filter((__, i) => i !== index) })),
  ])
    assert.throws(() => assertRealReport({ ...passed, ...patch }, expected));
});
test('NOT RUN returns exit 2, replaces stale evidence and never prints inherited secrets', async () => {
  const file = new URL('../test-results/e2e-real/summary.json', import.meta.url);
  await mkdir(new URL('.', file), { recursive: true });
  await writeFile(file, JSON.stringify(passed));
  const child = spawnSync(process.execPath, ['scripts/e2e/real.mjs'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      PATH: process.env.PATH,
      OP_SERVICE_ACCOUNT_TOKEN: 'sentinel-secret',
      E2E_REAL_CUSTOMER_PASSWORD: 'sentinel-password',
      E2E_REAL_ISSUER: 'not-a-url',
    },
  });
  assert.equal(child.status, 2);
  assert.match(child.stdout, /NOT RUN/);
  const output = child.stdout + child.stderr + (await readFile(file, 'utf8'));
  assert.doesNotMatch(output, /sentinel|not-a-url/);
  const result = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'preflight');
  assert.deepEqual(result.accounts, []);
  assert.notEqual(result.nonce, passed.nonce);
});
test('workflow pins actions, resolves no secrets before build and reports skipped integration as failure', async () => {
  const yaml = await readFile(
    new URL('../.github/workflows/e2e-zitadel.yml', import.meta.url),
    'utf8',
  );
  for (const line of yaml.split('\n').filter((line) => line.includes('uses:')))
    assert.match(line, /@[a-f0-9]{40}(?:\s|$)/);
  assert.doesNotMatch(
    yaml,
    /pull_request_target|continue-on-error|export-env: true|(?:^|\n)\s+cache:|cancel-in-progress: true/,
  );
  assert.ok(yaml.indexOf('npm run build') < yaml.indexOf('secrets.OP_SERVICE_ACCOUNT_TOKEN'));
  assert.match(yaml, /environment: e2e-zitadel/);
  assert.match(yaml, /GITHUB_TRIGGERING_ACTOR/);
  assert.match(yaml, /trusted\.has\(pr\.user\?\.login\)/);
  assert.match(yaml, /if: \$\{\{ always\(\) \}\}/);
  assert.match(yaml, /test "\$TRUST" = success && test "\$INTEGRATION" = success/);
  assert.equal((yaml.match(/secrets\.OP_SERVICE_ACCOUNT_TOKEN/g) || []).length, 1);
});

test('standalone browser entrypoint reaches safe preflight without CommonJS top-level-await failure', () => {
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'e2e/real/run.ts'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    timeout: 15_000,
    // No opt-in, provider, password, database, or secret-store configuration: no external login.
    env: { PATH: process.env.PATH },
  });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.equal(child.stderr.trim(), 'Real browser runner could not complete');
});
test('failed browser stages survive validation but never satisfy acceptance or disclose diagnostics', () => {
  const failure = {
    ...passed,
    status: 'failed',
    stage: 'customer-login',
    accounts: [],
    completed: ['records-cleanup', 'browser-cleanup'],
  };
  assert.equal(readRealReport(failure, expected).stage, 'customer-login');
  assert.throws(() => assertRealReport(failure, expected));
  for (const patch of [
    { stage: 'secret-url' },
    { accounts: ['actual-subject'] },
    { completed: ['secret-url'] },
    { error: 'sensitive-diagnostic' },
    { cleanup: 'sensitive-diagnostic' },
    { status: 'sensitive-diagnostic' },
    { nonce: 'stale' },
    { completed: ['customer-profile', 'customer-login'] },
  ])
    assert.throws(() => readRealReport({ ...failure, ...patch }, expected));
});
