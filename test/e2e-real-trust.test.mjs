import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../.github/workflows/e2e-zitadel.yml', import.meta.url),
  'utf8',
);
const scripts = [...workflow.matchAll(/          script: \|\n((?:            [^\n]*\n?)+)/g)].map(
  (match) =>
    match[1]
      .split('\n')
      .map((line) => line.slice(12))
      .join('\n')
      .trim(),
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function check(patch = {}) {
  const context = {
    repo: { owner: 'ramiz4', repo: 'autokosova' },
    actor: 'ramizloki',
    eventName: 'schedule',
    sha: 'main-sha',
    ref: 'refs/heads/main',
    ...patch.context,
  };
  const environment = {
    can_admins_bypass: false,
    protection_rules: [],
    deployment_branch_policy: { custom_branch_policies: true },
    ...patch.environment,
  };
  const github = {
    rest: {
      repos: {
        getEnvironment: async () => ({ data: environment }),
        getCollaboratorPermissionLevel: async ({ username }) => ({
          data: {
            user: { id: username === 'ramiz4' ? 1623235 : 235666066 },
            permission: 'write',
            ...patch.actor,
          },
        }),
        getBranch: async () => ({ data: { commit: { sha: 'main-sha' } } }),
      },
    },
  };
  await new AsyncFunction('github', 'context', 'process', scripts[0])(github, context, {
    env: { GITHUB_TRIGGERING_ACTOR: patch.trigger || context.actor },
  });
}
test('same automatic trust checks run before checkout and immediately before secrets', () => {
  assert.equal(scripts.length, 2);
  assert.equal(scripts[0], scripts[1]);
  assert.ok(workflow.indexOf('npm run build') < workflow.lastIndexOf('script: |'));
  assert.ok(
    workflow.lastIndexOf('script: |') < workflow.indexOf('secrets.OP_SERVICE_ACCOUNT_TOKEN'),
  );
});
test('trusted nightly main snapshots run automatically, without human reviewers', async () => {
  await check();
  await check({ context: { actor: 'ramiz4' } });
});
test('non-scheduled runs, non-main refs, untrusted actors, stale snapshots and approval gates fail closed', async () => {
  for (const patch of [
    { context: { eventName: 'pull_request' } },
    { context: { eventName: 'push' } },
    { context: { eventName: 'workflow_dispatch' } },
    { context: { eventName: 'pull_request_target' } },
    { context: { eventName: 'workflow_run' } },
    { context: { ref: 'refs/heads/feature' } },
    { context: { ref: 'refs/pull/158/merge' } },
    { context: { ref: 'refs/tags/main' } },
    { context: { sha: 'stale' } },
    { context: { actor: 'external' } },
    { trigger: 'external' },
    { actor: { permission: 'read' } },
    { actor: { user: { id: 999 } } },
    { context: { repo: { owner: 'external', repo: 'autokosova' } } },
    { environment: { can_admins_bypass: true } },
    { environment: { deployment_branch_policy: null } },
    { environment: { protection_rules: [{ type: 'required_reviewers' }] } },
    { environment: { protection_rules: [{ type: 'wait_timer' }] } },
  ])
    await assert.rejects(check(patch));
});
