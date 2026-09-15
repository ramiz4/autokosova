import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAcceptanceReport,
  acceptanceProblems,
  requiredCases,
  requiredProjects,
  assertControlDatabase,
  processEnvironment,
} from '../scripts/e2e/policy.mjs';

const complete = () =>
  requiredProjects.flatMap((project) =>
    requiredCases.map((id) => ({
      project,
      id,
      expected: 'passed',
      results: [{ status: 'passed', retry: 0 }],
    })),
  );
test('complete first-pass inventory is the only passing functional acceptance', () => {
  assert.deepEqual(acceptanceProblems(complete()), []);
  for (const cases of [[], complete().slice(1), [...complete(), complete()[0]]])
    assert.ok(acceptanceProblems(cases).length);
});
test('skipped, interrupted, expected failure and retries cannot satisfy acceptance', () => {
  for (const mutation of [
    { results: [] },
    { results: [{ status: 'skipped', retry: 0 }] },
    { results: [{ status: 'failed', retry: 0 }] },
    { results: [{ status: 'timedOut', retry: 0 }] },
    { results: [{ status: 'interrupted', retry: 0 }] },
    { expected: 'failed' },
    { results: [{ status: 'passed', retry: 1 }] },
    {
      results: [
        { status: 'failed', retry: 0 },
        { status: 'passed', retry: 1 },
      ],
    },
  ]) {
    const cases = complete();
    Object.assign(cases[0], mutation);
    assert.ok(acceptanceProblems(cases).length);
  }
});
test('local focused diagnostics are not a full acceptance and still cannot skip', () => {
  assert.deepEqual(acceptanceProblems(complete().slice(0, 1), false), []);
  assert.ok(acceptanceProblems([], false).length);
  assert.ok(acceptanceProblems([{ ...complete()[0], results: [] }], false).length);
});
test('database control rejects remote, arbitrary DB and search_path/TLS overrides', () => {
  assertControlDatabase('postgresql://test:test@127.0.0.1:5432/autokosova');
  for (const value of [
    undefined,
    '',
    'https://127.0.0.1/autokosova',
    'postgresql://remote.example.test/autokosova',
    'postgresql://localhost/production',
    'postgresql://localhost/autokosova?options=-csearch_path=public',
    'postgresql://localhost/autokosova#x',
  ])
    assert.throws(() => assertControlDatabase(value));
});
test('synthetic children never inherit application and secret-store credentials', () => {
  assert.deepEqual(
    processEnvironment({
      PATH: '/bin',
      HOME: '/tmp',
      DATABASE_URL: 'private',
      ZITADEL_CLIENT_ID: 'private',
      OP_SERVICE_ACCOUNT_TOKEN: 'secret',
      E2E_REAL_PASSWORD: 'secret',
    }),
    { PATH: '/bin', HOME: '/tmp' },
  );
});

test('launcher rejects missing, old, partial or mismatched reports independently of runner exit', () => {
  const context = { commit: 'tested-sha', nonce: 'current-run', full: true };
  const report = {
    status: 'passed',
    commit: context.commit,
    nonce: context.nonce,
    fullAcceptance: true,
    cases: complete(),
    problems: [],
  };
  assertAcceptanceReport(report, context);
  for (const invalid of [
    null,
    {},
    { ...report, nonce: 'old-run' },
    { ...report, commit: 'old-sha' },
    { ...report, fullAcceptance: false },
    { ...report, cases: [] },
    { ...report, status: 'failed' },
    { ...report, problems: ['error'] },
  ])
    assert.throws(() => assertAcceptanceReport(invalid, context));
});
