import { mkdir, writeFile } from 'node:fs/promises';
import type { FullResult, Reporter, Suite } from '@playwright/test/reporter';
import { acceptanceProblems } from '../../scripts/e2e/policy.mjs';

export default class AcceptanceReporter implements Reporter {
  private suite?: Suite;
  onBegin(_config: unknown, suite: Suite): void {
    this.suite = suite;
  }
  async onEnd(result: FullResult): Promise<{ status: 'passed' | 'failed' }> {
    const cases = (this.suite?.allTests() ?? []).map((test) => ({
      id: test.title.split(' ', 1)[0],
      project: test.parent.project()?.name ?? '',
      expected: test.expectedStatus,
      results: test.results.map((attempt) => ({ status: attempt.status, retry: attempt.retry })),
    }));
    const full = process.env['E2E_FULL_ACCEPTANCE'] !== '0';
    const problems = acceptanceProblems(cases, full);
    if (result.status !== 'passed') problems.push('Runner did not complete successfully');
    const status = problems.length ? 'failed' : 'passed';
    try {
      await mkdir('test-results/e2e', { recursive: true });
      await writeFile(
        'test-results/e2e/acceptance.json',
        JSON.stringify(
          {
            status,
            fullAcceptance: full,
            commit: process.env['E2E_COMMIT_SHA'] ?? 'local',
            run: process.env['E2E_RUN_ID'],
            nonce: process.env['E2E_RUN_NONCE'],
            provider: 'isolated signed test OIDC; not live ZITADEL',
            cases,
            problems,
          },
          null,
          2,
        ) + '\n',
      );
    } catch {
      console.error('Acceptance report could not be persisted');
      return { status: 'failed' };
    }
    for (const problem of problems) console.error('Acceptance: ' + problem);
    return { status };
  }
}
