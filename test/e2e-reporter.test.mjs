import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { processEnvironment } from '../scripts/e2e/policy.mjs';

// Reporter self-tests never run inside another test's output directory.
const root = resolve(import.meta.dirname, '..');
const playwright = createRequire(import.meta.url).resolve('@playwright/test');
for (const [name, body, pass] of [
  ['passed', "test('case', () => expect(1).toBe(1));", true],
  ['failed', "test('case', () => expect(1).toBe(2));", false],
  ['skipped', "test.skip('case', () => {});", false],
  ['expected-failure', "test('case', () => { test.fail(); expect(1).toBe(2); });", false],
  ['focused-only', "test.only('case', () => {});", false],
  ['empty', '', false],
  ['missing-inventory', "test('case', () => expect(1).toBe(1));", false],
  ['report-write-failure', "test('case', () => expect(1).toBe(1));", false],
])
  test(`real runner/report rejects invalid acceptance: ${name}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ak-e2e-policy-'));
    try {
      await writeFile(
        join(directory, 'sample.spec.ts'),
        `import {test,expect} from ${JSON.stringify(playwright)};\n` + body,
      );
      await writeFile(
        join(directory, 'playwright.config.ts'),
        `export default {
      testDir: '.', outputDir: './browser-results', globalTimeout: 15000,
      workers: 1, retries: 0, forbidOnly: true,
      reporter: [[${JSON.stringify(join(root, 'e2e/support/reporter.ts'))}]] };`,
      );
      if (name === 'report-write-failure') {
        await mkdir(join(directory, 'test-results'));
        await writeFile(join(directory, 'test-results/e2e'), 'not a directory');
      }
      const child = spawn(
        process.execPath,
        [join(root, 'node_modules/@playwright/test/cli.js'), 'test'],
        {
          cwd: directory,
          env: {
            ...processEnvironment(),
            E2E_FULL_ACCEPTANCE: name === 'missing-inventory' ? '1' : '0',
          },
          stdio: 'ignore',
          timeout: 20000,
        },
      );
      const code = await new Promise((done, reject) => {
        child.once('error', reject);
        child.once('close', done);
      });
      assert.equal(code === 0, pass);
      if (name === 'report-write-failure') return;
      const report = JSON.parse(
        await readFile(join(directory, 'test-results/e2e/acceptance.json'), 'utf8'),
      );
      assert.equal(report.status, pass ? 'passed' : 'failed');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
