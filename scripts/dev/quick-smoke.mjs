import assert from 'node:assert/strict';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { resolveConfig } from './config.mjs';
import { inspectDocker } from './docker.mjs';
import { runProcess, startProcess } from './process.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'autokosova-dev-quick-smoke-'));
const root = join(temporary, 'worktree');
const env = {
  ...process.env,
  DATABASE_URL: '',
  NODE_ENV: 'development',
  AUTOKOSOVA_DB_PORT: undefined,
  AUTOKOSOVA_APP_PORT: undefined,
};
for (const key of Object.keys(env)) if (key.startsWith('ZITADEL_')) env[key] = '';

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const run = (command, args, cwd = source) =>
  runProcess(command, args, { cwd, env, timeout: 90000 });
let app;
let worktreeAdded = false;

try {
  try {
    await access(join(source, 'node_modules'));
  } catch {
    throw new Error('node_modules fehlt. Zuerst npm ci ausführen.');
  }
  const files = (await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']))
    .split('\0')
    .filter(Boolean);
  await run('git', ['worktree', 'add', '--detach', root, 'HEAD']);
  worktreeAdded = true;
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(source, file), join(root, file));
  }
  await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
  await writeFile(join(root, '.env.local'), `AUTOKOSOVA_APP_PORT=${await freePort()}\n`);

  app = startProcess('npm', ['run', 'dev:demo'], { cwd: root, env });
  const deadline = Date.now() + 90000;
  while (!app.output.includes('Bereit:') && !app.finished && Date.now() < deadline)
    await delay(100);
  assert.ok(app.output.includes('Bereit:'), `Dev-Start fehlgeschlagen:\n${app.output}`);
  await app.interrupt();
  await assert.rejects(readFile(join(root, '.autokosova-dev.lock', 'owner')), { code: 'ENOENT' });
  await run(process.execPath, ['scripts/dev.mjs', '--doctor'], root);
  console.log('PASS: Schneller lokaler Demo-Start, Ctrl+C und Diagnose.');
} finally {
  await app?.stop();
  try {
    await (await inspectDocker(resolveConfig(root, env))).stop();
  } catch {
    /* No DB was started or its state was already inspected. */
  }
  if (worktreeAdded) await run('git', ['worktree', 'remove', '--force', root]);
  await rm(temporary, { force: true, recursive: true });
}
