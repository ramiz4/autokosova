import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProcess } from '../dev/process.mjs';
import { realConfiguration } from './real-config.mjs';
import { processEnvironment } from './policy.mjs';
import {
  assertRealReport,
  readRealReport,
  browserEnvironment,
  providerEnvironment,
} from './real-policy.mjs';
import { createRealApplication } from './real-application.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = join(root, 'test-results/e2e-real');
await mkdir(directory, { recursive: true });
await rm(join(directory, 'summary.json'), { force: true });
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  env: processEnvironment(),
  encoding: 'utf8',
});
const expected = {
  commit: revision.stdout?.trim(),
  nonce: randomUUID(),
  runId: process.env.GITHUB_RUN_ID || 'local',
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
};
let result = {
  mode: 'real-zitadel',
  status: 'failed',
  stage: 'preflight',
  ...expected,
  accounts: [],
  completed: [],
  cleanup: 'not-run',
};
let app,
  browser,
  temporary,
  exitCode = 1;
const abort = new AbortController();
const stop = () => {
  abort.abort();
  void browser?.stop();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
// A stopped or hung browser cannot leave a successful stale report behind.
const watchdog = setTimeout(stop, 12 * 60_000);
try {
  if (process.argv.length !== 2) throw new Error('Real acceptance cannot be filtered');
  realConfiguration(process.env);
  if (revision.status !== 0 || !/^[a-f0-9]{40}$/.test(expected.commit || ''))
    throw new Error('Cannot identify current commit');
  if (
    process.env.CI &&
    (process.env.E2E_REAL_ISOLATED !== '1' || process.env.GITHUB_SHA !== expected.commit)
  )
    throw new Error('CI requires its own app and exact checked-out integration commit');
  if (process.env.E2E_REAL_ISOLATED === '1') providerEnvironment(process.env);
  temporary = await mkdtemp(join(tmpdir(), 'ak-e2e-real-result-'));
  const resultFile = join(temporary, 'browser.json');
  result.stage = 'application-setup';
  if (process.env.E2E_REAL_ISOLATED === '1')
    app = await createRealApplication(root, process.env, abort.signal);
  abort.signal.throwIfAborted();
  result.stage = 'browser';
  browser = startProcess(process.execPath, ['--import', 'tsx', 'e2e/real/run.ts'], {
    cwd: root,
    env: {
      ...browserEnvironment(process.env),
      E2E_REAL_COMMIT_SHA: expected.commit,
      E2E_REAL_RUN_NONCE: expected.nonce,
      E2E_REAL_RUN_ID: expected.runId,
      E2E_REAL_RUN_ATTEMPT: expected.runAttempt,
      E2E_REAL_RESULT_FILE: resultFile,
    },
    // Never forward raw child errors, including unexpected loader/provider diagnostics.
  });
  const code = await browser.done;
  abort.signal.throwIfAborted();
  const evidence = JSON.parse(await readFile(resultFile, 'utf8'));
  result = readRealReport(evidence, expected);
  assertRealReport(result, expected);
  if (code !== 0) throw new Error('Real browser process failed');
  exitCode = 0;
} catch {
  // NOT RUN remains a nonzero result; no error.message or secret-bearing URLs.
  if (result.stage === 'preflight') exitCode = 2;
} finally {
  let cleanupFailed = false;
  for (const operation of [
    () => browser?.stop(),
    () => app?.close(),
    () => temporary && rm(temporary, { recursive: true, force: true }),
  ]) {
    try {
      await operation();
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed || abort.signal.aborted) {
    exitCode = 1;
    result.stage = cleanupFailed ? 'application-cleanup' : 'interrupted';
  }
  if (exitCode !== 0) result.status = 'failed';
  if (cleanupFailed) result.cleanup = 'failed';
  clearTimeout(watchdog);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  await writeFile(join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(
  'Real ZITADEL integration: ' +
    (exitCode === 2 ? 'NOT RUN' : result.status) +
    ' (' +
    result.stage +
    ')',
);
process.exitCode = exitCode;
