import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProcess } from '../scripts/dev/process.mjs';

test('npm ci rejects a new unreviewed install script without executing it', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'autokosova-npm-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dependency = join(root, 'dependency');
  await mkdir(dependency);
  await writeFile(
    join(dependency, 'package.json'),
    JSON.stringify({
      name: 'autokosova-policy-fixture',
      version: '1.0.0',
      scripts: { install: "node -e \"require('node:fs').writeFileSync('executed','unexpected')\"" },
    }),
  );
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^npm_config_/i.test(key)) delete env[key];
  const run = (args, cwd = root) => runProcess('npm', args, { cwd, env });
  await run(['pack', '--ignore-scripts'], dependency);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      private: true,
      allowScripts: pkg.allowScripts,
      dependencies: {
        'autokosova-policy-fixture': 'file:dependency/autokosova-policy-fixture-1.0.0.tgz',
      },
    }),
  );
  await writeFile(join(root, '.npmrc'), await readFile(new URL('../.npmrc', import.meta.url)));
  await run(['install', '--package-lock-only', '--ignore-scripts']);
  await assert.rejects(run(['ci']), /fehlgeschlagen/);
  await assert.rejects(access(join(root, 'node_modules/autokosova-policy-fixture/executed')));
});
