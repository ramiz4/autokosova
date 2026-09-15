import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveConfig } from '../dev/config.mjs';
import { inspectDocker } from '../dev/docker.mjs';
import { startProcess } from '../dev/process.mjs';
import { assertControlDatabase, assertAcceptanceReport, processEnvironment } from './policy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (process.env.NODE_ENV === 'production') throw new Error('E2E cannot run in production');
// Diagnostics may select cases locally; CI always runs the complete inventory.
if (process.env.CI && args.length)
  throw new Error('CI acceptance cannot be filtered or overridden');
if (args.length && !(args.length === 2 && ['--grep', '--project'].includes(args[0])))
  throw new Error('Only local --grep or --project diagnostics are supported');
const env = processEnvironment();
const isolatedRoot = join(
  tmpdir(),
  'autokosova-e2e-' + createHash('sha256').update(root).digest('hex').slice(0, 16),
);
await mkdir(isolatedRoot, { recursive: true });
const lock = join(isolatedRoot, 'runner.lock');
try {
  await mkdir(lock);
} catch {
  throw new Error(
    'Another E2E run owns this worktree; inspect its runner before removing the lock',
  );
}
await writeFile(join(lock, 'owner'), String(process.pid) + '\n');
const nonce = randomUUID();
let docker, running;
let exitCode = 1;
let interrupted = false;
const stop = () => {
  interrupted = true;
  void running?.stop();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function run(command, parameters, extra = {}) {
  if (interrupted) throw new Error('E2E interrupted');
  running = startProcess(command, parameters, {
    cwd: root,
    env: { ...env, ...extra },
    log: (text) => process.stdout.write(text),
  });
  // Bound even a runner stuck after reporting (e.g. an open resource); never accept its report alone.
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    void running?.stop();
  }, 14 * 60_000);
  let code;
  try {
    code = await running.done;
  } finally {
    clearTimeout(watchdog);
  }
  await running.stop();
  running = undefined;
  if (code !== 0 || interrupted || timedOut) throw new Error('E2E subprocess failed');
}
try {
  let control = process.env.AUTOKOSOVA_E2E_DATABASE_URL;
  if (control) assertControlDatabase(control);
  else {
    await copyFile(join(root, 'compose.yaml'), join(isolatedRoot, 'compose.yaml'));
    // Dedicated test Compose project, not the application's worktree database or port.
    const config = resolveConfig(isolatedRoot, {
      ...env,
      AUTOKOSOVA_APP_PORT: String(await freePort()),
    });
    docker = await inspectDocker(config);
    await docker.start();
    control = config.env.DATABASE_URL;
  }
  await rm(join(root, 'test-results/e2e'), { recursive: true, force: true });
  await run(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build']);
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env, encoding: 'utf8' });
  if (commit.status !== 0) throw new Error('Cannot identify the tested commit');
  await run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...args], {
    AUTOKOSOVA_E2E_DATABASE_URL: control,
    E2E_FULL_ACCEPTANCE: args.length ? '0' : '1',
    E2E_COMMIT_SHA: commit.stdout.trim(),
    E2E_RUN_NONCE: nonce,
    E2E_RUN_ID: process.env.GITHUB_RUN_ID ?? 'local',
  });
  const report = JSON.parse(await readFile(join(root, 'test-results/e2e/acceptance.json'), 'utf8'));
  assertAcceptanceReport(report, { commit: commit.stdout.trim(), nonce, full: args.length === 0 });
  exitCode = 0;
} catch (error) {
  // No connection strings, provider endpoints or arbitrary child errors.
  console.error(
    error.message === 'E2E subprocess failed'
      ? error.message
      : 'E2E setup/cleanup failed; check local Docker, browser and permissions',
  );
} finally {
  try {
    await running?.stop();
    await docker?.stop();
  } catch {
    exitCode = 1;
    console.error('E2E cleanup failed; only the dedicated test project needs inspection');
  }
  await rm(lock, { recursive: true, force: true });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
process.exitCode = interrupted ? 1 : exitCode;
