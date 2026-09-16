import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const directory = new URL('../.github/workflows/', import.meta.url);
const schedules = new Map([
  ['e2e.yml', 17],
  ['account.yml', 22],
  ['favorites-browser.yml', 27],
  ['inquiries-browser.yml', 32],
  ['footer.yml', 37],
  ['oidc-logout-browser.yml', 42],
  ['staff.yml', 47],
  ['e2e-zitadel.yml', 57],
]);
const manualReleaseGate = new Set(['e2e.yml', 'inquiries-browser.yml']);
const main = {
  event_name: 'schedule',
  ref: 'refs/heads/main',
  repository: 'ramiz4/autokosova',
};

for (const [file, minute] of schedules) {
  test(`${file}: guarded main snapshot, bounded non-cancelling jobs`, async () => {
    const source = await readFile(new URL(file, directory), 'utf8');
    const trigger = source.match(/^on:\n([\s\S]*?)(?=^[a-z][\w-]*:)/m)?.[1];
    assert.ok(trigger, 'explicit on block required');
    const uncommented = trigger.replace(/^\s*#[^\n]*\n/gm, '').trim();
    const expectedTrigger = manualReleaseGate.has(file)
      ? `workflow_dispatch:\n  schedule:\n    - cron: '${minute} 0 * * *'`
      : `schedule:\n    - cron: '${minute} 0 * * *'`;
    assert.equal(uncommented, expectedTrigger);
    assert.match(source, /^concurrency:\n  group: .+\n  cancel-in-progress: false$/m);
    const jobSource = source.split('\njobs:\n')[1];
    assert.ok(jobSource, 'workflow jobs required');
    const actualJobs = [
      ...jobSource.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/gm),
    ];
    assert.ok(actualJobs.length, 'workflow jobs required');
    for (const [, name, body] of actualJobs) {
      const condition = body.match(/^    if: \$\{\{ (.+) \}\}$/m)?.[1];
      assert.ok(condition, `${name}: explicit event/repository/main guard required`);
      const allowed = new Function('github', 'always', `return (${condition});`);
      assert.equal(
        allowed(main, () => true),
        true,
        name,
      );
      if (manualReleaseGate.has(file)) {
        assert.equal(
          allowed({ ...main, event_name: 'workflow_dispatch' }, () => true),
          true,
          `${name}: workflow_dispatch`,
        );
      }
      for (const patch of [
        { event_name: 'pull_request' },
        { event_name: 'pull_request_target' },
        { event_name: 'push' },
        ...(manualReleaseGate.has(file) ? [] : [{ event_name: 'workflow_dispatch' }]),
        { event_name: 'workflow_call' },
        { ref: 'refs/heads/feature' },
        { ref: 'refs/heads/develop' },
        { ref: 'refs/pull/158/merge' },
        { ref: 'refs/tags/main' },
        { repository: 'external/autokosova' },
      ]) {
        assert.equal(
          allowed({ ...main, ...patch }, () => true),
          false,
          `${name}: ${JSON.stringify(patch)}`,
        );
      }
      assert.match(body, /^    timeout-minutes: [1-9]\d*$/m, name);
    }
    const checkout = source.match(
      /uses: actions\/checkout@[^\n]+\n([\s\S]*?)(?=^      -|$(?![\s\S]))/m,
    );
    if (checkout) assert.match(checkout[1], /ref: \$\{\{ github\.sha \}\}/);
    assert.doesNotMatch(source, /continue-on-error:/);
  });
}

test('all workflows are classified; PR CI retains fast E2E policy/type checks but no browser suite', async () => {
  const files = (await readdir(directory)).filter((file) => /\.ya?ml$/.test(file)).sort();
  assert.deepEqual(files, ['ci.yml', ...schedules.keys()].sort());
  const ci = await readFile(new URL('ci.yml', directory), 'utf8');
  assert.match(ci, /\n  pull_request:/);
  assert.match(ci, /\n  push:\n    branches: \[main\]/);
  assert.match(ci, /\n  verify:/);
  assert.match(ci, /\n  development-start:/);
  assert.match(ci, /run: npm run typecheck:e2e/);
  assert.match(ci, /run: npm run test:e2e:policy/);
  assert.doesNotMatch(ci, /run:.*(?:playwright|browser|npm run test:e2e(?:\s|$))/m);
});
