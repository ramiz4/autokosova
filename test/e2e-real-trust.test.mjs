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
    eventName: 'pull_request',
    sha: 'merge-sha',
    ref: 'refs/pull/126/merge',
    issue: { number: 126 },
    ...patch.context,
  };
  const pr = {
    state: 'open',
    draft: false,
    user: { login: 'ramizloki', id: 235666066 },
    head: { repo: { full_name: 'ramiz4/autokosova' } },
    base: { ref: 'main', sha: 'main-sha' },
    merge_commit_sha: 'merge-sha',
    ...patch.pr,
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
      pulls: { get: async () => ({ data: pr }) },
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
test('trusted internal integration and actual main run automatically, without human reviewers', async () => {
  await check();
  await check({ context: { actor: 'ramiz4' } });
  for (const eventName of ['push', 'workflow_dispatch'])
    await check({ context: { eventName, ref: 'refs/heads/main', sha: 'main-sha' } });
});
test('forks, untrusted authors or actors, permission loss, stale refs and approval gates fail closed', async () => {
  for (const patch of [
    { pr: { head: { repo: { full_name: 'external/fork' } } } },
    { pr: { user: { login: 'external', id: 999 } } },
    { pr: { user: { login: 'ramizloki', id: 999 } } },
    { context: { actor: 'external' } },
    { trigger: 'external' },
    { actor: { permission: 'read' } },
    { actor: { user: { id: 999 } } },
    { pr: { draft: true } },
    { pr: { state: 'closed' } },
    { pr: { base: { ref: 'main', sha: 'stale' } } },
    { pr: { merge_commit_sha: 'stale' } },
    { context: { eventName: 'push', ref: 'refs/heads/main', sha: 'stale' } },
    { context: { eventName: 'workflow_dispatch', ref: 'refs/heads/feature', sha: 'main-sha' } },
    { context: { eventName: 'pull_request_target' } },
    { context: { repo: { owner: 'external', repo: 'autokosova' } } },
    { environment: { can_admins_bypass: true } },
    { environment: { deployment_branch_policy: null } },
    { environment: { protection_rules: [{ type: 'required_reviewers' }] } },
    { environment: { protection_rules: [{ type: 'wait_timer' }] } },
  ])
    await assert.rejects(check(patch));
});
